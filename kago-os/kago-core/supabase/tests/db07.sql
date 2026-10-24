-- Disposable Supabase-compatible DB only; run as owner after all migrations through DB-07.
-- Checks resend, price change, mid-way failure, other users' visits and invalid states, then rolls back.
begin;
create function pg_temp.db07_assert(ok boolean, message text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'DB-07 assertion failed: %',message; end if;
end;
$$;
-- Expect an error with SQLSTATE (and optional DETAIL).
create function pg_temp.db07_reject(statement text, expected_state text, expected_detail text default null)
returns void language plpgsql as $$
declare actual_state text; actual_detail text;
begin
  begin execute statement;
  exception when others then get stacked diagnostics actual_state = returned_sqlstate, actual_detail = pg_exception_detail;
  end;
  if actual_state is distinct from expected_state
     or (expected_detail is not null and actual_detail is distinct from expected_detail) then
    raise exception 'Expected % %, got % % for %',expected_state,expected_detail,actual_state,actual_detail,statement;
  end if;
end;
$$;
create function pg_temp.db07_as(sub uuid, kago jsonb) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(sub::text, ''), true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', sub, 'role', 'authenticated',
    'app_metadata', jsonb_build_object('kago', kago))::text, true);
end;
$$;

-- U1/U2 customers, T1 store staff. V1 (U1): P-PASTA x1 + P-SAUCE x1 = 546 yen at cart version 2.
insert into auth.users(id,email) values
 ('10000000-0000-4000-8000-000000000001','db07-u1@example.test'),
 ('10000000-0000-4000-8000-000000000002','db07-u2@example.test'),
 ('10000000-0000-4000-8000-000000000011','db07-t1@example.test');
insert into public.stores(id,slug,name) values
 ('20000000-0000-4000-8000-000000000001','db07-s1','架空1号店'),
 ('20000000-0000-4000-8000-000000000002','db07-s2','架空2号店');
insert into public.store_members(store_id,user_id) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000011');
insert into public.products(id,code,name,category) values
 ('30000000-0000-4000-8000-000000000001','2900000000100','架空スパゲッティ','pasta'),
 ('30000000-0000-4000-8000-000000000002','2900000000162','架空トマトソース','sauce'),
 ('30000000-0000-4000-8000-000000000003','2900000009999','架空高額品','other');
insert into public.store_products(store_id,product_id,price) values
 ('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',248),
 ('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002',298),
 ('20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000003',2000000000);
insert into public.visits(id,user_id,store_id) values
 ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001'),
 ('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001'),
 ('40000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002'),
 ('40000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002'),
 ('40000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002');
insert into public.cart_items(visit_id,product_id,quantity) values
 ('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',1),
 ('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002',1),
 ('40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001',1),
 ('40000000-0000-4000-8000-000000000004','30000000-0000-4000-8000-000000000003',2),
 ('40000000-0000-4000-8000-000000000005','30000000-0000-4000-8000-000000000003',1);
update public.visits set cart_version=2 where id='40000000-0000-4000-8000-000000000001';
update public.visits set cart_version=1 where id in ('40000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000004','40000000-0000-4000-8000-000000000005');
update public.visits set status='abandoned',ended_at=now() where id='40000000-0000-4000-8000-000000000005';

-- 1. Who may call.
set local role anon;
select pg_temp.db07_reject($q$select * from public.kago_checkout('40000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',2,546)$q$,'42501');
reset role;
select pg_temp.db07_as('10000000-0000-4000-8000-000000000011','{"roles":["store_staff"]}');
set local role authenticated;
select pg_temp.db07_reject($q$select * from public.kago_checkout('40000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',2,546)$q$,'42501');
reset role;

-- 2. U1: invalid requests change nothing.
select pg_temp.db07_as('10000000-0000-4000-8000-000000000001','{"roles":["customer"]}');
set local role authenticated;
select pg_temp.db07_reject($q$select * from public.kago_checkout('40000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000009',1,248)$q$,'42501');
select pg_temp.db07_reject($q$select * from public.kago_checkout('40000000-0000-4000-8000-000000000001',null,2,546)$q$,'22023');
select pg_temp.db07_reject($q$select * from public.kago_checkout('40000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',1,546)$q$,'40001','cart_changed');
select pg_temp.db07_reject($q$select * from public.kago_checkout('40000000-0000-4000-8000-000000000003','60000000-0000-4000-8000-000000000003',0,0)$q$,'23514');
select pg_temp.db07_reject($q$select * from public.kago_checkout('40000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',2,500)$q$,'40001','price_changed');
select pg_temp.db07_reject($q$insert into public.orders(visit_id,user_id,store_id,total,idempotency_key,cart_version,data_origin) values('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',546,gen_random_uuid(),2,'operated')$q$,'42501');
reset role;

-- 3. The price changes after the confirmation screen: the old total is refused, the new one accepted later.
update public.store_products set price=300 where product_id='30000000-0000-4000-8000-000000000002';
select pg_temp.db07_as('10000000-0000-4000-8000-000000000001','{"roles":["customer"]}');
set local role authenticated;
select pg_temp.db07_reject($q$select * from public.kago_checkout('40000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',2,546)$q$,'40001','price_changed');
reset role;

