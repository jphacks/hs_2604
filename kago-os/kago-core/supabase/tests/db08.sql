-- Disposable Supabase-compatible DB only; run as owner after all migrations through DB-08.
-- approve -> approve new version -> reject -> suspend, resends, other store / maker, mid-way failure.
begin;
create function pg_temp.db08_assert(ok boolean, message text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'DB-08 assertion failed: %',message; end if;
end;
$$;
create function pg_temp.db08_reject(statement text, expected_state text, expected_detail text default null)
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
create function pg_temp.db08_as(sub uuid, kago jsonb) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(sub::text, ''), true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', sub, 'role', 'authenticated',
    'app_metadata', jsonb_build_object('kago', kago))::text, true);
end;
$$;
-- At most one deliverable version per application, always.
create function pg_temp.db08_one_active() returns boolean language sql as $$
  select coalesce(max(n), 0) <= 1 from (select count(*) n from public.ad_placements where status='active' group by application_id) x;
$$;

-- T1 = S1 staff, T2 = S2 staff, W1 = M1 maker staff. A1: M1 -> S1 call, round 1 = creative v1.
insert into auth.users(id,email) values
 ('10000000-0000-4000-8000-000000000011','db08-t1@example.test'),
 ('10000000-0000-4000-8000-000000000012','db08-t2@example.test'),
 ('10000000-0000-4000-8000-000000000021','db08-w1@example.test');
insert into public.stores(id,slug,name) values
 ('20000000-0000-4000-8000-000000000001','db08-s1','架空1号店'),
 ('20000000-0000-4000-8000-000000000002','db08-s2','架空2号店');
insert into public.store_members(store_id,user_id) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000011'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000012');
insert into public.products(id,code,name,category) values
 ('30000000-0000-4000-8000-000000000001','2900000000162','架空トマトソース','sauce');
insert into public.store_products(store_id,product_id,price) values
 ('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',298);
insert into public.makers(id,slug,display_name) values ('70000000-0000-4000-8000-000000000001','db08-m1','架空メーカー');
insert into public.maker_members(maker_id,user_id) values ('70000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000021');
insert into public.ad_calls(id,store_id,title,categories,channels,starts_at,ends_at,status) values
 ('80000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','常設募集','{sauce}','{app,signage}',
  '2099-01-01T00:00:00+09','2099-12-01T00:00:00+09','open');
insert into public.creatives(id,maker_id,product_id) values
 ('90000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001');
insert into public.creative_versions(id,creative_id,version,image_path,headline) values
 ('a0000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001',1,'ad-assets/CR1/v1.png','第1版'),
 ('a0000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000001',2,'ad-assets/CR1/v2.png','第2版'),
 ('a0000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-000000000001',3,'ad-assets/CR1/v3.png','第3版');
insert into public.ad_applications(id,ad_call_id,store_id,maker_id,creative_id,creative_version_id,channels,requested_period) values
 ('b0000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001',
  '{app,signage}','[2099-01-01T00:00:00+09,2099-06-01T00:00:00+09)');

-- 1. Only S1 staff may review.
set local role anon;
select pg_temp.db08_reject($q$select * from public.kago_approve_application('b0000000-0000-4000-8000-000000000001',1)$q$,'42501');
reset role;
select pg_temp.db08_as('10000000-0000-4000-8000-000000000012','{"roles":["store_staff"]}');
set local role authenticated;
select pg_temp.db08_reject($q$select * from public.kago_approve_application('b0000000-0000-4000-8000-000000000001',1)$q$,'42501');
select pg_temp.db08_reject($q$select * from public.kago_reject_application('b0000000-0000-4000-8000-000000000001',1,'他店')$q$,'42501');
reset role;
select pg_temp.db08_as('10000000-0000-4000-8000-000000000021','{"roles":["maker_staff"]}');
set local role authenticated;
select pg_temp.db08_reject($q$select * from public.kago_approve_application('b0000000-0000-4000-8000-000000000001',1)$q$,'42501');
reset role;
select pg_temp.db08_as('10000000-0000-4000-8000-000000000011','{"roles":[]}');
set local role authenticated;
select pg_temp.db08_reject($q$select * from public.kago_approve_application('b0000000-0000-4000-8000-000000000001',1)$q$,'42501');
reset role;

