-- #189: the store pick (「店舗からのおすすめ」) for the demo store is spaghetti. The App always chooses this promotion
-- first while it is active (DEMO_PINNED_STORE_PICKS in selection.ts), whatever other promotions Insight has.
-- Owner only, after DATA-01. Re-runnable; an existing promotion/version is never changed and a stopped one is
-- never re-enabled (stop it in Insight to remove it). App channel, all day, 2026-10-25 .. 2026-11-07 JST.
-- Fixed UUIDs: promotion 0de0f008-0000-4000-8000-000000000001, version 0de0f008-0000-4000-8000-000000000002.
begin;
do $$begin
  if not exists (select from public.store_products sp join public.products p on p.id = sp.product_id
      where sp.store_id = '0da7a001-0000-4000-8000-000000000001'::uuid and p.code = '2900000000100' and sp.is_active) then
    raise exception 'STORE PICK: run DATA-01 first (spaghetti must be sold in DATA-01 S1)'; end if;
end$$;
insert into public.store_promotions(id, store_id, product_id)
select '0de0f008-0000-4000-8000-000000000001'::uuid, '0da7a001-0000-4000-8000-000000000001'::uuid, p.id
from public.products p where p.code = '2900000000100'
on conflict (id) do nothing;
insert into public.promotion_versions(id, promotion_id, version, channels, time_windows, priority, reason_text, starts_at, ends_at)
select '0de0f008-0000-4000-8000-000000000002'::uuid, '0de0f008-0000-4000-8000-000000000001'::uuid, 1, array['app'], '[]'::jsonb, 100,
  'デモ：店舗がおすすめするスパゲッティです。', '2026-10-25T00:00:00+09', '2026-11-07T00:00:00+09'
where not exists (select from public.promotion_versions where promotion_id = '0de0f008-0000-4000-8000-000000000001'::uuid);
do $$begin
  if not exists (select from public.store_promotions sp join public.products p on p.id = sp.product_id
      where sp.id = '0de0f008-0000-4000-8000-000000000001'::uuid and p.code = '2900000000100'
        and sp.store_id = '0da7a001-0000-4000-8000-000000000001'::uuid) then
    raise exception 'STORE PICK: existing promotion ID differs; nothing was changed'; end if;
end$$;
commit;
