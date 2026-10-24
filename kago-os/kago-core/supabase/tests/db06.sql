-- Disposable Supabase-compatible DB only; run as owner after all migrations through DB-06.
-- Signs in as each fictional role (JWT claims are simulated) and checks allow / deny,
-- including rewritten ids. Everything is rolled back.
begin;
create function pg_temp.db06_assert(ok boolean, message text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'DB-06 assertion failed: %',message; end if;
end;
$$;
create function pg_temp.db06_reject(statement text, expected_state text) returns void language plpgsql as $$
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
-- Rows a statement changed (UPDATE/DELETE hidden by RLS report 0, not an error).
create function pg_temp.db06_rows(statement text) returns integer language plpgsql as $$
declare n integer;
begin execute statement; get diagnostics n = row_count; return n; end;
$$;
-- Simulated Supabase JWT for the next `set local role authenticated`.
create function pg_temp.db06_as(sub uuid, kago jsonb) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(sub::text, ''), true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', sub, 'role', 'authenticated',
    'app_metadata', jsonb_build_object('kago', kago))::text, true);
end;
$$;

-- Fixture (owner). U1/U2 customers, T1/T2 staff of S1/S2, X1 staff role without membership,
-- W1/W2 staff of makers M1/M2, DV1/DV2 accounts of devices D1 (S1) / D2 (S2).
insert into auth.users(id,email) values
 ('10000000-0000-4000-8000-000000000001','db06-u1@example.test'),
 ('10000000-0000-4000-8000-000000000002','db06-u2@example.test'),
 ('10000000-0000-4000-8000-000000000011','db06-t1@example.test'),
 ('10000000-0000-4000-8000-000000000012','db06-t2@example.test'),
 ('10000000-0000-4000-8000-000000000013','db06-x1@example.test'),
 ('10000000-0000-4000-8000-000000000021','db06-w1@example.test'),
 ('10000000-0000-4000-8000-000000000022','db06-w2@example.test'),
 ('10000000-0000-4000-8000-000000000031','db06-dv1@example.test'),
 ('10000000-0000-4000-8000-000000000032','db06-dv2@example.test');
insert into public.stores(id,slug,name) values
 ('20000000-0000-4000-8000-000000000001','db06-s1','架空1号店'),
 ('20000000-0000-4000-8000-000000000002','db06-s2','架空2号店');
insert into public.store_members(store_id,user_id) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000011'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000012');
insert into public.products(id,code,name,category) values
 ('30000000-0000-4000-8000-000000000001','2900000000162','架空トマトソース','sauce'),
 ('30000000-0000-4000-8000-000000000002','2900000000100','架空スパゲッティ','pasta');
insert into public.store_products(store_id,product_id,price) values
 ('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',298),
 ('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002',248),
 ('20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001',298),
 ('20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002',248);
insert into public.customer_settings(user_id) values
 ('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');
insert into public.makers(id,slug,display_name) values
 ('70000000-0000-4000-8000-000000000001','db06-m1','架空メーカー1'),
 ('70000000-0000-4000-8000-000000000002','db06-m2','架空メーカー2');
insert into public.maker_members(maker_id,user_id) values
 ('70000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000021'),
 ('70000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000022');
insert into public.ad_calls(id,store_id,title,categories,channels,starts_at,ends_at,status) values
 ('80000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','S1公開','{sauce}','{app,signage}','2026-01-01T00:00:00+09','2099-01-01T00:00:00+09','open'),
 ('80000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','S1下書き','{sauce}','{app}','2026-01-01T00:00:00+09','2099-01-01T00:00:00+09','draft'),
 ('80000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002','S2公開','{sauce}','{app,signage}','2026-01-01T00:00:00+09','2099-01-01T00:00:00+09','open');
insert into public.creatives(id,maker_id,product_id) values
 ('90000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001'),
 ('90000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001');
insert into public.creative_versions(id,creative_id,version,image_path,headline) values
 ('a0000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001',1,'ad-assets/CR1/v1.png','M1第1版'),
 ('a0000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000001',2,'ad-assets/CR1/v2.png','M1未申請の第2版'),
 ('a0000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-000000000002',1,'ad-assets/CR2/v1.png','M2第1版');
