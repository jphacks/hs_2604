-- DB-07: confirm a purchase in one call. Requires DB-03 and DB-06.
-- Saves the order, its line snapshots and the visit end together, or nothing at all.
-- The same purchase request (idempotency_key) always returns the same order.
--
-- Errors the App (APP-09) should handle:
--   42501            not a customer session, or the visit is not the caller's
--   40001 + detail   'cart_changed'   the cart version moved; reload the cart
--                    'price_changed'  current prices differ from the confirmed total; show again
--   23505            the key was already used for a different request, or the visit already has an order
--   23514            the visit is not active, the cart is empty, or a product is no longer sold
--   22023            missing arguments
begin;

create function public.kago_checkout(
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
  unavailable integer;
  computed bigint;
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

  -- Serialise every request that carries the same key, then every checkout of the same visit.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text, 7244));

  -- Replay: same caller, visit, cart version and total -> same order. Anything else is refused.
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

  -- Current listing and price of every cart line, locked against concurrent price edits.
  select count(*), count(*) filter (where sp.product_id is null or not sp.is_active),
         coalesce(sum(sp.price::bigint * ci.quantity), 0)
    into line_count, unavailable, computed
  from public.cart_items ci
  left join public.store_products sp on sp.store_id = v.store_id and sp.product_id = ci.product_id
  where ci.visit_id = v.id;
  perform 1 from public.store_products sp join public.cart_items ci
    on ci.product_id = sp.product_id and ci.visit_id = v.id
    where sp.store_id = v.store_id for share of sp;
  if line_count = 0 then
    raise exception 'Cart is empty' using errcode = '23514';
  end if;
  if unavailable > 0 then
    raise exception 'A product in the cart is no longer sold here' using errcode = '23514';
  end if;
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
  update public.visits set status = 'completed', ended_at = at_time, last_activity_at = at_time
    where id = v.id;
  return query select new_id, computed::integer, at_time, false;
end;
$$;

revoke all on function public.kago_checkout(uuid, uuid, integer, integer) from public, anon;
grant execute on function public.kago_checkout(uuid, uuid, integer, integer) to authenticated;
commit;
