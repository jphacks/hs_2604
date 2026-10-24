-- DB-09: aggregate-only read paths. Underlying facts are never granted to API roles.
begin;

create view public.kago_app_cohorts_internal as
with first_impressions as (
  select distinct on (e.visit_id,e.product_id,si.placement_type,e.data_origin)
    e.visit_id,e.product_id,si.placement_type,e.data_origin,e.occurred_at as first_at,
    e.store_id,si.ad_placement_id,si.promotion_version_id,s.rule_version,v.ended_at
  from public.events e
  join public.selection_items si on si.id=e.selection_item_id
  join public.selections s on s.id=si.selection_id
  join public.visits v on v.id=e.visit_id
  where e.event_type='recommendation_impression' and e.occurred_at>=v.started_at
    and (v.ended_at is null or e.occurred_at<=v.ended_at)
  order by e.visit_id,e.product_id,si.placement_type,e.data_origin,e.occurred_at,e.event_id
)
select f.*,
  exists(select 1 from public.events e join public.selection_items si on si.id=e.selection_item_id
    where e.visit_id=f.visit_id and e.product_id=f.product_id and e.data_origin=f.data_origin
      and si.placement_type=f.placement_type and e.event_type='recommendation_click'
      and e.occurred_at>=f.first_at and (f.ended_at is null or e.occurred_at<=f.ended_at)) as clicked,
  a.added_at is not null as recommendation_added,
  exists(select 1 from public.events e where e.visit_id=f.visit_id and e.product_id=f.product_id
    and e.data_origin=f.data_origin and e.event_type='cart_item_added' and e.occurred_at>=f.first_at
    and (f.ended_at is null or e.occurred_at<=f.ended_at)) as added_after_impression,
  exists(select 1 from public.events e where e.visit_id=f.visit_id and e.product_id=f.product_id
    and e.data_origin=f.data_origin and e.event_type='cart_item_removed' and e.occurred_at>=a.added_at
    and (f.ended_at is null or e.occurred_at<=f.ended_at)
    and (o.ordered_at is null or e.occurred_at<o.ordered_at)) as recommendation_removed,
  o.id is not null as purchased,
  coalesce(oi.quantity::bigint,0) as purchased_quantity,
  coalesce(oi.quantity::bigint*oi.unit_price,0) as purchase_amount
from first_impressions f
left join lateral (
  select min(e.occurred_at) as added_at from public.events e
  join public.selection_items si on si.id=e.selection_item_id
  where e.visit_id=f.visit_id and e.product_id=f.product_id and e.data_origin=f.data_origin
    and si.placement_type=f.placement_type and e.event_type='cart_item_added'
    and e.payload->>'source'='recommendation' and e.occurred_at>=f.first_at
    and (f.ended_at is null or e.occurred_at<=f.ended_at)
) a on true
left join public.orders o on o.visit_id=f.visit_id and o.store_id=f.store_id
  and o.data_origin=f.data_origin and o.ordered_at>=f.first_at
  and (f.ended_at is null or o.ordered_at<=f.ended_at)
  and exists(select 1 from public.order_items i where i.order_id=o.id and i.product_id=f.product_id)
left join public.order_items oi on oi.order_id=o.id and oi.product_id=f.product_id;
revoke all on public.kago_app_cohorts_internal from public,anon,authenticated,service_role;