insert into public.ad_applications(id,ad_call_id,store_id,maker_id,creative_id,creative_version_id,channels,requested_period) values
 ('b0000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001',
  '{app,signage}','[2026-01-01T00:00:00+09,2099-01-01T00:00:00+09)'),
 ('b0000000-0000-4000-8000-000000000002','80000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002',
  '70000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000003',
  '{app}','[2026-01-01T00:00:00+09,2099-01-01T00:00:00+09)');
update public.ad_applications set status='approved',reviewed_by='10000000-0000-4000-8000-000000000011'
 where id='b0000000-0000-4000-8000-000000000001';
insert into public.ad_placements(id,application_id,revision,store_id,creative_version_id,channels,starts_at,ends_at,approved_by) values
 ('c0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001',1,'20000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001','{app,signage}','2026-01-01T00:00:00+09','2099-01-01T00:00:00+09','10000000-0000-4000-8000-000000000011');
insert into public.store_promotions(id,store_id,product_id) values
 ('d0000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002'),
 ('d0000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002');
insert into public.promotion_versions(id,promotion_id,version,channels,reason_text,starts_at,ends_at) values
 ('e0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001',1,'{app,signage}','S1特売','2026-01-01T00:00:00+09','2099-01-01T00:00:00+09'),
 ('e0000000-0000-4000-8000-000000000002','d0000000-0000-4000-8000-000000000002',1,'{app,signage}','S2特売','2026-01-01T00:00:00+09','2099-01-01T00:00:00+09');
-- U1: finished visit VO with order O1 and an active visit V1. U2: active visit V2 with a selection and an event.
insert into public.visits(id,user_id,store_id,started_at,last_activity_at) values
 ('40000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',now()-interval '2 days',now()-interval '2 days'),
 ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',now(),now()),
 ('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001',now(),now());
insert into public.cart_items(visit_id,product_id,quantity) values
 ('40000000-0000-4000-8000-000000000009','30000000-0000-4000-8000-000000000001',1),
 ('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',2),
 ('40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002',1);
update public.visits set cart_version=1 where id in ('40000000-0000-4000-8000-000000000009','40000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002');
insert into public.orders(id,visit_id,user_id,store_id,ordered_at,total,idempotency_key,cart_version,data_origin) values
 ('50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',now()-interval '2 days',298,'60000000-0000-4000-8000-000000000001',1,'operated');
insert into public.order_items(order_id,product_id,product_name,unit_price,quantity) values
 ('50000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','架空トマトソース',298,1);
update public.visits set status='completed',ended_at=now()-interval '2 days' where id='40000000-0000-4000-8000-000000000009';
insert into public.selections(id,visit_id,cart_version,rule_version) values
 ('61000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002',1,1);
insert into public.selection_items(id,selection_id,slot,placement_type,product_id,rank,reason_code,reason_text) values
 ('62000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-000000000002',1,'organic','30000000-0000-4000-8000-000000000001',1,'popular','売れ筋');
insert into public.events(event_id,event_type,schema_version,occurred_at,store_id,user_id,visit_id,product_id,payload,data_origin) values
 ('63000000-0000-4000-8000-000000000002','product_scanned',1,now(),'20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',
  '40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','{"method":"barcode"}','operated');
insert into public.experiments(id,store_id,slug,channel,unit,arms,starts_at,ends_at) values
 ('64000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','ads-ab','app','user','{control,ads}','2026-01-01T00:00:00+09','2099-01-01T00:00:00+09');
insert into public.experiment_assignments(id,experiment_id,user_id,arm) values
 ('65000000-0000-4000-8000-000000000002','64000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','ads');
insert into public.signage_devices(id,store_id,auth_user_id,slug,location) values
 ('66000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000031','entrance','入口'),
 ('66000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000032','entrance','入口');
insert into public.signage_plays(id,device_id,mode,reason_code,started_at,ended_at,data_origin) values
 ('67000000-0000-4000-8000-000000000001','66000000-0000-4000-8000-000000000001','fallback','no_content',now()-interval '1 hour',now()-interval '59 minutes','operated'),
 ('67000000-0000-4000-8000-000000000002','66000000-0000-4000-8000-000000000002','fallback','no_content',now()-interval '1 hour',now()-interval '59 minutes','operated');
