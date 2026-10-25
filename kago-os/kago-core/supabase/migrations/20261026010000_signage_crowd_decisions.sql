-- SIG-06: active-device-only aggregates and immutable play-linked decisions.
begin;
create function public.kago_signage_crowd()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare sid uuid:=public.kago_my_device_store_id(); n integer; cats jsonb; observed timestamptz:=statement_timestamp();
begin
 if sid is null then raise exception 'Active signage device required' using errcode='42501'; end if;
 select count(distinct user_id) into n from public.visits where store_id=sid and status='active'
   and last_activity_at>=observed-interval '15 minutes' and last_activity_at<=observed;
 if n<5 then n:=0; cats:='[]'; else
  select coalesce(jsonb_agg(jsonb_build_object('category',category,'visits',cnt) order by category),'[]') into cats from (
   select p.category,count(distinct v.user_id)::integer cnt
   from public.visits v join public.cart_items ci on ci.visit_id=v.id join public.products p on p.id=ci.product_id
   where v.store_id=sid and v.status='active' and v.last_activity_at>=observed-interval '15 minutes'
    and v.last_activity_at<=observed and exists (
     select 1 from public.ad_placements a join public.creative_versions cv on cv.id=a.creative_version_id
       join public.creatives c on c.id=cv.creative_id join public.products ap on ap.id=c.product_id
     where a.store_id=sid and a.status='active' and 'signage'=any(a.channels)
      and a.starts_at<=observed and observed<a.ends_at and ap.category=p.category)
   group by p.category having count(distinct v.user_id)>=5 order by p.category limit 100
  ) x;
 end if;
 return jsonb_build_object('schema_version',1,'store_id',sid,'data_origin','operated',
  'observed_at',observed,'expires_at',observed+interval '5 minutes','sample_size',n,'categories',cats);
end; $$;
revoke all on function public.kago_signage_crowd() from public,anon;
grant execute on function public.kago_signage_crowd() to authenticated;

create table public.signage_decisions(
 play_id uuid primary key references public.signage_plays(id) on delete restrict,
 device_id uuid not null references public.signage_devices(id) on delete restrict,
 store_id uuid not null references public.stores(id) on delete restrict,
 decision jsonb not null,
 recorded_at timestamptz not null default now()
);
create index signage_decisions_store_idx on public.signage_decisions(store_id,recorded_at desc);
alter table public.signage_decisions enable row level security;
revoke all on public.signage_decisions from public,anon,authenticated;
grant select on public.signage_decisions to authenticated;
create policy signage_decisions_store_read on public.signage_decisions for select to authenticated
 using (public.kago_is_store_staff(store_id));

