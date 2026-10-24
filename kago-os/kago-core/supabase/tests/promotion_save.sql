-- Disposable Supabase-compatible DB only; run as owner after all migrations through promotion_save.
-- first save -> resend -> new version -> stale screen -> failed saves keep the active version -> stop and save again.
begin;
create function pg_temp.ps_assert(ok boolean, message text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'promotion_save assertion failed: %',message; end if;
end;
$$;
create function pg_temp.ps_reject(statement text, expected_state text, expected_detail text default null)
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
create function pg_temp.ps_as(sub uuid, kago jsonb) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(sub::text, ''), true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', sub, 'role', 'authenticated',
    'app_metadata', jsonb_build_object('kago', kago))::text, true);
end;
$$;
-- (active version, number of versions) of the only promotion for P1 in S1.
create function pg_temp.ps_state() returns text language sql as $$
  select coalesce(max(v.version) filter (where v.status = 'active'), 0)::text || '/' || count(v.id)::text
    || '/' || (select count(*) from public.promotion_versions x where x.status = 'active' and x.promotion_id = s.id)::text
  from public.store_promotions s left join public.promotion_versions v on v.promotion_id = s.id
  where s.store_id = '20000000-0000-4000-8000-000000000001' and s.product_id = '30000000-0000-4000-8000-000000000001'
  group by s.id;
$$;

-- T1 = S1 staff, T2 = S2 staff, W1 = maker staff. P1 is sold in S1 and S2, P2 in S1 only, P3 nowhere.
insert into auth.users(id,email) values
 ('10000000-0000-4000-8000-000000000011','ps-t1@example.test'),
 ('10000000-0000-4000-8000-000000000012','ps-t2@example.test'),
 ('10000000-0000-4000-8000-000000000021','ps-w1@example.test');
insert into public.stores(id,slug,name) values
 ('20000000-0000-4000-8000-000000000001','ps-s1','架空1号店'),
 ('20000000-0000-4000-8000-000000000002','ps-s2','架空2号店');
insert into public.store_members(store_id,user_id) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000011'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000012');
insert into public.products(id,code,name,category) values
 ('30000000-0000-4000-8000-000000000001','2900000000162','架空トマトソース','sauce'),
 ('30000000-0000-4000-8000-000000000002','2900000000179','架空バジルソース','sauce'),
 ('30000000-0000-4000-8000-000000000003','2900000000186','架空ペンネ','pasta');
insert into public.store_products(store_id,product_id,price) values
 ('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',298),
 ('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002',348),
 ('20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001',298);
insert into public.makers(id,slug,display_name) values ('70000000-0000-4000-8000-000000000001','ps-m1','架空メーカー');
insert into public.maker_members(maker_id,user_id) values ('70000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000021');

-- 1. Only S1 staff may save S1 promotions; nothing is created on refusal.
set local role anon;
select pg_temp.ps_reject($q$select * from public.kago_save_promotion('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
  '{app}','[]',1,'拒否','2099-01-01T00:00:00+09','2099-02-01T00:00:00+09')$q$,'42501');
reset role;
select pg_temp.ps_as('10000000-0000-4000-8000-000000000012','{"roles":["store_staff"]}');
set local role authenticated;
select pg_temp.ps_reject($q$select * from public.kago_save_promotion('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
  '{app}','[]',1,'他店','2099-01-01T00:00:00+09','2099-02-01T00:00:00+09')$q$,'42501');
reset role;
select pg_temp.ps_as('10000000-0000-4000-8000-000000000021','{"roles":["maker_staff"]}');
set local role authenticated;
select pg_temp.ps_reject($q$select * from public.kago_save_promotion('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
  '{app}','[]',1,'メーカー','2099-01-01T00:00:00+09','2099-02-01T00:00:00+09')$q$,'42501');
reset role;
select pg_temp.ps_as('10000000-0000-4000-8000-000000000011','{"roles":[]}');
set local role authenticated;
select pg_temp.ps_reject($q$select * from public.kago_save_promotion('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
  '{app}','[]',1,'役割なし','2099-01-01T00:00:00+09','2099-02-01T00:00:00+09')$q$,'42501');
reset role;
select pg_temp.ps_assert((select count(*)=0 from public.store_promotions),'refused saves create nothing');

-- 2. First save creates the promotion and version 1. Resends return it without a new version.
select pg_temp.ps_as('10000000-0000-4000-8000-000000000011','{"roles":["store_staff"]}');
set local role authenticated;
select pg_temp.ps_reject($q$select * from public.kago_save_promotion('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
  '{app}','[]',1,'初回','2099-01-01T00:00:00+09','2099-02-01T00:00:00+09',null,3)$q$,'40001','revision_changed');
