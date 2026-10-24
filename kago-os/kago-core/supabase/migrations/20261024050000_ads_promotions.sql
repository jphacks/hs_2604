-- DB-04: ad calls, maker creatives, applications and review history, approved placements,
-- store promotions. Requires DB-02. Approval switching is implemented separately in DB-08.
begin;

-- Guards that read or lock other tables run as the owner (security definer, empty search_path,
-- EXECUTE revoked) so DB-06 can grant narrow table rights without exposing lookup tables.
-- Pure validators used by CHECK constraints (no table access).
create function public.kago_is_text_set(vals text[], allowed text[], min_count integer)
returns boolean language sql immutable set search_path = '' as $$
  select vals is not null and coalesce(array_ndims(vals), 1) = 1
    and cardinality(vals) >= min_count
    and array_position(vals, null) is null
    and (allowed is null or vals <@ allowed)
    and cardinality(vals) = (select count(distinct v) from unnest(vals) v)
    and not exists (select 1 from unnest(vals) v where btrim(v) = '' or v <> btrim(v));
$$;

create function public.kago_is_channel_set(vals text[])
returns boolean language sql immutable set search_path = '' as $$
  select public.kago_is_text_set(vals, array['app','signage']::text[], 1);
$$;

create function public.kago_is_short_text(val text, max_len integer)
returns boolean language sql immutable set search_path = '' as $$
  select val is null or (btrim(val) <> '' and char_length(val) <= max_len);
$$;