-- 2. T1 approves round 1 for App only. Invalid requests leave the application untouched.
select pg_temp.db08_as('10000000-0000-4000-8000-000000000011','{"roles":["store_staff"]}');
set local role authenticated;
select pg_temp.db08_reject($q$select * from public.kago_approve_application('b0000000-0000-4000-8000-000000000001',2)$q$,'40001','revision_changed');
select pg_temp.db08_reject($q$select * from public.kago_approve_application('b0000000-0000-4000-8000-000000000001',null)$q$,'22023');
select pg_temp.db08_reject($q$select * from public.kago_approve_application('b0000000-0000-4000-8000-000000000001',1,'2099-01-01T00:00:00+09','2099-07-01T00:00:00+09')$q$,'23514');
select pg_temp.db08_reject($q$select * from public.kago_approve_application('b0000000-0000-4000-8000-000000000001',1,null,null,'{web}')$q$,'23514');
select pg_temp.db08_assert((select status='submitted' and reviewed_by is null from public.ad_applications),'failed approvals change nothing');
select pg_temp.db08_assert((select count(*)=0 from public.ad_placements) and (select count(*)=0 from public.ad_operation_logs),'no placement or log yet');
create temp table db08_pl1 as select * from public.kago_approve_application('b0000000-0000-4000-8000-000000000001',1,null,null,'{app}');
select pg_temp.db08_assert((select revision=1 and not replayed from db08_pl1),'round 1 approved');
select pg_temp.db08_assert((select p.id=x.placement_id and p.status='active' and p.channels='{app}' and p.creative_version_id='a0000000-0000-4000-8000-000000000001'
  and p.starts_at='2099-01-01T00:00:00+09' and p.ends_at='2099-06-01T00:00:00+09' and p.approved_by='10000000-0000-4000-8000-000000000011'
  from public.ad_placements p, db08_pl1 x),'placement pins v1, App only, requested period');
select pg_temp.db08_assert((select x.placement_id=y.placement_id and y.replayed
  from db08_pl1 x, public.kago_approve_application('b0000000-0000-4000-8000-000000000001',1,null,null,'{app}') y),'approval resend returns same placement');
select pg_temp.db08_reject($q$select * from public.kago_approve_application('b0000000-0000-4000-8000-000000000001',1,null,null,'{app,signage}')$q$,'23505');
select pg_temp.db08_reject($q$select * from public.kago_reject_application('b0000000-0000-4000-8000-000000000001',1,'承認後の却下')$q$,'23505');
select pg_temp.db08_assert((select count(*)=1 and min(action)='approve' from public.ad_operation_logs),'one approve log');
select pg_temp.db08_reject($q$update public.ad_placements set status='suspended'$q$,'42501');
select pg_temp.db08_reject($q$insert into public.ad_operation_logs(store_id,application_id,revision,action,actor,reason) values('20000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001',1,'reject','10000000-0000-4000-8000-000000000011','x')$q$,'42501');
reset role;
select pg_temp.db08_assert(pg_temp.db08_one_active(),'one active after round 1');

-- 3. W1 resubmits v2 (round 2); T1 approves it: round 1 is superseded in the same step.
select pg_temp.db08_as('10000000-0000-4000-8000-000000000021','{"roles":["maker_staff"]}');
set local role authenticated;
update public.ad_applications set status='submitted',revision=2,creative_version_id='a0000000-0000-4000-8000-000000000002',
  review_comment=null,reviewed_by=null,reviewed_at=null where id='b0000000-0000-4000-8000-000000000001';
reset role;
select pg_temp.db08_assert((select count(*)=1 and bool_and(revision=1) from public.ad_placements where status='active'),'round 1 keeps running during review');
select pg_temp.db08_as('10000000-0000-4000-8000-000000000011','{"roles":["store_staff"]}');
set local role authenticated;
select pg_temp.db08_reject($q$select * from public.kago_approve_application('b0000000-0000-4000-8000-000000000001',1)$q$,'40001','revision_changed');
select pg_temp.db08_assert((select revision=2 and not replayed from public.kago_approve_application('b0000000-0000-4000-8000-000000000001',2)),'round 2 approved');
reset role;
select pg_temp.db08_assert((select count(*)=1 and bool_and(revision=2 and creative_version_id='a0000000-0000-4000-8000-000000000002' and channels='{app,signage}')
  from public.ad_placements where status='active'),'v2 is the only active version');
select pg_temp.db08_assert((select status='superseded' and creative_version_id='a0000000-0000-4000-8000-000000000001' from public.ad_placements where revision=1),'v1 superseded, kept');
select pg_temp.db08_assert((select string_agg(action||':'||revision, ',' order by created_at, action desc)='approve:1,supersede:1,approve:2' from public.ad_operation_logs),'log: approve, supersede, approve');

-- 4. Round 3 (v3): a failure after the supersede step rolls the whole approval back.
select pg_temp.db08_as('10000000-0000-4000-8000-000000000021','{"roles":["maker_staff"]}');
set local role authenticated;
update public.ad_applications set status='submitted',revision=3,creative_version_id='a0000000-0000-4000-8000-000000000003',
  review_comment=null,reviewed_by=null,reviewed_at=null where id='b0000000-0000-4000-8000-000000000001';
reset role;
create function public.db08_fail_on_approve_log() returns trigger language plpgsql as $$
begin
  if new.action = 'approve' then raise exception 'simulated failure' using errcode = 'XX000'; end if;
  return new;
