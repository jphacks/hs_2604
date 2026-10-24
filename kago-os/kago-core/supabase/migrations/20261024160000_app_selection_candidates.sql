-- APP-05 (#21): what the App's selection may use for the caller's active visit, in one snapshot.
-- One read instead of many: deliverability is evaluated with the DB clock and the store time zone
-- (period, time windows, channel, listing), and store-wide popularity is returned as an aggregate
-- (customers cannot read other customers' orders). Ranking stays in the App (no recommendation logic in Core);
-- the result is saved with kago_save_selection, whose DB-05 triggers re-check every slot.
--
-- Returned lists contain only what is deliverable in the App right now:
--   promotions  active version, 'app' channel, inside its period and time windows, product sold here
--   ads         active placement, 'app' channel, inside its period, advertised product sold here
--   popular     store-wide order counts of the last 30 days (aggregate only, no customer data)
-- Errors: 42501 not own visit / customer; P0001 'visit_ended'.
begin;

create function public.app_selection_candidates(p_visit_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v public.visits%rowtype; st public.stores%rowtype; at_time timestamptz := clock_timestamp();
begin
  if auth.uid() is null or not public.kago_has_role('customer') then
    raise exception 'Customer required' using errcode = '42501';
  end if;
  select * into v from public.visits where id = p_visit_id;
  if not found or v.user_id <> auth.uid() then
    raise exception 'Visit unavailable' using errcode = '42501';
  end if;
  if v.status <> 'active' then
    raise exception 'Visit ended' using errcode = 'P0001', detail = 'visit_ended';
  end if;
  select * into st from public.stores where id = v.store_id;
  return jsonb_build_object(
    'visit', jsonb_build_object('id', v.id, 'store_id', v.store_id, 'cart_version', v.cart_version,
      'started_at', v.started_at, 'experiment_arm', v.experiment_arm),
    'at', at_time,
    'cart', (select coalesce(jsonb_agg(jsonb_build_object('productId', p.id, 'code', p.code) order by p.code), '[]'::jsonb)
      from public.cart_items ci join public.products p on p.id = ci.product_id where ci.visit_id = v.id),
    'listings', (select coalesce(jsonb_agg(jsonb_build_object('productId', p.id, 'code', p.code, 'name', p.name,
        'category', p.category, 'price', sp.price) order by p.code), '[]'::jsonb)
      from public.store_products sp join public.products p on p.id = sp.product_id
      where sp.store_id = v.store_id and sp.is_active),
    'promotions', (select coalesce(jsonb_agg(jsonb_build_object('promotionVersionId', pv.id, 'promotionId', pr.id,
        'version', pv.version, 'productId', pr.product_id, 'priority', pv.priority, 'reasonText', pv.reason_text,
        'startsAt', pv.starts_at, 'endsAt', pv.ends_at) order by pv.priority desc, pv.id), '[]'::jsonb)
      from public.promotion_versions pv join public.store_promotions pr on pr.id = pv.promotion_id
      join public.store_products sp on sp.store_id = pr.store_id and sp.product_id = pr.product_id
      where pr.store_id = v.store_id and pv.status = 'active' and 'app' = any(pv.channels)
        and pv.starts_at <= at_time and at_time < pv.ends_at and sp.is_active
        and public.kago_time_windows_match(pv.time_windows, at_time, st.timezone)),
    'ads', (select coalesce(jsonb_agg(jsonb_build_object('adPlacementId', pl.id, 'creativeVersionId', cv.id,
        'creativeVersion', cv.version, 'productId', c.product_id, 'headline', cv.headline,
        'makerName', m.display_name, 'startsAt', pl.starts_at, 'endsAt', pl.ends_at) order by pl.id), '[]'::jsonb)
      from public.ad_placements pl
      join public.creative_versions cv on cv.id = pl.creative_version_id
      join public.creatives c on c.id = cv.creative_id
      join public.makers m on m.id = c.maker_id
      join public.store_products sp on sp.store_id = pl.store_id and sp.product_id = c.product_id
      where pl.store_id = v.store_id and pl.status = 'active' and 'app' = any(pl.channels)
        and pl.starts_at <= at_time and at_time < pl.ends_at and sp.is_active),
    'popular', (select coalesce(jsonb_agg(jsonb_build_object('productId', x.product_id, 'orders', x.orders)
        order by x.orders desc, x.product_id), '[]'::jsonb)
      from (select oi.product_id, count(distinct o.id)::integer as orders
        from public.orders o join public.order_items oi on oi.order_id = o.id
        join public.store_products sp on sp.store_id = o.store_id and sp.product_id = oi.product_id and sp.is_active
        where o.store_id = v.store_id and o.ordered_at >= at_time - interval '30 days' and o.ordered_at < at_time
        group by oi.product_id order by 2 desc, 1 limit 20) x)
  );
end;
$$;

revoke all on function public.app_selection_candidates(uuid) from public, anon;
grant execute on function public.app_selection_candidates(uuid) to authenticated;
commit;
