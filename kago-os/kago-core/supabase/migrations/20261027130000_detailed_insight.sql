-- INS-05: own-store aggregate metrics. No customer/visit/event identifiers returned.
begin;
create index events_removal_feedback_reference_idx on public.events ((payload->>'removal_event_id'))
 where event_type in ('removal_reason_prompted','removal_reason_skipped','removal_reason_submitted');

create function public.kago_detailed_insight(p_start timestamptz,p_end timestamptz,p_store_id uuid,p_origin text default 'operated')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.kago_is_store_staff(p_store_id) then raise exception 'Store not available' using errcode='42501'; end if;
 if p_start is null or p_end is null or not isfinite(p_start) or not isfinite(p_end)
    or p_start>=p_end or p_end-p_start>interval '31 days' or p_origin is null
    or p_origin not in ('operated','seeded','synthetic') then
  raise exception 'Invalid reporting period or origin' using errcode='22023';
 end if;
 with e as materialized (
  select event_id,event_type,selection_item_id,payload,occurred_at from public.events
  where store_id=p_store_id and data_origin=p_origin and occurred_at>=p_start and occurred_at<p_end
 ), seen as (select selection_item_id,min(occurred_at) shown_at from e where event_type='recommendation_impression' group by selection_item_id),
 methods as (
  select si.placement_type,si.reason_code,count(*) shown,
   count(*) filter(where exists(select 1 from e a where a.event_type='cart_item_added'
    and a.selection_item_id=si.id and a.occurred_at>=seen.shown_at and a.payload->>'source'='recommendation')) added,
   count(*) filter(where exists(select 1 from e d where d.event_type='recommendation_dismissed' and d.selection_item_id=si.id and d.occurred_at>=seen.shown_at)) dismissed
  from seen join public.selection_items si on si.id=seen.selection_item_id group by si.placement_type,si.reason_code
 ), removed as (select event_id from e where event_type='cart_item_removed'),
 feedback as (
  select r.event_id,
   case when exists(select 1 from public.events f where f.store_id=p_store_id and f.data_origin=p_origin
      and f.event_type='removal_reason_submitted' and f.payload->>'removal_event_id'=r.event_id::text) then 'submitted'
    when exists(select 1 from public.events f where f.store_id=p_store_id and f.data_origin=p_origin
      and f.event_type='removal_reason_skipped' and f.payload->>'removal_event_id'=r.event_id::text) then 'skipped'
    when exists(select 1 from public.events f where f.store_id=p_store_id and f.data_origin=p_origin
      and f.event_type='removal_reason_prompted' and f.payload->>'removal_event_id'=r.event_id::text) then 'unanswered'
    else 'uncollected' end status,
   (select case when f.payload->>'reason' in ('価格が合わない','買う予定が変わった','別の商品にする','その他')
      then f.payload->>'reason' else 'その他の入力理由' end
    from public.events f where f.store_id=p_store_id and f.data_origin=p_origin and f.event_type='removal_reason_submitted'
     and f.payload->>'removal_event_id'=r.event_id::text order by f.occurred_at,f.event_id limit 1) reason
   from removed r
 ), statuses as (select status,count(*) count from feedback group by status),
 reasons as (select reason,count(*) count from feedback where status='submitted' group by reason)
 select jsonb_build_object(
  'methods',coalesce((select jsonb_agg(to_jsonb(m) order by placement_type,reason_code) from methods m),'[]'::jsonb),
  'removal_statuses',coalesce((select jsonb_agg(to_jsonb(s) order by status) from statuses s),'[]'::jsonb),
  'removal_reasons',coalesce((select jsonb_agg(to_jsonb(r) order by reason) from reasons r),'[]'::jsonb),
  'compared',(select count(*) from e where event_type='product_compared'),
  'unshown_adds',(select count(distinct selection_item_id) from e a where event_type='cart_item_added'
      and payload->>'source'='recommendation' and not exists(select 1 from seen s where s.selection_item_id=a.selection_item_id and a.occurred_at>=s.shown_at)),
  'unshown_dismissals',(select count(distinct selection_item_id) from e a where event_type='recommendation_dismissed'
      and not exists(select 1 from seen s where s.selection_item_id=a.selection_item_id and a.occurred_at>=s.shown_at)),
  'removals',(select count(*) from removed)
 ) into result;
 return result;
end;
$$;
revoke all on function public.kago_detailed_insight(timestamptz,timestamptz,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.kago_detailed_insight(timestamptz,timestamptz,uuid,text) to authenticated;
comment on function public.kago_detailed_insight(timestamptz,timestamptz,uuid,text) is
 'INS-05 own-store aggregates. App observed-slot denominators; origin separated; removal-level feedback states; no individual IDs or raw free text.';
commit;