create temp table ps_v1 as select * from public.kago_save_promotion('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
  '{app,signage}','[{"weekdays":[1,2,3],"start":"10:00","end":"14:00"}]',2,'  夕方に推す  ','2099-01-01T00:00:00+09','2099-02-01T00:00:00+09',null,0);
select pg_temp.ps_assert((select version=1 and not replayed from ps_v1),'first save is version 1');
reset role;
select pg_temp.ps_assert((select v.id=x.promotion_version_id and v.promotion_id=x.promotion_id and v.status='active' and v.reason_text='夕方に推す'
  and v.channels='{app,signage}' and v.priority=2 from public.promotion_versions v, ps_v1 x),'version 1 stored with trimmed reason');
select pg_temp.ps_as('10000000-0000-4000-8000-000000000011','{"roles":["store_staff"]}');
set local role authenticated;
select pg_temp.ps_assert((select y.promotion_version_id=x.promotion_version_id and y.version=1 and y.replayed
  from ps_v1 x, public.kago_save_promotion('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
  '{signage,app}','[{"start":"10:00","end":"14:00","weekdays":[1,2,3]}]',2,'夕方に推す','2099-01-01T00:00:00+09','2099-02-01T00:00:00+09',null,0) y),
  'resend of the first save (null id, expected 0) replays');
select pg_temp.ps_assert((select y.promotion_version_id=x.promotion_version_id and y.replayed
  from ps_v1 x, public.kago_save_promotion('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
  '{app,signage}','[{"weekdays":[1,2,3],"start":"10:00","end":"14:00"}]',2,'夕方に推す','2099-01-01T00:00:00+09','2099-02-01T00:00:00+09',x.promotion_id,1) y),
  'saving unchanged content replays');
reset role;
select pg_temp.ps_assert(pg_temp.ps_state()='1/1/1','still one version after resends');

-- 3. Changed content becomes version 2; version 1 is kept as inactive.
select pg_temp.ps_as('10000000-0000-4000-8000-000000000011','{"roles":["store_staff"]}');
set local role authenticated;
select pg_temp.ps_assert((select y.version=2 and not y.replayed and y.promotion_id=x.promotion_id
  from ps_v1 x, public.kago_save_promotion('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
  '{app}','[]',3,'終日に変更','2099-01-01T00:00:00+09','2099-03-01T00:00:00+09',x.promotion_id,1) y),'version 2 saved');
-- A second terminal still showing version 1 cannot overwrite it.
select pg_temp.ps_reject($q$select * from public.kago_save_promotion('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
  '{signage}','[]',1,'別端末','2099-01-01T00:00:00+09','2099-02-01T00:00:00+09',null,1)$q$,'40001','revision_changed');
-- A resend of the version 2 save (expected 1, same content) replays.
select pg_temp.ps_assert((select version=2 and replayed from public.kago_save_promotion('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
  '{app}','[]',3,'終日に変更','2099-01-01T00:00:00+09','2099-03-01T00:00:00+09',null,1)),'resend of version 2 replays');
reset role;
select pg_temp.ps_assert(pg_temp.ps_state()='2/2/1','version 2 active, version 1 kept');
select pg_temp.ps_assert((select status='inactive' and reason_text='夕方に推す' from public.promotion_versions where version=1),'version 1 inactive and unchanged');

-- 4. Failed saves leave version 2 active (the old two-statement flow left no active version here).
select pg_temp.ps_as('10000000-0000-4000-8000-000000000011','{"roles":["store_staff"]}');
set local role authenticated;
select pg_temp.ps_reject($q$select * from public.kago_save_promotion('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
  '{app}','[{"weekdays":[1],"start":"14:00","end":"10:00"}]',1,'逆転','2099-01-01T00:00:00+09','2099-02-01T00:00:00+09',null,2)$q$,'23514');
select pg_temp.ps_reject($q$select * from public.kago_save_promotion('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
  '{web}','[]',1,'媒体','2099-01-01T00:00:00+09','2099-02-01T00:00:00+09',null,2)$q$,'23514');
select pg_temp.ps_reject($q$select * from public.kago_save_promotion('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
  '{}','[]',1,'媒体なし','2099-01-01T00:00:00+09','2099-02-01T00:00:00+09',null,2)$q$,'23514');
select pg_temp.ps_reject($q$select * from public.kago_save_promotion('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
  '{app}','[]',-1,'優先度','2099-01-01T00:00:00+09','2099-02-01T00:00:00+09',null,2)$q$,'23514');
