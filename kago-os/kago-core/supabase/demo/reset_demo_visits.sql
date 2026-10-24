-- DEMO-11 #121. Owner only. Enable explicitly in the SAME SQL session:
-- select set_config('kago.demo_reset','DEMO-11',false);
-- Then execute this file on kago-os-dev only, after DEMO-05.
-- No deletes: preserve past orders, rates, and evidence from previous rehearsals.
begin;
do $$
declare actor record; shop uuid := '0da7a001-0000-4000-8000-000000000001'; at_time timestamptz;
begin
 if current_setting('kago.demo_reset',true) is distinct from 'DEMO-11' then raise exception 'DEMO-11: explicit demo reset confirmation is required'; end if;
 if not exists(select from public.stores where id=shop and slug='hiroshima-demo-store')
 or not exists(select from public.orders where id='0de0050d-0000-4000-8000-000000000001' and data_origin='seeded') then
  raise exception 'DEMO-11: expected DATA-01 store / DEMO-05 marker missing';
 end if;
 if (select count(*) from auth.users where lower(email) in ('misaki.sato@example.test','ken.tanaka@example.test','yui.suzuki@example.test')
  and raw_app_meta_data#>'{kago,roles}'='["customer"]'::jsonb)<>3 then raise exception 'DEMO-11: exact three demo customers required'; end if;
 for actor in select id from auth.users where lower(email) in ('misaki.sato@example.test','ken.tanaka@example.test','yui.suzuki@example.test') order by id loop
  -- Same per-user/store lock as app_start_visit prevents a simultaneous duplicate start.
  perform pg_advisory_xact_lock(hashtextextended(actor.id::text||':'||shop::text,0));
  perform 1 from public.visits where user_id=actor.id and store_id=shop and status='active' for update;
  select greatest(clock_timestamp(),coalesce(max(started_at),clock_timestamp()),coalesce(max(last_activity_at),clock_timestamp()))
   into at_time from public.visits where user_id=actor.id and store_id=shop and status='active';
  update public.visits set status='abandoned',ended_at=at_time,last_activity_at=at_time
   where user_id=actor.id and store_id=shop and status='active';
  insert into public.visits(user_id,store_id,started_at,last_activity_at) values(actor.id,shop,at_time,at_time);
 end loop;
end$$;
-- Make the opt-in one-use; each subsequent reset needs explicit confirmation again.
select set_config('kago.demo_reset','',false);
commit;
select u.email,count(*) as active_visits from public.visits v join auth.users u on u.id=v.user_id
where v.store_id='0da7a001-0000-4000-8000-000000000001' and v.status='active'
 and lower(u.email) in ('misaki.sato@example.test','ken.tanaka@example.test','yui.suzuki@example.test') group by u.email order by u.email;