insert into public.signage_plays(id,device_id,mode,reason_code,started_at,ended_at,data_origin) values
 ('67000000-0000-4000-8000-000000000004','66000000-0000-4000-8000-000000000002','fallback','no_content',now()-interval '30 minutes',now()-interval '29 minutes','operated');
insert into public.audience_estimates(play_id,method_version,measurement_status,data_origin) values
 ('67000000-0000-4000-8000-000000000001','face-v1','not_measured','operated'),
 ('67000000-0000-4000-8000-000000000002','face-v1','not_measured','operated');

-- 1. anon and sessions without a KAGO role ------------------------------------------------
set local role anon;
select pg_temp.db06_reject($q$select * from public.stores$q$,'42501');
select pg_temp.db06_reject($q$select * from public.visits$q$,'42501');
select pg_temp.db06_reject($q$select public.app_start_visit('20000000-0000-4000-8000-000000000001',false,null)$q$,'42501');
reset role;
select pg_temp.db06_as('10000000-0000-4000-8000-000000000001','{"roles":[]}');
set local role authenticated;
select pg_temp.db06_assert((select count(*)=0 from public.stores) and (select count(*)=0 from public.visits),'no role, no rows');
reset role;

-- 2. Customer U1 -----------------------------------------------------------------------------
select pg_temp.db06_as('10000000-0000-4000-8000-000000000001','{"roles":["customer"]}');
set local role authenticated;
select pg_temp.db06_assert((select count(*)=2 from public.stores) and (select count(*)=2 from public.products)
  and (select count(*)=4 from public.store_products),'customer reads master data');
select pg_temp.db06_assert((select count(*)=2 and bool_and(user_id='10000000-0000-4000-8000-000000000001') from public.visits),'own visits only');
select pg_temp.db06_assert((select count(*)=0 from public.visits where id='40000000-0000-4000-8000-000000000002'),'rewritten visit id returns nothing');
select pg_temp.db06_assert((select count(*)=2 from public.cart_items)
  and (select count(*)=0 from public.cart_items where visit_id='40000000-0000-4000-8000-000000000002'),'own carts only');
select pg_temp.db06_assert((select count(*)=1 from public.orders) and (select count(*)=1 from public.order_items),'own orders only');
select pg_temp.db06_assert((select count(*)=0 from public.selections) and (select count(*)=0 from public.selection_items)
  and (select count(*)=0 from public.events) and (select count(*)=0 from public.experiment_assignments),'no other customer behaviour');
select pg_temp.db06_assert((select count(*)=0 from public.ad_calls) and (select count(*)=0 from public.ad_applications)
  and (select count(*)=0 from public.application_revisions) and (select count(*)=0 from public.signage_plays)
  and (select count(*)=0 from public.audience_estimates) and (select count(*)=0 from public.signage_devices),'no back-office rows');
select pg_temp.db06_assert((select count(*)=1 from public.ad_placements) and (select count(*)=1 from public.creative_versions)
  and (select count(*)=1 from public.creatives) and (select count(*)=2 from public.promotion_versions where status='active'),'only live ads and promotions');
