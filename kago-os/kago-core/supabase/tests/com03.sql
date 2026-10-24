-- Disposable DB only. Storage policies are real; HTTP size/MIME checks require live Storage.
begin;
create function pg_temp.com03_assert(ok boolean, message text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'DB-06 assertion failed: %',message; end if;
end;
$$;
create function pg_temp.com03_reject(statement text, expected_state text) returns void language plpgsql as $$
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
create function pg_temp.com03_rows(statement text) returns integer language plpgsql as $$
declare n integer;
begin execute statement; get diagnostics n = row_count; return n; end;
$$;
-- Simulated Supabase JWT for the next `set local role authenticated`.
create function pg_temp.com03_as(sub uuid, kago jsonb) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(sub::text, ''), true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', sub, 'role', 'authenticated',
    'app_metadata', jsonb_build_object('kago', kago))::text, true);
end;
$$;

-- Fixture (owner). U1/U2 customers, T1/T2 staff of S1/S2, X1 staff role without membership,
-- W1/W2 staff of makers M1/M2, DV1/DV2 accounts of devices D1 (S1) / D2 (S2).
insert into auth.users(id,email) values
 ('10000000-0000-4000-8000-000000000001','com03-u1@example.test'),
 ('10000000-0000-4000-8000-000000000002','com03-u2@example.test'),
 ('10000000-0000-4000-8000-000000000011','com03-t1@example.test'),
 ('10000000-0000-4000-8000-000000000012','com03-t2@example.test'),
 ('10000000-0000-4000-8000-000000000013','com03-x1@example.test'),
 ('10000000-0000-4000-8000-000000000021','com03-w1@example.test'),
 ('10000000-0000-4000-8000-000000000022','com03-w2@example.test'),
 ('10000000-0000-4000-8000-000000000031','com03-dv1@example.test'),
 ('10000000-0000-4000-8000-000000000032','com03-dv2@example.test');
insert into public.stores(id,slug,name) values
 ('20000000-0000-4000-8000-000000000001','com03-s1','架空1号店'),
 ('20000000-0000-4000-8000-000000000002','com03-s2','架空2号店');
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
 ('70000000-0000-4000-8000-000000000001','com03-m1','架空メーカー1'),
 ('70000000-0000-4000-8000-000000000002','com03-m2','架空メーカー2');
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
 ('a0000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001',1,'70000000-0000-4000-8000-000000000001/90000000-0000-4000-8000-000000000001/a0000000-0000-4000-8000-000000000001.png','M1第1版'),
 ('a0000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000001',2,'70000000-0000-4000-8000-000000000001/90000000-0000-4000-8000-000000000001/a0000000-0000-4000-8000-000000000002.png','M1未申請の第2版'),
 ('a0000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-000000000002',1,'70000000-0000-4000-8000-000000000002/90000000-0000-4000-8000-000000000002/a0000000-0000-4000-8000-000000000003.png','M2第1版');
insert into public.ad_applications(id,ad_call_id,store_id,maker_id,creative_id,creative_version_id,channels,requested_period) values
 ('b0000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001',
  '{app,signage}','[2026-01-01T00:00:00+09,2099-01-01T00:00:00+09)'),
 ('b0000000-0000-4000-8000-000000000002','80000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002',
  '70000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000003',
  '{app}','[2026-01-01T00:00:00+09,2099-01-01T00:00:00+09)');
insert into public.signage_devices(id,store_id,auth_user_id,slug,location) values
 ('66000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000031','entrance','入口'),
 ('66000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000032','entrance','入口');

insert into storage.objects(bucket_id,name)
select 'ad-images',image_path from public.creative_versions;

