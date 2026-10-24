-- Disposable Supabase-compatible DB only; run as owner after DB-02 and DB-03.
begin;
create function pg_temp.db03_assert(ok boolean, message text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'DB-03 assertion failed: %',message; end if;
end;
$$;
create function pg_temp.db03_reject(statement text, expected_state text) returns void language plpgsql as $$
declare actual_state text;
begin
  begin execute statement;
  exception when others then get stacked diagnostics actual_state = returned_sqlstate;
  end;
  if actual_state is distinct from expected_state then
    raise exception 'Expected SQLSTATE %, got % for %',expected_state,actual_state,statement;
  end if;
end;
$$;
insert into auth.users(id,email) values
 ('10000000-0000-4000-8000-000000000001','db03-one@example.test'),
 ('10000000-0000-4000-8000-000000000002','db03-two@example.test');
insert into public.stores(id,slug,name) values
 ('20000000-0000-4000-8000-000000000001','db03-one','架空1号店'),
 ('20000000-0000-4000-8000-000000000002','db03-two','架空2号店');
insert into public.products(id,code,name,category) values
 ('30000000-0000-4000-8000-000000000001','0123456789012','購入時の商品名','test'),
 ('30000000-0000-4000-8000-000000000002','PLU-2001','他店のみの商品','test');
insert into public.store_products(store_id,product_id,price) values
 ('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',248),
 ('20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002',98);
insert into public.visits(id,user_id,store_id,started_at,last_activity_at) values
 ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','2026-10-24T10:00:00+09','2026-10-24T10:00:00+09'),
 ('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','2026-10-24T11:00:00+09','2026-10-24T11:00:00+09');
insert into public.cart_items(visit_id,product_id,quantity) values
 ('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',1),
 ('40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001',2);
update public.cart_items set quantity=3,updated_at='2000-01-01T00:00:00Z' where visit_id='40000000-0000-4000-8000-000000000002';
select pg_temp.db03_assert((select quantity=1 from public.cart_items where visit_id='40000000-0000-4000-8000-000000000001'),'first visit cart unchanged');
select pg_temp.db03_assert((select quantity=3 and updated_at>'2000-01-01T00:00:00Z' from public.cart_items where visit_id='40000000-0000-4000-8000-000000000002'),'second visit cart and DB timestamp');
update public.visits set cart_version=1 where id='40000000-0000-4000-8000-000000000001';
update public.visits set cart_version=2 where id='40000000-0000-4000-8000-000000000002';
insert into public.orders(id,visit_id,user_id,store_id,ordered_at,total,idempotency_key,cart_version,data_origin) values
 ('50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','2026-10-24T10:05:00+09',248,'60000000-0000-4000-8000-000000000001',1,'operated'),
 ('50000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','2026-10-24T11:05:00+09',744,'60000000-0000-4000-8000-000000000002',2,'seeded');
insert into public.order_items(order_id,product_id,product_name,unit_price,quantity) values
 ('50000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','購入時の商品名',248,1),
 ('50000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','購入時の商品名',248,3);
update public.visits set status='completed',ended_at='2026-10-24T10:05:00+09' where id='40000000-0000-4000-8000-000000000001';
update public.visits set status='completed',ended_at='2026-10-24T11:05:00+09' where id='40000000-0000-4000-8000-000000000002';
update public.store_products set price=500;
update public.products set name='更新後の商品名' where id='30000000-0000-4000-8000-000000000001';
select pg_temp.db03_assert((select count(*)=2 and sum(total)=992 and count(distinct visit_id)=2 from public.orders where user_id='10000000-0000-4000-8000-000000000001'),'two visits, two orders');
select pg_temp.db03_assert((select count(*)=2 and bool_and(unit_price=248 and product_name='購入時の商品名') from public.order_items),'snapshots survive master changes');
select pg_temp.db03_assert((select sum(unit_price*quantity)=992 from public.order_items),'historical line total');
select pg_temp.db03_reject($q$update public.cart_items set quantity=0$q$, '23514');
select pg_temp.db03_reject($q$delete from public.cart_items where visit_id='40000000-0000-4000-8000-000000000001'$q$, '23514');
select pg_temp.db03_reject($q$insert into public.cart_items values('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002',1,now())$q$, '23514');
select pg_temp.db03_reject($q$update public.visits set status='active',ended_at=null where id='40000000-0000-4000-8000-000000000001'$q$, '23514');
select pg_temp.db03_reject($q$update public.visits set user_id='10000000-0000-4000-8000-000000000002' where id='40000000-0000-4000-8000-000000000001'$q$, '23514');
select pg_temp.db03_reject($q$update public.orders set total=0$q$, '23514');
select pg_temp.db03_reject($q$delete from public.orders$q$, '23514');
select pg_temp.db03_reject($q$update public.order_items set unit_price=500$q$, '23514');
select pg_temp.db03_reject($q$delete from public.order_items$q$, '23514');
select pg_temp.db03_reject($q$insert into public.order_items values('50000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','other store',98,1)$q$, '23503');
select pg_temp.db03_reject($q$insert into public.order_items values('50000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','duplicate',248,1)$q$, '23505');
select pg_temp.db03_reject($q$insert into public.orders(visit_id,user_id,store_id,total,idempotency_key,cart_version,data_origin) values('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',248,gen_random_uuid(),1,'operated')$q$, '23505');
select pg_temp.db03_reject($q$insert into public.visits(user_id,store_id,status) values('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','completed')$q$, '23514');
select pg_temp.db03_reject($q$insert into public.visits(user_id,store_id,cart_version) values('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',-1)$q$, '23514');
select pg_temp.db03_reject($q$delete from public.visits where id='40000000-0000-4000-8000-000000000001'$q$, '23001');

-- A third active visit isolates invalid quantity and cross-store checks from closed-cart guards.
insert into public.visits(id,user_id,store_id) values
 ('40000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001');
select pg_temp.db03_reject($q$insert into public.cart_items(visit_id,product_id,quantity) values('40000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000001',0)$q$, '23514');
select pg_temp.db03_reject($q$insert into public.cart_items(visit_id,product_id,quantity) values('40000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000002',1)$q$, '23503');
select pg_temp.db03_reject($q$update public.visits set store_id='20000000-0000-4000-8000-000000000002' where id='40000000-0000-4000-8000-000000000003'$q$, '23514');
select pg_temp.db03_reject($q$insert into public.orders(visit_id,user_id,store_id,total,idempotency_key,cart_version,data_origin) values('40000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001',248,gen_random_uuid(),0,'operated')$q$, '23503');
select pg_temp.db03_reject($q$insert into public.orders(visit_id,user_id,store_id,total,idempotency_key,cart_version,data_origin) values('40000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',248,gen_random_uuid(),0,'operated')$q$, '23503');
select pg_temp.db03_reject($q$insert into public.orders(visit_id,user_id,store_id,total,idempotency_key,cart_version,data_origin) values('40000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',248,'60000000-0000-4000-8000-000000000001',0,'operated')$q$, '23505');
select pg_temp.db03_reject($q$insert into public.orders(visit_id,user_id,store_id,total,idempotency_key,cart_version,data_origin) values('40000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',-1,gen_random_uuid(),0,'operated')$q$, '23514');
select pg_temp.db03_reject($q$insert into public.orders(visit_id,user_id,store_id,total,idempotency_key,cart_version,data_origin) values('40000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',0,gen_random_uuid(),0,'unknown')$q$, '23514');

update public.store_products set is_active=false where product_id='30000000-0000-4000-8000-000000000001';
select pg_temp.db03_reject($q$insert into public.cart_items(visit_id,product_id,quantity) values('40000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000001',1)$q$, '23503');
select pg_temp.db03_assert((select bool_and(unit_price=248) from public.order_items),'inactive listing preserves history');
select pg_temp.db03_assert((select count(*)=4 and bool_and(relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('visits','cart_items','orders','order_items')),'four tables RLS enabled');
select pg_temp.db03_assert((select bool_and(not has_table_privilege(r,'public.'||t,p)) from unnest(case when to_regprocedure('public.kago_has_role(text)') is null then array['anon','authenticated'] else array['anon'] end) r cross join unnest(array['visits','cart_items','orders','order_items']) t cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p),'general roles have no access');
set local role authenticated;
select pg_temp.db03_reject($q$select * from public.orders$q$, case when to_regprocedure('public.kago_has_role(text)') is null then '42501' end); -- DB-06 grants SELECT; rows are then filtered by RLS (db06.sql)
reset role;
select 'DB-03: all assertions passed; rolling back fixtures' as result;
rollback;
