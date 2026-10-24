-- #84 / INS-08. Disposable DB only; all fixtures roll back.
begin;
create function pg_temp.ps_id(prefix text,n integer) returns uuid language sql immutable as $$
 select (prefix||'4000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
$$;
create function pg_temp.ps_assert(ok boolean,message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Product sales: %',message;end if;end;
$$;
create function pg_temp.ps_reject(statement text,expected text) returns void language plpgsql as $$
declare actual text;
begin
 begin execute statement;exception when others then get stacked diagnostics actual=returned_sqlstate;end;
 if actual is distinct from expected then raise exception 'Expected %, got %: %',expected,actual,statement;end if;
end;
$$;
create function pg_temp.ps_as(n integer,role_name text) returns void language plpgsql as $$
begin
 perform set_config('request.jwt.claim.sub',pg_temp.ps_id('1',n)::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('app_metadata',
   jsonb_build_object('kago',jsonb_build_object('roles',jsonb_build_array(role_name))))::text,true);
end;
$$;
insert into auth.users(id,email) select pg_temp.ps_id('1',n),'ps-'||n||'@example.test'
 from unnest(array[1,2,11,12,13,21,31]) n;
insert into public.stores(id,slug,name) select pg_temp.ps_id('2',n),'ps-s'||n,'集計検証店'||n from generate_series(1,2)n;
insert into public.store_members(store_id,user_id) select pg_temp.ps_id('2',n),pg_temp.ps_id('1',10+n) from generate_series(1,2)n;
insert into public.products(id,code,name,category) select pg_temp.ps_id('3',n),'PS-'||n,'集計商品'||n,'test' from generate_series(1,4)n;
insert into public.store_products(store_id,product_id,price)
 select pg_temp.ps_id('2',s),pg_temp.ps_id('3',p),9999 from generate_series(1,2)s cross join generate_series(1,4)p;
-- Six in-period orders at store 1. Orders need no events, selections or plays.
-- Order 7 is exactly the exclusive end; order 8 belongs to store 2.
create temporary table ps_fixture(n integer,at_time timestamptz,origin text,store_n integer);
insert into ps_fixture values
 (1,'2026-10-22T23:59:59.999999+09','operated',1),
 (2,'2026-10-23T00:00:00+09','operated',1),
 (3,'2026-10-23T00:59:59.999999+09','operated',1),
 (4,'2026-10-23T01:00:00+09','operated',1),
 (5,'2026-10-23T00:30:00+09','seeded',1),
 (6,'2026-10-23T00:45:00+09','synthetic',1),
 (7,'2026-10-24T00:00:00+09','operated',1),
 (8,'2026-10-23T00:15:00+09','operated',2);
insert into public.visits(id,user_id,store_id,started_at,last_activity_at)
 select pg_temp.ps_id('4',n),pg_temp.ps_id('1',store_n),pg_temp.ps_id('2',store_n),at_time-interval '1 minute',at_time-interval '1 minute' from ps_fixture;
insert into public.orders(id,visit_id,user_id,store_id,ordered_at,total,idempotency_key,cart_version,data_origin)
 select pg_temp.ps_id('5',n),pg_temp.ps_id('4',n),pg_temp.ps_id('1',store_n),pg_temp.ps_id('2',store_n),at_time,
 case n when 1 then 400 when 2 then 360 when 3 then 1000 when 4 then 130 when 5 then 2000 when 6 then 6000 when 7 then 50000 when 8 then 98901 end,
 pg_temp.ps_id('6',n),0,origin from ps_fixture;
insert into public.order_items(order_id,product_id,product_name,unit_price,quantity)
 select pg_temp.ps_id('5',n),pg_temp.ps_id('3',p),'注文時の商品名',price,qty from (values
 (1,1,100,2),(1,2,200,1),(2,1,120,3),(2,3,0,1),(3,1,125,4),(3,2,250,2),
 (4,1,130,1),(5,1,200,10),(6,1,300,20),(7,1,1000,50),(8,1,999,99)) t(n,p,price,qty);
update public.visits v set status='completed',ended_at=f.at_time,last_activity_at=f.at_time
 from ps_fixture f where v.id=pg_temp.ps_id('4',f.n);
-- Master changes and listing deactivation must not alter historical sales.
update public.products set name='変更後の商品名';
update public.store_products set price=1,is_active=false;

select pg_temp.ps_as(11,'store_staff');set local role authenticated;
select pg_temp.ps_assert((select count(*)=7 and sum(quantity)=44 and sum(amount)=9890
 from public.kago_product_sales('2026-10-22+09','2026-10-24+09',pg_temp.ps_id('2',1))),
 'all products, six in-period orders, snapshot prices, free item and three origins');
select pg_temp.ps_assert((select orders=3 and quantity=8 and amount=990
 from public.kago_product_sales('2026-10-23+09','2026-10-24+09',pg_temp.ps_id('2',1))
 where product_id=pg_temp.ps_id('3',1) and data_origin='operated'), 'multiple orders for product one');
select pg_temp.ps_assert((select orders=1 and quantity=2 and amount=500
 from public.kago_product_sales('2026-10-23+09','2026-10-24+09',pg_temp.ps_id('2',1))
 where product_id=pg_temp.ps_id('3',2) and data_origin='operated'),'second item does not multiply product one');
select pg_temp.ps_assert((select orders=1 and quantity=1 and amount=0
 from public.kago_product_sales('2026-10-23+09','2026-10-24+09',pg_temp.ps_id('2',1))
 where product_id=pg_temp.ps_id('3',3)),'zero-price sale is still a sale');
select pg_temp.ps_assert((select orders=1 and quantity=10 and amount=2000
 from public.kago_product_sales('2026-10-23+09','2026-10-24+09',pg_temp.ps_id('2',1))
 where data_origin='seeded'),'seeded kept separate');
select pg_temp.ps_assert((select orders=1 and quantity=20 and amount=6000
 from public.kago_product_sales('2026-10-23+09','2026-10-24+09',pg_temp.ps_id('2',1))
 where data_origin='synthetic'),'synthetic kept separate');
select pg_temp.ps_assert((select count(*)=0 from public.kago_product_sales('2026-10-23+09','2026-10-24+09',pg_temp.ps_id('2',1),array[pg_temp.ps_id('3',4)])),'product without sales returns no rows');
select pg_temp.ps_assert((select count(*)=0 from public.kago_product_sales('2026-10-25+09','2026-10-26+09',pg_temp.ps_id('2',1))),'period without sales returns no rows');
select pg_temp.ps_assert((select count(*)=0 from public.kago_product_sales('2026-10-23+09','2026-10-24+09',pg_temp.ps_id('2',1),'{}'::uuid[])),'empty product list selects nothing');
select pg_temp.ps_assert((select count(*)=0 from public.kago_product_sales('2026-10-23+09','2026-10-24+09',pg_temp.ps_id('2',1),array[pg_temp.ps_id('3',99)])),'unknown product has no sales');
select pg_temp.ps_assert((select count(*)=3 and sum(quantity)=38 and sum(amount)=8990
 from public.kago_product_sales('2026-10-23+09','2026-10-24+09',pg_temp.ps_id('2',1),array[pg_temp.ps_id('3',1),pg_temp.ps_id('3',1)])), 'duplicate product IDs do not duplicate sales');
select pg_temp.ps_assert((select count(*)=4 from public.kago_product_sales('2026-10-23+09','2026-10-24+09',pg_temp.ps_id('2',1),array[pg_temp.ps_id('3',1)],'hour')),'hour buckets and origins remain separate');
select pg_temp.ps_assert((select orders=2 and quantity=7 and amount=860 and bucket_start='2026-10-23T00:00+09'::timestamptz
 from public.kago_product_sales('2026-10-23+09','2026-10-23T01:00+09',pg_temp.ps_id('2',1),array[pg_temp.ps_id('3',1)],'hour') where data_origin='operated'),'hour end exclusive');
select pg_temp.ps_assert((select orders=1 and quantity=4 and amount=500 and bucket_start='2026-10-23T00:00+09'::timestamptz
 from public.kago_product_sales('2026-10-23T00:30+09','2026-10-23T01:00+09',pg_temp.ps_id('2',1),array[pg_temp.ps_id('3',1)],'hour') where data_origin='operated'),'partial bucket only counts requested interval');
select pg_temp.ps_assert((select orders=1 and quantity=2 and amount=200 and bucket_start='2026-10-22T00:00+09'::timestamptz
 from public.kago_product_sales('2026-10-22T23:59:59.999999+09','2026-10-23T00:00+09',pg_temp.ps_id('2',1),array[pg_temp.ps_id('3',1)])), 'JST midnight, microsecond inclusive start');
set local timezone='UTC';
select pg_temp.ps_assert((select bool_and(bucket_start='2026-10-22T15:00Z'::timestamptz)
 from public.kago_product_sales('2026-10-23+09','2026-10-24+09',pg_temp.ps_id('2',1))), 'JST day buckets in UTC session');
set local timezone='America/New_York';
select pg_temp.ps_assert((select bool_and(bucket_start='2026-10-22T15:00Z'::timestamptz)
 from public.kago_product_sales('2026-10-23+09','2026-10-24+09',pg_temp.ps_id('2',1))), 'JST day buckets in New York session');
select pg_temp.ps_assert((select bucket_start='2026-10-22T16:00Z'::timestamptz and quantity=1
 from public.kago_product_sales('2026-10-23T01:00+09','2026-10-23T02:00+09',pg_temp.ps_id('2',1),array[pg_temp.ps_id('3',1)],'hour')), 'JST hour buckets independent of session timezone');
select pg_temp.ps_reject($q$select * from public.kago_product_sales(null,'2026-10-24+09',pg_temp.ps_id('2',1))$q$,'22023');
select pg_temp.ps_reject($q$select * from public.kago_product_sales('2026-10-23+09',null,pg_temp.ps_id('2',1))$q$,'22023');
select pg_temp.ps_reject($q$select * from public.kago_product_sales('2026-10-23+09','2026-10-23+09',pg_temp.ps_id('2',1))$q$,'22023');
select pg_temp.ps_reject($q$select * from public.kago_product_sales('2026-10-24+09','2026-10-23+09',pg_temp.ps_id('2',1))$q$,'22023');
select pg_temp.ps_reject($q$select * from public.kago_product_sales('-infinity','infinity',pg_temp.ps_id('2',1))$q$,'22023');
select pg_temp.ps_reject($q$select * from public.kago_product_sales('2026-10-23+09','2026-10-24+09',pg_temp.ps_id('2',1),null,'week')$q$,'22023');
select pg_temp.ps_reject($q$select * from public.kago_product_sales('2026-10-23+09','2026-10-24+09',pg_temp.ps_id('2',1),null,null)$q$,'22023');
select pg_temp.ps_reject($q$select * from public.kago_product_sales('2026-10-23+09','2026-10-24+09',pg_temp.ps_id('2',1),array[null::uuid])$q$,'22023');
select pg_temp.ps_reject($q$select * from public.kago_product_sales('2026-10-23+09','2026-10-24+09',pg_temp.ps_id('2',1),array[[pg_temp.ps_id('3',1)]])$q$,'22023');
select pg_temp.ps_reject($q$select * from public.kago_product_sales('2026-10-23+09','2026-10-24+09',pg_temp.ps_id('2',2))$q$,'42501');
select pg_temp.ps_reject($q$select * from public.kago_product_sales('2026-10-23+09','2026-10-24+09',null)$q$,'42501');
select pg_temp.ps_reject($q$select * from public.kago_product_sales('2026-10-23+09','2026-10-24+09',pg_temp.ps_id('2',99))$q$,'42501');
reset role;
select pg_temp.ps_as(12,'store_staff');set local role authenticated;
select pg_temp.ps_assert((select count(*)=1 and sum(quantity)=99 and sum(amount)=98901 and bool_and(store_id=pg_temp.ps_id('2',2))
 from public.kago_product_sales('2026-10-23+09','2026-10-24+09',pg_temp.ps_id('2',2))), 'second store sees own sales only');
reset role;
select pg_temp.ps_as(13,'store_staff');set local role authenticated;
select pg_temp.ps_reject($q$select * from public.kago_product_sales('2026-10-23+09','2026-10-24+09',pg_temp.ps_id('2',1))$q$,'42501');reset role;
select pg_temp.ps_as(21,'maker_staff');set local role authenticated;
select pg_temp.ps_reject($q$select * from public.kago_product_sales('2026-10-23+09','2026-10-24+09',pg_temp.ps_id('2',1))$q$,'42501');reset role;
select pg_temp.ps_as(1,'customer');set local role authenticated;
select pg_temp.ps_reject($q$select * from public.kago_product_sales('2026-10-23+09','2026-10-24+09',pg_temp.ps_id('2',1))$q$,'42501');reset role;
select pg_temp.ps_as(31,'signage');set local role authenticated;
select pg_temp.ps_reject($q$select * from public.kago_product_sales('2026-10-23+09','2026-10-24+09',pg_temp.ps_id('2',1))$q$,'42501');reset role;
-- A guessed trusted role cannot replace auth.uid or actual membership.
select set_config('request.jwt.claim.sub','',true);set local role authenticated;
select pg_temp.ps_reject($q$select * from public.kago_product_sales('2026-10-23+09','2026-10-24+09',pg_temp.ps_id('2',1))$q$,'42501');reset role;
set local role anon;
select pg_temp.ps_reject($q$select * from public.kago_product_sales('2026-10-23+09','2026-10-24+09',pg_temp.ps_id('2',1))$q$,'42501');reset role;
set local role service_role;
select pg_temp.ps_reject($q$select * from public.kago_product_sales('2026-10-23+09','2026-10-24+09',pg_temp.ps_id('2',1))$q$,'42501');reset role;
select pg_temp.ps_assert(not has_function_privilege('anon','public.kago_product_sales(timestamptz,timestamptz,uuid,uuid[],text)','execute'),'anon execute revoked');
select pg_temp.ps_assert(not has_function_privilege('service_role','public.kago_product_sales(timestamptz,timestamptz,uuid,uuid[],text)','execute'),'service role execute revoked');
select pg_temp.ps_assert(pg_get_function_result('public.kago_product_sales(timestamptz,timestamptz,uuid,uuid[],text)'::regprocedure)
 = 'TABLE(store_id uuid, product_id uuid, bucket_start timestamp with time zone, data_origin text, orders bigint, quantity numeric, amount numeric)', 'exact result contract, no individual identifiers');
select 'Product sales: all assertions passed; rolling back fixtures' as result;
rollback;
