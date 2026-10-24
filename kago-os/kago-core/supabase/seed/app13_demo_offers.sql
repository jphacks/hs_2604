-- APP-13 demo data (optional). Run as the DB owner on a demo/verification DB only, after all migrations.
-- Fictional product and discounts for the demo story:
--   scan pasta → guerrilla coupon "生バジル 25% OFF" → pasta + tomato sauce set 10% OFF → evening deli time sale.
-- Requires the demo store (slug hiroshima-demo-store) and the DATA-01 products below. Re-running is a no-op.
-- Time sale: today 17:00–17:30 JST (edit the time_sale row for a rehearsal at another time).
begin;
do $$
declare store uuid; pasta uuid; sauce uuid; deli uuid; basil uuid;
begin
  select id into store from public.stores where slug = 'hiroshima-demo-store';
  select id into pasta from public.products where code = '2900000000100';
  select id into sauce from public.products where code = '2900000000162';
  select id into deli from public.products where code = 'PLU-2002';
  if store is null or pasta is null or sauce is null or deli is null then
    raise exception 'Demo store or DATA-01 products are missing' using errcode = '23503';
  end if;
  insert into public.products(code, name, category) values ('2900000000179', '生バジル', '青果')
    on conflict (code) do nothing;
  select id into basil from public.products where code = '2900000000179';
  insert into public.store_products(store_id, product_id, price, is_active) values (store, basil, 198, true)
    on conflict (store_id, product_id) do nothing;
  if not exists (select 1 from public.store_offers where store_id = store and headline = '生バジル 25% OFF') then
    insert into public.store_offers(store_id, kind, product_id, trigger_product_id, discount_percent, headline, starts_at, ends_at)
    values (store, 'guerrilla_coupon', basil, pasta, 25, '生バジル 25% OFF', now(), now() + interval '30 days'),
           (store, 'set_deal', sauce, pasta, 10, 'パスタ＋トマトソースで10%OFF', now(), now() + interval '30 days'),
           (store, 'time_sale', deli, null, 20, 'お惣菜 20%OFF',
             (date_trunc('day', now() at time zone 'Asia/Tokyo') + interval '17 hours') at time zone 'Asia/Tokyo',
             (date_trunc('day', now() at time zone 'Asia/Tokyo') + interval '17 hours 30 minutes') at time zone 'Asia/Tokyo');
  end if;
end $$;
commit;