create function public.kago_app_metrics(
  p_start timestamptz default '-infinity',p_end timestamptz default 'infinity',
  p_store_id uuid default null,p_data_origin text default null
) returns table (
  store_id uuid,channel text,data_origin text,placement_type text,
  ad_placement_id uuid,promotion_version_id uuid,rule_version integer,
  impressions bigint,shown_visits bigint,clicks bigint,recommendation_adds bigint,
  adds_after_impression bigint,recommendation_removes bigint,purchases bigint,
  purchased_quantity numeric,purchase_amount numeric,small_sample boolean,disclosed_metrics text[]
) language plpgsql stable security definer set search_path='' as $$
begin
  if p_start is null or p_end is null or p_start>=p_end or
    (p_data_origin is not null and p_data_origin not in ('operated','seeded','synthetic')) then
    raise exception 'Invalid reporting period or origin' using errcode='22023';
  end if;
  return query
  with allowed as (
    select f.*,public.kago_is_store_staff(f.store_id) as internal,
      c.disclosure_scope
    from public.kago_app_cohorts_internal f
    left join public.ad_placements ap on ap.id=f.ad_placement_id
    left join public.ad_applications a on a.id=ap.application_id
    left join public.ad_calls c on c.id=a.ad_call_id
    where f.first_at>=p_start and f.first_at<p_end
      and (p_store_id is null or f.store_id=p_store_id)
      and (p_data_origin is null or f.data_origin=p_data_origin)
      and (public.kago_is_store_staff(f.store_id) or
        (f.placement_type='sponsored' and public.kago_is_maker_staff(a.maker_id)))
  ), grouped as (
    select f.store_id,f.data_origin,f.placement_type,f.ad_placement_id,f.promotion_version_id,f.rule_version,
      f.internal,f.disclosure_scope,
      count(*) as n,count(distinct f.visit_id) as nv,
      count(*) filter(where f.clicked) as nc,
      count(*) filter(where f.recommendation_added) as na,
      count(*) filter(where f.added_after_impression) as naa,
      count(*) filter(where f.recommendation_removed) as nr,
      count(*) filter(where f.purchased) as np,
      sum(f.purchased_quantity) as nq,sum(f.purchase_amount) as amount
    from allowed f group by f.store_id,f.data_origin,f.placement_type,f.ad_placement_id,
      f.promotion_version_id,f.rule_version,f.internal,f.disclosure_scope
  ) select g.store_id,'app'::text,g.data_origin,g.placement_type,g.ad_placement_id,g.promotion_version_id,g.rule_version,
    case when g.internal or 'impressions'=any(g.disclosure_scope) then g.n end,
    case when g.internal or 'impressions'=any(g.disclosure_scope) then g.nv end,
    case when g.internal or 'clicks'=any(g.disclosure_scope) then g.nc end,
    case when g.internal or 'cart_adds'=any(g.disclosure_scope) then g.na end,
    case when g.internal or 'cart_adds'=any(g.disclosure_scope) then g.naa end,
    case when g.internal or 'cart_adds'=any(g.disclosure_scope) then g.nr end,
    case when g.internal or 'purchases'=any(g.disclosure_scope) then g.np end,
    case when g.internal or 'purchases'=any(g.disclosure_scope) then g.nq end,
    case when g.internal or 'purchases'=any(g.disclosure_scope) then g.amount end,
    case when g.internal or 'impressions'=any(g.disclosure_scope) then g.nv<5 end,
    case when g.internal then array['impressions','clicks','cart_adds','purchases'] else g.disclosure_scope end
  from grouped g;
end;
$$;

