-- APP-02. Apply after DB-02..DB-06. No direct customer cart/receipt writes.
begin;

create table public.app_cart_requests (
  request_id uuid primary key,
  user_id uuid not null references auth.users(id),
  visit_id uuid not null references public.visits(id),
  request jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.app_cart_requests enable row level security;
revoke all on public.app_cart_requests from public, anon, authenticated;
grant select on public.app_cart_requests to service_role;

-- The visit lock makes the version and lines one snapshot, also with checkout/re-entry.
create function public.app_get_cart(p_visit_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v public.visits%rowtype; lines jsonb;
begin
  if auth.uid() is null or not public.kago_has_role('customer') then
    raise exception 'Customer required' using errcode = '42501';
  end if;
  select * into v from public.visits where id = p_visit_id for share;
  if not found or v.user_id <> auth.uid() then
    raise exception 'Visit unavailable' using errcode = '42501';
  end if;
  if v.status <> 'active' then
    raise exception 'Visit ended' using errcode = 'P0001', detail = 'visit_ended';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('productId', p.id, 'code', p.code,
    'name', p.name, 'category', p.category, 'price', sp.price, 'available', sp.is_active,
    'quantity', ci.quantity) order by p.name, p.id), '[]'::jsonb) into lines
  from public.cart_items ci join public.products p on p.id = ci.product_id
  join public.store_products sp on sp.store_id = v.store_id and sp.product_id = ci.product_id
  where ci.visit_id = v.id;
  return jsonb_build_object('visit', jsonb_build_object('id', v.id, 'store_id', v.store_id,
    'cart_version', v.cart_version, 'started_at', v.started_at), 'cart', lines);
end;
$$;

create function public.app_list_products(p_visit_id uuid, p_query text default '', p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare snapshot jsonb; items jsonb;
begin
  snapshot := public.app_get_cart(p_visit_id);
  if p_query is null or length(p_query) > 100 or p_offset is null or p_offset < 0 then
    raise exception 'Invalid search' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(to_jsonb(listed)), '[]'::jsonb) into items from (
    select p.id as "productId", p.code, p.name, p.category, sp.price, sp.is_active as available
    from public.products p join public.store_products sp on sp.product_id = p.id
    where sp.store_id = (snapshot->'visit'->>'store_id')::uuid and sp.is_active
      and (p_query = '' or strpos(lower(p.name), lower(p_query)) > 0 or strpos(lower(p.code), lower(p_query)) > 0)
    order by p.name, p.id limit 51 offset p_offset
  ) listed;
  return jsonb_build_object('products', (select coalesce(jsonb_agg(e.value order by e.ordinality), '[]'::jsonb)
    from jsonb_array_elements(items) with ordinality e where e.ordinality <= 50),
    'hasMore', jsonb_array_length(items) > 50);
end;
$$;

