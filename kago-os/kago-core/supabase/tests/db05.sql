-- Disposable Supabase-compatible DB only; run as owner after DB-02〜DB-05.
-- Traces selection -> impression -> click -> add -> remove -> re-add -> purchase, resends,
-- experiments and Signage plays/estimates, then rolls everything back.
begin;
create function pg_temp.db05_assert(ok boolean, message text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'DB-05 assertion failed: %',message; end if;
end;
$$;
create function pg_temp.db05_reject(statement text, expected_state text) returns void language plpgsql as $$
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

-- U1/U2 customers, T1 S1 staff, DV1/DV2 Signage device accounts. P-ONLY2 is sold only in S2.
insert into auth.users(id,email) values
 ('10000000-0000-4000-8000-000000000001','db05-u1@example.test'),
 ('10000000-0000-4000-8000-000000000002','db05-u2@example.test'),
 ('10000000-0000-4000-8000-000000000003','db05-t1@example.test'),
 ('10000000-0000-4000-8000-000000000004','db05-dv1@example.test'),
 ('10000000-0000-4000-8000-000000000005','db05-dv2@example.test');
insert into public.stores(id,slug,name) values
 ('20000000-0000-4000-8000-000000000001','db05-s1','架空1号店'),
 ('20000000-0000-4000-8000-000000000002','db05-s2','架空2号店');
insert into public.store_members(store_id,user_id) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003');
insert into public.products(id,code,name,category) values
 ('30000000-0000-4000-8000-000000000001','2900000000100','架空スパゲッティ','pasta'),
 ('30000000-0000-4000-8000-000000000002','2900000000162','架空トマトソース','sauce'),
 ('30000000-0000-4000-8000-000000000003','2900000000200','架空粉チーズ','dairy'),
 ('30000000-0000-4000-8000-000000000004','2900000000999','2号店のみ','other');
insert into public.store_products(store_id,product_id,price) values
 ('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',248),
 ('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002',298),
 ('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000003',198),
 ('20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002',298),
 ('20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000004',98);
insert into public.customer_settings(user_id) values
 ('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');

-- DB-04 content valid now: sponsored P-SAUCE (PL1), all-day promo P-PASTA (SP1), a promo outside
-- today's weekday (SP2), and an S2 promo (SP3).
insert into public.makers(id,slug,display_name) values ('70000000-0000-4000-8000-000000000001','db05-m1','架空メーカー');
insert into public.ad_calls(id,store_id,title,categories,channels,starts_at,ends_at,status) values
 ('80000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','常設募集','{sauce}','{app,signage}',
  '2026-01-01T00:00:00+09','2099-01-01T00:00:00+09','open');
insert into public.creatives(id,maker_id,product_id) values
 ('90000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002');
insert into public.creative_versions(id,creative_id,version,image_path,headline) values
 ('a0000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001',1,'ad-assets/CR1/v1.png','第1版'),
 ('a0000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000001',2,'ad-assets/CR1/v2.png','第2版');
insert into public.ad_applications(id,ad_call_id,store_id,maker_id,creative_id,creative_version_id,channels,requested_period) values
 ('b0000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001',
  '{app,signage}','[2026-01-01T00:00:00+09,2099-01-01T00:00:00+09)');
update public.ad_applications set status='approved',reviewed_by='10000000-0000-4000-8000-000000000003'
 where id='b0000000-0000-4000-8000-000000000001';
insert into public.ad_placements(id,application_id,revision,store_id,creative_version_id,channels,starts_at,ends_at,approved_by) values
 ('c0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001',1,'20000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001','{app,signage}','2026-01-01T00:00:00+09','2099-01-01T00:00:00+09','10000000-0000-4000-8000-000000000003');
insert into public.store_promotions(id,store_id,product_id) values
 ('d0000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001'),
 ('d0000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000003'),
 ('d0000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002');
insert into public.promotion_versions(id,promotion_id,version,channels,time_windows,reason_text,starts_at,ends_at) values
 ('e0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001',1,'{app,signage}','[]','パスタ特売','2026-01-01T00:00:00+09','2099-01-01T00:00:00+09'),
 ('e0000000-0000-4000-8000-000000000002','d0000000-0000-4000-8000-000000000002',1,'{app}',
  jsonb_build_array(jsonb_build_object('weekdays',
    (select jsonb_agg(d) from generate_series(1,7) d where d <> extract(isodow from now() at time zone 'Asia/Tokyo')::integer),
    'start','00:00','end','24:00')),
  '今日以外の曜日','2026-01-01T00:00:00+09','2099-01-01T00:00:00+09'),
 ('e0000000-0000-4000-8000-000000000003','d0000000-0000-4000-8000-000000000003',1,'{app,signage}','[]','2号店の販促','2026-01-01T00:00:00+09','2099-01-01T00:00:00+09');

-- 1. U1 starts V1 at S1; the App server stores selection SEL1 for cart version 0.
insert into public.visits(id,user_id,store_id) values
 ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001'),
 ('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001');
insert into public.selections(id,visit_id,cart_version,rule_version) values
 ('61000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',0,1),
 ('61000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002',0,1);
insert into public.selection_items(id,selection_id,slot,placement_type,product_id,ad_placement_id,promotion_version_id,rank,reason_code,reason_text) values
 ('62000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001',1,'organic','30000000-0000-4000-8000-000000000003',null,null,1,'co_purchase','一緒に選ばれています'),
 ('62000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-000000000001',2,'sponsored','30000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000001',null,1,'sponsored_related','スパゲッティを選んだ方への広告です'),
 ('62000000-0000-4000-8000-000000000003','61000000-0000-4000-8000-000000000001',3,'store_promo','30000000-0000-4000-8000-000000000001',null,'e0000000-0000-4000-8000-000000000001',1,'store_pick','パスタ特売'),
 ('62000000-0000-4000-8000-000000000009','61000000-0000-4000-8000-000000000002',1,'organic','30000000-0000-4000-8000-000000000003',null,null,1,'popular','売れ筋です');
select pg_temp.db05_assert((select count(*)=3 from public.selection_items where selection_id='61000000-0000-4000-8000-000000000001'),'three slots stored');
select pg_temp.db05_assert((select count(*)=0 from public.events where event_type='recommendation_impression'),'selection alone is not an impression');

-- Slot rules.
select pg_temp.db05_reject($q$insert into public.selection_items(selection_id,slot,placement_type,product_id,rank,reason_code,reason_text) values('61000000-0000-4000-8000-000000000001',4,'organic','30000000-0000-4000-8000-000000000001',1,'popular','x')$q$,'23514');
select pg_temp.db05_reject($q$insert into public.selection_items(selection_id,slot,placement_type,product_id,rank,reason_code,reason_text) values('61000000-0000-4000-8000-000000000002',2,'organic','30000000-0000-4000-8000-000000000003',1,'popular','x')$q$,'23505');
select pg_temp.db05_reject($q$insert into public.selection_items(selection_id,slot,placement_type,product_id,ad_placement_id,rank,reason_code,reason_text) values('61000000-0000-4000-8000-000000000002',2,'organic','30000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000001',1,'popular','x')$q$,'23514');
select pg_temp.db05_reject($q$insert into public.selection_items(selection_id,slot,placement_type,product_id,ad_placement_id,rank,reason_code,reason_text) values('61000000-0000-4000-8000-000000000002',2,'sponsored','30000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001',1,'sponsored_related','x')$q$,'23514');
select pg_temp.db05_reject($q$insert into public.selection_items(selection_id,slot,placement_type,product_id,promotion_version_id,rank,reason_code,reason_text) values('61000000-0000-4000-8000-000000000002',2,'store_promo','30000000-0000-4000-8000-000000000003','e0000000-0000-4000-8000-000000000002',1,'store_pick','x')$q$,'23514');
select pg_temp.db05_reject($q$insert into public.selection_items(selection_id,slot,placement_type,product_id,promotion_version_id,rank,reason_code,reason_text) values('61000000-0000-4000-8000-000000000002',2,'store_promo','30000000-0000-4000-8000-000000000002','e0000000-0000-4000-8000-000000000003',1,'store_pick','x')$q$,'23503');
select pg_temp.db05_reject($q$insert into public.selection_items(selection_id,slot,placement_type,product_id,rank,reason_code,reason_text) values('61000000-0000-4000-8000-000000000002',2,'organic','30000000-0000-4000-8000-000000000004',1,'popular','x')$q$,'23503');
select pg_temp.db05_reject($q$insert into public.selection_items(selection_id,slot,placement_type,product_id,rank,reason_code,reason_text) values('61000000-0000-4000-8000-000000000002',2,'organic','30000000-0000-4000-8000-000000000001',1,'replenishment','そろそろ')$q$,'23514');
select pg_temp.db05_reject($q$insert into public.selection_items(selection_id,slot,placement_type,product_id,rank,reason_code,reason_text) values('61000000-0000-4000-8000-000000000002',2,'organic','30000000-0000-4000-8000-000000000001',1,'Bad Code','x')$q$,'23514');
update public.customer_settings set use_purchase_history=true where user_id='10000000-0000-4000-8000-000000000002';
insert into public.selection_items(selection_id,slot,placement_type,product_id,rank,reason_code,reason_text) values
 ('61000000-0000-4000-8000-000000000002',2,'organic','30000000-0000-4000-8000-000000000001',1,'replenishment','そろそろです');
insert into public.selection_items(selection_id,slot,placement_type,product_id,ad_placement_id,rank,reason_code,reason_text) values
 ('61000000-0000-4000-8000-000000000002',3,'sponsored','30000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000001',1,'sponsored_related','広告');
select pg_temp.db05_reject($q$insert into public.selection_items(selection_id,slot,placement_type,product_id,rank,reason_code,reason_text) values('61000000-0000-4000-8000-000000000002',2,'organic','30000000-0000-4000-8000-000000000001',1,'sponsored_related','広告です')$q$,'23514');
select pg_temp.db05_reject($q$insert into public.selection_items(selection_id,slot,placement_type,product_id,ad_placement_id,rank,reason_code,reason_text) values('61000000-0000-4000-8000-000000000002',2,'sponsored','30000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000001',1,'popular','x')$q$,'23514');
-- Re-running a fixed-id seed: identical rows are no-ops, changed rows are refused.
insert into public.selections(id,visit_id,cart_version,rule_version) values ('61000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002',0,1);
insert into public.selection_items(id,selection_id,slot,placement_type,product_id,ad_placement_id,promotion_version_id,rank,reason_code,reason_text) values
 ('62000000-0000-4000-8000-000000000009','61000000-0000-4000-8000-000000000002',1,'organic','30000000-0000-4000-8000-000000000003',null,null,1,'popular','売れ筋です');
select pg_temp.db05_reject($q$insert into public.selections(id,visit_id,cart_version,rule_version) values('61000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002',0,2)$q$,'23505');
select pg_temp.db05_reject($q$insert into public.selection_items(id,selection_id,slot,placement_type,product_id,rank,reason_code,reason_text) values('62000000-0000-4000-8000-000000000009','61000000-0000-4000-8000-000000000002',1,'organic','30000000-0000-4000-8000-000000000003',2,'popular','売れ筋です')$q$,'23505');
select pg_temp.db05_assert((select count(*)=2 from public.selections) and (select count(*)=6 from public.selection_items),'seed re-run adds nothing');
select pg_temp.db05_reject($q$update public.selection_items set rank=2$q$,'23514');
select pg_temp.db05_reject($q$delete from public.selections$q$,'23514');
select pg_temp.db05_reject($q$insert into public.selections(visit_id,cart_version,rule_version) values('40000000-0000-4000-8000-000000000001',5,1)$q$,'23514');

-- 2. Impression on the sponsored slot, resent twice; a second impression id for the slot is refused.
insert into public.events(event_id,event_type,schema_version,occurred_at,store_id,user_id,visit_id,selection_item_id,product_id,payload,data_origin) values
 ('63000000-0000-4000-8000-000000000001','recommendation_impression',1,'2026-10-24T17:30:12+09','20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000002','{"visible_ms":1200}','operated');
insert into public.events(event_id,event_type,schema_version,occurred_at,store_id,user_id,visit_id,selection_item_id,product_id,payload,data_origin) values
 ('63000000-0000-4000-8000-000000000001','recommendation_impression',1,'2026-10-24T17:30:12+09','20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000002','{"visible_ms":1200}','operated');
select pg_temp.db05_assert((select count(*)=1 from public.events where event_id='63000000-0000-4000-8000-000000000001'),'identical resend is a no-op');
select pg_temp.db05_reject($q$insert into public.events(event_id,event_type,schema_version,occurred_at,store_id,user_id,visit_id,selection_item_id,product_id,payload,data_origin) values('63000000-0000-4000-8000-000000000001','recommendation_impression',1,'2026-10-24T17:30:12+09','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','{"visible_ms":9999}','operated')$q$,'23505');
insert into public.events(event_id,event_type,schema_version,occurred_at,store_id,user_id,visit_id,selection_item_id,product_id,payload,data_origin) values
 ('63000000-0000-4000-8000-0000000000ff','recommendation_impression',1,'2026-10-24T17:31:00+09','20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000002','{"visible_ms":1500}','operated');
select pg_temp.db05_assert((select count(*)=1 and min(event_id::text)='63000000-0000-4000-8000-000000000001' from public.events
 where selection_item_id='62000000-0000-4000-8000-000000000002' and event_type='recommendation_impression'),'one impression per slot; a re-shown slot adds nothing');

-- 3. Click + add from the card (cart write is APP-02's function; done directly here).
insert into public.events(event_id,event_type,schema_version,occurred_at,store_id,user_id,visit_id,selection_item_id,product_id,payload,data_origin) values
 ('63000000-0000-4000-8000-000000000002','recommendation_click',1,'2026-10-24T17:30:20+09','20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000002','{"target":"add_button"}','operated');
insert into public.cart_items(visit_id,product_id,quantity) values ('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002',1);
update public.visits set cart_version=1 where id='40000000-0000-4000-8000-000000000001';
insert into public.events(event_id,event_type,schema_version,occurred_at,store_id,user_id,visit_id,selection_item_id,product_id,payload,data_origin) values
 ('63000000-0000-4000-8000-000000000003','cart_item_added',1,'2026-10-24T17:30:21+09','20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000002','{"source":"recommendation","quantity":1,"quantity_delta":1,"cart_version":1}','operated');
-- SEL1 is now stale.
select pg_temp.db05_reject($q$insert into public.selection_items(selection_id,slot,placement_type,product_id,rank,reason_code,reason_text) values('61000000-0000-4000-8000-000000000001',1,'organic','30000000-0000-4000-8000-000000000001',2,'popular','x')$q$,'23514');
select pg_temp.db05_reject($q$insert into public.selections(visit_id,cart_version,rule_version) values('40000000-0000-4000-8000-000000000001',0,1)$q$,'23514');

-- 4. Remove all, give a reason, then re-add by scanning.
delete from public.cart_items where visit_id='40000000-0000-4000-8000-000000000001';
update public.visits set cart_version=2 where id='40000000-0000-4000-8000-000000000001';
insert into public.events(event_id,event_type,schema_version,occurred_at,store_id,user_id,visit_id,product_id,payload,data_origin) values
 ('63000000-0000-4000-8000-000000000004','cart_item_removed',1,'2026-10-24T17:31:00+09','20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002',
  '{"source":"manual","quantity":0,"quantity_delta":-1,"cart_version":2}','operated'),
 ('63000000-0000-4000-8000-000000000005','removal_reason_submitted',1,'2026-10-24T17:31:05+09','20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002',
  '{"removal_event_id":"63000000-0000-4000-8000-000000000004","reason":"price"}','operated'),
 ('63000000-0000-4000-8000-000000000006','product_scanned',1,'2026-10-24T17:32:00+09','20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002',
  '{"method":"barcode"}','operated'),
 ('63000000-0000-4000-8000-000000000007','scan_failed',1,'2026-10-24T17:32:30+09','20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',null,
  '{"reason":"not_found","code":"0000000000000"}','operated'),
 ('63000000-0000-4000-8000-000000000008','product_compared',1,'2026-10-24T17:32:40+09','20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',null,
  '{"product_ids":["30000000-0000-4000-8000-000000000001","30000000-0000-4000-8000-000000000002"]}','operated');
insert into public.cart_items(visit_id,product_id,quantity) values ('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002',1);
update public.visits set cart_version=3 where id='40000000-0000-4000-8000-000000000001';
insert into public.events(event_id,event_type,schema_version,occurred_at,store_id,user_id,visit_id,product_id,payload,data_origin) values
 ('63000000-0000-4000-8000-000000000009','cart_item_added',1,'2026-10-24T17:32:01+09','20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002',
  '{"source":"scan","quantity":1,"quantity_delta":1,"cart_version":3}','operated');

-- 5. Purchase (DB-03 tables; DB-07 will do this atomically) and late resend after the visit ended.
insert into public.orders(id,visit_id,user_id,store_id,ordered_at,total,idempotency_key,cart_version,data_origin) values
 ('50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001','2026-10-24T17:40:00+09',298,'60000000-0000-4000-8000-000000000001',3,'operated');
insert into public.order_items(order_id,product_id,product_name,unit_price,quantity) values
 ('50000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','架空トマトソース',298,1);
update public.visits set status='completed',ended_at=now() where id='40000000-0000-4000-8000-000000000001';
insert into public.events(event_id,event_type,schema_version,occurred_at,store_id,user_id,visit_id,selection_item_id,product_id,payload,data_origin) values
 ('63000000-0000-4000-8000-000000000001','recommendation_impression',1,'2026-10-24T17:30:12+09','20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000002','{"visible_ms":1200}','operated');
select pg_temp.db05_reject($q$insert into public.selections(visit_id,cart_version,rule_version) values('40000000-0000-4000-8000-000000000001',3,1)$q$,'23514');

-- Trace: impression -> click -> recommendation add -> full removal -> purchase for (V1, P-SAUCE, sponsored).
select pg_temp.db05_assert((
  with imp as (
    select e.visit_id, e.product_id, si.placement_type, si.ad_placement_id, min(e.occurred_at) at
    from public.events e join public.selection_items si on si.id=e.selection_item_id
    where e.event_type='recommendation_impression' group by 1,2,3,4)
  select count(*)=1
    and bool_and(i.ad_placement_id='c0000000-0000-4000-8000-000000000001')
    and bool_and(exists (select 1 from public.events c join public.selection_items s on s.id=c.selection_item_id
      where c.event_type='recommendation_click' and c.visit_id=i.visit_id and s.product_id=i.product_id and s.placement_type=i.placement_type and c.occurred_at>=i.at))
    and bool_and(exists (select 1 from public.events a where a.event_type='cart_item_added' and a.payload->>'source'='recommendation'
      and a.visit_id=i.visit_id and a.product_id=i.product_id and a.occurred_at>=i.at))
    and bool_and(exists (select 1 from public.events r where r.event_type='cart_item_removed' and r.visit_id=i.visit_id
      and r.product_id=i.product_id and (r.payload->>'quantity')::int=0))
    and bool_and(exists (select 1 from public.orders o join public.order_items oi on oi.order_id=o.id
      where o.visit_id=i.visit_id and oi.product_id=i.product_id and o.ordered_at>=i.at))
  from imp i),'impression-click-add-remove-purchase trace');
select pg_temp.db05_assert((select count(*)=9 and count(distinct event_id)=9 from public.events),'nine distinct events after resends');

-- Event rejections.
select pg_temp.db05_reject($q$insert into public.events(event_id,event_type,schema_version,occurred_at,store_id,user_id,visit_id,product_id,payload,data_origin) values(gen_random_uuid(),'product_scanned',1,now(),'20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','{"method":"barcode"}','operated')$q$,'23503');
select pg_temp.db05_reject($q$insert into public.events(event_id,event_type,schema_version,occurred_at,store_id,user_id,visit_id,product_id,payload,data_origin) values(gen_random_uuid(),'product_scanned',1,now(),'20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000004','{"method":"barcode"}','operated')$q$,'23503');
select pg_temp.db05_reject($q$insert into public.events(event_id,event_type,schema_version,occurred_at,store_id,user_id,visit_id,product_id,payload,data_origin) values(gen_random_uuid(),'recommendation_click',1,now(),'20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000003','{"target":"detail"}','operated')$q$,'23514');
select pg_temp.db05_reject($q$insert into public.events(event_id,event_type,schema_version,occurred_at,store_id,user_id,visit_id,product_id,payload,data_origin) values(gen_random_uuid(),'cart_item_added',1,now(),'20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000003','{"source":"recommendation","quantity":1,"quantity_delta":1,"cart_version":1}','operated')$q$,'23514');
select pg_temp.db05_reject($q$insert into public.events(event_id,event_type,schema_version,occurred_at,store_id,user_id,visit_id,product_id,payload,data_origin) values(gen_random_uuid(),'cart_quantity_changed',1,now(),'20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000003','{"source":"manual","quantity":2,"quantity_delta":0,"cart_version":1}','operated')$q$,'23514');
select pg_temp.db05_reject($q$insert into public.events(event_id,event_type,schema_version,occurred_at,store_id,user_id,visit_id,selection_item_id,product_id,payload,data_origin) values(gen_random_uuid(),'recommendation_impression',1,now(),'20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','62000000-0000-4000-8000-000000000009','30000000-0000-4000-8000-000000000003','{"visible_ms":500}','operated')$q$,'23514');
select pg_temp.db05_reject($q$insert into public.events(event_id,event_type,schema_version,occurred_at,store_id,user_id,visit_id,selection_item_id,product_id,payload,data_origin) values(gen_random_uuid(),'recommendation_impression',1,now(),'20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','62000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000003','{"visible_ms":1500}','operated')$q$,'23503');
select pg_temp.db05_reject($q$insert into public.events(event_id,event_type,schema_version,occurred_at,store_id,user_id,visit_id,selection_item_id,product_id,payload,data_origin) values(gen_random_uuid(),'recommendation_impression',1,now(),'20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','62000000-0000-4000-8000-000000000009','30000000-0000-4000-8000-000000000001','{"visible_ms":1500}','operated')$q$,'23503');
select pg_temp.db05_reject($q$insert into public.events(event_id,event_type,schema_version,occurred_at,store_id,user_id,visit_id,product_id,payload,data_origin) values(gen_random_uuid(),'purchase',1,now(),'20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000003','{}','operated')$q$,'23514');
select pg_temp.db05_reject($q$insert into public.events(event_id,event_type,schema_version,occurred_at,store_id,user_id,visit_id,product_id,payload,data_origin) values(gen_random_uuid(),'product_scanned',2,now(),'20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000003','{"method":"barcode"}','operated')$q$,'23514');
select pg_temp.db05_reject($q$insert into public.events(event_id,event_type,schema_version,occurred_at,store_id,channel,user_id,visit_id,product_id,payload,data_origin) values(gen_random_uuid(),'product_scanned',1,now(),'20000000-0000-4000-8000-000000000001','signage','10000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000003','{"method":"barcode"}','operated')$q$,'23514');
select pg_temp.db05_reject($q$insert into public.events(event_id,event_type,schema_version,occurred_at,store_id,user_id,visit_id,payload,data_origin) values(gen_random_uuid(),'product_compared',1,now(),'20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','{"product_ids":["30000000-0000-4000-8000-000000000001"]}','operated')$q$,'23514');
select pg_temp.db05_reject($q$insert into public.events(event_id,event_type,schema_version,occurred_at,store_id,user_id,visit_id,payload,data_origin) values(gen_random_uuid(),'product_compared',1,now(),'20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','{"product_ids":["30000000-0000-4000-8000-000000000001","30000000-0000-4000-8000-000000000004"]}','operated')$q$,'23503');
select pg_temp.db05_reject($q$insert into public.events(event_id,event_type,schema_version,occurred_at,store_id,user_id,visit_id,payload,data_origin) values(gen_random_uuid(),'removal_reason_submitted',1,now(),'20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','{"removal_event_id":"63000000-0000-4000-8000-000000000003","reason":"price"}','operated')$q$,'23503');
select pg_temp.db05_reject($q$insert into public.events(event_id,event_type,schema_version,occurred_at,store_id,user_id,visit_id,payload,data_origin) values(gen_random_uuid(),'removal_reason_submitted',1,now(),'20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','{"removal_event_id":"63000000-0000-4000-8000-000000000004","reason":"price"}','operated')$q$,'23503');
select pg_temp.db05_reject(format($q$insert into public.events(event_id,event_type,schema_version,occurred_at,store_id,user_id,visit_id,selection_item_id,product_id,payload,data_origin) values(gen_random_uuid(),%L,1,now(),'20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002',%L,%L,%L,'operated')$q$,t,si,pr,pl),'23514')
 from (values
  ('product_scanned',null,'30000000-0000-4000-8000-000000000003','{}'),
  ('product_scanned',null,'30000000-0000-4000-8000-000000000003','{"method":null}'),
  ('scan_failed',null,null,'{}'),
  ('recommendation_click','62000000-0000-4000-8000-000000000009','30000000-0000-4000-8000-000000000003','{}'),
  ('recommendation_impression','62000000-0000-4000-8000-000000000009','30000000-0000-4000-8000-000000000003','{"visible_ms":"1200"}'),
  ('product_compared',null,null,'{}'),
  ('product_compared',null,null,'{"product_ids":"30000000-0000-4000-8000-000000000001"}'),
  ('removal_reason_submitted',null,null,'{"removal_event_id":"not-a-uuid","reason":"price"}'),
  ('cart_item_added',null,'30000000-0000-4000-8000-000000000003','{"source":"scan","quantity":1,"quantity_delta":1,"cart_version":"x"}'),
  ('cart_item_removed',null,'30000000-0000-4000-8000-000000000003','{"source":"manual","quantity":1,"quantity_delta":-1,"cart_version":2}')
 ) v(t,si,pr,pl);
select pg_temp.db05_reject($q$update public.events set payload='{}'$q$,'23514');
select pg_temp.db05_reject($q$delete from public.events$q$,'23514');

-- 6. Experiments: App assignment fixes the visit arm; Signage experiments take no personal assignment.
insert into public.experiments(id,store_id,slug,channel,unit,arms,starts_at,ends_at) values
 ('64000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','ads-ab','app','user','{control,ads}','2026-01-01T00:00:00+09','2099-01-01T00:00:00+09'),
 ('64000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','signage-ab','signage','device_time_window','{schedule,adaptive}','2026-01-01T00:00:00+09','2099-01-01T00:00:00+09');
insert into public.experiment_assignments(id,experiment_id,user_id,arm) values
 ('65000000-0000-4000-8000-000000000001','64000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','ads');
select pg_temp.db05_reject($q$insert into public.experiment_assignments(experiment_id,user_id,arm) values('64000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','treatment')$q$,'23514');
select pg_temp.db05_reject($q$insert into public.experiment_assignments(experiment_id,user_id,arm) values('64000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','schedule')$q$,'23514');
select pg_temp.db05_reject($q$insert into public.experiment_assignments(experiment_id,user_id,arm) values('64000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','control')$q$,'23505');
select pg_temp.db05_reject($q$update public.experiment_assignments set arm='control'$q$,'23514');
select pg_temp.db05_reject($q$update public.experiments set arms='{a,b}'$q$,'23514');
select pg_temp.db05_reject($q$insert into public.experiments(store_id,slug,channel,unit,arms,starts_at,ends_at) values('20000000-0000-4000-8000-000000000001','one-arm','app','user','{only}','2026-01-01','2099-01-01')$q$,'23514');
select pg_temp.db05_reject($q$insert into public.experiments(store_id,slug,channel,unit,arms,starts_at,ends_at) values('20000000-0000-4000-8000-000000000001','bad-unit','app','device_time_window','{a,b}','2026-01-01','2099-01-01')$q$,'23514');
insert into public.visits(id,user_id,store_id,assignment_id,experiment_arm) values
 ('40000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','65000000-0000-4000-8000-000000000001','ads');
select pg_temp.db05_assert((select experiment_arm='ads' from public.visits where id='40000000-0000-4000-8000-000000000003'),'visit keeps arm');
select pg_temp.db05_reject($q$update public.visits set experiment_arm='control' where id='40000000-0000-4000-8000-000000000003'$q$,'23514');
select pg_temp.db05_reject($q$update public.visits set assignment_id=null,experiment_arm=null where id='40000000-0000-4000-8000-000000000003'$q$,'23514');
select pg_temp.db05_reject($q$insert into public.visits(user_id,store_id,assignment_id,experiment_arm) values('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','65000000-0000-4000-8000-000000000001','ads')$q$,'23503');
select pg_temp.db05_reject($q$insert into public.visits(user_id,store_id,assignment_id,experiment_arm) values('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','65000000-0000-4000-8000-000000000001','ads')$q$,'23514');
select pg_temp.db05_reject($q$insert into public.visits(user_id,store_id,assignment_id) values('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','65000000-0000-4000-8000-000000000001')$q$,'23514');

-- 7. Signage: D1 (S1) plays PL1, the S1 promotion and a fallback; estimates cover measured / not measured / error.
insert into public.signage_devices(id,store_id,auth_user_id,slug,location) values
 ('66000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004','entrance','入口'),
 ('66000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000005','entrance','入口');
select pg_temp.db05_reject($q$update public.signage_devices set store_id='20000000-0000-4000-8000-000000000002' where id='66000000-0000-4000-8000-000000000001'$q$,'23514');
insert into public.signage_plays(id,device_id,ad_placement_id,promotion_version_id,creative_version_id,mode,reason_code,started_at,ended_at,data_origin,media_kind,end_reason) values
 ('67000000-0000-4000-8000-000000000001','66000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001',null,'a0000000-0000-4000-8000-000000000001','schedule','approved_order','2026-10-24T17:00:00+09','2026-10-24T17:00:10+09','operated','image','completed'),
 ('67000000-0000-4000-8000-000000000002','66000000-0000-4000-8000-000000000001',null,'e0000000-0000-4000-8000-000000000001',null,'schedule','store_pick','2026-10-24T17:00:10+09','2026-10-24T17:00:12+09','operated','image','closed'),
 ('67000000-0000-4000-8000-000000000003','66000000-0000-4000-8000-000000000001',null,null,null,'fallback','cache_expired','2026-10-24T17:01:00+09','2026-10-24T17:01:30+09','operated',null,null),
 ('67000000-0000-4000-8000-000000000004','66000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001',null,'a0000000-0000-4000-8000-000000000001','schedule','approved_order','2026-10-24T17:02:00+09','2026-10-24T17:02:10+09','seeded','image','completed');
insert into public.signage_plays(id,device_id,ad_placement_id,promotion_version_id,creative_version_id,mode,reason_code,started_at,ended_at,data_origin,media_kind,end_reason) values
 ('67000000-0000-4000-8000-000000000001','66000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001',null,'a0000000-0000-4000-8000-000000000001','schedule','approved_order','2026-10-24T17:00:00+09','2026-10-24T17:00:10+09','operated','image','completed');
select pg_temp.db05_assert((select count(*)=4 from public.signage_plays),'identical play resend is a no-op');
select pg_temp.db05_reject($q$insert into public.signage_plays(id,device_id,ad_placement_id,creative_version_id,mode,reason_code,started_at,ended_at,data_origin) values('67000000-0000-4000-8000-000000000001','66000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','schedule','approved_order','2026-10-24T17:00:00+09','2026-10-24T17:00:20+09','operated')$q$,'23505');
select pg_temp.db05_reject($q$insert into public.signage_plays(id,device_id,ad_placement_id,creative_version_id,mode,reason_code,started_at,ended_at,data_origin) values(gen_random_uuid(),'66000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000002','schedule','approved_order','2026-10-24T17:00:00+09','2026-10-24T17:00:20+09','operated')$q$,'23514');
select pg_temp.db05_reject($q$insert into public.signage_plays(id,device_id,ad_placement_id,creative_version_id,mode,reason_code,started_at,ended_at,data_origin) values(gen_random_uuid(),'66000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','schedule','approved_order','2026-10-24T17:00:00+09','2026-10-24T17:00:20+09','operated')$q$,'23503');
select pg_temp.db05_reject($q$insert into public.signage_plays(id,device_id,promotion_version_id,mode,reason_code,started_at,ended_at,data_origin) values(gen_random_uuid(),'66000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000002','schedule','store_pick','2026-10-24T17:00:00+09','2026-10-24T17:00:20+09','operated')$q$,'23514');
select pg_temp.db05_reject($q$insert into public.signage_plays(id,device_id,ad_placement_id,creative_version_id,mode,reason_code,started_at,ended_at,data_origin) values(gen_random_uuid(),'66000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','schedule','approved_order','2025-10-24T17:00:00+09','2025-10-24T17:00:20+09','operated')$q$,'23514');
select pg_temp.db05_reject($q$insert into public.signage_plays(id,device_id,ad_placement_id,creative_version_id,mode,reason_code,started_at,ended_at,data_origin) values(gen_random_uuid(),'66000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','fallback','no_content','2026-10-24T17:00:00+09','2026-10-24T17:00:20+09','operated')$q$,'23514');
select pg_temp.db05_reject($q$insert into public.signage_plays(id,device_id,mode,reason_code,started_at,ended_at,data_origin) values(gen_random_uuid(),'66000000-0000-4000-8000-000000000001','fallback','no_content','2026-10-24T17:00:20+09','2026-10-24T17:00:00+09','operated')$q$,'23514');
select pg_temp.db05_reject($q$insert into public.signage_plays(id,device_id,mode,reason_code,started_at,ended_at,data_origin,end_reason) values(gen_random_uuid(),'66000000-0000-4000-8000-000000000001','fallback','no_content','2026-10-24T17:00:00+09','2026-10-24T17:00:20+09','operated','skipped')$q$,'23514');
select pg_temp.db05_reject($q$update public.signage_plays set ended_at=started_at$q$,'23514');
select pg_temp.db05_reject($q$delete from public.signage_plays$q$,'23514');

insert into public.audience_estimates(play_id,method_version,measurement_status,estimated_viewers,estimated_view_seconds,data_origin) values
 ('67000000-0000-4000-8000-000000000001','face-v1','measured',3,12.5,'operated'),
 ('67000000-0000-4000-8000-000000000002','face-v1','measured',0,0,'operated'),
 ('67000000-0000-4000-8000-000000000003','face-v1','not_measured',null,null,'operated'),
 ('67000000-0000-4000-8000-000000000004','synthetic-v1','measured',2,6,'synthetic');
insert into public.audience_estimates(play_id,method_version,measurement_status,estimated_viewers,estimated_view_seconds,data_origin) values
 ('67000000-0000-4000-8000-000000000003','face-v1','not_measured',null,null,'operated');
select pg_temp.db05_reject($q$insert into public.audience_estimates(play_id,method_version,measurement_status,estimated_viewers,estimated_view_seconds,data_origin) values('67000000-0000-4000-8000-000000000003','face-v1','error',null,null,'operated')$q$,'23505');
select pg_temp.db05_assert((select count(*) filter (where measurement_status='measured')=3 and count(*) filter (where estimated_viewers=0)=1
 and count(*) filter (where measurement_status='not_measured' and estimated_viewers is null)=1 and count(*)=4 from public.audience_estimates),'measured zero differs from not measured');
select pg_temp.db05_assert((select coalesce(sum(estimated_viewers),0)=3 from public.audience_estimates where data_origin='operated'),'synthetic estimates stay separate');
insert into public.signage_plays(id,device_id,mode,reason_code,started_at,ended_at,data_origin) values
 ('67000000-0000-4000-8000-000000000005','66000000-0000-4000-8000-000000000001','fallback','no_content','2026-10-24T17:05:00+09','2026-10-24T17:05:03+09','seeded');
select pg_temp.db05_reject($q$insert into public.audience_estimates(play_id,method_version,measurement_status,data_origin) values('67000000-0000-4000-8000-000000000005','face-v1','error','operated')$q$,'23514');
select pg_temp.db05_reject($q$insert into public.audience_estimates(play_id,method_version,measurement_status,data_origin) values('67000000-0000-4000-8000-000000000005','face-v1','measured','seeded')$q$,'23514');
select pg_temp.db05_reject($q$insert into public.audience_estimates(play_id,method_version,measurement_status,estimated_viewers,estimated_view_seconds,data_origin) values('67000000-0000-4000-8000-000000000005','face-v1','not_measured',0,0,'seeded')$q$,'23514');
select pg_temp.db05_reject($q$update public.audience_estimates set estimated_viewers=9$q$,'23514');
select pg_temp.db05_assert((select count(*)=0 from information_schema.columns where table_schema='public'
 and table_name in ('signage_devices','signage_plays','audience_estimates') and column_name in ('user_id','visit_id')),'Signage has no customer columns');

-- Privileges.
select pg_temp.db05_assert((select count(*)=8 and bool_and(relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
 and c.relname in ('experiments','experiment_assignments','selections','selection_items','events','signage_devices','signage_plays','audience_estimates')),'eight tables RLS enabled');
select pg_temp.db05_assert((select bool_and(not has_table_privilege(r,'public.'||t,p)) from unnest(case when to_regprocedure('public.kago_has_role(text)') is null then array['anon','authenticated'] else array['anon'] end) r
 cross join unnest(array['experiments','experiment_assignments','selections','selection_items','events','signage_devices','signage_plays','audience_estimates']) t
 cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p),'general roles have no access');
select pg_temp.db05_assert((select bool_and(not has_table_privilege('service_role','public.'||t,p)) from
 unnest(array['experiments','experiment_assignments','selections','selection_items','events','signage_plays','audience_estimates']) t
 cross join unnest(array['UPDATE','DELETE','TRUNCATE']) p),'append-only grants for service_role');
set local role service_role;
insert into public.events(event_id,event_type,schema_version,occurred_at,store_id,user_id,visit_id,product_id,payload,data_origin) values
 (gen_random_uuid(),'product_scanned',1,now(),'20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',
  '40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000003','{"method":"manual"}','seeded');
reset role;
set local role authenticated;
select pg_temp.db05_reject($q$select * from public.events$q$,case when to_regprocedure('public.kago_has_role(text)') is null then '42501' end); -- DB-06 grants SELECT; rows are then filtered by RLS (db06.sql)
reset role;
select 'DB-05: all assertions passed; rolling back fixtures' as result;
rollback;
