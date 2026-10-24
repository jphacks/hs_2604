-- DATA-01: shared fictional demo data for App / Ads / Insight / Signage.
-- Apply after every migration in ../migrations. Owner rights (SQL Editor or psql). Re-runnable.
--
-- * Everything here is fictional. Orders, visits and events are data_origin = 'seeded' and are
--   past history for display checks only. Today's demo purchases (DATA-03) are not included.
-- * Fixed UUIDs: 0da7a0TT-0000-4000-8000-0000000000NN (TT = table, NN = row). See docs/development/demo-data.md.
-- * Accounts are not created here. Create the nine @example.test users in Supabase Auth first;
--   this file resolves them by email, sets app_metadata.kago, and stops if any is missing.
-- * Existing rows are never overwritten. A re-run only adds what is missing, then checks that
--   the fixed ids still mean the same store / product / maker / application.
-- * Ad periods are fixed (2026-10-23 .. 2026-12-01 JST). Applications can only be inserted
--   while their ad call is open, so a first run must happen before 2026-12-01.
begin;

-- Accounts ---------------------------------------------------------------------------------
create temp table data01_accounts (key text primary key, email text not null unique,
  kago jsonb not null, user_id uuid) on commit drop;
insert into data01_accounts(key, email, kago) values
 ('U1',  'misaki.sato@example.test',                        '{"roles":["customer"]}'),
 ('U2',  'ken.tanaka@example.test',                         '{"roles":["customer"]}'),
 ('T1',  'staff.hiroshima-demo-store@example.test',         '{"roles":["store_staff"]}'),
 ('T2',  'staff.hiroshima-station-demo-store@example.test', '{"roles":["store_staff"]}'),
 ('W1',  'staff.setouchi-tomato-foods@example.test',        '{"roles":["maker_staff"]}'),
 ('W2',  'staff.check-maker@example.test',                  '{"roles":["maker_staff"]}'),
 ('DV1', 'signage.hiroshima-demo-entrance@example.test',
   '{"roles":["signage"],"device_id":"0da7a004-0000-4000-8000-000000000001","store_id":"0da7a001-0000-4000-8000-000000000001"}'),
 ('DV2', 'signage.hiroshima-demo-pasta-shelf@example.test',
   '{"roles":["signage"],"device_id":"0da7a004-0000-4000-8000-000000000002","store_id":"0da7a001-0000-4000-8000-000000000001"}'),
 ('DV3', 'signage.hiroshima-station-entrance@example.test',
   '{"roles":["signage"],"device_id":"0da7a004-0000-4000-8000-000000000003","store_id":"0da7a001-0000-4000-8000-000000000002"}');
update data01_accounts a set user_id = u.id from auth.users u where lower(u.email) = a.email;

do $$
declare missing text; conflicting text;
begin
  select string_agg(email, ', ' order by key) into missing from data01_accounts where user_id is null;
  if missing is not null then
    raise exception 'DATA-01: create these Auth users first: %', missing;
  end if;
  -- Roles decide the login type; refuse to silently change an account someone set up differently.
  select string_agg(a.email, ', ' order by a.key) into conflicting
    from data01_accounts a join auth.users u on u.id = a.user_id
    where u.raw_app_meta_data -> 'kago' is not null and u.raw_app_meta_data -> 'kago' <> a.kago;
  if conflicting is not null then
    raise exception 'DATA-01: app_metadata.kago differs for %; fix or remove it first', conflicting;
  end if;
end$$;

update auth.users u set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('kago', a.kago)
  from data01_accounts a
  where u.id = a.user_id and u.raw_app_meta_data -> 'kago' is null;

-- Stores, products, prices --------------------------------------------------------------------
insert into public.stores(id, slug, name, branch_name, created_at) values
 ('0da7a001-0000-4000-8000-000000000001', 'hiroshima-demo-store', '広島デモ店', null, '2026-10-21T10:00:00+09'),
 ('0da7a001-0000-4000-8000-000000000002', 'hiroshima-station-demo-store', '広島デモ店', '駅前店', '2026-10-21T10:00:00+09')
on conflict (id) do nothing;