-- 4. A failure after the order row is written rolls everything back.
create function public.db07_fail_on_sauce() returns trigger language plpgsql as $$
begin
  if new.product_id = '30000000-0000-4000-8000-000000000002' then raise exception 'simulated failure' using errcode = 'XX000'; end if;
  return new;
end;
$$;
create trigger db07_fail before insert on public.order_items for each row execute function public.db07_fail_on_sauce();
select pg_temp.db07_as('10000000-0000-4000-8000-000000000001','{"roles":["customer"]}');
set local role authenticated;
select pg_temp.db07_reject($q$select * from public.kago_checkout('40000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',2,548)$q$,'XX000');
reset role;
drop trigger db07_fail on public.order_items;
drop function public.db07_fail_on_sauce();
select pg_temp.db07_assert((select count(*)=0 from public.orders) and (select count(*)=0 from public.order_items)
  and (select status='active' and ended_at is null and cart_version=2 from public.visits where id='40000000-0000-4000-8000-000000000001')
  and (select count(*)=2 from public.cart_items where visit_id='40000000-0000-4000-8000-000000000001'),'mid-way failure leaves nothing behind');

-- 5. Success, then the same request again (double press / network resend).
select pg_temp.db07_as('10000000-0000-4000-8000-000000000001','{"roles":["customer"]}');
set local role authenticated;
create temp table db07_first as
  select * from public.kago_checkout('40000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',2,548);
create temp table db07_again as
  select * from public.kago_checkout('40000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',2,548);
select pg_temp.db07_assert((select total=548 and not replayed from db07_first),'first call creates the order');
select pg_temp.db07_assert((select a.order_id=f.order_id and a.ordered_at=f.ordered_at and a.replayed from db07_again a, db07_first f),'resend returns the same order');
select pg_temp.db07_reject($q$select * from public.kago_checkout('40000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000002',2,548)$q$,'23505');
select pg_temp.db07_reject($q$select * from public.kago_checkout('40000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',2,546)$q$,'23505');
select pg_temp.db07_assert((select count(*)=1 from public.orders) and (select count(*)=2 from public.order_items),'customer sees own order and lines');
reset role;
select pg_temp.db07_assert((select count(*)=1 and min(total)=548 and bool_and(data_origin='operated' and cart_version=2) from public.orders),'one operated order');
select pg_temp.db07_assert((select count(*)=2 and sum(unit_price*quantity)=548 and bool_and(product_name in ('架空スパゲッティ','架空トマトソース'))
  from public.order_items),'line snapshots match the total');
select pg_temp.db07_assert((select v.status='completed' and v.ended_at=o.ordered_at and o.ordered_at>=v.started_at
  from public.visits v join public.orders o on o.visit_id=v.id where v.id='40000000-0000-4000-8000-000000000001'),'visit ended at the order time');
select pg_temp.db07_reject($q$update public.cart_items set quantity=5 where visit_id='40000000-0000-4000-8000-000000000001'$q$,'23514');
update public.store_products set price=500 where product_id='30000000-0000-4000-8000-000000000002';
select pg_temp.db07_assert((select unit_price=300 from public.order_items where product_id='30000000-0000-4000-8000-000000000002'),'later price change keeps the snapshot');

-- 6. U2: the key of U1 cannot be reused; a product that stopped selling blocks the purchase.
select pg_temp.db07_as('10000000-0000-4000-8000-000000000002','{"roles":["customer"]}');
set local role authenticated;
select pg_temp.db07_reject($q$select * from public.kago_checkout('40000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000001',1,248)$q$,'23505');
select pg_temp.db07_assert((select count(*)=0 from public.orders),'U2 cannot see U1 order');
reset role;
update public.store_products set is_active=false where product_id='30000000-0000-4000-8000-000000000001';
select pg_temp.db07_as('10000000-0000-4000-8000-000000000002','{"roles":["customer"]}');
set local role authenticated;
select pg_temp.db07_reject($q$select * from public.kago_checkout('40000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000002',1,248)$q$,'23514');
reset role;
update public.store_products set is_active=true where product_id='30000000-0000-4000-8000-000000000001';
select pg_temp.db07_as('10000000-0000-4000-8000-000000000002','{"roles":["customer"]}');
set local role authenticated;
select pg_temp.db07_assert((select total=248 and not replayed from public.kago_checkout('40000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000002',1,248)),'U2 purchase');
select pg_temp.db07_reject($q$select * from public.kago_checkout('40000000-0000-4000-8000-000000000004','60000000-0000-4000-8000-000000000004',1,0)$q$,'22003');
select pg_temp.db07_reject($q$select * from public.kago_checkout('40000000-0000-4000-8000-000000000005','60000000-0000-4000-8000-000000000005',1,2000000000)$q$,'23514');
select pg_temp.db07_assert((select count(*)=1 from public.orders),'U2 sees only own order');
reset role;
select pg_temp.db07_assert((select count(*)=2 and sum(total)=796 from public.orders),'two orders, 548 + 248');
select pg_temp.db07_assert((select prosecdef from pg_proc where oid='public.kago_checkout(uuid,uuid,integer,integer)'::regprocedure)
  and not has_function_privilege('anon','public.kago_checkout(uuid,uuid,integer,integer)','EXECUTE'),'owner-rights function, no anon');
select 'DB-07: all assertions passed; rolling back fixtures' as result;
rollback;
