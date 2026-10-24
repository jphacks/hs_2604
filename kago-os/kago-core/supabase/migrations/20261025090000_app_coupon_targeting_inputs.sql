-- DEMO-02 #116: inputs for per-customer coupon targeting (spec: docs/specs/app-coupon-targeting.md).
-- app_list_offers keeps every existing key, filter and permission. It only adds, for the caller's own visit:
--   offers[].dismissed   : the customer chose "今回は見送る" for this offer in this visit (offer_events)
--   lastAddedProduct     : the product most recently added to the cart (cart_item_added; the trigger t), or null
--   claimedCouponCount   : guerrilla coupons already received in this visit (cap: 3 per visit)
-- Customers still cannot read offer_events / visit_offer_claims directly.
begin;

create or replace function public.app_list_offers(p_visit_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare snapshot jsonb; store uuid; at_time timestamptz := clock_timestamp(); items jsonb; next_change timestamptz;
  last_added jsonb; claimed_coupons integer;
begin
  -- app_get_cart checks the customer role and that the visit is the caller's own.
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
        where ci.visit_id = p_visit_id and ci.product_id = o.trigger_product_id),
      'dismissed', exists (select 1 from public.offer_events e where e.visit_id = p_visit_id and e.offer_id = o.id
        and e.user_id = auth.uid() and e.event_type = 'offer_dismissed'))
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
  -- The latest cart_item_added event of this visit whose product is still in the cart
  -- (quantity changes and removals are not "adding"; a claim that adds two products ties → code order).
  select jsonb_build_object('productId', p.id, 'code', p.code, 'name', p.name, 'category', p.category) into last_added
  from public.events e
  join public.cart_items ci on ci.visit_id = e.visit_id and ci.product_id = e.product_id
  join public.products p on p.id = e.product_id
  where e.visit_id = p_visit_id and e.event_type = 'cart_item_added'
  order by e.occurred_at desc, e.received_at desc, p.code limit 1;
  select count(*)::integer into claimed_coupons from public.visit_offer_claims c
  join public.store_offers o on o.id = c.offer_id where c.visit_id = p_visit_id and o.kind = 'guerrilla_coupon';
  return jsonb_build_object('visitId', p_visit_id, 'cartVersion', (snapshot->'visit'->>'cart_version')::integer,
    'serverTime', at_time, 'nextChangeAt', next_change, 'offers', items,
    'cartProductCodes', (select coalesce(jsonb_agg(l->>'code' order by l->>'code'), '[]'::jsonb)
      from jsonb_array_elements(snapshot->'cart') l),
    'lastAddedProduct', last_added, 'claimedCouponCount', claimed_coupons);
end;
$$;

revoke all on function public.app_list_offers(uuid) from public, anon;
grant execute on function public.app_list_offers(uuid) to authenticated;
commit;