select pg_temp.db06_assert((select count(*)=1 from public.customer_settings),'own settings only');
select pg_temp.db06_assert(pg_temp.db06_rows($q$update public.customer_settings set use_purchase_history=true$q$)=1,'update own settings');
select pg_temp.db06_assert(pg_temp.db06_rows($q$update public.customer_settings set use_current_cart=true where user_id='10000000-0000-4000-8000-000000000002'$q$)=0,'cannot update other settings');
select pg_temp.db06_reject($q$insert into public.customer_settings(user_id) values('10000000-0000-4000-8000-000000000013')$q$,'42501');
-- Direct writes that only owner-rights functions may perform.
select pg_temp.db06_reject($q$insert into public.visits(user_id,store_id) values('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001')$q$,'42501');
select pg_temp.db06_reject($q$update public.visits set cart_version=9$q$,'42501');
select pg_temp.db06_reject($q$insert into public.cart_items(visit_id,product_id,quantity) values('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002',1)$q$,'42501');
select pg_temp.db06_reject($q$insert into public.orders(visit_id,user_id,store_id,total,idempotency_key,cart_version,data_origin) values('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',0,gen_random_uuid(),1,'operated')$q$,'42501');
select pg_temp.db06_reject($q$insert into public.selections(visit_id,cart_version,rule_version) values('40000000-0000-4000-8000-000000000001',1,1)$q$,'42501');
select pg_temp.db06_reject($q$insert into public.experiment_assignments(experiment_id,user_id,arm) values('64000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','ads')$q$,'42501');
select pg_temp.db06_reject($q$update public.ad_placements set status='suspended',suspend_reason='x',suspended_by='10000000-0000-4000-8000-000000000001'$q$,'42501');
select pg_temp.db06_reject($q$insert into public.ad_calls(store_id,title,categories,channels,starts_at,ends_at) values('20000000-0000-4000-8000-000000000001','x','{sauce}','{app}','2026-01-01','2099-01-01')$q$,'42501');
-- Selection through the owner-rights function: own visit yes, someone else's no.
select pg_temp.db06_assert(public.kago_save_selection('40000000-0000-4000-8000-000000000001',1,1,
  '[{"slot":1,"placement_type":"sponsored","product_id":"30000000-0000-4000-8000-000000000001","ad_placement_id":"c0000000-0000-4000-8000-000000000001","reason_code":"sponsored_related","reason_text":"広告"},
    {"slot":2,"placement_type":"store_promo","product_id":"30000000-0000-4000-8000-000000000002","promotion_version_id":"e0000000-0000-4000-8000-000000000001","reason_code":"store_pick","reason_text":"特売"}]',
  '61000000-0000-4000-8000-000000000001')='61000000-0000-4000-8000-000000000001','save own selection');
select pg_temp.db06_assert(public.kago_save_selection('40000000-0000-4000-8000-000000000001',1,1,'[{"slot":1}]',
  '61000000-0000-4000-8000-000000000001')='61000000-0000-4000-8000-000000000001','selection resend is a no-op');
select pg_temp.db06_assert((select count(*)=1 from public.selections) and (select count(*)=2 from public.selection_items),'own selection visible');
select pg_temp.db06_reject($q$select public.kago_save_selection('40000000-0000-4000-8000-000000000002',1,1,'[{"slot":1,"placement_type":"organic","product_id":"30000000-0000-4000-8000-000000000001","reason_code":"popular","reason_text":"x"}]')$q$,'42501');
-- Events: own visit, non-cart types; forged user/visit ids are refused; resend is a no-op.
insert into public.events(event_id,event_type,schema_version,occurred_at,store_id,user_id,visit_id,selection_item_id,product_id,payload,data_origin)
 select '63000000-0000-4000-8000-000000000001','recommendation_impression',1,now(),'20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',id,product_id,'{"visible_ms":1200}','operated'
 from public.selection_items where slot=1 and selection_id='61000000-0000-4000-8000-000000000001';
select pg_temp.db06_assert(pg_temp.db06_rows($q$insert into public.events(event_id,event_type,schema_version,occurred_at,store_id,user_id,visit_id,selection_item_id,product_id,payload,data_origin)
 select '63000000-0000-4000-8000-000000000001','recommendation_impression',1,occurred_at,store_id,user_id,visit_id,selection_item_id,product_id,payload,data_origin
 from public.events where event_id='63000000-0000-4000-8000-000000000001'$q$)=0,'own resend is a no-op');
