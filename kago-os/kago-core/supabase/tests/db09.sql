-- Disposable Supabase-compatible DB only. Fixtures are synthetic test actions, rolled back.
begin;
create function pg_temp.db09_id(prefix text,n integer) returns uuid language sql immutable as $$
 select (prefix||'0000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
$$;
create function pg_temp.db09_assert(ok boolean,message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'DB-09: %',message;end if;end;
$$;
create function pg_temp.db09_reject(statement text,expected text) returns void language plpgsql as $$
declare actual text;
begin
 begin execute statement;exception when others then get stacked diagnostics actual=returned_sqlstate;end;
 if actual is distinct from expected then raise exception 'Expected %, got %: %',expected,actual,statement;end if;
end;
$$;
create function pg_temp.db09_as(n integer,role_name text) returns void language plpgsql as $$
begin
 perform set_config('request.jwt.claim.sub',pg_temp.db09_id('1',n)::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.db09_id('1',n),
  'app_metadata',jsonb_build_object('kago',jsonb_build_object('roles',jsonb_build_array(role_name))))::text,true);
end;
$$;
insert into auth.users(id,email) select pg_temp.db09_id('1',n),'db09-'||n||'@example.test'
 from unnest(array[1,2,11,12,21,22,31]) n;
insert into public.stores(id,slug,name) select pg_temp.db09_id('2',n),'db09-s'||n,'架空店舗'||n from generate_series(1,2)n;
insert into public.store_members(store_id,user_id) select pg_temp.db09_id('2',n),pg_temp.db09_id('1',10+n) from generate_series(1,2)n;
insert into public.products(id,code,name,category) select pg_temp.db09_id('3',n),'DB09-'||n,'架空商品'||n,'test' from generate_series(1,2)n;
insert into public.store_products(store_id,product_id,price) select pg_temp.db09_id('2',s),pg_temp.db09_id('3',p),p*100 from generate_series(1,2)s cross join generate_series(1,2)p;
insert into public.makers(id,slug,display_name) select pg_temp.db09_id('7',n),'db09-m'||n,'架空メーカー'||n from generate_series(1,2)n;
insert into public.maker_members(maker_id,user_id) select pg_temp.db09_id('7',n),pg_temp.db09_id('1',20+n) from generate_series(1,2)n;
insert into public.ad_calls(id,store_id,title,categories,channels,starts_at,ends_at,status,disclosure_scope)
 select pg_temp.db09_id('8',n),pg_temp.db09_id('2',n),'募集','{test}','{app,signage}',
 '2026-01-01+09','2099-01-01+09','open','{impressions,clicks,cart_adds,purchases,signage_views}' from generate_series(1,2)n;
insert into public.creatives(id,maker_id,product_id)
 select pg_temp.db09_id('9',n),pg_temp.db09_id('7',least(n,2)),pg_temp.db09_id('3',least(n,2)) from generate_series(1,3)n;
insert into public.creative_versions(id,creative_id,version,image_path,headline)
 select pg_temp.db09_id('a',n),pg_temp.db09_id('9',n),1,'db09/'||n||'.png','架空素材' from generate_series(1,3)n;
insert into public.ad_applications(id,ad_call_id,store_id,maker_id,creative_id,creative_version_id,channels,requested_period)
 select pg_temp.db09_id('b',n),pg_temp.db09_id('8',case when n=3 then 2 else 1 end),
 pg_temp.db09_id('2',case when n=3 then 2 else 1 end),pg_temp.db09_id('7',least(n,2)),
 pg_temp.db09_id('9',n),pg_temp.db09_id('a',n),'{app,signage}','[2026-01-01+09,2099-01-01+09)' from generate_series(1,3)n;
update public.ad_applications set status='approved',reviewed_by=pg_temp.db09_id('1',case when store_id=pg_temp.db09_id('2',1) then 11 else 12 end);
insert into public.ad_placements(id,application_id,revision,store_id,creative_version_id,channels,starts_at,ends_at,approved_by)
 select pg_temp.db09_id('c',n),pg_temp.db09_id('b',n),1,pg_temp.db09_id('2',case when n=3 then 2 else 1 end),
 pg_temp.db09_id('a',n),'{app,signage}','2026-01-01+09','2099-01-01+09',pg_temp.db09_id('1',case when n=3 then 12 else 11 end) from generate_series(1,3)n;
insert into public.visits(id,user_id,store_id,started_at,last_activity_at)
 select pg_temp.db09_id('4',n),pg_temp.db09_id('1',case when n in(1,3) then 1 else 2 end),
 pg_temp.db09_id('2',case when n=3 then 2 else 1 end),'2026-10-22T17:00:00+09','2026-10-22T17:00:00+09' from generate_series(1,4)n;
insert into public.selections(id,visit_id,cart_version,rule_version,created_at)
 select pg_temp.db09_id('6',n),pg_temp.db09_id('4',case when n in(1,2,6) then 1 else n-1 end),0,
 case when n=2 then 2 else 1 end,'2026-10-22T17:00:00+09'::timestamptz+(n-1)*interval '1 second' from generate_series(1,6)n;
insert into public.selection_items(id,selection_id,slot,placement_type,product_id,ad_placement_id,rank,reason_code,reason_text)
 select pg_temp.db09_id('e',n),pg_temp.db09_id('6',n),1,'sponsored',pg_temp.db09_id('3',case when n in(3,4) then 2 else 1 end),
 pg_temp.db09_id('c',case when n=3 then 2 when n=4 then 3 else 1 end),1,'sponsored_related','広告' from generate_series(1,5)n;
insert into public.selection_items(id,selection_id,slot,placement_type,product_id,rank,reason_code,reason_text) values
 (pg_temp.db09_id('e',6),pg_temp.db09_id('6',1),2,'organic',pg_temp.db09_id('3',2),1,'popular','通常推薦'),
 (pg_temp.db09_id('e',7),pg_temp.db09_id('6',2),2,'organic',pg_temp.db09_id('3',2),1,'popular','画面外'),
 (pg_temp.db09_id('e',8),pg_temp.db09_id('6',6),1,'organic',pg_temp.db09_id('3',1),1,'popular','別種別');

create function pg_temp.db09_event(n integer,kind text,v integer,si integer,p integer,at_time timestamptz,payload jsonb,origin text default 'operated')
returns void language sql as $$
 insert into public.events(event_id,event_type,schema_version,occurred_at,store_id,user_id,visit_id,selection_item_id,product_id,payload,data_origin)
 select pg_temp.db09_id('f',n),kind,1,at_time,store_id,user_id,id,case when si is not null then pg_temp.db09_id('e',si) end,pg_temp.db09_id('3',p),payload,origin
 from public.visits where id=pg_temp.db09_id('4',v);
$$;
select pg_temp.db09_event(1,'recommendation_impression',1,1,1,'2026-10-22T17:00:10+09','{"visible_ms":1000}');
-- Same UUID resend and another selection of the same product: only one counted impression.
select pg_temp.db09_event(1,'recommendation_impression',1,1,1,'2026-10-22T17:00:10+09','{"visible_ms":1000}');
select pg_temp.db09_event(2,'recommendation_impression',1,2,1,'2026-10-22T17:01:10+09','{"visible_ms":1000}');
select pg_temp.db09_event(3,'recommendation_click',1,1,1,'2026-10-22T17:00:05+09','{"target":"detail"}');
select pg_temp.db09_event(4,'recommendation_click',1,1,1,'2026-10-22T17:00:15+09','{"target":"detail"}');
select pg_temp.db09_event(5,'recommendation_click',1,2,1,'2026-10-22T17:01:20+09','{"target":"detail"}');
select pg_temp.db09_event(6,'cart_item_added',1,1,1,'2026-10-22T17:00:25+09','{"source":"recommendation","quantity":1,"quantity_delta":1,"cart_version":1}');
select pg_temp.db09_event(7,'cart_item_removed',1,null,1,'2026-10-22T17:00:30+09','{"source":"manual","quantity":0,"quantity_delta":-1,"cart_version":2}');
select pg_temp.db09_event(8,'cart_item_added',1,1,1,'2026-10-22T17:00:35+09','{"source":"recommendation","quantity":2,"quantity_delta":2,"cart_version":3}');
select pg_temp.db09_event(9,'recommendation_impression',2,3,2,'2026-10-22T17:00:10+09','{"visible_ms":1000}');
select pg_temp.db09_event(10,'recommendation_impression',3,4,2,'2026-10-22T17:00:10+09','{"visible_ms":1000}');
select pg_temp.db09_event(11,'recommendation_impression',4,5,1,'2026-10-22T17:00:10+09','{"visible_ms":1000}','seeded');
select pg_temp.db09_event(12,'recommendation_impression',1,6,2,'2026-10-22T17:00:10+09','{"visible_ms":1000}');
select pg_temp.db09_event(14,'recommendation_click',2,3,2,'2026-10-22T17:00:05+09','{"target":"detail"}');
select pg_temp.db09_event(13,'recommendation_impression',1,8,1,'2026-10-22T17:02:10+09','{"visible_ms":1000}');
insert into public.orders(id,visit_id,user_id,store_id,ordered_at,total,idempotency_key,cart_version,data_origin)
 select pg_temp.db09_id('5',n),v.id,v.user_id,v.store_id,'2026-10-22T17:05:00+09',
 case when n=1 then 400 when n=4 then 100 else 200 end,pg_temp.db09_id('0',n),0,
 case when n=2 then 'seeded' else 'operated' end from generate_series(1,4)n join public.visits v on v.id=pg_temp.db09_id('4',n);
insert into public.order_items(order_id,product_id,product_name,unit_price,quantity) values
 (pg_temp.db09_id('5',1),pg_temp.db09_id('3',1),'商品1',100,2),
 (pg_temp.db09_id('5',1),pg_temp.db09_id('3',2),'商品2',200,1),
 (pg_temp.db09_id('5',2),pg_temp.db09_id('3',2),'商品2',200,1),
 (pg_temp.db09_id('5',3),pg_temp.db09_id('3',2),'商品2',200,1),
 (pg_temp.db09_id('5',4),pg_temp.db09_id('3',1),'商品1',100,1);
update public.visits set status='completed',ended_at='2026-10-22T17:05:00+09';
insert into public.signage_devices(id,store_id,auth_user_id,slug,location) values
 (pg_temp.db09_id('d',1),pg_temp.db09_id('2',1),pg_temp.db09_id('1',31),'db09-d1','入口');
insert into public.signage_plays(id,device_id,ad_placement_id,creative_version_id,mode,reason_code,started_at,ended_at,data_origin)
 select pg_temp.db09_id('0',n),pg_temp.db09_id('d',1),pg_temp.db09_id('c',case when n=5 then 2 else 1 end),
 pg_temp.db09_id('a',case when n=5 then 2 else 1 end),'schedule','schedule',
 case when n=1 then '2026-10-22T17:59:50+09'::timestamptz else '2026-10-22T17:10:00+09'::timestamptz+n*interval '1 minute' end,
 case when n=1 then '2026-10-22T18:00:05+09'::timestamptz else '2026-10-22T17:10:00+09'::timestamptz+n*interval '1 minute'+case when n=3 then interval '2 seconds' else interval '15 seconds' end end,
 case when n=6 then 'seeded' else 'operated' end from unnest(array[1,2,3,5,6,7])n;
insert into public.signage_plays(id,device_id,mode,reason_code,started_at,ended_at,data_origin) values
 (pg_temp.db09_id('0',4),pg_temp.db09_id('d',1),'fallback','fallback','2026-10-22T17:00:00+09','2026-10-22T17:00:15+09','operated');
insert into public.audience_estimates(play_id,method_version,measurement_status,estimated_viewers,estimated_view_seconds,data_origin) values
 (pg_temp.db09_id('0',1),'test-v1','measured',0,0,'operated'),
 (pg_temp.db09_id('0',2),'test-v1','error',null,null,'operated'),
 (pg_temp.db09_id('0',7),'test-v1','measured',5,10,'synthetic');

-- Real API role with a simulated signed identity: callers never get the underlying facts.
select pg_temp.db09_as(11,'store_staff');set local role authenticated;
select pg_temp.db09_assert((select impressions=1 and shown_visits=1 and clicks=1 and recommendation_adds=1
 and recommendation_removes=1 and purchases=1 and purchased_quantity=2 and purchase_amount=200 and small_sample
 from public.kago_app_metrics() where ad_placement_id=pg_temp.db09_id('c',1) and data_origin='operated'),'dedup, remove then purchase, quantities and amounts');
select pg_temp.db09_assert((select count(*)=0 from public.kago_app_metrics() where rule_version=2),'first impression retains original rule version');
select pg_temp.db09_assert((select impressions=2 and shown_visits=1 and purchases=2 and purchase_amount=400
 from public.kago_app_metrics() where placement_type='organic'),'two products count one shown visit');
select pg_temp.db09_assert((select impressions=1 and purchases=0 from public.kago_app_metrics() where data_origin='seeded'),'cross-origin purchase excluded');
select pg_temp.db09_assert((select purchases=0 and clicks=0 from public.kago_app_metrics() where ad_placement_id=pg_temp.db09_id('c',2)),'seeded order not attributed to operated impression');
select pg_temp.db09_assert((select count(*)=0 from public.kago_app_metrics(p_store_id=>pg_temp.db09_id('2',2))),'other store hidden');
select pg_temp.db09_assert((select count(*)=4 and sum(impressions)=4 and sum(purchase_amount)=400 from public.kago_app_metrics('2026-10-22T17:00:10+09','2026-10-22T17:00:11+09')),'inclusive start works');
select pg_temp.db09_assert((select count(*)=0 from public.kago_app_metrics('2026-10-22T17:00:00+09','2026-10-22T17:00:10+09')),'exclusive end and zero rows');
select pg_temp.db09_assert((select count(*)=0 from public.kago_app_metrics('2026-10-22T17:01:00+09','2026-10-22T17:02:00+09')),'repeat in later period not a new impression');
select pg_temp.db09_assert((select plays=3 and play_seconds=45 and measured_plays=1 and error_plays=1
 and synthetic_estimates=1 and synthetic_viewers=5 and synthetic_view_seconds=10 and estimated_viewers=0 and reference_sales_quantity=3
 and hour_start='2026-10-22T17:00:00+09' from public.kago_signage_metrics() where ad_placement_id=pg_temp.db09_id('c',1) and data_origin='operated'),'short/fallback excluded, hour boundary, synthetic excluded and measured zero preserved');
select pg_temp.db09_assert((select not_measured_plays=1 and estimated_viewers is null from public.kago_signage_metrics()
 where ad_placement_id=pg_temp.db09_id('c',2)),'missing camera is NULL, not zero');
select pg_temp.db09_assert((select plays=1 and measured_plays=0 and estimated_viewers is null from public.kago_signage_metrics()
 where data_origin='seeded'),'play origin separated');
select pg_temp.db09_assert((select sum(selected_slots)=7 and bool_and(data_origin='unclassified') from public.kago_selection_counts),'unshown selections remain separate and origin not invented');
select pg_temp.db09_assert((select orders=2 and amount=500 and quantity=4 from public.kago_order_totals('2026-10-22+09','2026-10-23+09',pg_temp.db09_id('2',1)) where data_origin='operated'),'whole-store total is not the sum of placement attribution');
select pg_temp.db09_reject('select * from public.kago_app_cohorts_internal','42501');
select pg_temp.db09_reject($q$select * from public.kago_app_metrics('2026-10-23+09','2026-10-22+09')$q$,'22023');
reset role;
select pg_temp.db09_as(12,'store_staff');set local role authenticated;
select pg_temp.db09_assert((select count(*)=1 and sum(purchases)=1 from public.kago_app_metrics_view),'second store sees only its results');
reset role;
select pg_temp.db09_as(21,'maker_staff');set local role authenticated;
select pg_temp.db09_assert((select count(*)=2 and bool_and(placement_type='sponsored' and ad_placement_id=pg_temp.db09_id('c',1)) from public.kago_app_metrics_view),'maker one sees its own ad only');
select pg_temp.db09_assert((select count(*)=0 from public.kago_selection_counts),'maker cannot read unclassified selection counts');
select pg_temp.db09_assert((select count(*)=0 from public.orders),'maker cannot read order rows');
select pg_temp.db09_reject('select * from public.kago_app_cohorts_internal','42501');
reset role;
-- Public scope is applied at read time, including historical data.
update public.ad_calls set disclosure_scope='{impressions}' where id=pg_temp.db09_id('8',1);
select pg_temp.db09_as(21,'maker_staff');set local role authenticated;
select pg_temp.db09_assert((select bool_and(impressions is not null and clicks is null and recommendation_adds is null and purchases is null and purchase_amount is null) from public.kago_app_metrics_view),'non-public metrics NULL, not zero');
select pg_temp.db09_assert((select bool_and(plays is null and reference_sales_quantity is null) from public.kago_signage_metrics_view),'signage and purchase disclosure both enforced');
reset role;
select pg_temp.db09_as(22,'maker_staff');set local role authenticated;
select pg_temp.db09_assert((select count(*)=2 and bool_and(ad_placement_id in(pg_temp.db09_id('c',2),pg_temp.db09_id('c',3))) from public.kago_app_metrics_view),'second maker sees its ads in both stores, no first maker');
reset role;
select pg_temp.db09_as(1,'customer');set local role authenticated;
select pg_temp.db09_assert((select count(*)=0 from public.kago_app_metrics_view),'customer aggregate denied');
select pg_temp.db09_assert((select count(*)=0 from public.kago_signage_metrics_view),'customer signage aggregate denied');
reset role;
select pg_temp.db09_as(31,'signage');set local role authenticated;
select pg_temp.db09_assert((select count(*)=0 from public.kago_app_metrics_view),'device aggregate denied');
reset role;
set local role anon;
select pg_temp.db09_reject('select * from public.kago_app_metrics_view','42501');
select pg_temp.db09_reject('select * from public.kago_app_metrics()','42501');
reset role;
select pg_temp.db09_assert(not exists(select 1 from information_schema.columns where table_schema='public'
 and table_name in('kago_app_metrics_view','kago_signage_metrics_view','kago_selection_counts') and column_name in('user_id','visit_id','event_id','order_id')),'no individual identifiers in public aggregate views');
select 'DB-09: all assertions passed; rolling back fixtures' as result;
rollback;
