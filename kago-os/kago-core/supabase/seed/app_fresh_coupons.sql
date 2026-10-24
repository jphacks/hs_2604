-- #158: guerrilla coupons for three of the fresh products (#144) in the demo store. Owner only, after
-- DATA-01, DEMO-05 and app_menu_fresh_products.sql. Re-runnable; existing offers are never changed and a
-- stopped offer is never re-enabled. Store rates only: who receives a coupon is decided by the App (DEMO-02).
-- Chosen so the spaghetti demo is unchanged: spaghetti has no APP-04 rule (v2) to these products.
-- Fixed UUIDs: 0de0f006-0000-4000-8000-0000000000NN. Period = DEMO-05 (2026-10-24 .. 2026-11-07 JST).
begin;
create temp table fresh_coupons(n integer primary key, code text not null, rate integer not null, headline text not null) on commit drop;
insert into fresh_coupons values
 (1, 'PLU-5002', 20, '豚こま切れ 20% OFF'),
 (2, 'PLU-5004', 15, '鶏もも肉 15% OFF'),
 (3, 'PLU-5009', 25, 'ロースハム 25% OFF');
do $$begin
  if (select count(*) from fresh_coupons c join public.products p on p.code = c.code
      join public.store_products sp on sp.product_id = p.id and sp.is_active
       and sp.store_id = '0da7a001-0000-4000-8000-000000000001'::uuid) <> 3 then
    raise exception 'FRESH COUPONS: run app_menu_fresh_products.sql on DATA-01 S1 first'; end if;
end$$;
insert into public.store_offers(id, store_id, kind, product_id, trigger_product_id, discount_percent, headline, starts_at, ends_at)
select ('0de0f006-0000-4000-8000-' || lpad(c.n::text, 12, '0'))::uuid, '0da7a001-0000-4000-8000-000000000001'::uuid,
  'guerrilla_coupon', p.id, null, c.rate, c.headline, '2026-10-24T00:00:00+09', '2026-11-07T00:00:00+09'
from fresh_coupons c join public.products p on p.code = c.code
on conflict (id) do nothing;
-- Refuse an ID collision or changed terms; a rerun must not silently accept different offers.
do $$begin
  if (select count(*) from fresh_coupons c join public.products p on p.code = c.code join public.store_offers o
      on o.id = ('0de0f006-0000-4000-8000-' || lpad(c.n::text, 12, '0'))::uuid
      where o.store_id = '0da7a001-0000-4000-8000-000000000001'::uuid and o.kind = 'guerrilla_coupon' and o.product_id = p.id
        and o.trigger_product_id is null and o.discount_percent = c.rate and o.discount_amount is null) <> 3 then
    raise exception 'FRESH COUPONS: existing offer IDs differ; nothing was changed'; end if;
end$$;
commit;