select pg_temp.db06_reject($q$insert into public.events(event_id,event_type,schema_version,occurred_at,store_id,user_id,visit_id,product_id,payload,data_origin) values(gen_random_uuid(),'product_scanned',1,now(),'20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','{"method":"barcode"}','operated')$q$,'42501');
select pg_temp.db06_reject($q$insert into public.events(event_id,event_type,schema_version,occurred_at,store_id,user_id,visit_id,product_id,payload,data_origin) values(gen_random_uuid(),'product_scanned',1,now(),'20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','{"method":"barcode"}','operated')$q$,'42501');
select pg_temp.db06_reject($q$insert into public.events(event_id,event_type,schema_version,occurred_at,store_id,user_id,visit_id,product_id,payload,data_origin) values(gen_random_uuid(),'cart_item_added',1,now(),'20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','{"source":"scan","quantity":1,"quantity_delta":1,"cart_version":2}','operated')$q$,'42501');
select pg_temp.db06_reject($q$insert into public.events(event_id,event_type,schema_version,occurred_at,store_id,user_id,visit_id,product_id,payload,data_origin) values(gen_random_uuid(),'product_scanned',1,now(),'20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','{"method":"barcode"}','synthetic')$q$,'42501');
select pg_temp.db06_reject($q$insert into public.events(event_id,event_type,schema_version,occurred_at,store_id,user_id,visit_id,product_id,payload,data_origin) values(gen_random_uuid(),'product_scanned',1,'2020-01-01T00:00:00Z','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','{"method":"barcode"}','operated')$q$,'42501');
select pg_temp.db06_reject($q$insert into public.events(event_id,event_type,schema_version,occurred_at,store_id,user_id,visit_id,product_id,payload,data_origin) values(gen_random_uuid(),'product_scanned',1,now(),'20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000009','30000000-0000-4000-8000-000000000001','{"method":"barcode"}','operated')$q$,'42501');
select pg_temp.db06_assert((select count(*)=1 from public.events),'own event visible');
-- Visit lifecycle only through app_start_visit (owner rights, user from auth.uid()).
select pg_temp.db06_assert(public.app_start_visit('20000000-0000-4000-8000-000000000001',false,null)='40000000-0000-4000-8000-000000000001','resume own visit');
select pg_temp.db06_reject($q$select public.app_start_visit('20000000-0000-4000-8000-000000000001',true,'40000000-0000-4000-8000-000000000002')$q$,'42501');
select pg_temp.db06_assert(public.app_start_visit('20000000-0000-4000-8000-000000000001',true,'40000000-0000-4000-8000-000000000001')<>'40000000-0000-4000-8000-000000000001','explicit new visit');
select pg_temp.db06_assert((select count(*)=1 from public.visits where status='active')
  and (select status='abandoned' from public.visits where id='40000000-0000-4000-8000-000000000001'),'old visit ended, one active');
reset role;
select pg_temp.db06_assert((select status='active' from public.visits where id='40000000-0000-4000-8000-000000000002'),'U2 visit untouched');

-- U2 cannot see U1's rows created above.
select pg_temp.db06_as('10000000-0000-4000-8000-000000000002','{"roles":["customer"]}');
set local role authenticated;
select pg_temp.db06_assert((select count(*)=1 from public.visits) and (select count(*)=0 from public.orders)
  and (select count(*)=1 from public.selections) and (select count(*)=1 from public.events)
  and (select count(*)=1 from public.experiment_assignments),'U2 sees only U2');
reset role;

-- 3. Store staff T1 (S1) and X1 (role without membership) ---------------------------------
select pg_temp.db06_as('10000000-0000-4000-8000-000000000011','{"roles":["store_staff"]}');
set local role authenticated;
select pg_temp.db06_assert((select count(*)=1 from public.stores) and (select count(*)=2 from public.store_products),'own store master data');
select pg_temp.db06_assert((select count(*)=2 and bool_and(store_id='20000000-0000-4000-8000-000000000001') from public.ad_calls),'own calls incl. draft');
insert into public.ad_calls(id,store_id,title,categories,channels,starts_at,ends_at) values
 ('80000000-0000-4000-8000-000000000009','20000000-0000-4000-8000-000000000001','T1の新規','{pasta}','{app}','2026-01-01T00:00:00+09','2099-01-01T00:00:00+09');
