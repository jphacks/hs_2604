-- #152. Owner only, on the demo DB after DATA-01 and DEMO-05 (demo05_users_offers.sql).
-- One fictional U1 (佐藤) order on 2026-10-18 12:00 JST: 牛乳 and 食パン, which DATA-01 already has weekly
-- until 10/04. With it both are regular again and the "そろそろ買う頃です" card shows them from
-- 10/24 07:00 to 10/29 08:50 JST (0.8–1.5 × the 7.25-day interval). The coupon products (生バジル・たまご・
-- トマトソース) are not touched, so the #112 coupon results stay the same.
-- Orders are immutable: never change this date in place; add a new seed if the demo date moves.
-- Do not buy 牛乳・食パン as 佐藤 in a rehearsal: that order stays and hides the card.
begin;
create temp table demo152_lines(code text,quantity integer) on commit drop;
insert into demo152_lines values ('2900000000049',1),('2900000000056',1);
create temp table demo152_resolved on commit drop as
select u.id as user_id,p.id as product_id,p.name,sp.price,l.quantity,
 '0de1520c-0000-4000-8000-000000000001'::uuid as visit_id,'0de1520d-0000-4000-8000-000000000001'::uuid as order_id,
 '2026-10-18T12:00:00+09'::timestamptz as at_time
from demo152_lines l join public.products p on p.code=l.code
join public.store_products sp on sp.product_id=p.id and sp.store_id='0da7a001-0000-4000-8000-000000000001'::uuid and sp.is_active
cross join (select id from auth.users where lower(email)='misaki.sato@example.test') u;
do $$begin
 if not exists(select from public.orders where id='0de0050d-0000-4000-8000-000000000001' and data_origin='seeded') then raise exception '#152: apply DEMO-05 first'; end if;
 if (select count(*) from demo152_resolved)<>2 then raise exception '#152: U1 or the 牛乳・食パン store products are missing'; end if;
 if not exists(select from public.customer_settings where user_id=(select user_id from demo152_resolved limit 1) and use_purchase_history) then raise exception '#152: U1 history use must stay ON'; end if;
end$$;
insert into public.visits(id,user_id,store_id,status,started_at,ended_at,last_activity_at,cart_version)
select distinct visit_id,user_id,'0da7a001-0000-4000-8000-000000000001'::uuid,'completed',at_time-interval '15 minutes',at_time,at_time,2
from demo152_resolved on conflict(id) do nothing;
insert into public.orders(id,visit_id,user_id,store_id,ordered_at,total,idempotency_key,cart_version,data_origin,created_at)
select order_id,visit_id,user_id,'0da7a001-0000-4000-8000-000000000001'::uuid,at_time,sum(price*quantity)::integer,
 '0de1520e-0000-4000-8000-000000000001'::uuid,2,'seeded',at_time
from demo152_resolved group by order_id,visit_id,user_id,at_time on conflict(id) do nothing;
insert into public.order_items(order_id,product_id,product_name,unit_price,quantity)
select r.order_id,r.product_id,r.name,r.price,r.quantity from demo152_resolved r
where not exists(select from public.order_items i where i.order_id=r.order_id and i.product_id=r.product_id);
-- Refuse ID collisions or altered rows; a rerun must not silently accept wrong ownership or dates.
do $$begin
 if exists(select from demo152_resolved r left join public.orders o on o.id=r.order_id
  left join public.order_items i on i.order_id=r.order_id and i.product_id=r.product_id
  where o.user_id is distinct from r.user_id or o.visit_id is distinct from r.visit_id or o.ordered_at is distinct from r.at_time
   or o.store_id is distinct from '0da7a001-0000-4000-8000-000000000001'::uuid or o.data_origin is distinct from 'seeded'
   or i.quantity is distinct from r.quantity) then raise exception '#152: order ID collision'; end if;
end$$;
commit;
