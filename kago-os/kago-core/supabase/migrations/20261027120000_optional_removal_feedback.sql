-- APP-12: distinguish offered/skipped feedback from uncollected reasons.
begin;
create or replace function public.kago_is_valid_event(event_type text, payload jsonb,
  selection_item_id uuid, product_id uuid)
returns boolean language plpgsql immutable set search_path = '' as $$
declare src text; qty jsonb; delta jsonb; ver jsonb; ids jsonb;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then return false; end if;
  case event_type
  when 'product_scanned' then
    return coalesce(product_id is not null and selection_item_id is null
      and payload->>'method' in ('barcode','manual'), false);
  when 'scan_failed' then
    return coalesce(product_id is null and selection_item_id is null
      and jsonb_typeof(payload->'reason') = 'string' and btrim(payload->>'reason') <> ''
      and (payload->'code' is null or jsonb_typeof(payload->'code') = 'string'), false);
  when 'cart_item_added', 'cart_quantity_changed', 'cart_item_removed' then
    src := payload->>'source'; qty := payload->'quantity'; delta := payload->'quantity_delta';
    ver := payload->'cart_version';
    if product_id is null or src is null or src not in ('scan','manual','recommendation')
       or (src = 'recommendation') <> (selection_item_id is not null)
       or not public.kago_jsonb_is_int(qty) or not public.kago_jsonb_is_int(delta)
       or not public.kago_jsonb_is_int(ver) or ver::text::integer < 1 then
      return false;
    end if;
    return coalesce(case event_type
      when 'cart_item_added' then qty::text::integer >= 1 and delta::text::integer = qty::text::integer
      when 'cart_quantity_changed' then qty::text::integer >= 1 and delta::text::integer <> 0
      else qty::text::integer = 0 and delta::text::integer < 0 end, false);
  when 'recommendation_impression' then
    return coalesce(product_id is not null and selection_item_id is not null
      and public.kago_jsonb_is_int(payload->'visible_ms') and (payload->>'visible_ms')::integer >= 1000, false);
  when 'recommendation_click' then
    return coalesce(product_id is not null and selection_item_id is not null
      and payload->>'target' in ('detail','add_button'), false);
  when 'recommendation_dismissed' then
    return coalesce(product_id is not null and selection_item_id is not null, false);
  when 'product_compared' then
    ids := payload->'product_ids';
    return coalesce(selection_item_id is null and jsonb_typeof(ids) = 'array' and jsonb_array_length(ids) >= 2
      and not exists (select 1 from jsonb_array_elements(ids) e
        where jsonb_typeof(e) <> 'string'
          or e #>> '{}' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
      and jsonb_array_length(ids) = (select count(distinct e) from jsonb_array_elements(ids) e), false);
  when 'removal_reason_prompted' then
    return coalesce(selection_item_id is null and product_id is not null
      and jsonb_typeof(payload->'removal_event_id') = 'string'
      and payload->>'removal_event_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', false);
  when 'removal_reason_skipped' then
    return coalesce(selection_item_id is null and product_id is not null
      and jsonb_typeof(payload->'removal_event_id') = 'string'
      and payload->>'removal_event_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', false);
  when 'removal_reason_submitted' then
    return coalesce(selection_item_id is null
      and jsonb_typeof(payload->'removal_event_id') = 'string'
      and payload->>'removal_event_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and jsonb_typeof(payload->'reason') = 'string' and btrim(payload->>'reason') <> ''
      and char_length(payload->>'reason') <= 200, false);
  else
    return false;
  end case;
end;
$$;
alter table public.events drop constraint events_event_type_check;
alter table public.events add constraint events_event_type_check check (event_type in (
 'product_scanned','scan_failed','cart_item_added','cart_quantity_changed','cart_item_removed',
 'recommendation_impression','recommendation_click','recommendation_dismissed','product_compared',
 'removal_reason_submitted','removal_reason_prompted','removal_reason_skipped'));

create function public.kago_guard_removal_collection()
returns trigger language plpgsql security definer set search_path = '' as $$
declare removal public.events;
begin
 if new.event_type in ('removal_reason_prompted','removal_reason_skipped')
    and public.kago_is_valid_event(new.event_type,new.payload,new.selection_item_id,new.product_id) then
   select * into removal from public.events where event_id=(new.payload->>'removal_event_id')::uuid;
   if not found or removal.event_type<>'cart_item_removed' or removal.visit_id<>new.visit_id
      or removal.user_id<>new.user_id or removal.store_id<>new.store_id or removal.product_id<>new.product_id then
     raise exception 'Feedback must reference own removal in the same visit and product' using errcode='23503';
   end if;
 end if;
 return new;
end;
$$;
revoke all on function public.kago_guard_removal_collection() from public;
create trigger events_reason_collection_guard before insert on public.events
 for each row execute function public.kago_guard_removal_collection();
commit;