select pg_temp.db06_reject($q$insert into public.ad_calls(store_id,title,categories,channels,starts_at,ends_at) values('20000000-0000-4000-8000-000000000002','他店','{sauce}','{app}','2026-01-01','2099-01-01')$q$,'42501');
select pg_temp.db06_reject($q$update public.ad_calls set store_id='20000000-0000-4000-8000-000000000002' where id='80000000-0000-4000-8000-000000000009'$q$,'23514'); -- the immutable-store trigger fires before RLS
select pg_temp.db06_assert(pg_temp.db06_rows($q$update public.ad_calls set title='乗っ取り' where id='80000000-0000-4000-8000-000000000003'$q$)=0,'cannot edit other store call');
select pg_temp.db06_reject($q$delete from public.ad_calls where id='80000000-0000-4000-8000-000000000001'$q$,'23514');
select pg_temp.db06_assert(pg_temp.db06_rows($q$delete from public.ad_calls where id='80000000-0000-4000-8000-000000000009'$q$)=1,'delete own draft');
select pg_temp.db06_assert((select count(*)=1 and min(id::text)='b0000000-0000-4000-8000-000000000001' from public.ad_applications)
  and (select count(*)=1 from public.application_revisions),'applications to own store only');
select pg_temp.db06_assert(pg_temp.db06_rows($q$update public.ad_applications set status='rejected',review_comment='x',reviewed_by='10000000-0000-4000-8000-000000000011'$q$)=0,'review is not a direct update');
select pg_temp.db06_reject($q$insert into public.ad_placements(application_id,revision,store_id,creative_version_id,channels,starts_at,ends_at,approved_by) values('b0000000-0000-4000-8000-000000000001',1,'20000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','{app}','2026-01-01','2099-01-01','10000000-0000-4000-8000-000000000011')$q$,'42501');
select pg_temp.db06_assert((select count(*)=1 from public.creative_versions) and (select count(*)=1 from public.creatives),'only creatives submitted to own store');
select pg_temp.db06_assert((select count(*)=1 from public.store_promotions) and (select count(*)=1 from public.promotion_versions),'own promotions only');
insert into public.store_promotions(id,store_id,product_id) values
 ('d0000000-0000-4000-8000-000000000009','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001');
select pg_temp.db06_reject($q$insert into public.store_promotions(store_id,product_id) values('20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001')$q$,'42501');
select pg_temp.db06_assert(pg_temp.db06_rows($q$update public.promotion_versions set status='inactive' where id='e0000000-0000-4000-8000-000000000001'$q$)=1,'stop own promotion');
select pg_temp.db06_assert(pg_temp.db06_rows($q$update public.promotion_versions set status='inactive' where id='e0000000-0000-4000-8000-000000000002'$q$)=0,'cannot stop other store promotion');
select pg_temp.db06_reject($q$update public.promotion_versions set priority=9$q$,'42501');
insert into public.promotion_versions(promotion_id,version,channels,reason_text,starts_at,ends_at) values
 ('d0000000-0000-4000-8000-000000000001',2,'{app}','第2版','2026-01-01T00:00:00+09','2099-01-01T00:00:00+09');
select pg_temp.db06_reject($q$insert into public.experiments(store_id,slug,channel,unit,arms,starts_at,ends_at) values('20000000-0000-4000-8000-000000000002','x','app','user','{a,b}','2026-01-01','2099-01-01')$q$,'42501');
select pg_temp.db06_assert((select count(*)=1 from public.experiments),'own experiments');
-- Personal purchase data is not readable by store sessions (aggregates come from DB-09).
select pg_temp.db06_assert((select count(*)=0 from public.visits) and (select count(*)=0 from public.cart_items)
  and (select count(*)=0 from public.orders) and (select count(*)=0 from public.order_items)
  and (select count(*)=0 from public.events) and (select count(*)=0 from public.selections)
  and (select count(*)=0 from public.experiment_assignments) and (select count(*)=0 from public.customer_settings),'store staff sees no personal rows');
select pg_temp.db06_assert((select count(*)=1 from public.signage_devices) and (select count(*)=1 from public.signage_plays)
  and (select count(*)=1 from public.audience_estimates),'own store signage records');
reset role;
select pg_temp.db06_as('10000000-0000-4000-8000-000000000013','{"roles":["store_staff"]}');
set local role authenticated;
select pg_temp.db06_assert((select count(*)=0 from public.stores) and (select count(*)=0 from public.ad_calls)
  and (select count(*)=0 from public.signage_plays),'role without membership sees nothing');
