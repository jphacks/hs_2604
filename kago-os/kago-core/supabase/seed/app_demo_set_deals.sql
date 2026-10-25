-- #169: set deals (セット割) for the demo store, valid through the demo period so scanning the first product
-- of a pair shows 「セットでお得」. Owner only, after DATA-01 and app_menu_fresh_products.sql. Re-runnable;
-- existing offers are never changed and a stopped offer is never re-enabled. Discounts are computed by the DB.
-- Fixed UUIDs: 0de0f007-0000-4000-8000-0000000000NN. Period: 2026-10-25 .. 2026-11-07 JST (same end as DEMO-05).
begin;
create temp table demo_set_deals(n integer primary key, trigger_code text not null, code text not null,
  rate integer not null, headline text not null) on commit drop;
insert into demo_set_deals values
 (1, '2900000000100', '2900000000162', 10, 'パスタ＋トマトソース セットで10%OFF'),
 (2, '2900000000049', '2900000000056', 10, '牛乳＋食パン セットで10%OFF'),
 (3, 'PLU-5002',      'PLU-4004',      10, '豚こま＋キャベツ セットで10%OFF'),
 (4, 'PLU-5008',      'PLU-1001',      15, '合いびき肉＋玉ねぎ セットで15%OFF'),
 (5, 'PLU-6001',      'PLU-4008',      10, '生鮭＋ほうれん草 セットで10%OFF');
do $$begin
  if (select count(*) from demo_set_deals d
      join public.products p on p.code = d.code join public.store_products sp on sp.product_id = p.id and sp.is_active
        and sp.store_id = '0da7a001-0000-4000-8000-000000000001'::uuid
      join public.products t on t.code = d.trigger_code join public.store_products tsp on tsp.product_id = t.id and tsp.is_active
        and tsp.store_id = '0da7a001-0000-4000-8000-000000000001'::uuid) <> 5 then
    raise exception 'SET DEALS: run DATA-01 and app_menu_fresh_products.sql on DATA-01 S1 first'; end if;
end$$;
insert into public.store_offers(id, store_id, kind, product_id, trigger_product_id, discount_percent, headline, starts_at, ends_at)
select ('0de0f007-0000-4000-8000-' || lpad(d.n::text, 12, '0'))::uuid, '0da7a001-0000-4000-8000-000000000001'::uuid,
  'set_deal', p.id, t.id, d.rate, d.headline, '2026-10-25T00:00:00+09', '2026-11-07T00:00:00+09'
from demo_set_deals d join public.products p on p.code = d.code join public.products t on t.code = d.trigger_code
on conflict (id) do nothing;
do $$begin
  if (select count(*) from demo_set_deals d join public.products p on p.code = d.code join public.products t on t.code = d.trigger_code
      join public.store_offers o on o.id = ('0de0f007-0000-4000-8000-' || lpad(d.n::text, 12, '0'))::uuid
      where o.store_id = '0da7a001-0000-4000-8000-000000000001'::uuid and o.kind = 'set_deal' and o.product_id = p.id
        and o.trigger_product_id = t.id and o.discount_percent = d.rate and o.discount_amount is null) <> 5 then
    raise exception 'SET DEALS: existing offer IDs differ; nothing was changed'; end if;
end$$;
commit;