create function public.kago_signage_metrics(
  p_start timestamptz default '-infinity',p_end timestamptz default 'infinity',
  p_store_id uuid default null,p_data_origin text default null
) returns table (
  store_id uuid,channel text,data_origin text,device_id uuid,hour_start timestamptz,
  ad_placement_id uuid,promotion_version_id uuid,mode text,
  plays bigint,play_seconds numeric,measured_plays bigint,not_measured_plays bigint,error_plays bigint,
  estimated_viewers bigint,estimated_view_seconds numeric,synthetic_estimates bigint,
  synthetic_viewers bigint,synthetic_view_seconds numeric,
  reference_sales_quantity numeric,disclosed_metrics text[]
) language plpgsql stable security definer set search_path='' as $$
begin
  if p_start is null or p_end is null or p_start>=p_end or
    (p_data_origin is not null and p_data_origin not in ('operated','seeded','synthetic')) then
    raise exception 'Invalid reporting period or origin' using errcode='22023';
  end if;
  return query
  with allowed as (
    select p.*,d.store_id,date_trunc('hour',p.started_at at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo' as bucket,
      coalesce(cr.product_id,sp.product_id) as product_id,
      public.kago_is_store_staff(d.store_id) as internal,c.disclosure_scope,
      ae.measurement_status,ae.estimated_viewers,ae.estimated_view_seconds,ae.data_origin as estimate_origin
    from public.signage_plays p join public.signage_devices d on d.id=p.device_id
    left join public.ad_placements ap on ap.id=p.ad_placement_id
    left join public.ad_applications a on a.id=ap.application_id
    left join public.ad_calls c on c.id=a.ad_call_id
    left join public.creative_versions cv on cv.id=p.creative_version_id
    left join public.creatives cr on cr.id=cv.creative_id
    left join public.promotion_versions pv on pv.id=p.promotion_version_id
    left join public.store_promotions sp on sp.id=pv.promotion_id
    left join public.audience_estimates ae on ae.play_id=p.id
    where p.mode<>'fallback' and p.ended_at-p.started_at>=interval '3 seconds'
      and p.started_at>=p_start and p.started_at<p_end
      and (p_store_id is null or d.store_id=p_store_id)
      and (p_data_origin is null or p.data_origin=p_data_origin)
      and (public.kago_is_store_staff(d.store_id) or public.kago_is_maker_staff(a.maker_id))
  ), grouped as (
    select f.store_id,f.data_origin,f.device_id,f.bucket,f.ad_placement_id,f.promotion_version_id,f.mode,
      f.product_id,f.internal,f.disclosure_scope,
      count(*) as n,sum(extract(epoch from(f.ended_at-f.started_at))) as seconds,
      count(*) filter(where f.measurement_status='measured' and f.estimate_origin=f.data_origin) as nm,
      count(*) filter(where f.measurement_status is null or (f.measurement_status='not_measured' and f.estimate_origin=f.data_origin)) as nn,
      count(*) filter(where f.measurement_status='error' and f.estimate_origin=f.data_origin) as ne,
      sum(f.estimated_viewers) filter(where f.measurement_status='measured' and f.estimate_origin=f.data_origin) as viewers,
      sum(f.estimated_view_seconds) filter(where f.measurement_status='measured' and f.estimate_origin=f.data_origin) as view_seconds,
      count(*) filter(where f.estimate_origin='synthetic' and f.data_origin<>'synthetic') as ns,
      sum(f.estimated_viewers) filter(where f.measurement_status='measured' and f.estimate_origin='synthetic' and f.data_origin<>'synthetic') as synthetic_viewers,
      sum(f.estimated_view_seconds) filter(where f.measurement_status='measured' and f.estimate_origin='synthetic' and f.data_origin<>'synthetic') as synthetic_seconds
    from allowed f group by f.store_id,f.data_origin,f.device_id,f.bucket,f.ad_placement_id,f.promotion_version_id,
      f.mode,f.product_id,f.internal,f.disclosure_scope
  ) select g.store_id,'signage'::text,g.data_origin,g.device_id,g.bucket,g.ad_placement_id,g.promotion_version_id,g.mode,
    case when g.internal or 'signage_views'=any(g.disclosure_scope) then g.n end,
    case when g.internal or 'signage_views'=any(g.disclosure_scope) then g.seconds end,
    case when g.internal or 'signage_views'=any(g.disclosure_scope) then g.nm end,
    case when g.internal or 'signage_views'=any(g.disclosure_scope) then g.nn end,
    case when g.internal or 'signage_views'=any(g.disclosure_scope) then g.ne end,
    case when g.internal or 'signage_views'=any(g.disclosure_scope) then g.viewers end,
    case when g.internal or 'signage_views'=any(g.disclosure_scope) then g.view_seconds end,
    case when g.internal or 'signage_views'=any(g.disclosure_scope) then g.ns end,
    case when g.internal or 'signage_views'=any(g.disclosure_scope) then g.synthetic_viewers end,
    case when g.internal or 'signage_views'=any(g.disclosure_scope) then g.synthetic_seconds end,
    case when g.internal or 'purchases'=any(g.disclosure_scope) then (
      select coalesce(sum(i.quantity::bigint),0) from public.orders o join public.order_items i on i.order_id=o.id
      where o.store_id=g.store_id and i.product_id=g.product_id and o.data_origin=g.data_origin
        and o.ordered_at>=g.bucket and o.ordered_at<g.bucket+interval '1 hour') end,
    case when g.internal then array['signage_views','purchases'] else g.disclosure_scope end
  from grouped g;
end;
$$;

-- API views expose aggregates only; period-filtered RPCs avoid summing distinct counts across days.
create view public.kago_app_metrics_view with (security_barrier=true) as select * from public.kago_app_metrics();
create view public.kago_signage_metrics_view with (security_barrier=true) as select * from public.kago_signage_metrics();
-- Selection provenance is not present in DB-05: never guess that unshown slots were operated.
create view public.kago_selection_counts with (security_barrier=true) as
  select v.store_id,date_trunc('day',s.created_at at time zone 'Asia/Tokyo') as day_jst,
    si.placement_type,si.ad_placement_id,si.promotion_version_id,s.rule_version,
    'unclassified'::text as data_origin,count(*) as selected_slots
  from public.selections s join public.visits v on v.id=s.visit_id
  join public.selection_items si on si.selection_id=s.id
  where public.kago_is_store_staff(v.store_id)
  group by v.store_id,day_jst,si.placement_type,si.ad_placement_id,si.promotion_version_id,s.rule_version;

create function public.kago_order_totals(p_start timestamptz,p_end timestamptz,p_store_id uuid)
returns table(data_origin text,orders bigint,quantity numeric,amount numeric)
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.kago_is_store_staff(p_store_id) then raise exception 'Store not available' using errcode='42501'; end if;
  if p_start is null or p_end is null or p_start>=p_end then raise exception 'Invalid reporting period' using errcode='22023'; end if;
  return query select o.data_origin,count(distinct o.id),coalesce(sum(i.quantity),0),coalesce(sum(i.amount),0)
    from public.orders o left join lateral (
      select sum(oi.quantity::bigint) as quantity,sum(oi.quantity::bigint*oi.unit_price) as amount
      from public.order_items oi where oi.order_id=o.id) i on true
    where o.store_id=p_store_id and o.ordered_at>=p_start and o.ordered_at<p_end group by o.data_origin;
end;
$$;

revoke all on function public.kago_app_metrics(timestamptz,timestamptz,uuid,text),
  public.kago_signage_metrics(timestamptz,timestamptz,uuid,text),public.kago_order_totals(timestamptz,timestamptz,uuid)
  from public,anon,service_role;
grant execute on function public.kago_app_metrics(timestamptz,timestamptz,uuid,text),
  public.kago_signage_metrics(timestamptz,timestamptz,uuid,text),public.kago_order_totals(timestamptz,timestamptz,uuid) to authenticated;
revoke all on public.kago_app_metrics_view,public.kago_signage_metrics_view,public.kago_selection_counts from public,anon,authenticated,service_role;
grant select on public.kago_app_metrics_view,public.kago_signage_metrics_view,public.kago_selection_counts to authenticated;
commit;
