-- Run as the database owner on a disposable, migrated Supabase-compatible DB.
-- All fixtures and helper objects are rolled back, including on failure.
begin;

create function pg_temp.db02_assert(ok boolean, message text)
returns void language plpgsql as $$
begin
  if ok is distinct from true then
    raise exception 'DB-02 assertion failed: %', message;
  end if;
end;
$$;

create function pg_temp.db02_reject(statement text, expected_state text)
returns void language plpgsql as $$
declare actual_state text;
begin
  begin
    execute statement;
  exception when others then
    get stacked diagnostics actual_state = returned_sqlstate;
  end;
  if actual_state is distinct from expected_state then
    raise exception 'Expected SQLSTATE %, got % for %', expected_state, actual_state, statement;
  end if;
end;
$$;

insert into auth.users (id, email) values
  ('10000000-0000-4000-8000-000000000001', 'db02-one@example.test'),
  ('10000000-0000-4000-8000-000000000002', 'db02-two@example.test');
insert into public.stores(id, slug, name) values
  ('20000000-0000-4000-8000-000000000001', 'db02-store-one', '架空1号店'),
  ('20000000-0000-4000-8000-000000000002', 'db02-store-two', '架空2号店');
insert into public.products(id, code, name, category) values
  ('30000000-0000-4000-8000-000000000001', '0123456789012', '架空商品', 'test'),
  ('30000000-0000-4000-8000-000000000002', 'PLU-2001', '架空計量品', 'test');
insert into public.store_products(store_id, product_id, price) values
  ('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 248),
  ('20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', 298),
  ('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', 0);
insert into public.store_members(store_id,user_id) values
  ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');
insert into public.customer_settings(user_id) values
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002');

select pg_temp.db02_assert(
  (select count(*)=2 and min(price)=248 and max(price)=298 from public.store_products
   where product_id='30000000-0000-4000-8000-000000000001'), 'two stores, two prices');
select pg_temp.db02_assert(
  (select code='0123456789012' from public.products where code='0123456789012'), 'leading zero lookup');
select pg_temp.db02_assert(
  (select count(*)=1 from public.products where code='PLU-2001'), 'PLU lookup');
select pg_temp.db02_assert(
  (select bool_and(not use_purchase_history and not use_current_cart) from public.customer_settings
   where user_id in ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002')), 'consent defaults false');
update public.customer_settings set use_purchase_history=true, use_current_cart=true,
  updated_at='2000-01-01T00:00:00Z'
  where user_id='10000000-0000-4000-8000-000000000001';
select pg_temp.db02_assert(
  (select use_purchase_history and use_current_cart and updated_at>'2000-01-01T00:00:00Z'
   from public.customer_settings where user_id='10000000-0000-4000-8000-000000000001'), 'save settings and server timestamp');
select pg_temp.db02_assert(
  (select not use_purchase_history and not use_current_cart from public.customer_settings
   where user_id='10000000-0000-4000-8000-000000000002'), 'second user settings unchanged');
update public.store_products set price=250, updated_at='2000-01-01T00:00:00Z'
  where store_id='20000000-0000-4000-8000-000000000001' and product_id='30000000-0000-4000-8000-000000000001';
select pg_temp.db02_assert(
  (select price=250 and updated_at>'2000-01-01T00:00:00Z' from public.store_products
   where store_id='20000000-0000-4000-8000-000000000001' and product_id='30000000-0000-4000-8000-000000000001'), 'price update timestamp');
select pg_temp.db02_assert(
  (select price=298 from public.store_products where store_id='20000000-0000-4000-8000-000000000002'
   and product_id='30000000-0000-4000-8000-000000000001'), 'second store price unchanged');

select pg_temp.db02_reject($q$update public.store_products set price=-1$q$, '23514');
select pg_temp.db02_reject($q$update public.store_products set price=null$q$, '23502');
select pg_temp.db02_reject($q$update public.store_products set price=2147483648$q$, '22003');
select pg_temp.db02_reject($q$insert into public.products(code,name,category) values('0123456789012','duplicate','test')$q$, '23505');
select pg_temp.db02_reject($q$insert into public.products(code,name,category) values('  ','bad','test')$q$, '23514');
select pg_temp.db02_reject($q$insert into public.products(code,name,category) values(' 0123456789012','bad','test')$q$, '23514');
select pg_temp.db02_reject($q$insert into public.stores(slug,name) values('db02-store-one','duplicate')$q$, '23505');
select pg_temp.db02_reject($q$insert into public.stores(slug,name,timezone) values('db02-store-three','test','UTC')$q$, '23514');
select pg_temp.db02_reject($q$insert into public.store_products values('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',100,true,now())$q$, '23505');
select pg_temp.db02_reject($q$insert into public.store_products(store_id,product_id,price) values('20000000-0000-4000-8000-000000000099','30000000-0000-4000-8000-000000000001',100)$q$, '23503');
select pg_temp.db02_reject($q$insert into public.store_products(store_id,product_id,price) values('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000099',100)$q$, '23503');
select pg_temp.db02_reject($q$insert into public.store_members(store_id,user_id,role) values('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','admin')$q$, '23514');
select pg_temp.db02_reject($q$insert into public.customer_settings(user_id) values('10000000-0000-4000-8000-000000000099')$q$, '23503');
select pg_temp.db02_reject($q$delete from public.products where id='30000000-0000-4000-8000-000000000001'$q$, '23001');
select pg_temp.db02_reject($q$delete from public.stores where id='20000000-0000-4000-8000-000000000001'$q$, '23001');
select pg_temp.db02_reject($q$delete from auth.users where id='10000000-0000-4000-8000-000000000001'$q$, '23001');

-- Contract for future cart/order/selection tables: reference the PAIR, not product_id alone.
create table public.db02_store_product_reference (
  store_id uuid not null,
  product_id uuid not null,
  foreign key(store_id,product_id) references public.store_products(store_id,product_id)
);
insert into db02_store_product_reference values
  ('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002');
select pg_temp.db02_reject($q$insert into db02_store_product_reference values('20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002')$q$, '23503');

select pg_temp.db02_assert(
  (select count(*)=5 and bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relname in ('stores','store_members','products','store_products','customer_settings')), 'all five tables have RLS');
select pg_temp.db02_assert(
  (select bool_and(not has_table_privilege(r, 'public.'||t, p))
   from unnest(case when to_regprocedure('public.kago_has_role(text)') is null then array['anon','authenticated'] else array['anon'] end) r
   cross join unnest(array['stores','store_members','products','store_products','customer_settings']) t
   cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p), 'no general role grants');
set local role authenticated;
select pg_temp.db02_reject($q$select * from public.customer_settings$q$, case when to_regprocedure('public.kago_has_role(text)') is null then '42501' end); -- DB-06 grants SELECT; rows are then filtered by RLS (db06.sql)
select pg_temp.db02_reject($q$update public.store_products set price=1$q$, '42501');
reset role;
-- Even if a later grant is accidentally added, enabled RLS with no policies denies rows.
grant select, update on public.customer_settings to authenticated;
set local role authenticated;
select pg_temp.db02_assert((select count(*)=0 from public.customer_settings), 'RLS denies all rows before DB-06');
with changed as (update public.customer_settings set use_purchase_history=true returning user_id)
select pg_temp.db02_assert((select count(*)=0 from changed), 'RLS denies updates before DB-06');
reset role;
set local role anon;
select pg_temp.db02_reject($q$select * from public.products$q$, '42501');
reset role;

select 'DB-02: all assertions passed; rolling back fixtures' as result;
rollback;