create temp table data01_products (n integer primary key, code text not null, name text not null,
  category text not null, price integer not null) on commit drop;
insert into data01_products values
 ( 1, '2900000000018', 'KAGO 緑茶 500ml',         '飲料',     138),
 ( 2, '2900000000025', 'KAGO 天然水 550ml',       '飲料',      98),
 ( 3, '2900000000032', 'KAGO カフェラテ',         '飲料',     178),
 ( 4, '2900000000049', '成分無調整牛乳 1L',       '乳製品',   238),
 ( 5, '2900000000056', 'もっちり食パン 6枚切',    'パン',     228),
 ( 6, '2900000000063', '新鮮たまご 10個',         '卵',       298),
 ( 7, '2900000000070', 'プレーンヨーグルト',      '乳製品',   188),
 ( 8, '2900000000087', 'フィリピン産バナナ',      '青果',     198),
 ( 9, '2900000000094', '中辛ビーフカレー',        '加工食品', 258),
 (10, '2900000000100', 'スパゲッティ 500g',       '乾麺',     248),
 (11, '2900000000117', 'うすしおポテトチップス',  '菓子',     178),
 (12, '2900000000124', 'ミルクチョコレート',      '菓子',     158),
 (13, '2900000000131', '箱ティッシュ 5個組',      '日用品',   398),
 (14, '2900000000148', '液体洗濯洗剤 詰替',       '日用品',   498),
 (15, '2900000000155', '不織布マスク 30枚',       '衛生用品', 598),
 (16, '2900000000162', 'トマトパスタソース',      '調味料',   298),
 (17, 'PLU-1001',      '玉ねぎ 1個',              '青果',      78),
 (18, 'PLU-1002',      '国産りんご 1個',          '青果',     158),
 (19, 'PLU-1003',      'アボカド 1個',            '青果',     198),
 (20, 'PLU-2001',      'お店のコロッケ 1個',      '惣菜',      98),
 (21, 'PLU-2002',      '若鶏の唐揚げ 100g',       '惣菜',     218),
 (22, 'PLU-3001',      '焼きたて塩パン 1個',      'パン',     130);