set local role anon;
select pg_temp.com03_assert((select count(*)=0 from storage.objects),'anon cannot read');
reset role;
select pg_temp.com03_as('10000000-0000-4000-8000-000000000021','{"roles":["maker_staff"]}');
set local role authenticated;
select pg_temp.com03_assert((select count(*)=2 from storage.objects),'M1 sees own versions only');
insert into storage.objects(bucket_id,name) values('ad-images','70000000-0000-4000-8000-000000000001/90000000-0000-4000-8000-000000000001/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp');
select pg_temp.com03_assert((select count(*)=3 from storage.objects),'own upload before version can be previewed');
select pg_temp.com03_reject($q$insert into storage.objects(bucket_id,name) values('ad-images','70000000-0000-4000-8000-000000000002/90000000-0000-4000-8000-000000000002/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png')$q$,'42501');
select pg_temp.com03_reject($q$insert into storage.objects(bucket_id,name) values('ad-images','70000000-0000-4000-8000-000000000001/90000000-0000-4000-8000-000000000002/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png')$q$,'42501');
select pg_temp.com03_reject($q$insert into storage.objects(bucket_id,name) values('ad-images','../file.png')$q$,'42501');
select pg_temp.com03_reject($q$insert into storage.objects(bucket_id,name) values('ad-images','70000000-0000-4000-8000-000000000001/90000000-0000-4000-8000-000000000001/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.svg')$q$,'42501');
select pg_temp.com03_assert(pg_temp.com03_rows('update storage.objects set name=name')=0,'no overwrite');
select pg_temp.com03_assert(pg_temp.com03_rows('delete from storage.objects')=0,'no delete');
select pg_temp.com03_reject($q$insert into storage.objects(bucket_id,name) values('ad-images','70000000-0000-4000-8000-000000000001/90000000-0000-4000-8000-000000000001/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp') on conflict(bucket_id,name) do update set name=excluded.name$q$,'42501');
reset role;
select pg_temp.com03_as('10000000-0000-4000-8000-000000000022','{"roles":["maker_staff"]}');
set local role authenticated;
select pg_temp.com03_assert((select count(*)=1 from storage.objects),'M2 cannot see M1 uploads');
reset role;
select pg_temp.com03_as('10000000-0000-4000-8000-000000000001','{"roles":["customer"]}');
set local role authenticated;
select pg_temp.com03_assert((select count(*)=0 from storage.objects),'customer cannot see pending images');
reset role;
select pg_temp.com03_as('10000000-0000-4000-8000-000000000012','{"roles":["store_staff"]}');
set local role authenticated;
select pg_temp.com03_assert((select count(*)=1 from storage.objects),'T2 sees only own pending application');
reset role;
select pg_temp.com03_as('10000000-0000-4000-8000-000000000011','{"roles":["store_staff"]}');
set local role authenticated;
select pg_temp.com03_assert((select count(*)=1 from storage.objects),'T1 sees pending version, not unsubmitted version');
select * from public.kago_approve_application('b0000000-0000-4000-8000-000000000001',1);
reset role;
select pg_temp.com03_as('10000000-0000-4000-8000-000000000001','{"roles":["customer"]}');
set local role authenticated;
select pg_temp.com03_assert((select count(*)=1 from storage.objects),'customer sees only approved image');
reset role;
select pg_temp.com03_as('10000000-0000-4000-8000-000000000031','{"roles":["signage"],"device_id":"66000000-0000-4000-8000-000000000001","store_id":"20000000-0000-4000-8000-000000000001"}');
set local role authenticated;
select pg_temp.com03_assert((select count(*)=1 from storage.objects),'S1 device sees S1 approved image');
reset role;
select pg_temp.com03_as('10000000-0000-4000-8000-000000000032','{"roles":["signage"],"device_id":"66000000-0000-4000-8000-000000000002","store_id":"20000000-0000-4000-8000-000000000002"}');
set local role authenticated;
select pg_temp.com03_assert((select count(*)=0 from storage.objects),'S2 device cannot see S1 image');
reset role;
select pg_temp.com03_as('10000000-0000-4000-8000-000000000011','{"roles":["store_staff"]}');
set local role authenticated;
select * from public.kago_suspend_placement((select id from public.ad_placements where application_id='b0000000-0000-4000-8000-000000000001'),'検証の停止');
reset role;
select pg_temp.com03_as('10000000-0000-4000-8000-000000000001','{"roles":["customer"]}');
set local role authenticated;
select pg_temp.com03_assert((select count(*)=0 from storage.objects),'stopped image cannot obtain a new URL');
reset role;
select 'COM-03: all assertions passed; rolling back fixtures' as result;
rollback;
