-- #84 / INS-08: all product sales, independent of recommendation or Signage events.
-- Orders and immutable order_items are the source of truth (D-06).
begin;

create function public.kago_product_sales(
  p_start timestamptz,
  p_end timestamptz,
  p_store_id uuid,
  p_product_ids uuid[] default null,
  p_bucket text default 'day'
) returns table (
  store_id uuid,
  product_id uuid,
  bucket_start timestamptz,
  data_origin text,
  orders bigint,
  quantity numeric,
  amount numeric
)
language plpgsql stable security definer set search_path='' as $$
begin
  -- No implicit all-stores mode. Check membership as well as the trusted JWT role.
  if not public.kago_is_store_staff(p_store_id) then
    raise exception 'Store not available' using errcode='42501';
  end if;
  if p_start is null or p_end is null or not isfinite(p_start) or not isfinite(p_end)
     or p_start>=p_end then
    raise exception 'Invalid reporting period' using errcode='22023';
  end if;
  if p_bucket is null or p_bucket not in ('day','hour') then
    raise exception 'Bucket must be day or hour' using errcode='22023';
  end if;
  if p_product_ids is not null then
    if coalesce(array_ndims(p_product_ids),1)<>1 then
      raise exception 'Product IDs must be a one-dimensional array' using errcode='22023';
    end if;
    if array_position(p_product_ids,null) is not null then
      raise exception 'Product IDs must not contain null' using errcode='22023';
    end if;
  end if;

  return query
    select o.store_id,oi.product_id,date_trunc(p_bucket,o.ordered_at,'Asia/Tokyo'),
      o.data_origin,count(distinct o.id),sum(oi.quantity::numeric),
      sum(oi.quantity::numeric*oi.unit_price)
    from public.orders o
    join public.order_items oi on oi.order_id=o.id
    where o.store_id=p_store_id and o.ordered_at>=p_start and o.ordered_at<p_end
      and (p_product_ids is null or oi.product_id=any(p_product_ids))
    group by o.store_id,oi.product_id,date_trunc(p_bucket,o.ordered_at,'Asia/Tokyo'),o.data_origin
    order by 3,2,4;
end;
$$;

-- Authenticated RPC calls still have to pass the store-staff membership check.
revoke all on function public.kago_product_sales(timestamptz,timestamptz,uuid,uuid[],text)
  from public,anon,authenticated,service_role;
grant execute on function public.kago_product_sales(timestamptz,timestamptz,uuid,uuid[],text)
  to authenticated;
comment on function public.kago_product_sales(timestamptz,timestamptz,uuid,uuid[],text) is
  'INS-08: [start,end) order-line sales by product, Asia/Tokyo day/hour and data_origin. Own-store staff only. No zero-fill; no collection-coverage guarantee.';
commit;