create function public.kago_record_signage_decision(p_play_id uuid,p_decision jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare did uuid:=public.kago_my_device_id(); sid uuid:=public.kago_my_device_store_id();
 p public.signage_plays%rowtype; s jsonb; x jsonb; previous jsonb; n integer; selected timestamptz;
begin
 if did is null then raise exception 'Active signage device required' using errcode='42501'; end if;
 select * into p from public.signage_plays where id=p_play_id and device_id=did;
 if not found then raise exception 'Own completed play required' using errcode='42501'; end if;
 if jsonb_typeof(p_decision) is distinct from 'object'
  or not p_decision ?& array['policy_version','store_id','selected_at','selected_key','reason_code','reason_text','weights','snapshot']
  or (select count(*) from jsonb_object_keys(p_decision))<>8
  or p_decision->>'policy_version' is distinct from 'sig06-crowd-v1' or p_decision->>'store_id' is distinct from sid::text
  or p_decision->>'reason_code' is distinct from p.reason_code
  or p.reason_code not in ('crowd_category','crowd_small','crowd_missing','crowd_invalid','crowd_expired','crowd_no_match','crowd_no_content')
  or (p_decision->>'selected_key') is distinct from p.ad_placement_id::text
  or jsonb_typeof(p_decision->'reason_text') is distinct from 'string'
  or length(p_decision->>'reason_text')>160
  or jsonb_typeof(p_decision->'weights') is distinct from 'array'
  or jsonb_array_length(p_decision->'weights')>100
 then raise exception 'Invalid decision' using errcode='23514'; end if;
 selected:=(p_decision->>'selected_at')::timestamptz;
 if selected is null or abs(extract(epoch from(selected-p.started_at)))>5 then
  raise exception 'Selection time must match play' using errcode='23514'; end if;
 for x in select value from jsonb_array_elements(p_decision->'weights') loop
  if jsonb_typeof(x) is distinct from 'object' or not x ?& array['key','weight']
   or (select count(*) from jsonb_object_keys(x))<>2 or jsonb_typeof(x->'weight') is distinct from 'number'
   or (x->>'weight')::numeric not between 0 and 1 or not exists (
    select 1 from public.ad_placements a where a.id::text=x->>'key' and a.store_id=sid and 'signage'=any(a.channels))
  then raise exception 'Invalid weights' using errcode='23514'; end if;
 end loop;
 s:=p_decision->'snapshot';
 if s is distinct from 'null'::jsonb then
  if jsonb_typeof(s) is distinct from 'object'
   or not s ?& array['schema_version','store_id','data_origin','observed_at','expires_at','sample_size','categories']
   or (select count(*) from jsonb_object_keys(s))<>7 or s->'schema_version' is distinct from '1'::jsonb
   or s->>'store_id' is distinct from sid::text or s->>'data_origin' is distinct from 'operated'
   or jsonb_typeof(s->'observed_at') is distinct from 'string' or jsonb_typeof(s->'expires_at') is distinct from 'string'
   or not public.kago_jsonb_is_int(s->'sample_size')
   or (s->>'sample_size')::integer not between 5 and 100000
   or jsonb_typeof(s->'categories') is distinct from 'array' or jsonb_array_length(s->'categories')>100
  then raise exception 'Invalid aggregate' using errcode='23514'; end if;
  n:=(s->>'sample_size')::integer;
  if (s->>'observed_at')::timestamptz>selected or (s->>'expires_at')::timestamptz<=selected
   or (s->>'expires_at')::timestamptz>(s->>'observed_at')::timestamptz+interval '5 minutes'
   or (s->>'expires_at')::timestamptz<=(s->>'observed_at')::timestamptz
  then raise exception 'Stale aggregate' using errcode='23514'; end if;
  for x in select value from jsonb_array_elements(s->'categories') loop
   if jsonb_typeof(x) is distinct from 'object' or not x ?& array['category','visits']
    or (select count(*) from jsonb_object_keys(x))<>2 or not public.kago_jsonb_is_int(x->'visits')
    or (x->>'visits')::integer not between 5 and n or not exists (
     select 1 from public.products pr join public.store_products sp on sp.product_id=pr.id
     where sp.store_id=sid and pr.category=x->>'category')
   then raise exception 'Invalid aggregate category' using errcode='23514'; end if;
  end loop;
 end if;
 if p.reason_code='crowd_category' and (s='null'::jsonb or p.mode<>'adaptive') then
  raise exception 'Adaptive play needs aggregate' using errcode='23514'; end if;
 -- Do not store arbitrary terminal-provided text: only controlled reason descriptions.
 p_decision:=jsonb_set(p_decision,'{reason_text}',to_jsonb(case p.reason_code
  when 'crowd_category' then '店内の集計傾向に合う広告を選びました（端末報告）'
  when 'crowd_small' then '人数が少ないため、汎用のご案内を表示します'
  when 'crowd_expired' then '集計の有効期限が切れたため、汎用のご案内を表示します'
  else '集計または有効な広告がないため、汎用のご案内を表示します' end));
 insert into public.signage_decisions(play_id,device_id,store_id,decision) values(p_play_id,did,sid,p_decision)
  on conflict(play_id) do nothing;
 select decision into previous from public.signage_decisions where play_id=p_play_id;
 if previous is distinct from p_decision then raise exception 'Conflicting decision retry' using errcode='23514'; end if;
end; $$;
revoke all on function public.kago_record_signage_decision(uuid,jsonb) from public,anon;
grant execute on function public.kago_record_signage_decision(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
