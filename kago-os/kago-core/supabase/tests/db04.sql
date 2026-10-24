-- Disposable Supabase-compatible DB only; run as owner after DB-02 and DB-04.
-- Replays call -> apply -> reject -> fix -> resubmit -> approve -> swap version -> suspend, then rolls back.
begin;
create function pg_temp.db04_assert(ok boolean, message text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'DB-04 assertion failed: %',message; end if;
end;
$$;
create function pg_temp.db04_reject(statement text, expected_state text) returns void language plpgsql as $$
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

-- T1/T2 = staff of S1/S2, W1 = maker staff of M1. P-SAUCE is sold in both stores, P-OTHER only in S2.
insert into auth.users(id,email) values
 ('10000000-0000-4000-8000-000000000001','db04-t1@example.test'),
 ('10000000-0000-4000-8000-000000000002','db04-t2@example.test'),
 ('10000000-0000-4000-8000-000000000003','db04-w1@example.test');
insert into public.stores(id,slug,name) values
 ('20000000-0000-4000-8000-000000000001','db04-s1','架空1号店'),
 ('20000000-0000-4000-8000-000000000002','db04-s2','架空2号店');
insert into public.store_members(store_id,user_id) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002');
insert into public.products(id,code,name,category) values
 ('30000000-0000-4000-8000-000000000001','2900000000162','架空トマトパスタソース','sauce'),
 ('30000000-0000-4000-8000-000000000002','2900000000999','2号店のみの商品','sauce');
insert into public.store_products(store_id,product_id,price) values
 ('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',298),
 ('20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001',298),
 ('20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002',98);
insert into public.makers(id,slug,display_name) values
 ('70000000-0000-4000-8000-000000000001','db04-m1','架空メーカー1'),
 ('70000000-0000-4000-8000-000000000002','db04-m2','架空メーカー2');
insert into public.maker_members(maker_id,user_id) values
 ('70000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003');

-- 1. Recruit: S1 drafts C1 and publishes it. C2 stays draft, C3 recruits App only.
insert into public.ad_calls(id,store_id,title,description,categories,channels,starts_at,ends_at,disclosure_scope) values
 ('80000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','11月ソース募集','売り場の案内',
  '{sauce}','{app,signage}','2099-11-01T00:00:00+09','2099-12-01T00:00:00+09','{impressions,purchases}'),
 ('80000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','下書き募集',null,
  '{sauce}','{app}','2099-11-01T00:00:00+09','2099-12-01T00:00:00+09','{}'),
 ('80000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','App限定募集',null,
  '{sauce}','{app}','2099-11-01T00:00:00+09','2099-12-01T00:00:00+09','{}');
select pg_temp.db04_assert((select status='draft' from public.ad_calls where id='80000000-0000-4000-8000-000000000001'),'calls start as draft');
update public.ad_calls set status='open',title='11月ソース募集（公開）',disclosure_scope='{impressions,clicks,purchases}'
 where id in ('80000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000003');

-- 2. M1 registers creative CR1 v1 and applies A1 to C1.
insert into public.creatives(id,maker_id,product_id) values
 ('90000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001'),
 ('90000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001'),
 ('90000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002');
insert into public.creative_versions(id,creative_id,version,image_path,headline) values
 ('a0000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001',1,'ad-assets/CR1/v1.png','第1版'),
 ('a0000000-0000-4000-8000-000000000009','90000000-0000-4000-8000-000000000002',1,'ad-assets/CR2/v1.png','他社の版'),
 ('a0000000-0000-4000-8000-000000000008','90000000-0000-4000-8000-000000000003',1,'ad-assets/CR3/v1.png','2号店のみ');
insert into public.ad_applications(id,ad_call_id,store_id,maker_id,creative_id,creative_version_id,channels,requested_period,message) values
 ('b0000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001',
  '{app,signage}','[2099-11-01T00:00:00+09,2099-11-16T00:00:00+09)','初回申請');
select pg_temp.db04_reject($q$update public.ad_applications set channels='{app}' where id='b0000000-0000-4000-8000-000000000001'$q$,'23514');
select pg_temp.db04_reject($q$update public.ad_applications set status='rejected',review_comment='他店担当',reviewed_by='10000000-0000-4000-8000-000000000002' where id='b0000000-0000-4000-8000-000000000001'$q$,'42501');
select pg_temp.db04_reject($q$update public.ad_applications set status='rejected',reviewed_by='10000000-0000-4000-8000-000000000001' where id='b0000000-0000-4000-8000-000000000001'$q$,'23514');
select pg_temp.db04_reject($q$update public.ad_applications set status='rejected',review_comment=repeat('長',201),reviewed_by='10000000-0000-4000-8000-000000000001' where id='b0000000-0000-4000-8000-000000000001'$q$,'23514');

-- 3. T1 rejects round 1.
update public.ad_applications set status='rejected',review_comment='商品名を大きくしてください',
 reviewed_by='10000000-0000-4000-8000-000000000001',reviewed_at='2019-01-01T00:00:00Z'
 where id='b0000000-0000-4000-8000-000000000001';
select pg_temp.db04_reject($q$insert into public.ad_placements(application_id,revision,store_id,creative_version_id,channels,starts_at,ends_at,approved_by) values('b0000000-0000-4000-8000-000000000001',1,'20000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','{app}','2099-11-01T00:00:00+09','2099-11-02T00:00:00+09','10000000-0000-4000-8000-000000000001')$q$,'23514');

-- 4. M1 fixes the creative (v2) and resubmits the same application as round 2.
insert into public.creative_versions(id,creative_id,version,image_path,headline,note) values
 ('a0000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000001',2,'ad-assets/CR1/v2.png','第2版','商品名を拡大');
select pg_temp.db04_reject($q$update public.ad_applications set status='submitted',revision=3,creative_version_id='a0000000-0000-4000-8000-000000000002',review_comment=null,reviewed_by=null,reviewed_at=null where id='b0000000-0000-4000-8000-000000000001'$q$,'23514');
update public.ad_applications set status='submitted',revision=2,creative_version_id='a0000000-0000-4000-8000-000000000002',
 message='商品名を拡大しました',review_comment=null,reviewed_by=null,reviewed_at=null
 where id='b0000000-0000-4000-8000-000000000001';

-- 5. T1 approves round 2; DB-08 will do this update and the placement insert in one transaction.
update public.ad_applications set status='approved',reviewed_by='10000000-0000-4000-8000-000000000001'
 where id='b0000000-0000-4000-8000-000000000001';
select pg_temp.db04_reject($q$insert into public.ad_placements(application_id,revision,store_id,creative_version_id,channels,starts_at,ends_at,approved_by) values('b0000000-0000-4000-8000-000000000001',2,'20000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','{app}','2099-11-01T00:00:00+09','2099-11-16T00:00:00+09','10000000-0000-4000-8000-000000000001')$q$,'23514');
select pg_temp.db04_reject($q$insert into public.ad_placements(application_id,revision,store_id,creative_version_id,channels,starts_at,ends_at,approved_by) values('b0000000-0000-4000-8000-000000000001',2,'20000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000002','{app}','2099-11-01T00:00:00+09','2099-11-17T00:00:00+09','10000000-0000-4000-8000-000000000001')$q$,'23514');
select pg_temp.db04_reject($q$insert into public.ad_placements(application_id,revision,store_id,creative_version_id,channels,starts_at,ends_at,approved_by) values('b0000000-0000-4000-8000-000000000001',2,'20000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000002','{app}','2099-11-01T00:00:00+09','2099-11-16T00:00:00+09','10000000-0000-4000-8000-000000000002')$q$,'23514');
select pg_temp.db04_reject($q$insert into public.ad_placements(application_id,revision,store_id,creative_version_id,channels,starts_at,ends_at,approved_by) values('b0000000-0000-4000-8000-000000000001',2,'20000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000002','{app}','2099-11-01T00:00:00+09','2099-11-16T00:00:00+09','10000000-0000-4000-8000-000000000001')$q$,'23503');
insert into public.ad_placements(id,application_id,revision,store_id,creative_version_id,channels,starts_at,ends_at,approved_by) values
 ('c0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001',2,'20000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000002','{app}','2099-11-01T00:00:00+09','2099-11-16T00:00:00+09','10000000-0000-4000-8000-000000000001');
select pg_temp.db04_assert((select p.approved_at=r.reviewed_at from public.ad_placements p join public.application_revisions r
 on r.application_id=p.application_id and r.revision=p.revision where p.id='c0000000-0000-4000-8000-000000000001'),'placement pins review time');
select pg_temp.db04_reject($q$update public.ad_placements set status='expired' where id='c0000000-0000-4000-8000-000000000001'$q$,'23514');
select pg_temp.db04_reject($q$update public.ad_placements set status='superseded' where id='c0000000-0000-4000-8000-000000000001'$q$,'23514');

-- 6. Approved creative swap: v3 is resubmitted (round 3). PL1 stays active until v3 is approved.
insert into public.creative_versions(id,creative_id,version,image_path,headline) values
 ('a0000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-000000000001',3,'ad-assets/CR1/v3.png','第3版');
update public.ad_applications set status='submitted',revision=3,creative_version_id='a0000000-0000-4000-8000-000000000003',
 channels='{app,signage}',message=null,reviewed_by=null,reviewed_at=null where id='b0000000-0000-4000-8000-000000000001';
select pg_temp.db04_assert((select status='active' and creative_version_id='a0000000-0000-4000-8000-000000000002' from public.ad_placements where id='c0000000-0000-4000-8000-000000000001'),'old placement stays active during re-review');
select pg_temp.db04_reject($q$update public.ad_placements set status='superseded' where id='c0000000-0000-4000-8000-000000000001'$q$,'23514');
update public.ad_applications set status='approved',reviewed_by='10000000-0000-4000-8000-000000000001'
 where id='b0000000-0000-4000-8000-000000000001';
select pg_temp.db04_reject($q$insert into public.ad_placements(application_id,revision,store_id,creative_version_id,channels,starts_at,ends_at,approved_by) values('b0000000-0000-4000-8000-000000000001',3,'20000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000003','{app,signage}','2099-11-01T00:00:00+09','2099-11-16T00:00:00+09','10000000-0000-4000-8000-000000000001')$q$,'23505');
update public.ad_placements set status='superseded' where id='c0000000-0000-4000-8000-000000000001';
insert into public.ad_placements(id,application_id,revision,store_id,creative_version_id,channels,starts_at,ends_at,approved_by) values
 ('c0000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000001',3,'20000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000003','{app,signage}','2099-11-01T00:00:00+09','2099-11-16T00:00:00+09','10000000-0000-4000-8000-000000000001');

-- 7. T1 suspends PL2.
select pg_temp.db04_reject($q$update public.ad_placements set status='suspended',suspended_by='10000000-0000-4000-8000-000000000001' where id='c0000000-0000-4000-8000-000000000002'$q$,'23514');
select pg_temp.db04_reject($q$update public.ad_placements set status='suspended',suspend_reason='他店',suspended_by='10000000-0000-4000-8000-000000000002' where id='c0000000-0000-4000-8000-000000000002'$q$,'42501');
update public.ad_placements set status='suspended',suspend_reason='在庫切れのため',suspended_by='10000000-0000-4000-8000-000000000001'
 where id='c0000000-0000-4000-8000-000000000002';
-- A suspended round cannot be placed again, and an older round cannot be placed after a newer approval.
select pg_temp.db04_reject($q$insert into public.ad_placements(application_id,revision,store_id,creative_version_id,channels,starts_at,ends_at,approved_by) values('b0000000-0000-4000-8000-000000000001',3,'20000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000003','{app}','2099-11-01T00:00:00+09','2099-11-16T00:00:00+09','10000000-0000-4000-8000-000000000001')$q$,'23505');
select pg_temp.db04_reject($q$insert into public.ad_placements(application_id,revision,store_id,creative_version_id,channels,starts_at,ends_at,approved_by) values('b0000000-0000-4000-8000-000000000001',2,'20000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000002','{app}','2099-11-01T00:00:00+09','2099-11-16T00:00:00+09','10000000-0000-4000-8000-000000000001')$q$,'23514');

select pg_temp.db04_assert((select count(*)=3 from public.application_revisions where application_id='b0000000-0000-4000-8000-000000000001'),'three submission rounds kept');
select pg_temp.db04_assert((select status='rejected' and review_comment='商品名を大きくしてください' and reviewed_by='10000000-0000-4000-8000-000000000001'
 and reviewed_at>='2020-01-01' and reviewed_at>=submitted_at
 and creative_version_id='a0000000-0000-4000-8000-000000000001' and message='初回申請' and channels='{app,signage}'
 from public.application_revisions where application_id='b0000000-0000-4000-8000-000000000001' and revision=1),'round 1 rejected with reason and reviewer');
select pg_temp.db04_assert((select status='approved' and review_comment is null and reviewed_at>=submitted_at
 and creative_version_id='a0000000-0000-4000-8000-000000000002' and message='商品名を拡大しました'
 from public.application_revisions where application_id='b0000000-0000-4000-8000-000000000001' and revision=2),'round 2 approved');
select pg_temp.db04_assert((select status='approved' and creative_version_id='a0000000-0000-4000-8000-000000000003'
 from public.application_revisions where application_id='b0000000-0000-4000-8000-000000000001' and revision=3),'round 3 approved');
select pg_temp.db04_assert((select status='approved' and revision=3 and creative_version_id='a0000000-0000-4000-8000-000000000003' and review_comment is null
 from public.ad_applications where id='b0000000-0000-4000-8000-000000000001'),'application mirrors latest round');
select pg_temp.db04_assert((select status='superseded' and creative_version_id='a0000000-0000-4000-8000-000000000002' and channels='{app}'
 from public.ad_placements where id='c0000000-0000-4000-8000-000000000001'),'superseded placement keeps approved v2');
select pg_temp.db04_assert((select status='suspended' and suspend_reason='在庫切れのため' and approved_by='10000000-0000-4000-8000-000000000001'
 and suspended_by='10000000-0000-4000-8000-000000000001' and suspended_at>=approved_at
 from public.ad_placements where id='c0000000-0000-4000-8000-000000000002'),'suspended placement keeps approver');
select pg_temp.db04_assert((select count(*)=3 and max(version)=3 from public.creative_versions where creative_id='90000000-0000-4000-8000-000000000001'),'creative versions append-only');

-- Placement transitions after the fact.
select pg_temp.db04_reject($q$update public.ad_placements set status='active',suspend_reason=null where id='c0000000-0000-4000-8000-000000000002'$q$,'23514');
select pg_temp.db04_reject($q$update public.ad_placements set status='active' where id='c0000000-0000-4000-8000-000000000001'$q$,'23514');
select pg_temp.db04_reject($q$update public.ad_placements set suspend_reason='理由変更' where id='c0000000-0000-4000-8000-000000000002'$q$,'23514');
select pg_temp.db04_reject($q$update public.ad_placements set channels='{signage}' where id='c0000000-0000-4000-8000-000000000001'$q$,'23514');
select pg_temp.db04_reject($q$delete from public.ad_placements$q$,'23514');

-- Review history cannot be edited directly.
select pg_temp.db04_reject($q$update public.application_revisions set review_comment='改ざん' where revision=1$q$,'23514');
select pg_temp.db04_reject($q$delete from public.application_revisions$q$,'23514');
select pg_temp.db04_reject($q$insert into public.application_revisions values('b0000000-0000-4000-8000-000000000001',9,'a0000000-0000-4000-8000-000000000001','{app}','[2099-11-01,2099-11-02)',null,now(),'submitted',null,null,null)$q$,'23514');
select pg_temp.db04_reject($q$delete from public.ad_applications$q$,'23514');
select pg_temp.db04_reject($q$update public.ad_applications set status='rejected',review_comment='直接却下' where id='b0000000-0000-4000-8000-000000000001'$q$,'23514');
select pg_temp.db04_reject($q$update public.ad_applications set ad_call_id='80000000-0000-4000-8000-000000000003' where id='b0000000-0000-4000-8000-000000000001'$q$,'23514');

-- Application terms: call state, channels, period, ownership, listing, duplicates.
select pg_temp.db04_reject($q$insert into public.ad_applications(ad_call_id,store_id,maker_id,creative_id,creative_version_id,channels,requested_period) values('80000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','{app}','[2099-11-01T00:00:00+09,2099-11-02T00:00:00+09)')$q$,'23505');
select pg_temp.db04_reject($q$insert into public.ad_applications(ad_call_id,store_id,maker_id,creative_id,creative_version_id,channels,requested_period) values('80000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','{app}','[2099-11-01T00:00:00+09,2099-11-02T00:00:00+09)')$q$,'23514');
select pg_temp.db04_reject($q$insert into public.ad_applications(ad_call_id,store_id,maker_id,creative_id,creative_version_id,channels,requested_period) values('80000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','{signage}','[2099-11-01T00:00:00+09,2099-11-02T00:00:00+09)')$q$,'23514');
select pg_temp.db04_reject($q$insert into public.ad_applications(ad_call_id,store_id,maker_id,creative_id,creative_version_id,channels,requested_period) values('80000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','{app}','[2099-11-20T00:00:00+09,2099-12-01T00:00:01+09)')$q$,'23514');
select pg_temp.db04_reject($q$insert into public.ad_applications(ad_call_id,store_id,maker_id,creative_id,creative_version_id,channels,requested_period) values('80000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000009','{app}','[2099-11-01T00:00:00+09,2099-11-02T00:00:00+09)')$q$,'23503');
select pg_temp.db04_reject($q$insert into public.ad_applications(ad_call_id,store_id,maker_id,creative_id,creative_version_id,channels,requested_period) values('80000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000009','{app}','[2099-11-01T00:00:00+09,2099-11-02T00:00:00+09)')$q$,'23503');
select pg_temp.db04_reject($q$insert into public.ad_applications(ad_call_id,store_id,maker_id,creative_id,creative_version_id,channels,requested_period) values('80000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','{app}','[2099-11-01T00:00:00+09,2099-11-02T00:00:00+09)')$q$,'23503');
select pg_temp.db04_reject($q$insert into public.ad_applications(ad_call_id,store_id,maker_id,creative_id,creative_version_id,channels,requested_period) values('80000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000008','{app}','[2099-11-01T00:00:00+09,2099-11-02T00:00:00+09)')$q$,'23503');
select pg_temp.db04_reject($q$insert into public.ad_applications(ad_call_id,store_id,maker_id,creative_id,creative_version_id,channels,requested_period,status) values('80000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','{app}','[2099-11-01T00:00:00+09,2099-11-02T00:00:00+09)','approved')$q$,'23514');
select pg_temp.db04_reject($q$insert into public.ad_applications(ad_call_id,store_id,maker_id,creative_id,creative_version_id,channels,requested_period) values('80000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','{app}','(,2099-11-02T00:00:00+09)')$q$,'23514');
select pg_temp.db04_reject($q$insert into public.ad_applications(ad_call_id,store_id,maker_id,creative_id,creative_version_id,channels,requested_period) values('80000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','{app}','[2099-11-01T00:00:00+09,2099-11-02T00:00:00+09]')$q$,'23514');
insert into public.ad_calls(id,store_id,title,categories,channels,starts_at,ends_at,status) values
 ('80000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000001','終了済み期間','{sauce}','{app}','2020-01-01T00:00:00+09','2020-02-01T00:00:00+09','open');
select pg_temp.db04_reject($q$insert into public.ad_applications(ad_call_id,store_id,maker_id,creative_id,creative_version_id,channels,requested_period) values('80000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','{app}','[2020-01-01T00:00:00+09,2020-01-02T00:00:00+09)')$q$,'23514');
update public.store_products set is_active=false where store_id='20000000-0000-4000-8000-000000000001';
select pg_temp.db04_reject($q$insert into public.ad_applications(ad_call_id,store_id,maker_id,creative_id,creative_version_id,channels,requested_period) values('80000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','{app}','[2099-11-01T00:00:00+09,2099-11-02T00:00:00+09)')$q$,'23503');
update public.store_products set is_active=true where store_id='20000000-0000-4000-8000-000000000001';

-- Calls: channel sets, period, scope, lifecycle; closing keeps approved placements.
select pg_temp.db04_reject($q$insert into public.ad_calls(store_id,title,categories,channels,starts_at,ends_at) values('20000000-0000-4000-8000-000000000001','x','{sauce}','{}','2099-11-01','2099-11-02')$q$,'23514');
select pg_temp.db04_reject($q$insert into public.ad_calls(store_id,title,categories,channels,starts_at,ends_at) values('20000000-0000-4000-8000-000000000001','x','{sauce}','{app,app}','2099-11-01','2099-11-02')$q$,'23514');
select pg_temp.db04_reject($q$insert into public.ad_calls(store_id,title,categories,channels,starts_at,ends_at) values('20000000-0000-4000-8000-000000000001','x','{sauce}','{web}','2099-11-01','2099-11-02')$q$,'23514');
select pg_temp.db04_reject($q$insert into public.ad_calls(store_id,title,categories,channels,starts_at,ends_at) values('20000000-0000-4000-8000-000000000001','x','{}','{app}','2099-11-01','2099-11-02')$q$,'23514');
select pg_temp.db04_reject($q$insert into public.ad_calls(store_id,title,categories,channels,starts_at,ends_at) values('20000000-0000-4000-8000-000000000001','x','{sauce}','{app}','2099-11-02','2099-11-02')$q$,'23514');
select pg_temp.db04_reject($q$insert into public.ad_calls(store_id,title,categories,channels,starts_at,ends_at,disclosure_scope) values('20000000-0000-4000-8000-000000000001','x','{sauce}','{app}','2099-11-01','2099-11-02','{orders}')$q$,'23514');
select pg_temp.db04_reject($q$update public.ad_calls set status='draft' where id='80000000-0000-4000-8000-000000000001'$q$,'23514');
select pg_temp.db04_reject($q$update public.ad_calls set ends_at='2099-12-02T00:00:00+09' where id='80000000-0000-4000-8000-000000000001'$q$,'23514');
select pg_temp.db04_reject($q$update public.ad_calls set store_id='20000000-0000-4000-8000-000000000002' where id='80000000-0000-4000-8000-000000000002'$q$,'23514');
select pg_temp.db04_reject($q$delete from public.ad_calls where id='80000000-0000-4000-8000-000000000001'$q$,'23514');
update public.ad_calls set ends_at='2099-12-02T00:00:00+09',channels='{app,signage}' where id='80000000-0000-4000-8000-000000000002';
update public.ad_calls set status='closed' where id='80000000-0000-4000-8000-000000000001';
select pg_temp.db04_reject($q$update public.ad_calls set status='open' where id='80000000-0000-4000-8000-000000000001'$q$,'23514');
select pg_temp.db04_reject($q$update public.ad_calls set title='終了後の変更' where id='80000000-0000-4000-8000-000000000001'$q$,'23514');
select pg_temp.db04_reject($q$update public.ad_applications set status='submitted',revision=4,review_comment=null,reviewed_by=null,reviewed_at=null where id='b0000000-0000-4000-8000-000000000001'$q$,'23514');
select pg_temp.db04_assert((select count(*)=2 from public.ad_placements where application_id='b0000000-0000-4000-8000-000000000001'),'closing call keeps placements');
select pg_temp.db04_assert((select disclosure_scope='{impressions,clicks,purchases}' from public.ad_calls where id='80000000-0000-4000-8000-000000000001'),'disclosure scope stored per call');
delete from public.ad_calls where id='80000000-0000-4000-8000-000000000002';

-- Creatives and versions.
select pg_temp.db04_reject($q$update public.creatives set maker_id='70000000-0000-4000-8000-000000000002' where id='90000000-0000-4000-8000-000000000001'$q$,'23514');
select pg_temp.db04_reject($q$insert into public.creative_versions(creative_id,version,image_path,headline) values('90000000-0000-4000-8000-000000000001',5,'ad-assets/CR1/v5.png','飛び番')$q$,'23514');
select pg_temp.db04_reject($q$insert into public.creative_versions(creative_id,version,image_path,headline) values('90000000-0000-4000-8000-000000000001',4,'https://example.test/v4.png?token=x','URL')$q$,'23514');
select pg_temp.db04_reject($q$update public.creative_versions set headline='変更' where id='a0000000-0000-4000-8000-000000000001'$q$,'23514');
select pg_temp.db04_reject($q$delete from public.creative_versions where id='a0000000-0000-4000-8000-000000000001'$q$,'23514');
select pg_temp.db04_reject($q$delete from public.makers where id='70000000-0000-4000-8000-000000000001'$q$,case when current_setting('server_version_num')::int >= 170000 then '23001' else '23503' end); -- RESTRICT: 23001 on PostgreSQL 17+, 23503 before

-- 8. Store promotion is a separate entity from maker ads; versions append and switch active.
insert into public.store_promotions(id,store_id,product_id) values
 ('d0000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001');
insert into public.promotion_versions(id,promotion_id,version,channels,time_windows,priority,reason_text,starts_at,ends_at) values
 ('e0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001',1,'{app,signage}',
  '[{"weekdays":[1,2,3,4,5],"start":"16:00","end":"19:00"},{"weekdays":[6,7],"start":"22:00","end":"24:00"},{"weekdays":[7],"start":"00:00","end":"02:00"}]',
  10,'夕方の特売','2099-11-01T00:00:00+09','2099-12-01T00:00:00+09');
select pg_temp.db04_reject($q$insert into public.promotion_versions(promotion_id,version,channels,reason_text,starts_at,ends_at) values('d0000000-0000-4000-8000-000000000001',2,'{app}','第2版','2099-11-01','2099-12-01')$q$,'23505');
update public.promotion_versions set status='inactive' where id='e0000000-0000-4000-8000-000000000001';
insert into public.promotion_versions(id,promotion_id,version,channels,reason_text,starts_at,ends_at) values
 ('e0000000-0000-4000-8000-000000000002','d0000000-0000-4000-8000-000000000001',2,'{app}','終日に変更','2099-11-01T00:00:00+09','2099-12-01T00:00:00+09');
select pg_temp.db04_assert((select count(*)=2 and count(*) filter (where status='active')=1 and bool_or(time_windows='[]'::jsonb and version=2)
 from public.promotion_versions where promotion_id='d0000000-0000-4000-8000-000000000001'),'promotion keeps old version and one active');
select pg_temp.db04_reject($q$update public.promotion_versions set status='active' where id='e0000000-0000-4000-8000-000000000001'$q$,'23514');
select pg_temp.db04_reject($q$update public.promotion_versions set priority=5 where id='e0000000-0000-4000-8000-000000000002'$q$,'23514');
select pg_temp.db04_reject($q$delete from public.promotion_versions$q$,'23514');
select pg_temp.db04_reject($q$update public.store_promotions set product_id='30000000-0000-4000-8000-000000000002'$q$,'23514');
select pg_temp.db04_reject($q$insert into public.store_promotions(store_id,product_id) values('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002')$q$,'23503');
insert into public.promotion_versions(promotion_id,version,channels,reason_text,starts_at,ends_at,status) values
 ('d0000000-0000-4000-8000-000000000001',3,'{signage}','停止中の案','2099-11-01T00:00:00+09','2099-12-01T00:00:00+09','inactive');
select pg_temp.db04_reject($q$insert into public.promotion_versions(promotion_id,version,channels,reason_text,starts_at,ends_at,priority,status) values('d0000000-0000-4000-8000-000000000001',4,'{app}','x','2099-11-01','2099-12-01',-1,'inactive')$q$,'23514');
select pg_temp.db04_reject(format($q$insert into public.promotion_versions(promotion_id,version,channels,time_windows,reason_text,starts_at,ends_at,status) values('d0000000-0000-4000-8000-000000000001',4,'{app}',%L,'x','2099-11-01','2099-12-01','inactive')$q$,w),'23514')
 from unnest(array[
  '{}',                                                              -- not an array
  '[{"weekdays":[1],"start":"19:00","end":"16:00"}]',                -- start after end
  '[{"weekdays":[1],"start":"22:00","end":"02:00"}]',                -- overnight must be split
  '[{"weekdays":[1,1],"start":"16:00","end":"19:00"}]',              -- duplicate weekday
  '[{"weekdays":[8],"start":"16:00","end":"19:00"}]',                -- weekday out of range
  '[{"weekdays":[1.5],"start":"16:00","end":"19:00"}]',              -- not an ISO weekday
  '[{"weekdays":[],"start":"16:00","end":"19:00"}]',                 -- no weekday
  '[{"weekdays":[1],"start":"4:00","end":"19:00"}]',                 -- not HH:mm
  '[{"weekdays":[1],"start":"16:00","end":"19:00","note":"x"}]',     -- unknown key
  '[{"weekdays":[1,2],"start":"16:00","end":"19:00"},{"weekdays":[2],"start":"18:00","end":"20:00"}]' -- overlap
 ]) w;

-- Privileges: RLS on, no general-role access, review history not writable by service_role.
select pg_temp.db04_assert((select count(*)=10 and bool_and(relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
 and c.relname in ('makers','maker_members','ad_calls','creatives','creative_versions','ad_applications','application_revisions','ad_placements','store_promotions','promotion_versions')),'ten tables RLS enabled');
select pg_temp.db04_assert((select bool_and(not has_table_privilege(r,'public.'||t,p)) from unnest(case when to_regprocedure('public.kago_has_role(text)') is null then array['anon','authenticated'] else array['anon'] end) r
 cross join unnest(array['makers','maker_members','ad_calls','creatives','creative_versions','ad_applications','application_revisions','ad_placements','store_promotions','promotion_versions']) t
 cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p),'general roles have no access');
select pg_temp.db04_assert((select not has_table_privilege('service_role','public.application_revisions','INSERT')
 and not has_table_privilege('service_role','public.creative_versions','UPDATE')
 and not has_table_privilege('service_role','public.ad_placements','DELETE')),'append-only grants for service_role');
-- service_role (seed/server) can append versions under the row locks; history stays read-only.
set local role service_role;
insert into public.creative_versions(creative_id,version,image_path,headline) values
 ('90000000-0000-4000-8000-000000000001',4,'ad-assets/CR1/v4.png','第4版');
insert into public.promotion_versions(promotion_id,version,channels,reason_text,starts_at,ends_at,status) values
 ('d0000000-0000-4000-8000-000000000001',4,'{app}','service_role','2099-11-01T00:00:00+09','2099-12-01T00:00:00+09','inactive');
select pg_temp.db04_reject($q$update public.application_revisions set status='approved'$q$,'42501');
reset role;
set local role authenticated;
select pg_temp.db04_reject($q$select * from public.ad_applications$q$,case when to_regprocedure('public.kago_has_role(text)') is null then '42501' end); -- DB-06 grants SELECT; rows are then filtered by RLS (db06.sql)
reset role;
select 'DB-04: all assertions passed; rolling back fixtures' as result;
rollback;