select pg_temp.ps_reject($q$select * from public.kago_save_promotion('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
  '{app}','[]',1,'期間','2099-02-01T00:00:00+09','2099-02-01T00:00:00+09',null,2)$q$,'23514');
select pg_temp.ps_reject($q$select * from public.kago_save_promotion('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
  '{app}','[]',1,'   ','2099-01-01T00:00:00+09','2099-02-01T00:00:00+09',null,2)$q$,'22023');
select pg_temp.ps_reject(format($q$select * from public.kago_save_promotion('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
  '{app}','[]',1,%L,'2099-01-01T00:00:00+09','2099-02-01T00:00:00+09',null,2)$q$, repeat('長',201)),'22023');
select pg_temp.ps_reject($q$select * from public.kago_save_promotion('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
  null,'[]',1,'媒体null','2099-01-01T00:00:00+09','2099-02-01T00:00:00+09',null,2)$q$,'22023');
select pg_temp.ps_reject($q$select * from public.kago_save_promotion('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
  '{app}',null,1,'時間帯null','2099-01-01T00:00:00+09','2099-02-01T00:00:00+09',null,2)$q$,'22023');
select pg_temp.ps_reject(format($q$select * from public.kago_save_promotion('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002',
  '{app}','[]',1,'商品違い','2099-01-01T00:00:00+09','2099-02-01T00:00:00+09',%L,2)$q$, (select promotion_id from ps_v1)),'22023');
reset role;
select pg_temp.ps_assert(pg_temp.ps_state()='2/2/1','invalid saves keep version 2 active');

-- S2 staff cannot save into S1's promotion, even naming their own store.
select pg_temp.ps_as('10000000-0000-4000-8000-000000000012','{"roles":["store_staff"]}');
set local role authenticated;
select pg_temp.ps_reject(format($q$select * from public.kago_save_promotion('20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001',
  '{app}','[]',1,'他店の販促','2099-01-01T00:00:00+09','2099-02-01T00:00:00+09',%L,2)$q$, (select promotion_id from ps_v1)),'42501');
reset role;
select pg_temp.ps_assert(pg_temp.ps_state()='2/2/1','other store refused');

-- A product that stopped selling: 23514 (as DB-08), version 2 stays active.
update public.store_products set is_active=false
  where store_id='20000000-0000-4000-8000-000000000001' and product_id='30000000-0000-4000-8000-000000000001';
select pg_temp.ps_as('10000000-0000-4000-8000-000000000011','{"roles":["store_staff"]}');
set local role authenticated;
select pg_temp.ps_reject($q$select * from public.kago_save_promotion('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
  '{app}','[]',1,'販売停止','2099-01-01T00:00:00+09','2099-02-01T00:00:00+09',null,2)$q$,'23514');
-- A product the store never listed: 23514 and no promotion row is left behind.
select pg_temp.ps_reject($q$select * from public.kago_save_promotion('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000003',
  '{app}','[]',1,'未取扱','2099-01-01T00:00:00+09','2099-02-01T00:00:00+09')$q$,'23514');
reset role;
select pg_temp.ps_assert(pg_temp.ps_state()='2/2/1','stopped product keeps version 2 active');
select pg_temp.ps_assert((select count(*)=1 from public.store_promotions),'no promotion created for an unlisted product');
update public.store_products set is_active=true
  where store_id='20000000-0000-4000-8000-000000000001' and product_id='30000000-0000-4000-8000-000000000001';

-- 5. Stop (the existing single UPDATE), then saving the same content again starts version 3.
select pg_temp.ps_as('10000000-0000-4000-8000-000000000011','{"roles":["store_staff"]}');
set local role authenticated;
update public.promotion_versions set status='inactive' where version=2;
select pg_temp.ps_assert((select version=3 and not replayed from public.kago_save_promotion('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
  '{app}','[]',3,'終日に変更','2099-01-01T00:00:00+09','2099-03-01T00:00:00+09',null,2)),'saving after a stop is a new version');
-- Another product in the same store gets its own promotion.
select pg_temp.ps_assert((select version=1 and not replayed from public.kago_save_promotion('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002',
  '{signage}','[]',0,'バジル','2099-01-01T00:00:00+09','2099-02-01T00:00:00+09')),'second product version 1');
reset role;
select pg_temp.ps_assert(pg_temp.ps_state()='3/3/1','version 3 active after stop and save');
select pg_temp.ps_assert((select count(*)=2 from public.store_promotions),'one promotion per product');
select pg_temp.ps_assert((select coalesce(max(n),0)<=1 from (select count(*) n from public.promotion_versions where status='active' group by promotion_id) x),
  'at most one active version per promotion, always');

select 'promotion_save: all assertions passed; rolling back fixtures' as result;
rollback;
