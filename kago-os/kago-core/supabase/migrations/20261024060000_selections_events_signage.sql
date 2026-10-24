-- DB-05: App selections and behaviour events, experiments, Signage devices/plays/audience estimates.
-- Requires DB-02, DB-03 and DB-04. The cart-update function (cart + version + event in one call)
-- belongs to APP-02; aggregation views belong to DB-09.
-- Guards that read or lock other tables are SECURITY DEFINER with an empty search_path and
-- EXECUTE revoked, as in DB-04, so DB-06 only needs to grant the target table.
begin;

-- Pure validators ------------------------------------------------------------------------

create function public.kago_jsonb_is_int(val jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select val is not null and jsonb_typeof(val) = 'number' and val::text ~ '^-?[0-9]+$'
    and length(ltrim(val::text, '-')) <= 9;
$$;

create function public.kago_is_code(val text)
returns boolean language sql immutable set search_path = '' as $$
  select val ~ '^[a-z][a-z0-9_]{0,62}$';
$$;

create function public.kago_is_code_set(vals text[], min_count integer)
returns boolean language sql immutable set search_path = '' as $$
  select public.kago_is_text_set(vals, null, min_count)
    and not exists (select 1 from unnest(vals) v where not public.kago_is_code(v));
$$;

-- Shape of one App event (common spec 8.1/8.2). Cross-row rules live in the insert trigger.
create function public.kago_is_valid_event(event_type text, payload jsonb,
  selection_item_id uuid, product_id uuid)
returns boolean language plpgsql immutable set search_path = '' as $$
declare src text; qty jsonb; delta jsonb; ver jsonb; ids jsonb;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then return false; end if;
  case event_type
  when 'product_scanned' then
    return coalesce(product_id is not null and selection_item_id is null
      and payload->>'method' in ('barcode','manual'), false);
  when 'scan_failed' then
    return coalesce(product_id is null and selection_item_id is null
      and jsonb_typeof(payload->'reason') = 'string' and btrim(payload->>'reason') <> ''
      and (payload->'code' is null or jsonb_typeof(payload->'code') = 'string'), false);
  when 'cart_item_added', 'cart_quantity_changed', 'cart_item_removed' then
    src := payload->>'source'; qty := payload->'quantity'; delta := payload->'quantity_delta';
    ver := payload->'cart_version';
    if product_id is null or src is null or src not in ('scan','manual','recommendation')
       or (src = 'recommendation') <> (selection_item_id is not null)
       or not public.kago_jsonb_is_int(qty) or not public.kago_jsonb_is_int(delta)
       or not public.kago_jsonb_is_int(ver) or ver::text::integer < 1 then
      return false;
    end if;
    return coalesce(case event_type
      when 'cart_item_added' then qty::text::integer >= 1 and delta::text::integer = qty::text::integer
      when 'cart_quantity_changed' then qty::text::integer >= 1 and delta::text::integer <> 0
      else qty::text::integer = 0 and delta::text::integer < 0 end, false);
  when 'recommendation_impression' then
    return coalesce(product_id is not null and selection_item_id is not null
      and public.kago_jsonb_is_int(payload->'visible_ms') and (payload->>'visible_ms')::integer >= 1000, false);
  when 'recommendation_click' then
    return coalesce(product_id is not null and selection_item_id is not null
      and payload->>'target' in ('detail','add_button'), false);
  when 'recommendation_dismissed' then
    return coalesce(product_id is not null and selection_item_id is not null, false);
  when 'product_compared' then
    ids := payload->'product_ids';
    return coalesce(selection_item_id is null and jsonb_typeof(ids) = 'array' and jsonb_array_length(ids) >= 2
      and not exists (select 1 from jsonb_array_elements(ids) e
        where jsonb_typeof(e) <> 'string'
          or e #>> '{}' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
      and jsonb_array_length(ids) = (select count(distinct e) from jsonb_array_elements(ids) e), false);
  when 'removal_reason_submitted' then
    return coalesce(selection_item_id is null
      and jsonb_typeof(payload->'removal_event_id') = 'string'
      and payload->>'removal_event_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and jsonb_typeof(payload->'reason') = 'string' and btrim(payload->>'reason') <> ''
      and char_length(payload->>'reason') <= 200, false);
  else
    return false;
  end case;
end;
$$;

-- Serialises concurrent writes of the same client-generated id so a resend racing the
-- original sees the committed row instead of a raw primary-key error.
create function public.kago_lock_id(id uuid)
returns void language sql volatile set search_path = '' as $$
  select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(id::text, 7243));
$$;

-- Store-local time windows from DB-04 promotion_versions. Empty array = all day.
create function public.kago_time_windows_match(windows jsonb, at_time timestamptz, tz text)
returns boolean language plpgsql stable set search_path = '' as $$
declare local_ts timestamp; dow integer; minute_of_day integer; w jsonb;
begin
  if jsonb_array_length(windows) = 0 then return true; end if;
  local_ts := at_time at time zone tz;
  dow := extract(isodow from local_ts)::integer;
  minute_of_day := extract(hour from local_ts)::integer * 60 + extract(minute from local_ts)::integer;
  for w in select value from jsonb_array_elements(windows) loop
    if (w->'weekdays') @> to_jsonb(dow)
       and minute_of_day >= split_part(w->>'start', ':', 1)::integer * 60 + split_part(w->>'start', ':', 2)::integer
       and minute_of_day < split_part(w->>'end', ':', 1)::integer * 60 + split_part(w->>'end', ':', 2)::integer then
      return true;
    end if;
  end loop;
  return false;
end;
$$;

-- Experiments (APP-10 / INS-04, optional extension) --------------------------------------

create table public.experiments (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  channel text not null check (channel in ('app','signage')),
  unit text not null,
  arms text[] not null check (public.kago_is_code_set(arms, 2)),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  unique (store_id, slug, version),
  check (starts_at < ends_at),
  check ((channel = 'app' and unit = 'user') or (channel = 'signage' and unit = 'device_time_window'))
);
create trigger experiments_immutable before update on public.experiments
for each row execute function public.kago_reject_mutation();

create table public.experiment_assignments (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references public.experiments(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  arm text not null,
  assigned_at timestamptz not null default now(),
  unique (experiment_id, user_id),
  unique (id, user_id, arm)
);
create index experiment_assignments_user_idx on public.experiment_assignments(user_id);

create function public.kago_guard_experiment_assignment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'Experiment assignments are fixed' using errcode = '23514';
  end if;
  perform 1 from public.experiments
    where id = new.experiment_id and channel = 'app' and new.arm = any(arms);
  if not found then
    raise exception 'Assignment needs an App experiment arm' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger experiment_assignments_guard before insert or update or delete on public.experiment_assignments
for each row execute function public.kago_guard_experiment_assignment();

-- DB-03 deferred these two columns to DB-05. Both NULL or both set; the arm is fixed once set.
alter table public.visits
  add column assignment_id uuid,
  add column experiment_arm text,
  add constraint visits_assignment_pair check ((assignment_id is null) = (experiment_arm is null)),
  add constraint visits_assignment_fk foreign key (assignment_id, user_id, experiment_arm)
    references public.experiment_assignments(id, user_id, arm) on delete restrict;
create index visits_assignment_idx on public.visits(assignment_id) where assignment_id is not null;

create function public.kago_guard_visit_assignment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.assignment_id is not null
     and (new.assignment_id, new.experiment_arm) is distinct from (old.assignment_id, old.experiment_arm) then
    raise exception 'Visit experiment arm is fixed' using errcode = '23514';
  end if;
  if new.assignment_id is not null then
    perform 1 from public.experiment_assignments a join public.experiments e on e.id = a.experiment_id
      where a.id = new.assignment_id and e.store_id = new.store_id
        and new.started_at >= e.starts_at and new.started_at < e.ends_at;
    if not found then
      raise exception 'Assignment must belong to the visit store and period' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
create trigger visits_assignment_guard before insert or update of assignment_id, experiment_arm
on public.visits for each row execute function public.kago_guard_visit_assignment();

-- App selections -------------------------------------------------------------------------

create table public.selections (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.visits(id) on delete restrict,
  cart_version integer not null check (cart_version >= 0),
  rule_version integer not null check (rule_version >= 1),
  -- clock_timestamp: a selection saved in the same transaction as app_start_visit is not "before" the visit.
  created_at timestamptz not null default clock_timestamp()
);
create index selections_visit_idx on public.selections(visit_id, created_at);

create table public.selection_items (
  id uuid primary key default gen_random_uuid(),
  selection_id uuid not null references public.selections(id) on delete restrict,
  slot integer not null check (slot between 1 and 3),
  placement_type text not null check (placement_type in ('organic','store_promo','sponsored')),
  product_id uuid not null references public.products(id) on delete restrict,
  ad_placement_id uuid references public.ad_placements(id) on delete restrict,
  promotion_version_id uuid references public.promotion_versions(id) on delete restrict,
  rank integer not null check (rank >= 1),
  reason_code text not null check (public.kago_is_code(reason_code)),
  reason_text text not null check (btrim(reason_text) <> '' and char_length(reason_text) <= 200),
  unique (selection_id, slot),
  -- The recorded type and the on-screen label must agree: sponsored_* only for ads, store_* only for promos.
  check ((placement_type = 'sponsored') = (reason_code like 'sponsored\_%')
     and (placement_type = 'store_promo') = (reason_code like 'store\_%')),
  unique (selection_id, product_id),
  check ((placement_type = 'organic' and ad_placement_id is null and promotion_version_id is null)
      or (placement_type = 'sponsored' and ad_placement_id is not null and promotion_version_id is null)
      or (placement_type = 'store_promo' and ad_placement_id is null and promotion_version_id is not null))
);
create unique index selection_items_one_sponsored_idx on public.selection_items(selection_id) where placement_type = 'sponsored';
create unique index selection_items_one_promo_idx on public.selection_items(selection_id) where placement_type = 'store_promo';
create index selection_items_ad_placement_idx on public.selection_items(ad_placement_id) where ad_placement_id is not null;
create index selection_items_promotion_idx on public.selection_items(promotion_version_id) where promotion_version_id is not null;

-- A selection is taken for the current cart of an active visit.
create function public.kago_guard_selection()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v public.visits%rowtype; prev public.selections%rowtype;
begin
  if tg_op <> 'INSERT' then
    raise exception 'Selections are append-only' using errcode = '23514';
  end if;
  perform public.kago_lock_id(new.id);
  select * into prev from public.selections where id = new.id;
  if found then
    -- Re-running a fixed-id seed or resending the same selection is a no-op.
    if (prev.visit_id, prev.cart_version, prev.rule_version) = (new.visit_id, new.cart_version, new.rule_version) then
      return null;
    end if;
    raise exception 'Selection % already stored with different content', new.id using errcode = '23505';
  end if;
  select * into v from public.visits where id = new.visit_id for share;
  if not found then raise exception 'Unknown visit' using errcode = '23503'; end if;
  if v.status <> 'active' or new.cart_version is distinct from v.cart_version then
    raise exception 'Selection must match the current cart of an active visit' using errcode = '23514';
  end if;
  if new.created_at < v.started_at or new.created_at > clock_timestamp() then
    raise exception 'Selection time must be within the visit' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger selections_guard before insert or update or delete on public.selections
for each row execute function public.kago_guard_selection();

-- Each slot must point at something the visit store could legally show in the App at that time.
create function public.kago_guard_selection_item()
returns trigger language plpgsql security definer set search_path = '' as $$
declare s public.selections%rowtype; v public.visits%rowtype; st public.stores%rowtype;
  p public.ad_placements%rowtype; pv public.promotion_versions%rowtype; sp public.store_promotions%rowtype;
  prev public.selection_items%rowtype;
begin
  if tg_op <> 'INSERT' then
    raise exception 'Selection items are append-only' using errcode = '23514';
  end if;
  perform public.kago_lock_id(new.id);
  select * into prev from public.selection_items where id = new.id;
  if found then
    if to_jsonb(prev) = to_jsonb(new) then return null; end if;
    raise exception 'Selection item % already stored with different content', new.id using errcode = '23505';
  end if;
  select * into s from public.selections where id = new.selection_id;
  if not found then raise exception 'Unknown selection' using errcode = '23503'; end if;
  select * into v from public.visits where id = s.visit_id for share;
  if v.status <> 'active' or v.cart_version <> s.cart_version then
    raise exception 'Selection is stale' using errcode = '23514';
  end if;
  select * into st from public.stores where id = v.store_id;
  perform 1 from public.store_products
    where store_id = v.store_id and product_id = new.product_id and is_active;
  if not found then raise exception 'Product is not active in the visit store' using errcode = '23503'; end if;

  if new.placement_type = 'sponsored' then
    select * into p from public.ad_placements where id = new.ad_placement_id;
    if p.store_id <> v.store_id then
      raise exception 'Ad placement belongs to another store' using errcode = '23503';
    end if;
    perform 1 from public.creative_versions cv join public.creatives c on c.id = cv.creative_id
      where cv.id = p.creative_version_id and c.product_id = new.product_id;
    if not found then raise exception 'Slot product must be the advertised product' using errcode = '23514'; end if;
    if p.status <> 'active' or not ('app' = any(p.channels))
       or s.created_at < p.starts_at or s.created_at >= p.ends_at then
      raise exception 'Ad placement is not deliverable in the App now' using errcode = '23514';
    end if;
  elsif new.placement_type = 'store_promo' then
    select * into pv from public.promotion_versions where id = new.promotion_version_id;
    select * into sp from public.store_promotions where id = pv.promotion_id;
    if sp.store_id <> v.store_id then
      raise exception 'Promotion belongs to another store' using errcode = '23503';
    end if;
    if sp.product_id <> new.product_id then
      raise exception 'Slot product must be the promoted product' using errcode = '23514';
    end if;
    if pv.status <> 'active' or not ('app' = any(pv.channels))
       or s.created_at < pv.starts_at or s.created_at >= pv.ends_at
       or not public.kago_time_windows_match(pv.time_windows, s.created_at, st.timezone) then
      raise exception 'Promotion is not deliverable in the App now' using errcode = '23514';
    end if;
  end if;

  if new.reason_code = 'replenishment' then
    perform 1 from public.customer_settings where user_id = v.user_id and use_purchase_history;
    if not found then
      raise exception 'Purchase history use is off for this customer' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
create trigger selection_items_guard before insert or update or delete on public.selection_items
for each row execute function public.kago_guard_selection_item();

-- App behaviour events -------------------------------------------------------------------

create table public.events (
  event_id uuid primary key,
  event_type text not null check (event_type in ('product_scanned','scan_failed','cart_item_added',
    'cart_quantity_changed','cart_item_removed','recommendation_impression','recommendation_click',
    'recommendation_dismissed','product_compared','removal_reason_submitted')),
  schema_version integer not null check (schema_version = 1),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  store_id uuid not null,
  channel text not null default 'app' check (channel = 'app'),
  user_id uuid not null,
  visit_id uuid not null,
  selection_item_id uuid references public.selection_items(id) on delete restrict,
  product_id uuid references public.products(id) on delete restrict,
  payload jsonb not null default '{}',
  data_origin text not null check (data_origin in ('operated','seeded','synthetic')),
  foreign key (visit_id, user_id, store_id) references public.visits(id, user_id, store_id) on delete restrict,
  foreign key (store_id, product_id) references public.store_products(store_id, product_id) on delete restrict,
  check (public.kago_is_valid_event(event_type, payload, selection_item_id, product_id))
);
-- One real impression per slot (common spec 8.2.1). The trigger drops later ones; the index is the backstop.
create unique index events_one_impression_idx on public.events(selection_item_id)
  where event_type = 'recommendation_impression';
create index events_visit_idx on public.events(visit_id, occurred_at);
create index events_store_idx on public.events(store_id, occurred_at);
create index events_selection_item_idx on public.events(selection_item_id) where selection_item_id is not null;

-- Same event_id + same content = silent no-op (resend). Same id, different content = 23505.
create function public.kago_guard_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare prev public.events%rowtype; removal public.events%rowtype; ids jsonb;
begin
  if tg_op <> 'INSERT' then
    raise exception 'Events are append-only' using errcode = '23514';
  end if;
  perform public.kago_lock_id(new.event_id);
  select * into prev from public.events where event_id = new.event_id;
  if found then
    if (to_jsonb(prev) - 'received_at') = (to_jsonb(new) - 'received_at') then
      return null;
    end if;
    raise exception 'event_id % was already stored with different content', new.event_id
      using errcode = '23505';
  end if;
  new.received_at := statement_timestamp();
  -- A slot counts one real impression. A later impression for the same slot (e.g. after an App
  -- reload) is dropped silently, so batches do not fail on it.
  if new.event_type = 'recommendation_impression' and new.selection_item_id is not null then
    perform public.kago_lock_id(new.selection_item_id);
    perform 1 from public.events
      where selection_item_id = new.selection_item_id and event_type = 'recommendation_impression';
    if found then return null; end if;
  end if;

  if new.selection_item_id is not null then
    perform 1 from public.selection_items si join public.selections s on s.id = si.selection_id
      where si.id = new.selection_item_id and s.visit_id = new.visit_id and si.product_id = new.product_id;
    if not found then
      raise exception 'Selection item does not belong to this visit and product' using errcode = '23503';
    end if;
  end if;

  -- Malformed payloads fall through to the CHECK (23514); only well-formed ids are cast here.
  if new.event_type = 'product_compared' and jsonb_typeof(new.payload->'product_ids') = 'array'
     and not exists (select 1 from jsonb_array_elements(new.payload->'product_ids') e
       where jsonb_typeof(e) <> 'string'
         or e #>> '{}' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
    ids := new.payload->'product_ids';
    if exists (select 1 from jsonb_array_elements_text(ids) x
               where not exists (select 1 from public.store_products sp
                 where sp.store_id = new.store_id and sp.product_id = x::uuid)) then
      raise exception 'Compared products must be listed in the store' using errcode = '23503';
    end if;
  elsif new.event_type = 'removal_reason_submitted' and jsonb_typeof(new.payload->'removal_event_id') = 'string'
     and new.payload->>'removal_event_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select * into removal from public.events where event_id = (new.payload->>'removal_event_id')::uuid;
    if not found or removal.event_type <> 'cart_item_removed' or removal.visit_id <> new.visit_id
       or (new.product_id is not null and new.product_id <> removal.product_id) then
      raise exception 'Removal reason must reference a removal in the same visit' using errcode = '23503';
    end if;
  end if;
  return new;
end;
$$;
create trigger events_guard before insert or update or delete on public.events
for each row execute function public.kago_guard_event();

-- Signage devices, plays and audience estimates (no user_id / visit_id by design) ------------

create table public.signage_devices (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  auth_user_id uuid not null unique references auth.users(id) on delete restrict,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  location text not null check (btrim(location) <> ''),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (store_id, slug)
);

create function public.kago_guard_signage_device()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if (new.id, new.store_id, new.created_at) is distinct from (old.id, old.store_id, old.created_at) then
    raise exception 'Signage device store is fixed' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger signage_devices_guard before update on public.signage_devices
for each row execute function public.kago_guard_signage_device();

create table public.signage_plays (
  id uuid primary key,
  device_id uuid not null references public.signage_devices(id) on delete restrict,
  ad_placement_id uuid references public.ad_placements(id) on delete restrict,
  promotion_version_id uuid references public.promotion_versions(id) on delete restrict,
  creative_version_id uuid references public.creative_versions(id) on delete restrict,
  mode text not null check (mode in ('schedule','adaptive','fallback')),
  reason_code text not null check (public.kago_is_code(reason_code)),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  received_at timestamptz not null default now(),
  data_origin text not null check (data_origin in ('operated','seeded','synthetic')),
  media_kind text check (media_kind in ('image','video')),
  end_reason text check (end_reason in ('completed','updated','suspended','expired','media_error','closed')),
  check (ended_at >= started_at),
  check ((mode = 'fallback' and ad_placement_id is null and promotion_version_id is null and creative_version_id is null)
      or (mode <> 'fallback' and ad_placement_id is not null and promotion_version_id is null and creative_version_id is not null)
      or (mode <> 'fallback' and ad_placement_id is null and promotion_version_id is not null and creative_version_id is null))
);
create index signage_plays_device_idx on public.signage_plays(device_id, started_at);
create index signage_plays_ad_placement_idx on public.signage_plays(ad_placement_id, started_at) where ad_placement_id is not null;
create index signage_plays_promotion_idx on public.signage_plays(promotion_version_id, started_at) where promotion_version_id is not null;

-- Plays record what the screen showed: same store, Signage channel, inside the content period,
-- and for ads the approved creative version. Status is not re-checked (offline cache, SIG-03).
create function public.kago_guard_signage_play()
returns trigger language plpgsql security definer set search_path = '' as $$
declare prev public.signage_plays%rowtype; d public.signage_devices%rowtype;
  p public.ad_placements%rowtype; pv public.promotion_versions%rowtype;
begin
  if tg_op <> 'INSERT' then
    raise exception 'Signage plays are append-only' using errcode = '23514';
  end if;
  perform public.kago_lock_id(new.id);
  select * into prev from public.signage_plays where id = new.id;
  if found then
    if (to_jsonb(prev) - 'received_at') = (to_jsonb(new) - 'received_at') then
      return null;
    end if;
    raise exception 'Play % was already stored with different content', new.id using errcode = '23505';
  end if;
  new.received_at := statement_timestamp();
  select * into d from public.signage_devices where id = new.device_id;
  if not found then raise exception 'Unknown signage device' using errcode = '23503'; end if;
  if new.ad_placement_id is not null then
    select * into p from public.ad_placements where id = new.ad_placement_id;
    if p.store_id <> d.store_id then
      raise exception 'Ad placement belongs to another store' using errcode = '23503';
    end if;
    if new.creative_version_id <> p.creative_version_id or not ('signage' = any(p.channels))
       or new.started_at < p.starts_at or new.started_at >= p.ends_at then
      raise exception 'Play does not match the approved Signage placement' using errcode = '23514';
    end if;
  elsif new.promotion_version_id is not null then
    select * into pv from public.promotion_versions where id = new.promotion_version_id;
    perform 1 from public.store_promotions where id = pv.promotion_id and store_id = d.store_id;
    if not found then raise exception 'Promotion belongs to another store' using errcode = '23503'; end if;
    if not ('signage' = any(pv.channels)) or new.started_at < pv.starts_at or new.started_at >= pv.ends_at then
      raise exception 'Play does not match the Signage promotion' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
create trigger signage_plays_guard before insert or update or delete on public.signage_plays
for each row execute function public.kago_guard_signage_play();

create table public.audience_estimates (
  play_id uuid primary key references public.signage_plays(id) on delete restrict,
  method_version text not null check (btrim(method_version) <> '' and char_length(method_version) <= 100),
  measurement_status text not null check (measurement_status in ('measured','not_measured','error')),
  estimated_viewers integer,
  estimated_view_seconds numeric(10,2),
  data_origin text not null check (data_origin in ('operated','seeded','synthetic')),
  received_at timestamptz not null default now(),
  -- Not measured is NULL, never 0. Measured 0 viewers is a real 0.
  check ((measurement_status = 'measured' and estimated_viewers is not null and estimated_viewers >= 0
          and estimated_view_seconds is not null and estimated_view_seconds >= 0)
      or (measurement_status <> 'measured' and estimated_viewers is null and estimated_view_seconds is null))
);

create function public.kago_guard_audience_estimate()
returns trigger language plpgsql security definer set search_path = '' as $$
declare prev public.audience_estimates%rowtype; play public.signage_plays%rowtype;
begin
  if tg_op <> 'INSERT' then
    raise exception 'Audience estimates are append-only' using errcode = '23514';
  end if;
  perform public.kago_lock_id(new.play_id);
  select * into prev from public.audience_estimates where play_id = new.play_id;
  if found then
    if (to_jsonb(prev) - 'received_at') = (to_jsonb(new) - 'received_at') then
      return null;
    end if;
    raise exception 'Estimate for play % already stored with different content', new.play_id
      using errcode = '23505';
  end if;
  new.received_at := statement_timestamp();
  select * into play from public.signage_plays where id = new.play_id;
  if not found then raise exception 'Unknown play' using errcode = '23503'; end if;
  -- Synthetic estimates may sit on any play; otherwise the origin must match the play.
  if new.data_origin <> 'synthetic' and new.data_origin <> play.data_origin then
    raise exception 'Estimate origin must match the play or be synthetic' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger audience_estimates_guard before insert or update or delete on public.audience_estimates
for each row execute function public.kago_guard_audience_estimate();

-- Privileges -----------------------------------------------------------------------------

revoke all on function public.kago_guard_experiment_assignment(), public.kago_guard_visit_assignment(),
  public.kago_guard_selection(), public.kago_guard_selection_item(), public.kago_guard_event(),
  public.kago_guard_signage_device(), public.kago_guard_signage_play(),
  public.kago_guard_audience_estimate() from public, anon, authenticated;
-- CHECK validators (kago_jsonb_is_int, kago_is_code, kago_is_code_set, kago_is_valid_event) stay executable.
revoke all on function public.kago_time_windows_match(jsonb, timestamptz, text), public.kago_lock_id(uuid)
  from public, anon, authenticated;

alter table public.experiments enable row level security;
alter table public.experiment_assignments enable row level security;
alter table public.selections enable row level security;
alter table public.selection_items enable row level security;
alter table public.events enable row level security;
alter table public.signage_devices enable row level security;
alter table public.signage_plays enable row level security;
alter table public.audience_estimates enable row level security;
revoke all on table public.experiments, public.experiment_assignments, public.selections,
  public.selection_items, public.events, public.signage_devices, public.signage_plays,
  public.audience_estimates from public, anon, authenticated, service_role;
-- Append-only records: service_role may read and insert, never update or delete.
grant select, insert on table public.experiments, public.experiment_assignments, public.selections,
  public.selection_items, public.events, public.signage_plays, public.audience_estimates to service_role;
grant select, insert, update, delete on table public.signage_devices to service_role;
commit;