create or replace function pg_temp.data01_product(p_code text) returns uuid language sql stable as $$
  select ('0da7a002-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid from pg_temp.data01_products where code = p_code;
$$;
create or replace function pg_temp.data01_user(p_key text) returns uuid language sql stable as $$
  select user_id from pg_temp.data01_accounts where key = p_key;
$$;

insert into public.products(id, code, name, category, created_at)
select pg_temp.data01_product(code), code, name, category, '2026-10-21T10:00:00+09' from data01_products
on conflict (id) do nothing;

-- Station store sells the same range; the sauce is 278 yen there to show per-store prices.
insert into public.store_products(store_id, product_id, price)
select s.id, pg_temp.data01_product(p.code),
  case when s.slug = 'hiroshima-station-demo-store' and p.code = '2900000000162' then 278 else p.price end
from data01_products p cross join public.stores s
where s.id in ('0da7a001-0000-4000-8000-000000000001', '0da7a001-0000-4000-8000-000000000002')
on conflict (store_id, product_id) do nothing;

insert into public.store_members(store_id, user_id, created_at) values
 ('0da7a001-0000-4000-8000-000000000001', pg_temp.data01_user('T1'), '2026-10-21T10:00:00+09'),
 ('0da7a001-0000-4000-8000-000000000002', pg_temp.data01_user('T2'), '2026-10-21T10:00:00+09')
on conflict do nothing;

-- U1 = 佐藤 美咲 (history ON, kago-app customer.json), U2 = 田中 健 (no history, history OFF).
insert into public.customer_settings(user_id, slug, use_purchase_history, use_current_cart) values
 (pg_temp.data01_user('U1'), 'demo-user-sato-misaki', true, true),
 (pg_temp.data01_user('U2'), 'demo-user-tanaka-ken', false, false)
on conflict (user_id) do nothing;

insert into public.signage_devices(id, store_id, auth_user_id, slug, location, created_at) values
 ('0da7a004-0000-4000-8000-000000000001', '0da7a001-0000-4000-8000-000000000001', pg_temp.data01_user('DV1'),
  'hiroshima-demo-entrance', '入口', '2026-10-21T10:00:00+09'),
 ('0da7a004-0000-4000-8000-000000000002', '0da7a001-0000-4000-8000-000000000001', pg_temp.data01_user('DV2'),
  'hiroshima-demo-pasta-shelf', 'パスタ・調味料の棚', '2026-10-21T10:00:00+09'),
 ('0da7a004-0000-4000-8000-000000000003', '0da7a001-0000-4000-8000-000000000002', pg_temp.data01_user('DV3'),
  'hiroshima-station-entrance', '入口', '2026-10-21T10:00:00+09')
on conflict (id) do nothing;

-- Makers and ad calls ---------------------------------------------------------------------------
insert into public.makers(id, slug, display_name, is_fictional, created_at) values
 ('0da7a003-0000-4000-8000-000000000001', 'setouchi-tomato-foods', '瀬戸内トマト食品', true, '2026-10-21T10:00:00+09'),
 ('0da7a003-0000-4000-8000-000000000002', 'check-maker', '確認用メーカー（架空）', true, '2026-10-21T10:00:00+09')
on conflict (id) do nothing;
insert into public.maker_members(maker_id, user_id, created_at) values
 ('0da7a003-0000-4000-8000-000000000001', pg_temp.data01_user('W1'), '2026-10-21T10:00:00+09'),
 ('0da7a003-0000-4000-8000-000000000002', pg_temp.data01_user('W2'), '2026-10-21T10:00:00+09')
on conflict do nothing;

-- C1..C6 follow kago-ads/src/data/demo/seed.ts with its "today" fixed to 2026-10-24.
insert into public.ad_calls(id, store_id, title, description, categories, channels, starts_at, ends_at,
  status, disclosure_scope, created_at) values
 ('0da7a005-0000-4000-8000-000000000001', '0da7a001-0000-4000-8000-000000000001', 'パスタ関連商品の広告募集',
  'パスタ・調味料の棚の前にあるサイネージと、App のおすすめ枠で、パスタと一緒に使う商品の広告を募集します。',
  '{乾麺,調味料}', '{app,signage}', '2026-10-23T00:00:00+09', '2026-12-01T00:00:00+09', 'open',
  '{impressions,clicks,cart_adds,purchases,signage_views}', '2026-10-21T10:00:00+09'),
 ('0da7a005-0000-4000-8000-000000000002', '0da7a001-0000-4000-8000-000000000001', '惣菜・パン売り場のサイネージ',
  '入口のサイネージで、夕方の惣菜・パンに合う商品の広告を募集します。動画（15秒以内）も可。',
  '{惣菜,パン}', '{signage}', '2026-10-24T00:00:00+09', '2026-12-24T00:00:00+09', 'open',
  '{signage_views}', '2026-10-22T10:00:00+09'),
 ('0da7a005-0000-4000-8000-000000000003', '0da7a001-0000-4000-8000-000000000002', '駅前店 日用品の広告募集',
  '日用品フェアに合わせた広告枠です。',
  '{日用品}', '{app,signage}', '2026-09-24T00:00:00+09', '2026-10-24T00:00:00+09', 'open',
  '{impressions,clicks,cart_adds,purchases,signage_views}', '2026-09-19T10:00:00+09'),
 ('0da7a005-0000-4000-8000-000000000004', '0da7a001-0000-4000-8000-000000000002', '駅前店 App おすすめ枠',
  '通勤帰りのお客様向けに、App のおすすめ枠で広告を募集します。',
  '{調味料,乳製品}', '{app}', '2026-10-27T00:00:00+09', '2026-12-09T00:00:00+09', 'open',
  '{impressions,clicks}', '2026-10-23T10:00:00+09'),
 ('0da7a005-0000-4000-8000-000000000005', '0da7a001-0000-4000-8000-000000000001', '年末の売り場企画（下書き）',
  '内容を検討中。',
  '{調味料}', '{app,signage}', '2026-12-03T00:00:00+09', '2027-01-03T00:00:00+09', 'draft',
  '{impressions,clicks,cart_adds,purchases,signage_views}', '2026-10-23T10:00:00+09'),
 ('0da7a005-0000-4000-8000-000000000006', '0da7a001-0000-4000-8000-000000000002', '秋の飲料キャンペーン',
  '応募が集まったため募集を終了しました。',
  '{飲料}', '{signage}', '2026-10-04T00:00:00+09', '2026-11-04T00:00:00+09', 'closed',
  '{}', '2026-09-29T10:00:00+09')
on conflict (id) do nothing;

-- Creative CR1 (M1, P-SAUCE). image_path follows COM-03; the image objects are uploaded separately.
insert into public.creatives(id, maker_id, product_id, created_at) values
 ('0da7a006-0000-4000-8000-000000000001', '0da7a003-0000-4000-8000-000000000001',
  pg_temp.data01_product('2900000000162'), '2026-10-21T10:00:00+09')
on conflict (id) do nothing;
insert into public.creative_versions(id, creative_id, version, image_path, headline, note, created_at)
select v.* from (values
 ('0da7a007-0000-4000-8000-000000000001'::uuid, '0da7a006-0000-4000-8000-000000000001'::uuid, 1,
  '0da7a003-0000-4000-8000-000000000001/0da7a006-0000-4000-8000-000000000001/0da7a011-0000-4000-8000-000000000001.png',
  'ゆでたパスタに、かけるだけ。', '初版', '2026-10-21T10:00:00+09'::timestamptz),
 ('0da7a007-0000-4000-8000-000000000002'::uuid, '0da7a006-0000-4000-8000-000000000001'::uuid, 2,
  '0da7a003-0000-4000-8000-000000000001/0da7a006-0000-4000-8000-000000000001/0da7a011-0000-4000-8000-000000000002.png',
  'ゆでたパスタに、かけるだけ。', '商品名を大きくした', '2026-10-22T13:00:00+09'::timestamptz)
) v(id, creative_id, version, image_path, headline, note, created_at)
where not exists (select 1 from public.creative_versions cv where cv.id = v.id)
order by v.version;

-- A1 (common spec 11.2 No.2-5): round 1 rejected, round 2 with version 2 approved as PL1.
-- Each step only runs from the state before it, so a re-run never repeats a review.
insert into public.ad_applications(id, ad_call_id, store_id, maker_id, creative_id, creative_version_id,
  channels, requested_period, message, created_at)
select '0da7a008-0000-4000-8000-000000000001', '0da7a005-0000-4000-8000-000000000001',
  '0da7a001-0000-4000-8000-000000000001', '0da7a003-0000-4000-8000-000000000001',
  '0da7a006-0000-4000-8000-000000000001', '0da7a007-0000-4000-8000-000000000001', '{app,signage}',
  tstzrange('2026-10-23T00:00:00+09', '2026-12-01T00:00:00+09', '[)'),
  'パスタと一緒に買われやすいソースです。', '2026-10-21T10:00:00+09'
where not exists (select 1 from public.ad_applications where id = '0da7a008-0000-4000-8000-000000000001');
update public.ad_applications set status = 'rejected', reviewed_by = pg_temp.data01_user('T1'),
  review_comment = '商品名がサイネージの離れた位置から読みにくいので、大きくしてください。'
  where id = '0da7a008-0000-4000-8000-000000000001' and status = 'submitted' and revision = 1;
insert into public.ad_operation_logs(id, store_id, application_id, revision, action, actor, reason)
select '0da7a010-0000-4000-8000-000000000001', a.store_id, a.id, 1, 'reject', r.reviewed_by, r.review_comment
  from public.application_revisions r join public.ad_applications a on a.id = r.application_id
  where r.application_id = '0da7a008-0000-4000-8000-000000000001' and r.revision = 1 and r.status = 'rejected'
on conflict (id) do nothing;
update public.ad_applications set status = 'submitted', revision = 2,
  creative_version_id = '0da7a007-0000-4000-8000-000000000002', message = '商品名を大きくしました。',
  reviewed_by = null, reviewed_at = null, review_comment = null
  where id = '0da7a008-0000-4000-8000-000000000001' and status = 'rejected' and revision = 1;
update public.ad_applications set status = 'approved', reviewed_by = pg_temp.data01_user('T1')
  where id = '0da7a008-0000-4000-8000-000000000001' and status = 'submitted' and revision = 2;
insert into public.ad_placements(id, application_id, revision, store_id, creative_version_id, channels,
  starts_at, ends_at, approved_by)
select '0da7a009-0000-4000-8000-000000000001', id, revision, store_id, creative_version_id, channels,
  lower(requested_period), upper(requested_period), reviewed_by
  from public.ad_applications
  where id = '0da7a008-0000-4000-8000-000000000001' and status = 'approved' and revision = 2
    and not exists (select 1 from public.ad_placements where id = '0da7a009-0000-4000-8000-000000000001');
insert into public.ad_operation_logs(id, store_id, application_id, revision, placement_id, action, actor)
select '0da7a010-0000-4000-8000-000000000002', store_id, application_id, revision, id, 'approve', approved_by
  from public.ad_placements where id = '0da7a009-0000-4000-8000-000000000001'
on conflict (id) do nothing;

-- A2: waiting for review (C2, Signage only), for trying INS-01 approve / reject.
insert into public.ad_applications(id, ad_call_id, store_id, maker_id, creative_id, creative_version_id,
  channels, requested_period, message, created_at)
select '0da7a008-0000-4000-8000-000000000002', '0da7a005-0000-4000-8000-000000000002',
  '0da7a001-0000-4000-8000-000000000001', '0da7a003-0000-4000-8000-000000000001',
  '0da7a006-0000-4000-8000-000000000001', '0da7a007-0000-4000-8000-000000000002', '{signage}',
  tstzrange('2026-10-25T00:00:00+09', '2026-11-24T00:00:00+09', '[)'),
  '入口の画面で、夕方の惣菜と一緒に案内したいです。', '2026-10-24T08:00:00+09'
where not exists (select 1 from public.ad_applications where id = '0da7a008-0000-4000-8000-000000000002');

-- A3: M2 -> S2 (C4, App), waiting for review. Gives S2 / M2 their own rows so store and maker
-- isolation can be checked against non-empty data in both directions (INS-06, DB-06).
insert into public.creatives(id, maker_id, product_id, created_at) values
 ('0da7a006-0000-4000-8000-000000000002', '0da7a003-0000-4000-8000-000000000002',
  pg_temp.data01_product('2900000000070'), '2026-10-23T10:00:00+09')
on conflict (id) do nothing;
insert into public.creative_versions(id, creative_id, version, image_path, headline, note, created_at)
select '0da7a007-0000-4000-8000-000000000003', '0da7a006-0000-4000-8000-000000000002', 1,
  '0da7a003-0000-4000-8000-000000000002/0da7a006-0000-4000-8000-000000000002/0da7a011-0000-4000-8000-000000000003.png',
  '朝の一杯に、プレーンヨーグルト。', '確認用（架空）', '2026-10-23T10:00:00+09'
where not exists (select 1 from public.creative_versions where id = '0da7a007-0000-4000-8000-000000000003');
insert into public.ad_applications(id, ad_call_id, store_id, maker_id, creative_id, creative_version_id,
  channels, requested_period, message, created_at)
select '0da7a008-0000-4000-8000-000000000003', '0da7a005-0000-4000-8000-000000000004',
  '0da7a001-0000-4000-8000-000000000002', '0da7a003-0000-4000-8000-000000000002',
  '0da7a006-0000-4000-8000-000000000002', '0da7a007-0000-4000-8000-000000000003', '{app}',
  tstzrange('2026-10-27T00:00:00+09', '2026-12-09T00:00:00+09', '[)'),
  '駅前店のおすすめ枠で、通勤帰りの方に案内したいです。', '2026-10-24T09:00:00+09'
where not exists (select 1 from public.ad_applications where id = '0da7a008-0000-4000-8000-000000000003');

-- Store promotions: SP1 P-CROQ 16-19h App+Signage (common spec 11.2 No.6), SP2 salt bread all day Signage.
insert into public.store_promotions(id, store_id, product_id, created_at) values
 ('0da7a00a-0000-4000-8000-000000000001', '0da7a001-0000-4000-8000-000000000001',
  pg_temp.data01_product('PLU-2001'), '2026-10-21T10:00:00+09'),
 ('0da7a00a-0000-4000-8000-000000000002', '0da7a001-0000-4000-8000-000000000001',
  pg_temp.data01_product('PLU-3001'), '2026-10-21T10:00:00+09')
on conflict (id) do nothing;
insert into public.promotion_versions(id, promotion_id, version, channels, time_windows, priority,
  reason_text, starts_at, ends_at, created_at)
select v.* from (values
 ('0da7a00b-0000-4000-8000-000000000001'::uuid, '0da7a00a-0000-4000-8000-000000000001'::uuid, 1,
  '{app,signage}'::text[], '[{"weekdays":[1,2,3,4,5,6,7],"start":"16:00","end":"19:00"}]'::jsonb, 50,
  '店内で揚げたてです', '2026-10-23T00:00:00+09'::timestamptz, '2026-11-24T00:00:00+09'::timestamptz,
  '2026-10-21T10:00:00+09'::timestamptz),
 ('0da7a00b-0000-4000-8000-000000000002'::uuid, '0da7a00a-0000-4000-8000-000000000002'::uuid, 1,
  '{signage}'::text[], '[]'::jsonb, 30,
  '朝と夕方に店内で焼き上げています', '2026-10-23T00:00:00+09'::timestamptz, '2026-11-24T00:00:00+09'::timestamptz,
  '2026-10-21T10:00:00+09'::timestamptz)
) v(id, promotion_id, version, channels, time_windows, priority, reason_text, starts_at, ends_at, created_at)
where not exists (select 1 from public.promotion_versions pv where pv.id = v.id);

-- U1's past purchases (kago-app customer.json order-demo-001..011) --------------------------------
-- One completed visit per order: scan + add per line, then the order. All 'seeded'.
create temp table data01_history (n integer, ordered_at timestamptz, code text, quantity integer,
  unit_price integer) on commit drop;
insert into data01_history values
 ( 1, '2026-08-28T18:32:00+09', '2900000000049', 1, 238), ( 1, '2026-08-28T18:32:00+09', '2900000000056', 1, 228),
 ( 1, '2026-08-28T18:32:00+09', '2900000000063', 1, 298), ( 1, '2026-08-28T18:32:00+09', '2900000000148', 1, 498),
 ( 2, '2026-09-05T11:08:00+09', '2900000000049', 1, 238), ( 2, '2026-09-05T11:08:00+09', '2900000000056', 1, 228),
 ( 2, '2026-09-05T11:08:00+09', '2900000000070', 1, 188), ( 2, '2026-09-05T11:08:00+09', '2900000000087', 1, 198),
 ( 3, '2026-09-09T17:46:00+09', '2900000000063', 1, 298), ( 3, '2026-09-09T17:46:00+09', '2900000000094', 2, 258),
 ( 3, '2026-09-09T17:46:00+09', '2900000000018', 2, 138),
 ( 4, '2026-09-12T10:14:00+09', '2900000000049', 1, 238), ( 4, '2026-09-12T10:14:00+09', '2900000000056', 1, 228),
 ( 4, '2026-09-12T10:14:00+09', '2900000000070', 1, 188), ( 4, '2026-09-12T10:14:00+09', '2900000000131', 1, 398),
 ( 5, '2026-09-18T18:03:00+09', '2900000000049', 1, 238), ( 5, '2026-09-18T18:03:00+09', '2900000000056', 1, 228),
 ( 5, '2026-09-18T18:03:00+09', '2900000000070', 1, 188), ( 5, '2026-09-18T18:03:00+09', '2900000000087', 1, 198),
 ( 6, '2026-09-21T16:27:00+09', '2900000000063', 1, 298), ( 6, '2026-09-21T16:27:00+09', '2900000000100', 1, 248),
 ( 6, '2026-09-21T16:27:00+09', '2900000000124', 1, 158),
 ( 7, '2026-09-24T18:51:00+09', '2900000000049', 1, 238), ( 7, '2026-09-24T18:51:00+09', '2900000000056', 1, 228),
 ( 7, '2026-09-24T18:51:00+09', '2900000000087', 1, 198),
 ( 8, '2026-09-29T19:12:00+09', '2900000000049', 1, 238), ( 8, '2026-09-29T19:12:00+09', '2900000000070', 1, 188),
 ( 8, '2026-09-29T19:12:00+09', '2900000000148', 1, 498),
 ( 9, '2026-10-01T18:38:00+09', '2900000000056', 1, 228), ( 9, '2026-10-01T18:38:00+09', '2900000000087', 1, 198),
 ( 9, '2026-10-01T18:38:00+09', '2900000000018', 2, 138),
 (10, '2026-10-03T11:24:00+09', '2900000000063', 1, 298), (10, '2026-10-03T11:24:00+09', '2900000000070', 1, 188),
 (10, '2026-10-03T11:24:00+09', '2900000000117', 1, 178),
 (11, '2026-10-04T16:42:00+09', '2900000000049', 1, 238), (11, '2026-10-04T16:42:00+09', '2900000000056', 1, 228),
 (11, '2026-10-04T16:42:00+09', '2900000000087', 1, 198);
create temp table data01_lines on commit drop as
select h.*, row_number() over (partition by h.n order by h.code)::integer as line,
  count(*) over (partition by h.n)::integer as lines,
  ('0da7a00c-0000-4000-8000-' || lpad(h.n::text, 12, '0'))::uuid as visit_id,
  ('0da7a00d-0000-4000-8000-' || lpad(h.n::text, 12, '0'))::uuid as order_id,
  h.ordered_at - interval '15 minutes' as started_at
from data01_history h;

insert into public.visits(id, user_id, store_id, status, started_at, ended_at, last_activity_at, cart_version)
select distinct visit_id, pg_temp.data01_user('U1'), '0da7a001-0000-4000-8000-000000000001'::uuid, 'completed',
  started_at, ordered_at, ordered_at, lines
from data01_lines
on conflict (id) do nothing;

insert into public.events(event_id, event_type, schema_version, occurred_at, store_id, user_id, visit_id,
  product_id, payload, data_origin)
select ('0da7a00f-0000-4000-8000-' || lpad(l.n::text, 6, '0') || lpad(l.line::text, 4, '0') || e.kind)::uuid,
  e.event_type, 1, l.started_at + l.line * interval '2 minutes' + e.offset_s * interval '1 second',
  '0da7a001-0000-4000-8000-000000000001', pg_temp.data01_user('U1'), l.visit_id, pg_temp.data01_product(l.code),
  case e.kind when '01' then '{"method":"barcode"}'::jsonb
    else jsonb_build_object('source', 'scan', 'quantity', l.quantity, 'quantity_delta', l.quantity,
      'cart_version', l.line) end,
  'seeded'
from data01_lines l cross join (values ('01', 'product_scanned', 0), ('02', 'cart_item_added', 2)) e(kind, event_type, offset_s)
on conflict (event_id) do nothing;

insert into public.orders(id, visit_id, user_id, store_id, ordered_at, total, idempotency_key, cart_version,
  data_origin, created_at)
select order_id, visit_id, pg_temp.data01_user('U1'), '0da7a001-0000-4000-8000-000000000001', ordered_at,
  sum(unit_price * quantity)::integer, ('0da7a00e-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, max(lines),
  'seeded', ordered_at
from data01_lines group by n, order_id, visit_id, ordered_at
on conflict do nothing;

insert into public.order_items(order_id, product_id, product_name, unit_price, quantity)
select l.order_id, pg_temp.data01_product(l.code), p.name, l.unit_price, l.quantity
from data01_lines l join data01_products p on p.code = l.code
where not exists (select 1 from public.order_items oi
  where oi.order_id = l.order_id and oi.product_id = pg_temp.data01_product(l.code));

-- Check that the fixed ids still mean what this file defines --------------------------------------
do $$
declare problems text[] := '{}';
begin
  if (select count(*) from public.stores where (id, slug) in (
      ('0da7a001-0000-4000-8000-000000000001', 'hiroshima-demo-store'),
      ('0da7a001-0000-4000-8000-000000000002', 'hiroshima-station-demo-store'))) <> 2 then
    problems := array_append(problems, 'stores'); end if;
  if (select count(*) from public.products p join pg_temp.data01_products d
      on p.id = pg_temp.data01_product(d.code) and p.code = d.code) <> 22 then
    problems := array_append(problems, 'products'); end if;
  if (select count(*) from public.store_products where store_id in
      ('0da7a001-0000-4000-8000-000000000001', '0da7a001-0000-4000-8000-000000000002')
      and product_id in (select pg_temp.data01_product(code) from pg_temp.data01_products)) <> 44 then
    problems := array_append(problems, 'store_products'); end if;
  if (select count(*) from public.makers where (id, slug) in (
      ('0da7a003-0000-4000-8000-000000000001', 'setouchi-tomato-foods'),
      ('0da7a003-0000-4000-8000-000000000002', 'check-maker'))) <> 2 then
    problems := array_append(problems, 'makers'); end if;
  if (select count(*) from public.signage_devices d join pg_temp.data01_accounts a
      on a.user_id = d.auth_user_id and (a.kago ->> 'device_id')::uuid = d.id
      and (a.kago ->> 'store_id')::uuid = d.store_id) <> 3 then
    problems := array_append(problems, 'signage_devices'); end if;
  if (select count(*) from public.ad_calls where id::text like '0da7a005-%') <> 6 then
    problems := array_append(problems, 'ad_calls'); end if;
  if (select count(*) from public.creative_versions where (id, creative_id, version) in (
      ('0da7a007-0000-4000-8000-000000000001', '0da7a006-0000-4000-8000-000000000001', 1),
      ('0da7a007-0000-4000-8000-000000000002', '0da7a006-0000-4000-8000-000000000001', 2),
      ('0da7a007-0000-4000-8000-000000000003', '0da7a006-0000-4000-8000-000000000002', 1))) <> 3 then
    problems := array_append(problems, 'creative_versions'); end if;
  if (select count(*) from public.ad_applications where (id, store_id, maker_id) in (
      ('0da7a008-0000-4000-8000-000000000001', '0da7a001-0000-4000-8000-000000000001', '0da7a003-0000-4000-8000-000000000001'),
      ('0da7a008-0000-4000-8000-000000000002', '0da7a001-0000-4000-8000-000000000001', '0da7a003-0000-4000-8000-000000000001'),
      ('0da7a008-0000-4000-8000-000000000003', '0da7a001-0000-4000-8000-000000000002', '0da7a003-0000-4000-8000-000000000002'))) <> 3 then
    problems := array_append(problems, 'ad_applications'); end if;
  if not exists (select 1 from public.ad_placements where id = '0da7a009-0000-4000-8000-000000000001'
      and application_id = '0da7a008-0000-4000-8000-000000000001' and revision = 2
      and creative_version_id = '0da7a007-0000-4000-8000-000000000002') then
    problems := array_append(problems, 'ad_placements (A1 may have been reviewed differently before this run)'); end if;
  if (select count(*) from public.promotion_versions where id::text like '0da7a00b-%') <> 2 then
    problems := array_append(problems, 'promotion_versions'); end if;
  if (select count(*) from public.orders where id::text like '0da7a00d-%' and data_origin = 'seeded'
      and user_id = pg_temp.data01_user('U1')) <> 11
     or (select count(*) from public.order_items where order_id::text like '0da7a00d-%') <> 37
     or (select count(*) from public.events where event_id::text like '0da7a00f-%' and data_origin = 'seeded') <> 74 then
    problems := array_append(problems, 'order history'); end if;
  if cardinality(problems) > 0 then
    raise exception 'DATA-01: existing rows conflict with the fixed demo ids: %', array_to_string(problems, ', ');
  end if;
end$$;

select 'DATA-01 seeded' as result,
  (select count(*) from public.stores where id::text like '0da7a001-%') as stores,
  (select count(*) from public.products where id::text like '0da7a002-%') as products,
  (select count(*) from public.ad_calls where id::text like '0da7a005-%') as ad_calls,
  (select count(*) from public.ad_applications where id::text like '0da7a008-%') as applications,
  (select count(*) from public.orders where id::text like '0da7a00d-%') as seeded_orders;
commit;
