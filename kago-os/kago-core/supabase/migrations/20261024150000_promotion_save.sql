-- Save a store promotion as one step: the current active version becomes inactive and the next
-- version is inserted as active in the same transaction, or nothing changes. Requires DB-04,
-- DB-06 and DB-08. Stopping a promotion stays a single active -> inactive UPDATE.
--
-- Errors (same codes as DB-08):
--   42501            not staff of the store (or not signed in), or the promotion is another store's
--   40001 + detail   'revision_changed'  someone saved a newer version after the screen was loaded; reload
--   23514            the product is not sold (active) in the store; invalid channels, time windows,
--                    priority or period
--   22023            missing or invalid arguments (reason required, 200 characters max)
begin;

create function public.kago_save_promotion(
  p_store_id uuid,
  p_product_id uuid,
  p_channels text[],
  p_time_windows jsonb,
  p_priority integer,
  p_reason_text text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_promotion_id uuid default null,
  p_expected_version integer default null
) returns table (promotion_id uuid, promotion_version_id uuid, version integer, replayed boolean)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  sp public.store_promotions%rowtype;
  latest public.promotion_versions%rowtype;
  v_reason text;
  new_id uuid := gen_random_uuid();
begin
  if not public.kago_is_store_staff(p_store_id) then
    raise exception 'Store is not available' using errcode = '42501';
  end if;
  if p_product_id is null or p_channels is null or p_time_windows is null or p_priority is null
     or p_starts_at is null or p_ends_at is null then
    raise exception 'Product, channels, time windows, priority and period are required' using errcode = '22023';
  end if;
  v_reason := public.kago_require_reason(p_reason_text);

  if p_promotion_id is not null then
    select * into sp from public.store_promotions where id = p_promotion_id;
    if not found or sp.store_id <> p_store_id then
      raise exception 'Promotion is not available' using errcode = '42501';
    end if;
    if sp.product_id <> p_product_id then
      raise exception 'Promotion is for a different product' using errcode = '22023';
    end if;
  end if;

  begin
    -- Saves of the same store product run one at a time, so two first saves cannot both create
    -- a promotion. Then the promotion row, the same lock DB-04's version trigger takes.
    perform pg_advisory_xact_lock(hashtext('kago_save_promotion'), hashtext(p_store_id::text || p_product_id::text));
    if p_promotion_id is null then
      -- Prefer the promotion that is running, then the newest one.
      select s.* into sp from public.store_promotions s
        where s.store_id = p_store_id and s.product_id = p_product_id
        order by public.kago_promotion_is_active(s.id) desc, s.created_at desc, s.id
        limit 1;
      if not found then
        insert into public.store_promotions(store_id, product_id) values (p_store_id, p_product_id)
          returning * into sp;
      end if;
    end if;
    perform 1 from public.store_promotions where id = sp.id for update;

    select * into latest from public.promotion_versions v
      where v.promotion_id = sp.id order by v.version desc limit 1;

    -- A resend of the save that produced the latest version (or a save with no change) returns it.
    if found and latest.status = 'active'
       and (p_expected_version is null or p_expected_version in (latest.version, latest.version - 1))
       and latest.channels @> p_channels and latest.channels <@ p_channels
       and latest.time_windows = p_time_windows and latest.priority = p_priority
       and latest.reason_text = v_reason and latest.starts_at = p_starts_at and latest.ends_at = p_ends_at then
      return query select sp.id, latest.id, latest.version, true;
      return;
    end if;
    if p_expected_version is not null and p_expected_version <> coalesce(latest.version, 0) then
      raise exception 'The promotion was saved elsewhere; reload before saving' using errcode = '40001', detail = 'revision_changed';
    end if;

    update public.promotion_versions set status = 'inactive'
      where promotion_id = sp.id and status = 'active';
    -- DB-04's trigger and checks re-validate version, product listing, channels, windows and period.
    insert into public.promotion_versions(id, promotion_id, version, channels, time_windows, priority,
      reason_text, starts_at, ends_at, status)
    values (new_id, sp.id, coalesce(latest.version, 0) + 1, p_channels, p_time_windows, p_priority,
      v_reason, p_starts_at, p_ends_at, 'active');
    return query select sp.id, new_id, coalesce(latest.version, 0) + 1, false;
  exception when foreign_key_violation then
    -- DB-04 reports an unlisted or stopped product as 23503; Insight shows it like DB-08's 23514.
    raise exception 'Promoted product is not active in the store' using errcode = '23514';
  end;
end;
$$;

revoke all on function public.kago_save_promotion(uuid, uuid, text[], jsonb, integer, text,
  timestamptz, timestamptz, uuid, integer) from public, anon;
grant execute on function public.kago_save_promotion(uuid, uuid, text[], jsonb, integer, text,
  timestamptz, timestamptz, uuid, integer) to authenticated;
commit;