-- [{"weekdays":[1..7],"start":"HH:mm","end":"HH:mm"}], store-local time, empty array = all day.
-- start < end, end may be 24:00. Overnight windows are split in two. Duplicate weekdays in a
-- window and overlapping windows on the same weekday are rejected.
create function public.kago_is_valid_time_windows(windows jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  w jsonb; d jsonb; day_no integer; s integer; e integer;
  seen_days integer[]; all_days integer[] := '{}'; all_s integer[] := '{}'; all_e integer[] := '{}';
  i integer;
begin
  if windows is null or jsonb_typeof(windows) <> 'array' then return false; end if;
  for w in select value from jsonb_array_elements(windows) loop
    if jsonb_typeof(w) <> 'object'
       or (select array_agg(k order by k) from jsonb_object_keys(w) k) <> array['end','start','weekdays']
       or jsonb_typeof(w->'weekdays') <> 'array' or jsonb_array_length(w->'weekdays') = 0
       or jsonb_typeof(w->'start') <> 'string' or jsonb_typeof(w->'end') <> 'string'
       or (w->>'start') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or (w->>'end') !~ '^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$' then
      return false;
    end if;
    s := split_part(w->>'start', ':', 1)::integer * 60 + split_part(w->>'start', ':', 2)::integer;
    e := split_part(w->>'end', ':', 1)::integer * 60 + split_part(w->>'end', ':', 2)::integer;
    if s >= e then return false; end if;
    seen_days := '{}';
    for d in select value from jsonb_array_elements(w->'weekdays') loop
      if jsonb_typeof(d) <> 'number' or d::text !~ '^[1-7]$' then return false; end if;
      day_no := d::text::integer;
      if day_no = any(seen_days) then return false; end if;
      seen_days := seen_days || day_no;
      for i in 1 .. coalesce(array_length(all_days, 1), 0) loop
        if all_days[i] = day_no and s < all_e[i] and all_s[i] < e then return false; end if;
      end loop;
      all_days := all_days || day_no; all_s := all_s || s; all_e := all_e || e;
    end loop;
  end loop;
  return true;
end;
$$;

create table public.makers (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  display_name text not null check (btrim(display_name) <> ''),
  is_fictional boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.maker_members (
  maker_id uuid not null references public.makers(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (maker_id, user_id)
);
create index maker_members_user_id_idx on public.maker_members(user_id);

create table public.ad_calls (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  title text not null check (btrim(title) <> ''),
  description text check (public.kago_is_short_text(description, 2000)),
  categories text[] not null check (public.kago_is_text_set(categories, null, 1)),
  channels text[] not null check (public.kago_is_channel_set(channels)),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'draft' check (status in ('draft','open','closed')),
  disclosure_scope text[] not null default '{}' check (public.kago_is_text_set(disclosure_scope,
    array['impressions','clicks','cart_adds','purchases','signage_views']::text[], 0)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_at < ends_at),
  unique (id, store_id)
);
create index ad_calls_store_idx on public.ad_calls(store_id, starts_at desc);
create index ad_calls_open_idx on public.ad_calls(ends_at) where status = 'open';

create table public.creatives (
  id uuid primary key default gen_random_uuid(),
  maker_id uuid not null references public.makers(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (id, maker_id)
);
create index creatives_maker_idx on public.creatives(maker_id);

create table public.creative_versions (
  id uuid primary key default gen_random_uuid(),
  creative_id uuid not null references public.creatives(id) on delete restrict,
  version integer not null check (version >= 1),
  -- Storage object key (COM-03). Never a URL, signed URL or query string.
  image_path text not null check (btrim(image_path) <> '' and image_path = btrim(image_path)
    and image_path !~ '^[A-Za-z][A-Za-z0-9+.-]*:' and image_path !~ '^/' and position('?' in image_path) = 0),
  headline text not null check (btrim(headline) <> ''),
  note text check (public.kago_is_short_text(note, 500)),
  created_at timestamptz not null default now(),
  unique (creative_id, version),
  unique (id, creative_id)
);

create table public.ad_applications (
  id uuid primary key default gen_random_uuid(),
  ad_call_id uuid not null,
  store_id uuid not null,
  maker_id uuid not null,
  creative_id uuid not null,
  creative_version_id uuid not null,
  channels text[] not null check (public.kago_is_channel_set(channels)),
  requested_period tstzrange not null check (not isempty(requested_period)
    and not lower_inf(requested_period) and not upper_inf(requested_period)
    and lower_inc(requested_period) and not upper_inc(requested_period)),
  message text check (public.kago_is_short_text(message, 500)),
  revision integer not null default 1 check (revision >= 1),
  status text not null default 'submitted' check (status in ('submitted','approved','rejected')),
  review_comment text check (public.kago_is_short_text(review_comment, 200)),
  reviewed_by uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (ad_call_id, store_id) references public.ad_calls(id, store_id) on delete restrict,
  foreign key (creative_id, maker_id) references public.creatives(id, maker_id) on delete restrict,
  foreign key (creative_version_id, creative_id) references public.creative_versions(id, creative_id) on delete restrict,
  unique (ad_call_id, creative_id),
  unique (id, store_id),
  check ((status = 'submitted' and reviewed_by is null and reviewed_at is null and review_comment is null)
      or (status = 'approved' and reviewed_by is not null and reviewed_at is not null)
      or (status = 'rejected' and reviewed_by is not null and reviewed_at is not null and review_comment is not null))
);
create index ad_applications_store_idx on public.ad_applications(store_id, status);
create index ad_applications_maker_idx on public.ad_applications(maker_id);
create index ad_applications_creative_version_idx on public.ad_applications(creative_version_id);

-- One row per submission round. Written only by the ad_applications trigger.
create table public.application_revisions (
  application_id uuid not null references public.ad_applications(id) on delete restrict,
  revision integer not null check (revision >= 1),
  creative_version_id uuid not null references public.creative_versions(id) on delete restrict,
  channels text[] not null check (public.kago_is_channel_set(channels)),
  requested_period tstzrange not null,
  message text,
  submitted_at timestamptz not null,
  status text not null check (status in ('submitted','approved','rejected')),
  review_comment text,
  reviewed_by uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  primary key (application_id, revision),
  check ((status = 'submitted' and reviewed_by is null and reviewed_at is null and review_comment is null)
      or (status = 'approved' and reviewed_by is not null and reviewed_at is not null)
      or (status = 'rejected' and reviewed_by is not null and reviewed_at is not null and review_comment is not null))
);

create table public.ad_placements (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null,
  revision integer not null,
  store_id uuid not null,
  creative_version_id uuid not null references public.creative_versions(id) on delete restrict,
  channels text[] not null check (public.kago_is_channel_set(channels)),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'active' check (status in ('active','suspended','expired','superseded')),
  approved_by uuid not null references auth.users(id) on delete restrict,
  approved_at timestamptz not null default now(),
  suspend_reason text check (public.kago_is_short_text(suspend_reason, 200)),
  suspended_by uuid references auth.users(id) on delete restrict,
  suspended_at timestamptz,
  foreign key (application_id, store_id) references public.ad_applications(id, store_id) on delete restrict,
  foreign key (application_id, revision) references public.application_revisions(application_id, revision) on delete restrict,
  -- One placement per approved round: a suspended or superseded round cannot be re-placed without a new review.
  unique (application_id, revision),
  check (starts_at < ends_at),
  check ((status = 'suspended' and suspend_reason is not null and suspended_by is not null and suspended_at is not null)
      or (status <> 'suspended' and suspend_reason is null and suspended_by is null and suspended_at is null))
);
create unique index ad_placements_one_active_idx on public.ad_placements(application_id) where status = 'active';
create index ad_placements_store_active_idx on public.ad_placements(store_id, starts_at, ends_at) where status = 'active';
create index ad_placements_creative_version_idx on public.ad_placements(creative_version_id);

create table public.store_promotions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  product_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (store_id, product_id) references public.store_products(store_id, product_id) on delete restrict
);
create index store_promotions_store_idx on public.store_promotions(store_id);
create index store_promotions_product_idx on public.store_promotions(product_id);

create table public.promotion_versions (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.store_promotions(id) on delete restrict,
  version integer not null check (version >= 1),
  channels text[] not null check (public.kago_is_channel_set(channels)),
  time_windows jsonb not null default '[]' check (public.kago_is_valid_time_windows(time_windows)),
  priority integer not null default 0 check (priority >= 0),
  reason_text text not null check (btrim(reason_text) <> '' and char_length(reason_text) <= 200),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  unique (promotion_id, version),
  check (starts_at < ends_at)
);
create unique index promotion_versions_one_active_idx on public.promotion_versions(promotion_id) where status = 'active';

-- Ad calls: store is fixed; status only moves forward; delivery terms freeze after publishing.
create function public.kago_guard_ad_call()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Only draft ad calls can be deleted' using errcode = '23514';
    end if;
    return old;
  end if;
  if (new.id, new.store_id, new.created_at) is distinct from (old.id, old.store_id, old.created_at) then
    raise exception 'Ad call identity is immutable' using errcode = '23514';
  end if;
  if old.status = 'closed' then
    raise exception 'Closed ad calls are immutable' using errcode = '23514';
  end if;
  if old.status = 'open' and new.status = 'draft' then
    raise exception 'Published ad calls cannot return to draft' using errcode = '23514';
  end if;
  if old.status <> 'draft' and (new.channels, new.starts_at, new.ends_at)
     is distinct from (old.channels, old.starts_at, old.ends_at) then
    raise exception 'Published ad call channels and period are fixed' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger ad_calls_guard before update or delete on public.ad_calls
for each row execute function public.kago_guard_ad_call();
create trigger ad_calls_updated_at before insert or update on public.ad_calls
for each row execute function public.kago_set_updated_at();

-- Creatives keep their maker and product forever.
create function public.kago_reject_mutation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  raise exception '% rows are immutable', tg_table_name using errcode = '23514';
end;
$$;
create trigger creatives_immutable before update on public.creatives
for each row execute function public.kago_reject_mutation();

-- Creative versions are append-only and numbered 1,2,3... per creative.
create function public.kago_guard_creative_version()
returns trigger language plpgsql security definer set search_path = '' as $$
declare next_version integer;
begin
  if tg_op <> 'INSERT' then
    raise exception 'Creative versions are append-only' using errcode = '23514';
  end if;
  perform 1 from public.creatives where id = new.creative_id for update;
  if not found then raise exception 'Unknown creative' using errcode = '23503'; end if;
  select coalesce(max(version), 0) + 1 into next_version
    from public.creative_versions where creative_id = new.creative_id;
  if new.version is distinct from next_version then
    raise exception 'Creative version must be %', next_version using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger creative_versions_guard before insert or update or delete on public.creative_versions
for each row execute function public.kago_guard_creative_version();

-- Shared check for a (re)submission against the call and the store's listing.
create function public.kago_check_application_terms(app public.ad_applications)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.ad_calls%rowtype;
begin
  select * into c from public.ad_calls where id = app.ad_call_id for share;
  if not found then raise exception 'Unknown ad call' using errcode = '23503'; end if;
  if c.status <> 'open' or statement_timestamp() >= c.ends_at then
    raise exception 'Ad call is not open for applications' using errcode = '23514';
  end if;
  if not (app.channels <@ c.channels) then
    raise exception 'Requested channels are outside the ad call' using errcode = '23514';
  end if;
  if not (app.requested_period <@ tstzrange(c.starts_at, c.ends_at, '[)')) then
    raise exception 'Requested period is outside the ad call period' using errcode = '23514';
  end if;
  perform 1 from public.creatives cr join public.store_products sp
    on sp.store_id = app.store_id and sp.product_id = cr.product_id and sp.is_active
    where cr.id = app.creative_id for share of sp;
  if not found then
    raise exception 'Advertised product is not active in the call store' using errcode = '23503';
  end if;
end;
$$;

-- Applications: submitted -> approved|rejected (review), approved|rejected -> submitted (resubmit).
create function public.kago_guard_ad_application()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Ad applications keep their history' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'submitted' or new.revision <> 1 then
      raise exception 'New applications start as submitted revision 1' using errcode = '23514';
    end if;
    perform public.kago_check_application_terms(new);
    return new;
  end if;
  if (new.id, new.ad_call_id, new.store_id, new.maker_id, new.creative_id, new.created_at)
     is distinct from (old.id, old.ad_call_id, old.store_id, old.maker_id, old.creative_id, old.created_at) then
    raise exception 'Application identity is immutable' using errcode = '23514';
  end if;
  if old.status = 'submitted' then
    if new.status not in ('approved','rejected') then
      raise exception 'Submitted applications can only be reviewed' using errcode = '23514';
    end if;
    if (new.creative_version_id, new.channels, new.requested_period, new.message, new.revision)
       is distinct from (old.creative_version_id, old.channels, old.requested_period, old.message, old.revision) then
      raise exception 'Reviewed content must match the submission' using errcode = '23514';
    end if;
    perform 1 from public.store_members where store_id = new.store_id and user_id = new.reviewed_by;
    if not found then
      raise exception 'Reviewer must belong to the call store' using errcode = '42501';
    end if;
    new.reviewed_at := statement_timestamp();
  else
    if new.status <> 'submitted' or new.revision <> old.revision + 1 then
      raise exception 'Reviewed applications can only be resubmitted as the next revision' using errcode = '23514';
    end if;
    perform public.kago_check_application_terms(new);
  end if;
  return new;
end;
$$;
create trigger ad_applications_guard before insert or update or delete on public.ad_applications
for each row execute function public.kago_guard_ad_application();
create trigger ad_applications_updated_at before insert or update on public.ad_applications
for each row execute function public.kago_set_updated_at();

-- Record every submission round and its review result. Definer so that callers never need
-- direct write access to application_revisions.
create function public.kago_record_application_revision()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'submitted' then
    insert into public.application_revisions(application_id, revision, creative_version_id, channels,
      requested_period, message, submitted_at, status)
    values (new.id, new.revision, new.creative_version_id, new.channels, new.requested_period,
      new.message, new.updated_at, 'submitted');
  else
    update public.application_revisions
      set status = new.status, review_comment = new.review_comment,
          reviewed_by = new.reviewed_by, reviewed_at = new.reviewed_at
      where application_id = new.id and revision = new.revision and status = 'submitted';
    if not found then raise exception 'Missing submitted revision' using errcode = '23514'; end if;
  end if;
  return null;
end;
$$;
create trigger ad_applications_record_revision after insert or update on public.ad_applications
for each row execute function public.kago_record_application_revision();

create function public.kago_guard_application_revision()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'DELETE' or pg_trigger_depth() < 2 then
    raise exception 'Application revisions are maintained by ad_applications' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and (old.status <> 'submitted' or
     (new.application_id, new.revision, new.creative_version_id, new.channels, new.requested_period,
      new.message, new.submitted_at) is distinct from
     (old.application_id, old.revision, old.creative_version_id, old.channels, old.requested_period,
      old.message, old.submitted_at)) then
    raise exception 'Reviewed revisions are immutable' using errcode = '23514';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger application_revisions_guard before insert or update or delete on public.application_revisions
for each row execute function public.kago_guard_application_revision();

-- Placements pin the reviewed content. Only the status may move forward afterwards.
create function public.kago_guard_ad_placement()
returns trigger language plpgsql security definer set search_path = '' as $$
declare a public.ad_applications%rowtype;
begin
  if tg_op = 'DELETE' then
    raise exception 'Ad placements keep their history' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    if (new.id, new.application_id, new.revision, new.store_id, new.creative_version_id, new.channels,
        new.starts_at, new.ends_at, new.approved_by, new.approved_at) is distinct from
       (old.id, old.application_id, old.revision, old.store_id, old.creative_version_id, old.channels,
        old.starts_at, old.ends_at, old.approved_by, old.approved_at) then
      raise exception 'Approved placement content is immutable' using errcode = '23514';
    end if;
    if old.status <> 'active' or new.status = 'active' then
      raise exception 'Only active placements can move to suspended, expired or superseded' using errcode = '23514';
    end if;
    if new.status = 'suspended' then
      perform 1 from public.store_members where store_id = new.store_id and user_id = new.suspended_by;
      if not found then raise exception 'Suspender must belong to the store' using errcode = '42501'; end if;
      new.suspended_at := statement_timestamp();
    elsif new.status = 'superseded' then
      -- The old round keeps running until a newer round of the same application is approved.
      perform 1 from public.ad_applications
        where id = new.application_id and status = 'approved' and revision > old.revision;
      if not found then
        raise exception 'Only a newer approved round can supersede a placement' using errcode = '23514';
      end if;
    elsif statement_timestamp() < old.ends_at then
      raise exception 'Placements expire only after ends_at' using errcode = '23514';
    end if;
    return new;
  end if;
  if new.status <> 'active' then
    raise exception 'New placements start active' using errcode = '23514';
  end if;
  select * into a from public.ad_applications where id = new.application_id for share;
  if not found or a.store_id <> new.store_id then
    raise exception 'Unknown application for the store' using errcode = '23503';
  end if;
  if a.status <> 'approved' or new.revision is distinct from a.revision then
    raise exception 'Placement requires the currently approved round' using errcode = '23514';
  end if;
  if new.creative_version_id is distinct from a.creative_version_id then
    raise exception 'Placement must pin the approved creative version' using errcode = '23514';
  end if;
  if not (new.channels <@ a.channels) then
    raise exception 'Placement channels must be within the application' using errcode = '23514';
  end if;
  if not (tstzrange(new.starts_at, new.ends_at, '[)') <@ a.requested_period) then
    raise exception 'Placement period must be within the requested period' using errcode = '23514';
  end if;
  if new.approved_by is distinct from a.reviewed_by then
    raise exception 'Placement approver must be the application reviewer' using errcode = '23514';
  end if;
  new.approved_at := a.reviewed_at;
  perform 1 from public.store_members where store_id = new.store_id and user_id = new.approved_by;
  if not found then raise exception 'Approver must belong to the store' using errcode = '42501'; end if;
  perform 1 from public.creatives cr join public.store_products sp
    on sp.store_id = new.store_id and sp.product_id = cr.product_id and sp.is_active
    where cr.id = a.creative_id for share of sp;
  if not found then
    raise exception 'Advertised product is not active in the store' using errcode = '23503';
  end if;
  return new;
end;
$$;
create trigger ad_placements_guard before insert or update or delete on public.ad_placements
for each row execute function public.kago_guard_ad_placement();

create trigger store_promotions_immutable before update on public.store_promotions
for each row execute function public.kago_reject_mutation();

-- Promotion versions are append-only; only active -> inactive is allowed afterwards.
create function public.kago_guard_promotion_version()
returns trigger language plpgsql security definer set search_path = '' as $$
declare p public.store_promotions%rowtype; next_version integer;
begin
  if tg_op = 'DELETE' then
    raise exception 'Promotion versions keep their history' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    if (new.id, new.promotion_id, new.version, new.channels, new.time_windows, new.priority,
        new.reason_text, new.starts_at, new.ends_at, new.created_at) is distinct from
       (old.id, old.promotion_id, old.version, old.channels, old.time_windows, old.priority,
        old.reason_text, old.starts_at, old.ends_at, old.created_at)
       or (new.status is distinct from old.status and (old.status, new.status) <> ('active','inactive')) then
      raise exception 'Promotion versions only allow active -> inactive' using errcode = '23514';
    end if;
    return new;
  end if;
  select * into p from public.store_promotions where id = new.promotion_id for update;
  if not found then raise exception 'Unknown promotion' using errcode = '23503'; end if;
  select coalesce(max(version), 0) + 1 into next_version
    from public.promotion_versions where promotion_id = new.promotion_id;
  if new.version is distinct from next_version then
    raise exception 'Promotion version must be %', next_version using errcode = '23514';
  end if;
  if new.status = 'active' then
    perform 1 from public.store_products
      where store_id = p.store_id and product_id = p.product_id and is_active for share;
    if not found then
      raise exception 'Promoted product is not active in the store' using errcode = '23503';
    end if;
  end if;
  return new;
end;
$$;
create trigger promotion_versions_guard before insert or update or delete on public.promotion_versions
for each row execute function public.kago_guard_promotion_version();

revoke all on function public.kago_guard_ad_call(), public.kago_reject_mutation(),
  public.kago_guard_creative_version(), public.kago_check_application_terms(public.ad_applications),
  public.kago_guard_ad_application(), public.kago_record_application_revision(),
  public.kago_guard_application_revision(), public.kago_guard_ad_placement(),
  public.kago_guard_promotion_version() from public, anon, authenticated;
-- CHECK validators stay executable: they are pure and must run for any future writer.

alter table public.makers enable row level security;
alter table public.maker_members enable row level security;
alter table public.ad_calls enable row level security;
alter table public.creatives enable row level security;
alter table public.creative_versions enable row level security;
alter table public.ad_applications enable row level security;
alter table public.application_revisions enable row level security;
alter table public.ad_placements enable row level security;
alter table public.store_promotions enable row level security;
alter table public.promotion_versions enable row level security;
revoke all on table public.makers, public.maker_members, public.ad_calls, public.creatives,
  public.creative_versions, public.ad_applications, public.application_revisions, public.ad_placements,
  public.store_promotions, public.promotion_versions from public, anon, authenticated, service_role;
-- service_role gets only the verbs each history rule allows (Supabase default grants are ALL).
grant select, insert, update, delete on table public.makers, public.maker_members, public.ad_calls to service_role;
grant select, insert, delete on table public.creatives, public.store_promotions to service_role;
grant select, insert on table public.creative_versions to service_role;
grant select, insert, update on table public.ad_applications, public.ad_placements,
  public.promotion_versions to service_role;
grant select on table public.application_revisions to service_role;
commit;
