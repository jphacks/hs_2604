-- #144: fictional fresh products for the App menu genres (野菜・肉・魚) in the demo store.
-- Owner only (SQL Editor or psql), after DATA-01. Re-runnable: adds only what is missing and
-- never changes existing products, prices or DATA-01 rows. Everything here is fictional.
-- Fixed UUIDs: 0de0f001-0000-4000-8000-0000000000NN. Codes: PLU-4xxx 野菜 / PLU-5xxx 肉 / PLU-6xxx 魚.
begin;
do $$begin
  if not exists(select from public.stores where id='0da7a001-0000-4000-8000-000000000001'::uuid and slug='hiroshima-demo-store') then
    raise exception 'MENU: DATA-01 S1 (hiroshima-demo-store) is missing; do not substitute another store'; end if;
end$$;
create temp table menu_products(n integer primary key, code text not null unique, name text not null,
  category text not null, price integer not null) on commit drop;
insert into menu_products values
 ( 1, 'PLU-4001', 'トマト 1個',              '野菜',  98),
 ( 2, 'PLU-4002', 'なす 1本',                '野菜',  68),
 ( 3, 'PLU-4003', 'きゅうり 1本',            '野菜',  58),
 ( 4, 'PLU-4004', 'キャベツ 1玉',            '野菜', 198),
 ( 5, 'PLU-4005', 'にんじん 1本',            '野菜',  48),
 ( 6, 'PLU-4006', 'じゃがいも 1個',          '野菜',  38),
 ( 7, 'PLU-4007', 'ピーマン 1袋',            '野菜', 128),
 ( 8, 'PLU-4008', 'ほうれん草 1束',          '野菜', 158),
 ( 9, 'PLU-4009', 'ブロッコリー 1株',        '野菜', 198),
 (10, 'PLU-5001', '豚バラ薄切り 200g',       '肉',   398),
 (11, 'PLU-5002', '豚こま切れ 200g',         '肉',   298),
 (12, 'PLU-5003', '豚ロース とんかつ用 2枚', '肉',   458),
 (13, 'PLU-5004', '鶏もも肉 300g',           '肉',   378),
 (14, 'PLU-5005', '鶏むね肉 300g',           '肉',   258),
 (15, 'PLU-5006', '鶏手羽元 500g',           '肉',   348),
 (16, 'PLU-5007', '牛こま切れ 200g',         '肉',   598),
 (17, 'PLU-5008', '合いびき肉 250g',         '肉',   348),
 (18, 'PLU-5009', 'ロースハム 4枚',          '肉',   198),
 (19, 'PLU-6001', '生鮭 切身 2切',           '魚',   398),
 (20, 'PLU-6002', 'さば 切身 2切',           '魚',   298),
 (21, 'PLU-6003', 'ぶり 切身 2切',           '魚',   458),
 (22, 'PLU-6004', 'まぐろ赤身 刺身',         '魚',   598),
 (23, 'PLU-6005', 'かつおのたたき',          '魚',   498),
 (24, 'PLU-6006', 'あじ 2尾',                '魚',   258),
 (25, 'PLU-6007', 'むきえび 150g',           '魚',   398),
 (26, 'PLU-6008', 'するめいか 1杯',          '魚',   298),
 (27, 'PLU-6009', '釜揚げしらす 50g',        '魚',   298);
insert into public.products(id, code, name, category)
select ('0de0f001-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, code, name, category from menu_products
on conflict (code) do nothing;
insert into public.store_products(store_id, product_id, price, is_active)
select '0da7a001-0000-4000-8000-000000000001'::uuid, p.id, m.price, true
from menu_products m join public.products p on p.code = m.code
on conflict (store_id, product_id) do nothing;
-- Refuse an existing product that reuses one of these codes for something else.
do $$begin
  if exists(select from menu_products m join public.products p on p.code = m.code where p.name <> m.name or p.category <> m.category) then
    raise exception 'MENU: a product code is already used for a different product; nothing was changed'; end if;
  if (select count(*) from menu_products m join public.products p on p.code = m.code
      join public.store_products sp on sp.product_id = p.id and sp.store_id = '0da7a001-0000-4000-8000-000000000001'::uuid) <> 27 then
    raise exception 'MENU: store products are missing'; end if;
end$$;
commit;