select pg_temp.db06_reject($q$insert into public.ad_calls(store_id,title,categories,channels,starts_at,ends_at) values('20000000-0000-4000-8000-000000000001','x','{sauce}','{app}','2026-01-01','2099-01-01')$q$,'42501');
reset role;

-- 4. Maker staff W1 (M1) and W2 (M2) --------------------------------------------------------
select pg_temp.db06_as('10000000-0000-4000-8000-000000000021','{"roles":["maker_staff"]}');
set local role authenticated;
select pg_temp.db06_assert((select count(*)=2 and bool_and(status<>'draft') from public.ad_calls),'published calls only');
select pg_temp.db06_assert((select count(*)=1 from public.creatives) and (select count(*)=2 from public.creative_versions),'own creatives only');
select pg_temp.db06_assert((select count(*)=1 from public.ad_applications) and (select count(*)=1 from public.ad_placements),'own applications and placements');
insert into public.creative_versions(id,creative_id,version,image_path,headline) values
 ('a0000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-000000000001',3,'ad-assets/CR1/v3.png','M1第3版');
select pg_temp.db06_reject($q$insert into public.creative_versions(creative_id,version,image_path,headline) values('90000000-0000-4000-8000-000000000002',2,'ad-assets/CR2/v2.png','他社')$q$,'42501');
select pg_temp.db06_reject($q$insert into public.creatives(maker_id,product_id) values('70000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002')$q$,'42501');
insert into public.creatives(maker_id,product_id) values('70000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002');
select pg_temp.db06_reject($q$insert into public.ad_applications(ad_call_id,store_id,maker_id,creative_id,creative_version_id,channels,requested_period) values('80000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000003','{app}','[2026-02-01,2026-03-01)')$q$,'42501');
-- Resubmitting own approved application with v3 is allowed; approving it is not.
select pg_temp.db06_assert(pg_temp.db06_rows($q$update public.ad_applications set status='submitted',revision=2,creative_version_id='a0000000-0000-4000-8000-000000000004',review_comment=null,reviewed_by=null,reviewed_at=null where id='b0000000-0000-4000-8000-000000000001'$q$)=1,'resubmit own application');
select pg_temp.db06_reject($q$update public.ad_applications set status='approved',reviewed_by='10000000-0000-4000-8000-000000000011' where id='b0000000-0000-4000-8000-000000000001'$q$,'42501');
select pg_temp.db06_assert(pg_temp.db06_rows($q$update public.ad_applications set message='他社を変更' where id='b0000000-0000-4000-8000-000000000002'$q$)=0,'cannot touch other maker application');
select pg_temp.db06_assert((select count(*)=2 from public.application_revisions),'own revision history');
select pg_temp.db06_assert((select count(*)=0 from public.visits) and (select count(*)=0 from public.orders)
  and (select count(*)=0 from public.order_items) and (select count(*)=0 from public.events)
  and (select count(*)=0 from public.selections) and (select count(*)=0 from public.selection_items)
  and (select count(*)=0 from public.signage_plays) and (select count(*)=0 from public.audience_estimates)
  and (select count(*)=0 from public.store_promotions),'maker sees no personal or store-internal rows');
select pg_temp.db06_assert((select count(*)=2 from public.signage_devices),'maker sees device locations');
select pg_temp.db06_reject($q$select auth_user_id from public.signage_devices$q$,'42501');
reset role;
select pg_temp.db06_as('10000000-0000-4000-8000-000000000022','{"roles":["maker_staff"]}');
set local role authenticated;
select pg_temp.db06_assert((select count(*)=1 and min(id::text)='b0000000-0000-4000-8000-000000000002' from public.ad_applications)
  and (select count(*)=0 from public.ad_placements) and (select count(*)=1 from public.creatives)
  and (select count(*)=1 from public.application_revisions),'W2 sees only M2');
reset role;

-- 5. Signage devices -----------------------------------------------------------------------
select pg_temp.db06_as('10000000-0000-4000-8000-000000000031','{"roles":["signage"],"device_id":"66000000-0000-4000-8000-000000000001","store_id":"20000000-0000-4000-8000-000000000001"}');
set local role authenticated;
select pg_temp.db06_assert((select count(*)=1 from public.stores) and (select count(*)=2 from public.store_products)
  and (select count(*)=1 from public.signage_devices),'device reads own store');
