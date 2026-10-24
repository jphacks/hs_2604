-- DEMO-05 #113. Owner only, on the demo DB after DATA-01 and APP-13.
-- Auth accounts/passwords are created separately. Never change DATA-01 rows.
-- Rehearsal reference: 2026-10-25 12:00 JST. All additional purchases are fictional/seeded.
begin;
create temp table demo05_users(k text primary key,email text,id uuid) on commit drop;
insert into demo05_users values ('U1','misaki.sato@example.test',null),
 ('U2','ken.tanaka@example.test',null),('U3','yui.suzuki@example.test',null);
update demo05_users d set id=u.id from auth.users u where lower(u.email)=d.email;
do $$begin
 if exists(select from demo05_users where id is null) then raise exception 'DEMO-05: create all three Auth accounts first'; end if;
 if exists(select from demo05_users d join auth.users u on u.id=d.id
  where u.raw_app_meta_data#>'{kago,roles}' is distinct from '["customer"]'::jsonb) then raise exception 'DEMO-05: customer roles must be configured before seeding'; end if;
 if not exists(select from public.stores where id='0da7a001-0000-4000-8000-000000000001'::uuid and slug='hiroshima-demo-store') then raise exception 'DEMO-05: DATA-01 S1 is missing; do not substitute the legacy store'; end if;
 if not exists(select from public.customer_settings where user_id=(select id from demo05_users where k='U1') and use_purchase_history)
 or not exists(select from public.customer_settings where user_id=(select id from demo05_users where k='U2') and not use_purchase_history) then raise exception 'DEMO-05: preserve DATA-01 U1 ON / U2 OFF'; end if;
end$$;
insert into public.customer_settings(user_id,use_purchase_history,use_current_cart)
select id,true,true from demo05_users where k='U3' on conflict(user_id) do nothing;
do $$begin
 if not exists(select from public.customer_settings where user_id=(select id from demo05_users where k='U3') and use_purchase_history and use_current_cart) then raise exception 'DEMO-05: existing U3 settings differ; no overwrite'; end if;
end$$;
-- Resolve products by barcode, including the legacy pasta UUID reused by DATA-01.
insert into public.products(id,code,name,category) values
 ('0de00502-0000-4000-8000-000000000001','2900000000179','生バジル','青果') on conflict(code) do nothing;
insert into public.store_products(store_id,product_id,price,is_active)
select '0da7a001-0000-4000-8000-000000000001'::uuid,id,198,true from public.products where code='2900000000179'
on conflict(store_id,product_id) do nothing;
create temp table demo05_rates(n integer,code text,rate integer,headline text) on commit drop;
insert into demo05_rates values (1,'2900000000179',25,'DEMO-05 生バジル 25% OFF'),
 (2,'2900000000063',20,'DEMO-05 新鮮たまご 20% OFF'),(3,'2900000000162',15,'DEMO-05 トマトパスタソース 15% OFF');
do $$begin
 if (select count(*) from demo05_rates d join public.products p on p.code=d.code join public.store_products sp on sp.product_id=p.id
   where sp.store_id='0da7a001-0000-4000-8000-000000000001'::uuid and sp.is_active)<>3 then raise exception 'DEMO-05: candidate store products are missing'; end if;
end$$;
insert into public.store_offers(id,store_id,kind,product_id,trigger_product_id,discount_percent,headline,starts_at,ends_at)
select ('0de00506-0000-4000-8000-'||lpad(d.n::text,12,'0'))::uuid,'0da7a001-0000-4000-8000-000000000001'::uuid,
 'guerrilla_coupon',p.id,null,d.rate,d.headline,'2026-10-24T00:00:00+09','2026-11-07T00:00:00+09'
from demo05_rates d join public.products p on p.code=d.code on conflict(id) do nothing;
-- U1: basil and sauce weekly; eggs were last bought on Oct 3 in unchanged DATA-01 history.
-- U2: keep history OFF and DATA-01 unchanged (no additional purchases needed).
-- U3: milk/bread weekly; one previous basil/egg purchase, never sauce.
create temp table demo05_lines(n integer,k text,at_time timestamptz,code text,quantity integer) on commit drop;
insert into demo05_lines values
 (1,'U1','2026-10-10T12:00:00+09','2900000000179',1),(1,'U1','2026-10-10T12:00:00+09','2900000000162',1),
 (2,'U1','2026-10-17T12:00:00+09','2900000000179',1),(2,'U1','2026-10-17T12:00:00+09','2900000000162',1),
 (3,'U1','2026-10-24T12:00:00+09','2900000000179',1),(3,'U1','2026-10-24T12:00:00+09','2900000000162',1),
 (4,'U3','2026-10-10T12:00:00+09','2900000000049',1),(4,'U3','2026-10-10T12:00:00+09','2900000000056',1),
 (5,'U3','2026-10-17T12:00:00+09','2900000000049',1),(5,'U3','2026-10-17T12:00:00+09','2900000000056',1),
 (6,'U3','2026-10-24T12:00:00+09','2900000000049',1),(6,'U3','2026-10-24T12:00:00+09','2900000000056',1),
 (7,'U3','2026-10-01T12:00:00+09','2900000000179',1),(7,'U3','2026-10-01T12:00:00+09','2900000000063',1);
create temp table demo05_resolved on commit drop as select d.*,u.id as user_id,p.id as product_id,p.name,sp.price,
 ('0de0050c-0000-4000-8000-'||lpad(d.n::text,12,'0'))::uuid as visit_id,
 ('0de0050d-0000-4000-8000-'||lpad(d.n::text,12,'0'))::uuid as order_id
from demo05_lines d join demo05_users u on u.k=d.k join public.products p on p.code=d.code
join public.store_products sp on sp.product_id=p.id and sp.store_id='0da7a001-0000-4000-8000-000000000001'::uuid;
do $$begin
 if (select count(*) from demo05_resolved)<>(select count(*) from demo05_lines) then raise exception 'DEMO-05: historical products missing'; end if;
end$$;
insert into public.visits(id,user_id,store_id,status,started_at,ended_at,last_activity_at,cart_version)
select distinct visit_id,user_id,'0da7a001-0000-4000-8000-000000000001'::uuid,'completed',at_time-interval '15 minutes',at_time,at_time,2
from demo05_resolved on conflict(id) do nothing;
insert into public.orders(id,visit_id,user_id,store_id,ordered_at,total,idempotency_key,cart_version,data_origin,created_at)
select order_id,visit_id,user_id,'0da7a001-0000-4000-8000-000000000001'::uuid,at_time,sum(price*quantity)::integer,
 ('0de0050e-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,2,'seeded',at_time
from demo05_resolved group by n,order_id,visit_id,user_id,at_time on conflict(id) do nothing;
insert into public.order_items(order_id,product_id,product_name,unit_price,quantity)
select r.order_id,r.product_id,r.name,r.price,r.quantity from demo05_resolved r
where not exists(select from public.order_items i where i.order_id=r.order_id and i.product_id=r.product_id);
-- Refuse ID collisions or altered seed rows; a rerun must not silently accept wrong ownership/terms.
do $$begin
 if (select count(*) from demo05_rates d join public.products p on p.code=d.code join public.store_offers o
  on o.id=('0de00506-0000-4000-8000-'||lpad(d.n::text,12,'0'))::uuid
  where o.store_id='0da7a001-0000-4000-8000-000000000001'::uuid and o.kind='guerrilla_coupon' and o.product_id=p.id
   and o.trigger_product_id is null and o.discount_percent=d.rate and o.discount_amount is null and o.status='active')<>3 then raise exception 'DEMO-05: existing offer IDs differ or were stopped; do not overwrite operator settings'; end if;
 if exists(select from demo05_resolved r left join public.orders o on o.id=r.order_id
  left join public.order_items i on i.order_id=r.order_id and i.product_id=r.product_id
  where o.user_id is distinct from r.user_id or o.visit_id is distinct from r.visit_id or o.store_id is distinct from '0da7a001-0000-4000-8000-000000000001'::uuid or o.data_origin is distinct from 'seeded'
   or i.quantity is distinct from r.quantity or i.unit_price is distinct from r.price) then raise exception 'DEMO-05: historical ID collision'; end if;
end$$;
commit;