end;
$$;
create trigger db08_fail before insert on public.ad_operation_logs for each row execute function public.db08_fail_on_approve_log();
select pg_temp.db08_as('10000000-0000-4000-8000-000000000011','{"roles":["store_staff"]}');
set local role authenticated;
select pg_temp.db08_reject($q$select * from public.kago_approve_application('b0000000-0000-4000-8000-000000000001',3)$q$,'XX000');
reset role;
drop trigger db08_fail on public.ad_operation_logs;
drop function public.db08_fail_on_approve_log();
select pg_temp.db08_assert((select status='submitted' and revision=3 and reviewed_by is null from public.ad_applications)
  and (select status='submitted' from public.application_revisions where revision=3)
  and (select count(*)=1 and bool_and(revision=2) from public.ad_placements where status='active')
  and (select count(*)=2 from public.ad_placements) and (select count(*)=3 from public.ad_operation_logs),'mid-way failure leaves application, placements and log unchanged');

-- 5. T1 rejects round 3; round 2 keeps running.
select pg_temp.db08_as('10000000-0000-4000-8000-000000000011','{"roles":["store_staff"]}');
set local role authenticated;
select pg_temp.db08_reject($q$select * from public.kago_reject_application('b0000000-0000-4000-8000-000000000001',3,'  ')$q$,'22023');
select pg_temp.db08_reject($q$select * from public.kago_reject_application('b0000000-0000-4000-8000-000000000001',3,repeat('長',201))$q$,'22023');
select pg_temp.db08_assert((select not replayed from public.kago_reject_application('b0000000-0000-4000-8000-000000000001',3,'商品名を大きくしてください')),'round 3 rejected');
select pg_temp.db08_assert((select replayed from public.kago_reject_application('b0000000-0000-4000-8000-000000000001',3,'商品名を大きくしてください')),'reject resend');
select pg_temp.db08_reject($q$select * from public.kago_reject_application('b0000000-0000-4000-8000-000000000001',3,'別の理由')$q$,'23505');
select pg_temp.db08_reject($q$select * from public.kago_approve_application('b0000000-0000-4000-8000-000000000001',3)$q$,'23505');
reset role;
select pg_temp.db08_assert((select count(*)=1 and bool_and(revision=2) from public.ad_placements where status='active'),'approved round 2 still delivers');
select pg_temp.db08_assert((select status='rejected' and review_comment='商品名を大きくしてください' and reviewed_by='10000000-0000-4000-8000-000000000011'
  from public.application_revisions where revision=3),'rejection in revision history');

-- 6. Suspend round 2.
create temp table db08_ids as select id, revision from public.ad_placements;
grant select on db08_ids to public;
select pg_temp.db08_as('10000000-0000-4000-8000-000000000012','{"roles":["store_staff"]}');
set local role authenticated;
select pg_temp.db08_reject(format($q$select * from public.kago_suspend_placement(%L,'他店')$q$,(select id from db08_ids where revision=2)),'42501');
select pg_temp.db08_assert((select count(*)=0 from public.ad_operation_logs),'other store sees no log');
reset role;
select pg_temp.db08_as('10000000-0000-4000-8000-000000000011','{"roles":["store_staff"]}');
set local role authenticated;
select pg_temp.db08_reject(format($q$select * from public.kago_suspend_placement(%L,'')$q$,(select id from db08_ids where revision=2)),'22023');
select pg_temp.db08_reject(format($q$select * from public.kago_suspend_placement(%L,'停止')$q$,(select id from db08_ids where revision=1)),'23514');
select pg_temp.db08_assert((select not replayed from public.kago_suspend_placement((select id from db08_ids where revision=2),'在庫切れのため')),'round 2 suspended');
select pg_temp.db08_assert((select replayed from public.kago_suspend_placement((select id from db08_ids where revision=2),'在庫切れのため')),'suspend resend');
select pg_temp.db08_reject(format($q$select * from public.kago_suspend_placement(%L,'別の理由')$q$,(select id from db08_ids where revision=2)),'23505');
select pg_temp.db08_assert((select count(*)=5 from public.ad_operation_logs),'own store reads the log');
reset role;
select pg_temp.db08_as('10000000-0000-4000-8000-000000000021','{"roles":["maker_staff"]}');
set local role authenticated;
select pg_temp.db08_reject(format($q$select * from public.kago_suspend_placement(%L,'メーカー')$q$,(select id from db08_ids where revision=2)),'42501');
select pg_temp.db08_assert((select count(*)=5 from public.ad_operation_logs),'maker reads own application log');
reset role;
select pg_temp.db08_assert((select count(*)=0 from public.ad_placements where status='active') and pg_temp.db08_one_active(),'nothing active after suspension');
select pg_temp.db08_assert((select status='suspended' and suspend_reason='在庫切れのため' and suspended_by='10000000-0000-4000-8000-000000000011' and suspended_at is not null
  from public.ad_placements where revision=2),'suspension recorded on placement');
select pg_temp.db08_assert((select string_agg(action||':'||revision, ',' order by created_at, action desc)='approve:1,supersede:1,approve:2,reject:3,suspend:2'
  from public.ad_operation_logs),'full operation history');
select pg_temp.db08_reject($q$update public.ad_operation_logs set reason='改ざん'$q$,'23514');
select pg_temp.db08_reject($q$delete from public.ad_operation_logs$q$,'23514');
select 'DB-08: all assertions passed; rolling back fixtures' as result;
rollback;