select pg_temp.db06_assert((select count(*)=1 and bool_and(status='active') from public.promotion_versions) and (select count(*)=2 from public.store_promotions),'own store promotions, active versions only');
insert into public.signage_plays(id,device_id,mode,reason_code,started_at,ended_at,data_origin) values
 ('67000000-0000-4000-8000-000000000003','66000000-0000-4000-8000-000000000001','fallback','no_content',now()-interval '10 minutes',now()-interval '9 minutes','operated');
insert into public.audience_estimates(play_id,method_version,measurement_status,estimated_viewers,estimated_view_seconds,data_origin) values
 ('67000000-0000-4000-8000-000000000003','face-v1','measured',0,0,'operated');
select pg_temp.db06_reject($q$insert into public.signage_plays(id,device_id,mode,reason_code,started_at,ended_at,data_origin) values(gen_random_uuid(),'66000000-0000-4000-8000-000000000002','fallback','no_content',now()-interval '10 minutes',now()-interval '9 minutes','operated')$q$,'42501');
select pg_temp.db06_reject($q$insert into public.audience_estimates(play_id,method_version,measurement_status,data_origin) values('67000000-0000-4000-8000-000000000004','face-v1','error','operated')$q$,'42501');
select pg_temp.db06_assert((select count(*)=2 from public.signage_plays) and (select count(*)=2 from public.audience_estimates),'own plays only');
select pg_temp.db06_assert((select count(*)=0 from public.visits) and (select count(*)=0 from public.orders)
  and (select count(*)=0 from public.order_items) and (select count(*)=0 from public.events)
  and (select count(*)=0 from public.customer_settings) and (select count(*)=0 from public.experiment_assignments),'device sees no personal rows');
reset role;
-- The same account claiming another device id gets nothing.
select pg_temp.db06_as('10000000-0000-4000-8000-000000000031','{"roles":["signage"],"device_id":"66000000-0000-4000-8000-000000000002","store_id":"20000000-0000-4000-8000-000000000002"}');
set local role authenticated;
select pg_temp.db06_assert((select count(*)=0 from public.stores) and (select count(*)=0 from public.signage_plays),'spoofed device claims see nothing');
select pg_temp.db06_reject($q$insert into public.signage_plays(id,device_id,mode,reason_code,started_at,ended_at,data_origin) values(gen_random_uuid(),'66000000-0000-4000-8000-000000000002','fallback','no_content',now()-interval '10 minutes',now()-interval '9 minutes','operated')$q$,'42501');
reset role;
-- A deactivated device loses access.
update public.signage_devices set is_active=false where id='66000000-0000-4000-8000-000000000001';
select pg_temp.db06_as('10000000-0000-4000-8000-000000000031','{"roles":["signage"],"device_id":"66000000-0000-4000-8000-000000000001","store_id":"20000000-0000-4000-8000-000000000001"}');
set local role authenticated;
select pg_temp.db06_assert((select count(*)=0 from public.signage_plays),'inactive device sees nothing');
reset role;

-- 6. Privilege shape ------------------------------------------------------------------------
select pg_temp.db06_assert((select bool_and(not has_table_privilege('anon','public.'||t,'SELECT')) from unnest(array['stores','products','visits','orders','events','ad_calls','signage_plays']) t),'anon has no table access');
select pg_temp.db06_assert((select bool_and(not has_table_privilege('authenticated','public.'||t,p))
  from unnest(array['visits','cart_items','orders','order_items','selections','selection_items','experiment_assignments','ad_placements','application_revisions']) t
  cross join unnest(array['INSERT','UPDATE','DELETE']) p),'no direct writes to function-only tables');
select pg_temp.db06_assert((select prosecdef from pg_proc where oid='public.app_start_visit(uuid,boolean,uuid)'::regprocedure),'app_start_visit runs with owner rights');
select pg_temp.db06_assert((select count(*)=0 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and not c.relrowsecurity),'every public table has RLS');
select 'DB-06: all assertions passed; rolling back fixtures' as result;
rollback;