-- A lookup records product_scanned/scan_failed once; it never changes a cart.
create function public.app_lookup_product(p_visit_id uuid, p_request_id uuid,
  p_code text default null, p_product_id uuid default null, p_failure_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare snapshot jsonb; prev public.app_cart_requests%rowtype; req jsonb; result jsonb;
  product jsonb; actor uuid := auth.uid(); at_time timestamptz;
begin
  if actor is null or not public.kago_has_role('customer') then
    raise exception 'Customer required' using errcode = '42501';
  end if;
  if p_request_id is null or p_visit_id is null or num_nonnulls(p_code, p_product_id, p_failure_reason) <> 1
    or (p_failure_reason is not null and p_failure_reason not in ('camera_unavailable','permission_denied','unreadable'))
    or (p_code is not null and (length(p_code) not between 1 and 100 or p_code <> btrim(p_code))) then
    raise exception 'Invalid lookup' using errcode = '22023';
  end if;
  req := jsonb_build_object('kind', 'lookup', 'code', p_code, 'productId', p_product_id, 'failureReason', p_failure_reason);
  perform public.kago_lock_id(p_request_id);
  select * into prev from public.app_cart_requests where request_id = p_request_id;
  if found then
    if prev.user_id <> actor or prev.visit_id <> p_visit_id or prev.request <> req then
      raise exception 'Request key reused' using errcode = '23505';
    end if;
    perform public.app_get_cart(p_visit_id);
    return prev.result;
  end if;
  snapshot := public.app_get_cart(p_visit_id);
  select jsonb_build_object('productId', p.id, 'code', p.code, 'name', p.name,
    'category', p.category, 'price', sp.price, 'available', sp.is_active) into product
  from public.products p join public.store_products sp on sp.product_id = p.id
  where sp.store_id = (snapshot->'visit'->>'store_id')::uuid
    and ((p_code is not null and p.code = p_code) or (p_product_id is not null and p.id = p_product_id));
  result := case when p_failure_reason is not null then jsonb_build_object('code', 'scan_failed')
    when product is null then jsonb_build_object('code', 'product_not_found')
    when not (product->>'available')::boolean then jsonb_build_object('code', 'product_unavailable')
    else jsonb_build_object('product', product) end;
  at_time := greatest(clock_timestamp(), (snapshot->'visit'->>'started_at')::timestamptz);
  insert into public.events(event_id, event_type, schema_version, occurred_at, store_id,
    user_id, visit_id, product_id, payload, data_origin)
  values (p_request_id, case when result ? 'product' then 'product_scanned' else 'scan_failed' end,
    1, at_time, (snapshot->'visit'->>'store_id')::uuid, actor, p_visit_id,
    case when result ? 'product' then (product->>'productId')::uuid else null end,
    case when result ? 'product' then jsonb_build_object('method', case when p_code is null then 'manual' else 'barcode' end)
      else jsonb_strip_nulls(jsonb_build_object('reason', coalesce(p_failure_reason, result->>'code'), 'code', p_code)) end, 'operated');
  insert into public.app_cart_requests(request_id, user_id, visit_id, request, result)
  values (p_request_id, actor, p_visit_id, req, result);
  return result;
end;
$$;

-- Absolute quantities + expected version prevent lost updates; receipts prevent replay.
-- source recommendation is reserved for real selection_items, never a local sample card.
create function public.app_set_cart_item(p_visit_id uuid, p_request_id uuid, p_product_id uuid,
  p_quantity integer, p_expected_cart_version integer, p_source text,
  p_selection_item_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); v public.visits%rowtype; prev public.app_cart_requests%rowtype;
  req jsonb; old_quantity integer; new_version integer; active boolean; result jsonb; at_time timestamptz;
begin
  if actor is null or not public.kago_has_role('customer') then
    raise exception 'Customer required' using errcode = '42501';
  end if;
  if p_request_id is null or p_visit_id is null or p_product_id is null
    or p_quantity is null or p_quantity < 0 or p_quantity > 999
    or p_expected_cart_version is null or p_expected_cart_version < 0
    or p_source is null or p_source not in ('scan', 'manual', 'recommendation')
    or (p_source = 'recommendation') <> (p_selection_item_id is not null) then
    raise exception 'Invalid cart request' using errcode = '22023';
  end if;
  req := jsonb_build_object('kind', 'set', 'productId', p_product_id, 'quantity', p_quantity,
    'expectedVersion', p_expected_cart_version, 'source', p_source, 'selectionItemId', p_selection_item_id);
  perform public.kago_lock_id(p_request_id);
  select * into prev from public.app_cart_requests where request_id = p_request_id;
  if found then
    if prev.user_id <> actor or prev.visit_id <> p_visit_id or prev.request <> req then
      raise exception 'Request key reused' using errcode = '23505';
    end if;
    -- Return the current cart, not a stale historic snapshot, after recognizing the replay.
    return public.app_get_cart(p_visit_id) || prev.result || jsonb_build_object('replayed', true);
  end if;
  select * into v from public.visits where id = p_visit_id for update;
  if not found or v.user_id <> actor then
    raise exception 'Visit unavailable' using errcode = '42501';
  end if;
  if v.status <> 'active' then
    raise exception 'Visit ended' using errcode = 'P0001', detail = 'visit_ended';
  end if;
  if v.cart_version <> p_expected_cart_version then
    raise exception 'Cart changed' using errcode = '40001', detail = 'cart_changed';
  end if;
  select sp.is_active into active from public.store_products sp
    where sp.store_id = v.store_id and sp.product_id = p_product_id for share;
  if not found then
    raise exception 'Product not listed' using errcode = 'P0001', detail = 'product_not_found';
  end if;
  if p_quantity > 0 and not active then
    raise exception 'Product unavailable' using errcode = 'P0001', detail = 'product_unavailable';
  end if;
  if p_selection_item_id is not null then
    perform 1 from public.selection_items si join public.selections s on s.id = si.selection_id
      where si.id = p_selection_item_id and s.visit_id = v.id and s.cart_version = v.cart_version
        and si.product_id = p_product_id;
    if not found then raise exception 'Selection unavailable' using errcode = '42501'; end if;
  end if;
  select quantity into old_quantity from public.cart_items where visit_id = v.id and product_id = p_product_id;
  old_quantity := coalesce(old_quantity, 0);
  new_version := v.cart_version;
  if old_quantity <> p_quantity then
    if p_quantity = 0 then
      delete from public.cart_items where visit_id = v.id and product_id = p_product_id;
    else
      insert into public.cart_items(visit_id, product_id, quantity) values (v.id, p_product_id, p_quantity)
        on conflict (visit_id, product_id) do update set quantity = excluded.quantity;
    end if;
    new_version := v.cart_version + 1;
    at_time := greatest(clock_timestamp(), v.started_at, v.last_activity_at);
    update public.visits set cart_version = new_version, last_activity_at = at_time where id = v.id;
    insert into public.events(event_id, event_type, schema_version, occurred_at, store_id, user_id,
      visit_id, selection_item_id, product_id, payload, data_origin)
    values (p_request_id, case when p_quantity = 0 then 'cart_item_removed'
      when old_quantity = 0 then 'cart_item_added' else 'cart_quantity_changed' end,
      1, at_time, v.store_id, actor, v.id, p_selection_item_id, p_product_id,
      jsonb_build_object('source', p_source, 'quantity', p_quantity,
        'quantity_delta', p_quantity - old_quantity, 'cart_version', new_version), 'operated');
  end if;
  result := jsonb_build_object('appliedVersion', new_version);
  insert into public.app_cart_requests(request_id, user_id, visit_id, request, result)
    values (p_request_id, actor, v.id, req, result);
  return public.app_get_cart(v.id) || result || jsonb_build_object('replayed', false);
end;
$$;

revoke all on function public.app_get_cart(uuid), public.app_list_products(uuid, text, integer),
  public.app_lookup_product(uuid, uuid, text, uuid, text),
  public.app_set_cart_item(uuid, uuid, uuid, integer, integer, text, uuid) from public, anon;
grant execute on function public.app_get_cart(uuid), public.app_list_products(uuid, text, integer),
  public.app_lookup_product(uuid, uuid, text, uuid, text),
  public.app_set_cart_item(uuid, uuid, uuid, integer, integer, text, uuid) to authenticated;
commit;
