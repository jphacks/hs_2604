-- APP-13 (#93): serendipity offers in the App — guerrilla coupons, set deals and time sales.
-- Apply after all earlier migrations (DB-02..09, APP-02, #76). Existing tables keep their
-- permissions; customers never write offers, claims or discounts directly.
--
-- * store_offers: store-defined discounts (own-store staff insert / stop; INS-02 can add a screen later).
-- * visit_offer_claims: the customer accepted an offer during an active visit while it was valid.
--   A claim is honoured until checkout even if the offer ends later ("no NEW discount after the end").
-- * Discounts are computed in the DB only (kago_cart_discounts) and are shown by app_get_cart,
--   charged by kago_checkout and recorded in order_discounts. order_items keep list prices.
--
-- Discount per cart line (never stacked; the largest applicable claim wins):
--   time_sale         every unit of the product
--   guerrilla_coupon  one unit of the product
--   set_deal          min(qty of trigger, qty of product) units of BOTH products, only while both are in the cart
-- Unit discount = discount_amount, or floor(price * discount_percent / 100), never above the price.
--
-- Errors for the App: 42501 not own visit / customer; 40001 'cart_changed'; P0001 detail
-- 'offer_unavailable' | 'offer_claimed' | 'trigger_missing' | 'visit_ended'; 23505 request key reused; 22023 bad input.
begin;

create table public.store_offers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  kind text not null check (kind in ('guerrilla_coupon', 'set_deal', 'time_sale')),
  product_id uuid not null,
  trigger_product_id uuid,
  discount_percent integer check (discount_percent between 1 and 90),
  discount_amount integer check (discount_amount between 1 and 100000),
  headline text not null check (btrim(headline) <> '' and char_length(headline) <= 60),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  foreign key (store_id, product_id) references public.store_products(store_id, product_id) on delete restrict,
  foreign key (store_id, trigger_product_id) references public.store_products(store_id, product_id) on delete restrict,
  check (num_nonnulls(discount_percent, discount_amount) = 1),
  check (starts_at < ends_at),
  check ((kind = 'time_sale' and trigger_product_id is null)
      or (kind = 'set_deal' and trigger_product_id is not null and trigger_product_id <> product_id and discount_percent is not null)
      or (kind = 'guerrilla_coupon' and (trigger_product_id is null or trigger_product_id <> product_id)))
);
create index store_offers_store_active_idx on public.store_offers(store_id, starts_at, ends_at) where status = 'active';

-- Terms are frozen once published: only active -> inactive (stop) is allowed.
create function public.kago_guard_store_offer()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Offers cannot be deleted; stop them instead' using errcode = '23514';
  end if;
  if (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status')
     or not (old.status = 'active' and new.status = 'inactive') then
    raise exception 'Only stopping an active offer is allowed' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger store_offers_guard before update or delete on public.store_offers
for each row execute function public.kago_guard_store_offer();

create table public.visit_offer_claims (
  visit_id uuid not null references public.visits(id) on delete restrict,
  offer_id uuid not null references public.store_offers(id) on delete restrict,
  request_id uuid not null unique,
  claimed_at timestamptz not null,
  primary key (visit_id, offer_id)
);

create table public.order_discounts (
  order_id uuid not null references public.orders(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  offer_id uuid not null references public.store_offers(id) on delete restrict,
  units integer not null check (units >= 1),
  amount integer not null check (amount >= 1),
  primary key (order_id, product_id)
);
create function public.kago_reject_discount_mutation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  raise exception 'Claims and order discounts are immutable' using errcode = '23514';
end;
$$;
create trigger order_discounts_immutable before update or delete on public.order_discounts
for each row execute function public.kago_reject_discount_mutation();
create trigger visit_offer_claims_immutable before update or delete on public.visit_offer_claims
for each row execute function public.kago_reject_discount_mutation();

-- Offer display/open/dismiss log (APP-07 link). Cart additions are the existing cart events
-- with payload.offer_id, and the claim's request_id equals that event_id.
create table public.offer_events (
  event_id uuid primary key,
  event_type text not null check (event_type in ('offer_shown', 'offer_opened', 'offer_dismissed')),
  visit_id uuid not null,
  user_id uuid not null,
  store_id uuid not null,
  offer_id uuid not null references public.store_offers(id) on delete restrict,
  occurred_at timestamptz not null,
  foreign key (visit_id, user_id, store_id) references public.visits(id, user_id, store_id) on delete restrict
);
create index offer_events_offer_idx on public.offer_events(offer_id, event_type);

alter table public.store_offers enable row level security;
alter table public.visit_offer_claims enable row level security;
alter table public.order_discounts enable row level security;
alter table public.offer_events enable row level security;
revoke all on table public.store_offers, public.visit_offer_claims, public.order_discounts, public.offer_events
  from public, anon, authenticated;
grant select, insert on table public.store_offers to authenticated;
grant update (status) on table public.store_offers to authenticated;
grant select on table public.order_discounts, public.offer_events to authenticated;
grant select on table public.store_offers, public.visit_offer_claims, public.order_discounts, public.offer_events to service_role;

create policy store_offers_read_own_store on public.store_offers for select to authenticated
  using (store_id in (select public.kago_my_store_ids()));
create policy store_offers_insert_own_store on public.store_offers for insert to authenticated
  with check (store_id in (select public.kago_my_store_ids()) and status = 'active');
create policy store_offers_stop_own_store on public.store_offers for update to authenticated
  using (store_id in (select public.kago_my_store_ids()))
  with check (store_id in (select public.kago_my_store_ids()));
create policy order_discounts_read_own on public.order_discounts for select to authenticated
  using (order_id in (select id from public.orders));
create policy offer_events_read_own_store on public.offer_events for select to authenticated
  using (store_id in (select public.kago_my_store_ids()));

create function public.kago_offer_unit_discount(p_price integer, p_percent integer, p_amount integer)
returns integer language sql immutable set search_path = '' as $$
  select least(p_price, coalesce(p_amount, (p_price::bigint * p_percent / 100)::integer));
$$;

-- One discount row per discounted cart line of the visit. Internal: called by the RPCs below.
create function public.kago_cart_discounts(p_visit_id uuid)
returns table (product_id uuid, offer_id uuid, units integer, amount integer)
language sql stable security definer set search_path = '' as $$
  with lines as (
    select ci.product_id, ci.quantity, sp.price
    from public.cart_items ci
    join public.visits v on v.id = ci.visit_id
    join public.store_products sp on sp.store_id = v.store_id and sp.product_id = ci.product_id
    where ci.visit_id = p_visit_id
  ), claimed as (
    select o.* from public.visit_offer_claims c join public.store_offers o on o.id = c.offer_id
    where c.visit_id = p_visit_id
  ), candidates as (
    select o.id as offer_id, l.product_id, l.price, o.discount_percent, o.discount_amount,
      case o.kind when 'time_sale' then l.quantity when 'guerrilla_coupon' then 1
        else least(l.quantity, t.quantity) end as units
    from claimed o join lines l on l.product_id = o.product_id
    left join lines t on t.product_id = o.trigger_product_id
    where o.kind <> 'set_deal' or t.product_id is not null
    union all
    select o.id, t.product_id, t.price, o.discount_percent, o.discount_amount, least(l.quantity, t.quantity)
    from claimed o join lines l on l.product_id = o.product_id
    join lines t on t.product_id = o.trigger_product_id
    where o.kind = 'set_deal'
  )
  select distinct on (c.product_id) c.product_id, c.offer_id, c.units,
    c.units * public.kago_offer_unit_discount(c.price, c.discount_percent, c.discount_amount)
  from candidates c
  where c.units > 0 and public.kago_offer_unit_discount(c.price, c.discount_percent, c.discount_amount) > 0
  order by c.product_id, 4 desc, c.offer_id;
$$;

-- APP-02's snapshot plus per-line discount, still one locked snapshot of the visit.
create or replace function public.app_get_cart(p_visit_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v public.visits%rowtype; lines jsonb; discount_total bigint;
begin
  if auth.uid() is null or not public.kago_has_role('customer') then
    raise exception 'Customer required' using errcode = '42501';
  end if;
  select * into v from public.visits where id = p_visit_id for share;
  if not found or v.user_id <> auth.uid() then
    raise exception 'Visit unavailable' using errcode = '42501';
  end if;
  if v.status <> 'active' then
    raise exception 'Visit ended' using errcode = 'P0001', detail = 'visit_ended';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('productId', p.id, 'code', p.code,
    'name', p.name, 'category', p.category, 'price', sp.price, 'available', sp.is_active,
    'quantity', ci.quantity, 'discount', coalesce(d.amount, 0), 'offerId', d.offer_id,
    'offerKind', o.kind) order by p.name, p.id), '[]'::jsonb), coalesce(sum(d.amount), 0)
    into lines, discount_total
  from public.cart_items ci join public.products p on p.id = ci.product_id
  join public.store_products sp on sp.store_id = v.store_id and sp.product_id = ci.product_id
  left join public.kago_cart_discounts(v.id) d on d.product_id = ci.product_id
  left join public.store_offers o on o.id = d.offer_id
  where ci.visit_id = v.id;
  return jsonb_build_object('visit', jsonb_build_object('id', v.id, 'store_id', v.store_id,
    'cart_version', v.cart_version, 'started_at', v.started_at), 'cart', lines,
    'discountTotal', discount_total,
    'claimedOfferIds', (select coalesce(jsonb_agg(c.offer_id order by c.claimed_at, c.offer_id), '[]'::jsonb)
      from public.visit_offer_claims c where c.visit_id = v.id));
end;
$$;

-- Offers the visit could use now, plus when the list next changes (a time sale starting/ending).
create function public.app_list_offers(p_visit_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare snapshot jsonb; store uuid; at_time timestamptz := clock_timestamp(); items jsonb; next_change timestamptz;
begin
  snapshot := public.app_get_cart(p_visit_id);
  store := (snapshot->'visit'->>'store_id')::uuid;
  select coalesce(jsonb_agg(jsonb_build_object(
      'offerId', o.id, 'kind', o.kind, 'headline', o.headline,
      'discountPercent', o.discount_percent, 'discountAmount', o.discount_amount,
      'unitDiscount', public.kago_offer_unit_discount(sp.price, o.discount_percent, o.discount_amount),
      'startsAt', o.starts_at, 'endsAt', o.ends_at,
      'product', jsonb_build_object('productId', p.id, 'code', p.code, 'name', p.name, 'category', p.category,
        'price', sp.price, 'available', sp.is_active),
      'trigger', case when tp.id is null then null else jsonb_build_object('productId', tp.id, 'code', tp.code,
        'name', tp.name, 'category', tp.category, 'price', tsp.price, 'available', tsp.is_active,
        'unitDiscount', public.kago_offer_unit_discount(tsp.price, o.discount_percent, o.discount_amount)) end,
      'productInCart', exists (select 1 from public.cart_items ci where ci.visit_id = p_visit_id and ci.product_id = o.product_id),
      'triggerInCart', o.trigger_product_id is not null and exists (select 1 from public.cart_items ci
        where ci.visit_id = p_visit_id and ci.product_id = o.trigger_product_id))
      order by o.starts_at, o.id), '[]'::jsonb) into items
  from public.store_offers o
  join public.products p on p.id = o.product_id
  join public.store_products sp on sp.store_id = o.store_id and sp.product_id = o.product_id
  left join public.products tp on tp.id = o.trigger_product_id
  left join public.store_products tsp on tsp.store_id = o.store_id and tsp.product_id = o.trigger_product_id
  where o.store_id = store and o.status = 'active' and o.starts_at <= at_time and at_time < o.ends_at
    and sp.is_active and (tsp.product_id is null or tsp.is_active)
    and not exists (select 1 from public.visit_offer_claims c where c.visit_id = p_visit_id and c.offer_id = o.id);
  select min(t) into next_change from (
    select starts_at as t from public.store_offers where store_id = store and status = 'active' and starts_at > at_time
    union all
    select ends_at from public.store_offers where store_id = store and status = 'active' and starts_at <= at_time and ends_at > at_time
  ) changes;
  return jsonb_build_object('visitId', p_visit_id, 'cartVersion', (snapshot->'visit'->>'cart_version')::integer,
    'serverTime', at_time, 'nextChangeAt', next_change, 'offers', items,
    'cartProductCodes', (select coalesce(jsonb_agg(l->>'code' order by l->>'code'), '[]'::jsonb)
      from jsonb_array_elements(snapshot->'cart') l));
end;
$$;

-- Accept an offer: adds the missing product(s) and records the claim in one versioned cart change.
create function public.app_claim_offer(p_visit_id uuid, p_request_id uuid, p_offer_id uuid,
  p_expected_cart_version integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); v public.visits%rowtype; o public.store_offers%rowtype;
  prev public.app_cart_requests%rowtype; req jsonb; result jsonb; at_time timestamptz;
  new_version integer; added uuid[] := '{}'; target uuid; event_no integer := 0;
begin
  if actor is null or not public.kago_has_role('customer') then
    raise exception 'Customer required' using errcode = '42501';
  end if;
  if p_visit_id is null or p_request_id is null or p_offer_id is null
     or p_expected_cart_version is null or p_expected_cart_version < 0 then
    raise exception 'Invalid offer request' using errcode = '22023';
  end if;
  req := jsonb_build_object('kind', 'claim', 'offerId', p_offer_id, 'expectedVersion', p_expected_cart_version);
  perform public.kago_lock_id(p_request_id);
  select * into prev from public.app_cart_requests where request_id = p_request_id;
  if found then
    if prev.user_id <> actor or prev.visit_id <> p_visit_id or prev.request <> req then
      raise exception 'Request key reused' using errcode = '23505';
    end if;
    return public.app_get_cart(p_visit_id) || prev.result || jsonb_build_object('replayed', true);
  end if;
  select * into v from public.visits where id = p_visit_id for update;
  if not found or v.user_id <> actor then
    raise exception 'Visit unavailable' using errcode = '42501';
  end if;
  if v.status <> 'active' then
    raise exception 'Visit ended' using errcode = 'P0001', detail = 'visit_ended';
  end if;
  if v.cart_version <> p_expected_cart_version then
    raise exception 'Cart changed' using errcode = '40001', detail = 'cart_changed';
  end if;
  at_time := greatest(clock_timestamp(), v.started_at, v.last_activity_at);
  select * into o from public.store_offers where id = p_offer_id for share;
  if not found or o.store_id <> v.store_id or o.status <> 'active'
     or clock_timestamp() < o.starts_at or clock_timestamp() >= o.ends_at then
    raise exception 'Offer unavailable' using errcode = 'P0001', detail = 'offer_unavailable';
  end if;
  perform 1 from public.store_products sp where sp.store_id = v.store_id and sp.is_active
    and sp.product_id in (o.product_id, coalesce(o.trigger_product_id, o.product_id))
    having count(*) = case when o.trigger_product_id is null then 1 else 2 end;
  if not found then
    raise exception 'Offer product unavailable' using errcode = 'P0001', detail = 'offer_unavailable';
  end if;
  perform 1 from public.visit_offer_claims where visit_id = v.id and offer_id = o.id;
  if found then
    raise exception 'Offer already claimed' using errcode = 'P0001', detail = 'offer_claimed';
  end if;
  if o.trigger_product_id is not null and not exists (select 1 from public.cart_items
       where visit_id = v.id and product_id = o.trigger_product_id) then
    raise exception 'Trigger product is not in the cart' using errcode = 'P0001', detail = 'trigger_missing';
  end if;

  if not exists (select 1 from public.cart_items where visit_id = v.id and product_id = o.product_id) then
    insert into public.cart_items(visit_id, product_id, quantity) values (v.id, o.product_id, 1);
    added := added || o.product_id;
  end if;
  -- A claim always changes the price of the cart, so it always moves the version.
  new_version := v.cart_version + 1;
  update public.visits set cart_version = new_version, last_activity_at = at_time where id = v.id;
  foreach target in array added loop
    event_no := event_no + 1;
    insert into public.events(event_id, event_type, schema_version, occurred_at, store_id, user_id,
      visit_id, product_id, payload, data_origin)
    values (case when event_no = 1 then p_request_id else gen_random_uuid() end, 'cart_item_added', 1, at_time,
      v.store_id, actor, v.id, target, jsonb_build_object('source', 'manual', 'quantity', 1,
        'quantity_delta', 1, 'cart_version', new_version, 'offer_id', o.id, 'offer_kind', o.kind), 'operated');
  end loop;
  insert into public.visit_offer_claims(visit_id, offer_id, request_id, claimed_at)
    values (v.id, o.id, p_request_id, at_time);
  result := jsonb_build_object('appliedVersion', new_version, 'claimedOfferId', o.id);
  insert into public.app_cart_requests(request_id, user_id, visit_id, request, result)
    values (p_request_id, actor, v.id, req, result);
  return public.app_get_cart(v.id) || result || jsonb_build_object('replayed', false);
end;
$$;

-- Display / open / dismiss of an offer shown to the caller's active visit. Same id + content = no-op.
create function public.app_record_offer_event(p_visit_id uuid, p_event_id uuid, p_offer_id uuid, p_event_type text)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); v public.visits%rowtype; prev public.offer_events%rowtype;
begin
  if actor is null or not public.kago_has_role('customer') then
    raise exception 'Customer required' using errcode = '42501';
  end if;
  if p_visit_id is null or p_event_id is null or p_offer_id is null
     or p_event_type is null or p_event_type not in ('offer_shown', 'offer_opened', 'offer_dismissed') then
    raise exception 'Invalid offer event' using errcode = '22023';
  end if;
  perform public.kago_lock_id(p_event_id);
  select * into prev from public.offer_events where event_id = p_event_id;
  if found then
    if prev.user_id <> actor or prev.visit_id <> p_visit_id or prev.offer_id <> p_offer_id or prev.event_type <> p_event_type then
      raise exception 'Event key reused' using errcode = '23505';
    end if;
    return;
  end if;
  select * into v from public.visits where id = p_visit_id;
  if not found or v.user_id <> actor then
    raise exception 'Visit unavailable' using errcode = '42501';
  end if;
  if v.status <> 'active' then
    raise exception 'Visit ended' using errcode = 'P0001', detail = 'visit_ended';
  end if;
  perform 1 from public.store_offers where id = p_offer_id and store_id = v.store_id;
  if not found then
    raise exception 'Offer unavailable' using errcode = 'P0001', detail = 'offer_unavailable';
  end if;
  insert into public.offer_events(event_id, event_type, visit_id, user_id, store_id, offer_id, occurred_at)
  values (p_event_id, p_event_type, v.id, actor, v.store_id, p_offer_id, greatest(clock_timestamp(), v.started_at));
end;
$$;

-- #76's checkout plus claimed discounts. Same arguments, locks and error codes; the expected
-- total is the discounted total shown by app_get_cart.
create or replace function public.kago_checkout(
  p_visit_id uuid,
  p_idempotency_key uuid,
  p_expected_cart_version integer,
  p_expected_total integer
) returns table (order_id uuid, total integer, ordered_at timestamptz, replayed boolean)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  actor uuid := auth.uid();
  v public.visits%rowtype;
  prev public.orders%rowtype;
  line_count integer;
  locked_line_count integer;
  unavailable integer;
  computed bigint;
  discounted bigint;
  new_id uuid := gen_random_uuid();
  at_time timestamptz;
begin
  if actor is null or not public.kago_has_role('customer') then
    raise exception 'Customer authentication required' using errcode = '42501';
  end if;
  if p_visit_id is null or p_idempotency_key is null or p_expected_cart_version is null
     or p_expected_total is null then
    raise exception 'Visit, request key, cart version and total are required' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text, 7244));

  select * into prev from public.orders o where o.idempotency_key = p_idempotency_key;
  if found then
    if prev.user_id = actor and prev.visit_id = p_visit_id
       and prev.cart_version = p_expected_cart_version and prev.total = p_expected_total then
      return query select prev.id, prev.total, prev.ordered_at, true;
      return;
    end if;
    raise exception 'Purchase request key was already used for a different request' using errcode = '23505';
  end if;

  select * into v from public.visits where id = p_visit_id for update;
  if not found or v.user_id <> actor then
    raise exception 'Visit is not available' using errcode = '42501';
  end if;
  perform 1 from public.orders o where o.visit_id = p_visit_id;
  if found then
    raise exception 'This visit already has an order' using errcode = '23505';
  end if;
  if v.status <> 'active' then
    raise exception 'Visit is not active' using errcode = '23514';
  end if;
  if v.cart_version <> p_expected_cart_version then
    raise exception 'Cart changed; reload before purchasing' using errcode = '40001', detail = 'cart_changed';
  end if;

  perform 1 from public.store_products sp join public.cart_items ci
    on ci.product_id = sp.product_id and ci.visit_id = v.id
    where sp.store_id = v.store_id order by sp.product_id for share of sp;
  get diagnostics locked_line_count = row_count;

  select count(*), count(*) filter (where sp.product_id is null or not sp.is_active),
         coalesce(sum(sp.price::bigint * ci.quantity), 0)
    into line_count, unavailable, computed
  from public.cart_items ci
  left join public.store_products sp on sp.store_id = v.store_id and sp.product_id = ci.product_id
  where ci.visit_id = v.id;
  if line_count = 0 then
    raise exception 'Cart is empty' using errcode = '23514';
  end if;
  if unavailable > 0 or line_count <> locked_line_count then
    raise exception 'A product in the cart is no longer sold here' using errcode = '23514';
  end if;
  select coalesce(sum(d.amount), 0) into discounted from public.kago_cart_discounts(v.id) d;
  computed := computed - discounted;
  if computed > 2147483647 then
    raise exception 'Order total is too large' using errcode = '22003';
  end if;
  if computed <> p_expected_total then
    raise exception 'Prices changed; confirm the new total' using errcode = '40001', detail = 'price_changed';
  end if;

  at_time := greatest(clock_timestamp(), v.started_at, v.last_activity_at);
  insert into public.orders(id, visit_id, user_id, store_id, ordered_at, total, idempotency_key,
    cart_version, data_origin)
  values (new_id, v.id, v.user_id, v.store_id, at_time, computed::integer, p_idempotency_key,
    v.cart_version, 'operated');
  insert into public.order_items(order_id, product_id, product_name, unit_price, quantity)
  select new_id, ci.product_id, p.name, sp.price, ci.quantity
  from public.cart_items ci
  join public.products p on p.id = ci.product_id
  join public.store_products sp on sp.store_id = v.store_id and sp.product_id = ci.product_id
  where ci.visit_id = v.id;
  insert into public.order_discounts(order_id, product_id, offer_id, units, amount)
  select new_id, d.product_id, d.offer_id, d.units, d.amount from public.kago_cart_discounts(v.id) d;
  update public.visits set status = 'completed', ended_at = at_time, last_activity_at = at_time
    where id = v.id;
  return query select new_id, computed::integer, at_time, false;
end;
$$;

revoke all on function public.kago_guard_store_offer(), public.kago_reject_discount_mutation(),
  public.kago_cart_discounts(uuid), public.kago_offer_unit_discount(integer, integer, integer)
  from public, anon, authenticated;
revoke all on function public.app_list_offers(uuid), public.app_claim_offer(uuid, uuid, uuid, integer),
  public.app_record_offer_event(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.app_list_offers(uuid), public.app_claim_offer(uuid, uuid, uuid, integer),
  public.app_record_offer_event(uuid, uuid, uuid, text) to authenticated;
revoke all on function public.kago_checkout(uuid, uuid, integer, integer) from public, anon;
grant execute on function public.kago_checkout(uuid, uuid, integer, integer) to authenticated;
commit;
