-- #148: Owner-only, demo/verification DB, after DATA-01 + APP-13.
-- Four rehearsal offers valid for the execution day in JST (00:00 through next 00:00).
-- Run again on the rehearsal day. Same-day reruns add nothing; old offers expire naturally.
-- No existing offers/prices/history/carts are changed; a stopped offer is never re-enabled.
begin;
create temp table offer_scenarios(n integer primary key, kind text, code text, trigger_code text,
  rate integer, headline text) on commit drop;
insert into offer_scenarios values
 (1,'set_deal','2900000000162','2900000000100',10,'デモ：パスタ＋ソース 10%OFF'),
 (2,'set_deal','2900000000056','2900000000049',10,'デモ：牛乳＋食パン 10%OFF'),
 (3,'time_sale','2900000000049',null,20,'デモ：牛乳タイムセール 20%OFF'),
 (4,'time_sale','PLU-2002',null,20,'デモ：唐揚げタイムセール 20%OFF');

do $$begin
  if not exists(select from public.stores where id='0da7a001-0000-4000-8000-000000000001'::uuid
    and slug='hiroshima-demo-store') then
    raise exception 'OFFER DEMO: DATA-01 S1 is missing; do not substitute another store'; end if;
  if exists(select from offer_scenarios s left join public.products p on p.code=s.code
    left join public.store_products sp on sp.product_id=p.id and sp.store_id='0da7a001-0000-4000-8000-000000000001'::uuid
    where not coalesce(sp.is_active,false)) or exists(
    select from offer_scenarios s left join public.products p on p.code=s.trigger_code
    left join public.store_products sp on sp.product_id=p.id and sp.store_id='0da7a001-0000-4000-8000-000000000001'::uuid
    where s.trigger_code is not null and not coalesce(sp.is_active,false)) then
    raise exception 'OFFER DEMO: active DATA-01 store products are missing'; end if;
end$$;

create temp table resolved_offer_scenarios on commit drop as
select md5('kago-offer-demo-v1:' || (now() at time zone 'Asia/Tokyo')::date::text || ':' || s.n)::uuid as id,
  '0da7a001-0000-4000-8000-000000000001'::uuid as store_id,s.kind,p.id as product_id,t.id as trigger_product_id,
  s.rate,s.headline,
  date_trunc('day',now() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo' as starts_at,
  (date_trunc('day',now() at time zone 'Asia/Tokyo')+interval '1 day') at time zone 'Asia/Tokyo' as ends_at
from offer_scenarios s join public.products p on p.code=s.code left join public.products t on t.code=s.trigger_code;
-- Reuse an equivalent existing offer valid through today's end (e.g. APP-13's pasta set).
delete from resolved_offer_scenarios r
where not exists(select from public.store_offers own where own.id=r.id)
  and exists(select from public.store_offers o where o.store_id=r.store_id and o.kind=r.kind
    and o.product_id=r.product_id and o.trigger_product_id is not distinct from r.trigger_product_id
    and o.discount_percent=r.rate and o.discount_amount is null and o.status='active'
    and o.starts_at<=now() and o.ends_at>=r.ends_at);
insert into public.store_offers(id,store_id,kind,product_id,trigger_product_id,discount_percent,headline,starts_at,ends_at)
select id,store_id,kind,product_id,trigger_product_id,rate,headline,starts_at,ends_at from resolved_offer_scenarios
on conflict(id) do nothing;
do $$begin
  if exists(select from resolved_offer_scenarios r left join public.store_offers o on o.id=r.id
    where (o.store_id,o.kind,o.product_id,o.trigger_product_id,o.discount_percent,o.headline,o.starts_at,o.ends_at)
      is distinct from (r.store_id,r.kind,r.product_id,r.trigger_product_id,r.rate,r.headline,r.starts_at,r.ends_at)
      or o.discount_amount is not null) then
    raise exception 'OFFER DEMO: existing offer ID has different terms; nothing was changed'; end if;
end$$;
select 'OFFER DEMO prepared for today (JST)' as result,count(*) as offers,
  count(*) filter(where o.status='active') as active_offers,min(o.ends_at) as ends_at
from public.store_offers o join resolved_offer_scenarios r on r.id=o.id;
commit;
