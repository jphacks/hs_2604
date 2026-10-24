-- DB-06: row-level access for customer / store_staff / maker_staff / signage sessions.
-- Requires COM-02 through DB-05 and APP-01's app_start_visit.
--
-- Rules
-- * Roles come from app_metadata.kago.roles (set by admins), but rows are always scoped by
--   store_members / maker_members / signage_devices / auth.uid(), never by the role alone.
-- * anon gets nothing. Tables keep RLS on; authenticated gets only the verbs listed here.
-- * Writes users must not decide (visit lifecycle, cart, orders, selections, approvals,
--   placements, experiment arms, review history) go through owner-rights functions only:
--   app_start_visit (APP-01), kago_save_selection (here), the APP-02 cart function, DB-07
--   checkout and DB-08 approval. Aggregates for Insight/Ads come from DB-09 views.
-- * Image storage permissions follow COM-03.
begin;

-- Identity helpers. SECURITY DEFINER so policies can consult membership tables that the
-- caller cannot read; they only ever answer about the caller.

create function public.kago_has_role(p_role text)
returns boolean language sql stable set search_path = '' as $$
  select auth.uid() is not null and coalesce(
    (auth.jwt() -> 'app_metadata' -> 'kago' -> 'roles') ? p_role, false);
$$;

create function public.kago_is_store_staff(p_store_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.kago_has_role('store_staff') and exists (
    select 1 from public.store_members where store_id = p_store_id and user_id = auth.uid());
$$;

create function public.kago_is_maker_staff(p_maker_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.kago_has_role('maker_staff') and exists (
    select 1 from public.maker_members where maker_id = p_maker_id and user_id = auth.uid());
$$;

-- The caller's Signage device: active row bound to this Auth user AND matching the
-- device_id / store_id the admin put in app_metadata.
create function public.kago_my_device_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select d.id from public.signage_devices d
  where public.kago_has_role('signage') and d.auth_user_id = auth.uid() and d.is_active
    and d.id::text = auth.jwt() -> 'app_metadata' -> 'kago' ->> 'device_id'
    and d.store_id::text = auth.jwt() -> 'app_metadata' -> 'kago' ->> 'store_id';
$$;

create function public.kago_my_device_store_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select store_id from public.signage_devices where id = public.kago_my_device_id();
$$;

create function public.kago_owns_visit(p_visit_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.kago_has_role('customer') and exists (
    select 1 from public.visits where id = p_visit_id and user_id = auth.uid());
$$;

-- A creative version is "live" for a store while an active placement pins it.
create function public.kago_creative_version_visible(p_version_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
      select 1 from public.creative_versions cv join public.creatives c on c.id = cv.creative_id
      where cv.id = p_version_id and public.kago_is_maker_staff(c.maker_id))
    or exists (
      select 1 from public.ad_applications a
      left join public.application_revisions r on r.application_id = a.id
      where (a.creative_version_id = p_version_id or r.creative_version_id = p_version_id)
        and public.kago_is_store_staff(a.store_id))
    or exists (
      select 1 from public.ad_placements p where p.creative_version_id = p_version_id and p.status = 'active'
        and (public.kago_has_role('customer') or p.store_id = public.kago_my_device_store_id()));
$$;

create function public.kago_creative_visible(p_creative_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.creative_versions cv
    where cv.creative_id = p_creative_id and public.kago_creative_version_visible(cv.id))
    or exists (select 1 from public.creatives c where c.id = p_creative_id
      and public.kago_is_maker_staff(c.maker_id));
$$;

-- Set-returning helpers so policies evaluate membership once per query, not once per row.
create function public.kago_my_store_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select store_id from public.store_members
  where user_id = auth.uid() and public.kago_has_role('store_staff');
$$;

create function public.kago_my_maker_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select maker_id from public.maker_members
  where user_id = auth.uid() and public.kago_has_role('maker_staff');
$$;

-- Breaks the store_promotions <-> promotion_versions policy cycle. Active promotions are
-- visible to customers anyway, so the answer reveals nothing new.
create function public.kago_promotion_is_active(p_promotion_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.promotion_versions where promotion_id = p_promotion_id and status = 'active');
$$;

-- Customer events must fall inside the visit (10 minutes of clock skew either side).
create function public.kago_event_time_ok(p_visit_id uuid, p_occurred_at timestamptz)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.visits v where v.id = p_visit_id and v.user_id = auth.uid()
    and p_occurred_at >= v.started_at - interval '10 minutes'
    and p_occurred_at <= coalesce(v.ended_at, clock_timestamp()) + interval '10 minutes');
$$;

revoke all on function public.kago_has_role(text), public.kago_is_store_staff(uuid),
  public.kago_is_maker_staff(uuid), public.kago_my_device_id(), public.kago_my_device_store_id(),
  public.kago_owns_visit(uuid), public.kago_creative_version_visible(uuid),
  public.kago_creative_visible(uuid), public.kago_my_store_ids(), public.kago_my_maker_ids(),
  public.kago_event_time_ok(uuid, timestamptz), public.kago_promotion_is_active(uuid) from public, anon;
grant execute on function public.kago_has_role(text), public.kago_is_store_staff(uuid),
  public.kago_is_maker_staff(uuid), public.kago_my_device_id(), public.kago_my_device_store_id(),
  public.kago_owns_visit(uuid), public.kago_creative_version_visible(uuid),
  public.kago_creative_visible(uuid), public.kago_my_store_ids(), public.kago_my_maker_ids(),
  public.kago_event_time_ok(uuid, timestamptz), public.kago_promotion_is_active(uuid) to authenticated;

-- Owner-rights write paths -----------------------------------------------------------------

-- APP-01's function already derives the user from auth.uid() and checks the customer role.
-- Running it with owner rights lets customers start/resume visits without any direct
-- INSERT/UPDATE on visits (which would let them rewrite status or cart_version).
alter function public.app_start_visit(uuid, boolean, uuid) security definer;
revoke all on function public.app_start_visit(uuid, boolean, uuid) from public, anon;
grant execute on function public.app_start_visit(uuid, boolean, uuid) to authenticated;

-- APP-05 saves its selection for the caller's own visit. DB-05 triggers re-check the cart
-- version, store, slot types and deliverability. Re-sending the same p_selection_id is a no-op.
create function public.kago_save_selection(
  p_visit_id uuid,
  p_cart_version integer,
  p_rule_version integer,
  p_items jsonb,
  p_selection_id uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare sel_id uuid := coalesce(p_selection_id, gen_random_uuid()); item jsonb;
begin
  if not public.kago_owns_visit(p_visit_id) then
    raise exception 'Visit is not available' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 3 then
    raise exception 'Selection needs 1 to 3 items' using errcode = '22023';
  end if;
  perform 1 from public.selections where id = sel_id;
  if found then
    -- Resend: identical header is a no-op inside the DB-05 trigger; differing content raises.
    insert into public.selections(id, visit_id, cart_version, rule_version)
      values (sel_id, p_visit_id, p_cart_version, p_rule_version);
    return sel_id;
  end if;
  insert into public.selections(id, visit_id, cart_version, rule_version)
    values (sel_id, p_visit_id, p_cart_version, p_rule_version);
  for item in select value from jsonb_array_elements(p_items) loop
    insert into public.selection_items(id, selection_id, slot, placement_type, product_id,
      ad_placement_id, promotion_version_id, rank, reason_code, reason_text)
    values (coalesce((item->>'id')::uuid, gen_random_uuid()), sel_id, (item->>'slot')::integer,
      item->>'placement_type', (item->>'product_id')::uuid, (item->>'ad_placement_id')::uuid,
      (item->>'promotion_version_id')::uuid, coalesce((item->>'rank')::integer, 1),
      item->>'reason_code', item->>'reason_text');
  end loop;
  return sel_id;
end;
$$;
revoke all on function public.kago_save_selection(uuid, integer, integer, jsonb, uuid) from public, anon;
grant execute on function public.kago_save_selection(uuid, integer, integer, jsonb, uuid) to authenticated;

-- Table privileges ---------------------------------------------------------------------------

revoke all on table public.stores, public.store_members, public.products, public.store_products,
  public.customer_settings, public.visits, public.cart_items, public.orders, public.order_items,
  public.makers, public.maker_members, public.ad_calls, public.creatives, public.creative_versions,
  public.ad_applications, public.application_revisions, public.ad_placements, public.store_promotions,
  public.promotion_versions, public.experiments, public.experiment_assignments, public.selections,
  public.selection_items, public.events, public.signage_devices, public.signage_plays,
  public.audience_estimates from anon, authenticated;

grant select on table public.stores, public.store_members, public.products, public.store_products,
  public.visits, public.cart_items, public.orders, public.order_items, public.makers,
  public.maker_members, public.ad_calls, public.creatives, public.creative_versions,
  public.ad_applications, public.application_revisions, public.ad_placements, public.store_promotions,
  public.promotion_versions, public.experiments, public.experiment_assignments, public.selections,
  public.selection_items, public.events, public.signage_plays, public.audience_estimates
  to authenticated;
-- Device account ids are not exposed to other users.
grant select (id, store_id, slug, location, is_active, created_at) on table public.signage_devices to authenticated;
grant select, insert, update on table public.customer_settings to authenticated;
grant insert, update, delete on table public.ad_calls to authenticated;
grant insert on table public.creatives, public.creative_versions, public.store_promotions,
  public.promotion_versions, public.experiments, public.events, public.signage_plays,
  public.audience_estimates to authenticated;
grant insert, update on table public.ad_applications to authenticated;
grant update (status) on table public.promotion_versions to authenticated;

-- Policies ---------------------------------------------------------------------------------
-- Helpers without row arguments are wrapped in (select ...) so they run once per statement.

-- Master data: customers and makers see every store; staff and devices see their own store.
create policy stores_read on public.stores for select to authenticated using (
  (select public.kago_has_role('customer')) or (select public.kago_has_role('maker_staff'))
  or id in (select public.kago_my_store_ids()) or id = (select public.kago_my_device_store_id()));
create policy store_members_read_own on public.store_members for select to authenticated
  using (user_id = (select auth.uid()));
create policy products_read on public.products for select to authenticated using (
  (select public.kago_has_role('customer')) or (select public.kago_has_role('maker_staff'))
  or (select public.kago_has_role('store_staff')) or (select public.kago_my_device_id()) is not null);
create policy store_products_read on public.store_products for select to authenticated using (
  (select public.kago_has_role('customer')) or (select public.kago_has_role('maker_staff'))
  or store_id in (select public.kago_my_store_ids()) or store_id = (select public.kago_my_device_store_id()));

create policy customer_settings_own on public.customer_settings for all to authenticated
  using (user_id = (select auth.uid()) and (select public.kago_has_role('customer')))
  with check (user_id = (select auth.uid()) and (select public.kago_has_role('customer')));

create policy makers_read on public.makers for select to authenticated using (
  (select public.kago_has_role('customer')) or (select public.kago_has_role('maker_staff'))
  or (select public.kago_has_role('store_staff')) or (select public.kago_my_device_id()) is not null);
create policy maker_members_read_own on public.maker_members for select to authenticated
  using (user_id = (select auth.uid()));

-- Shopping data: the customer only. Store/maker/device sessions read nothing here (DB-09 views).
-- Child tables follow the parent's policy through the sub-select.
create policy visits_read_own on public.visits for select to authenticated
  using (user_id = (select auth.uid()) and (select public.kago_has_role('customer')));
create policy cart_items_read_own on public.cart_items for select to authenticated
  using (visit_id in (select id from public.visits));
create policy orders_read_own on public.orders for select to authenticated
  using (user_id = (select auth.uid()) and (select public.kago_has_role('customer')));
create policy order_items_read_own on public.order_items for select to authenticated
  using (order_id in (select id from public.orders));

-- Ad calls: store staff manage their own store's calls; makers browse published ones
-- (closed calls stay listed for ADS-01's "include ended" view).
create policy ad_calls_read on public.ad_calls for select to authenticated using (
  store_id in (select public.kago_my_store_ids())
  or (status <> 'draft' and (select public.kago_has_role('maker_staff'))));
create policy ad_calls_insert_own_store on public.ad_calls for insert to authenticated
  with check (store_id in (select public.kago_my_store_ids()));
create policy ad_calls_update_own_store on public.ad_calls for update to authenticated
  using (store_id in (select public.kago_my_store_ids()))
  with check (store_id in (select public.kago_my_store_ids()));
create policy ad_calls_delete_own_store on public.ad_calls for delete to authenticated
  using (store_id in (select public.kago_my_store_ids()));

-- Creatives: makers own them; stores see what was submitted to them; customers/devices see
-- only what an active placement pins.
create policy creatives_read on public.creatives for select to authenticated
  using (public.kago_creative_visible(id));
create policy creatives_insert_own_maker on public.creatives for insert to authenticated
  with check (maker_id in (select public.kago_my_maker_ids()));
create policy creative_versions_read on public.creative_versions for select to authenticated
  using (public.kago_creative_version_visible(id));
create policy creative_versions_insert_own_maker on public.creative_versions for insert to authenticated
  with check (creative_id in (select c.id from public.creatives c
    where c.maker_id in (select public.kago_my_maker_ids())));

-- Applications: makers create and resubmit their own; review is DB-08's function, not an UPDATE.
create policy ad_applications_read on public.ad_applications for select to authenticated using (
  maker_id in (select public.kago_my_maker_ids()) or store_id in (select public.kago_my_store_ids()));
create policy ad_applications_insert_own_maker on public.ad_applications for insert to authenticated
  with check (maker_id in (select public.kago_my_maker_ids()));
create policy ad_applications_resubmit_own_maker on public.ad_applications for update to authenticated
  using (maker_id in (select public.kago_my_maker_ids()))
  with check (maker_id in (select public.kago_my_maker_ids()) and status = 'submitted');
create policy application_revisions_read on public.application_revisions for select to authenticated
  using (application_id in (select id from public.ad_applications));

-- Placements: written only by DB-08. Readers: own store, applying maker, customers (active),
-- the store's devices (active).
create policy ad_placements_read on public.ad_placements for select to authenticated using (
  store_id in (select public.kago_my_store_ids())
  or application_id in (select a.id from public.ad_applications a where a.maker_id in (select public.kago_my_maker_ids()))
  or (status = 'active' and ((select public.kago_has_role('customer'))
    or store_id = (select public.kago_my_device_store_id()))));

-- Store promotions: own store staff create and stop; customers/devices see active versions.
create policy store_promotions_read on public.store_promotions for select to authenticated using (
  store_id in (select public.kago_my_store_ids()) or store_id = (select public.kago_my_device_store_id())
  or ((select public.kago_has_role('customer')) and public.kago_promotion_is_active(id)));
create policy store_promotions_insert_own_store on public.store_promotions for insert to authenticated
  with check (store_id in (select public.kago_my_store_ids()));
create policy promotion_versions_read on public.promotion_versions for select to authenticated using (
  promotion_id in (select sp.id from public.store_promotions sp where sp.store_id in (select public.kago_my_store_ids()))
  or (status = 'active' and ((select public.kago_has_role('customer'))
    or promotion_id in (select sp.id from public.store_promotions sp
      where sp.store_id = (select public.kago_my_device_store_id())))));
create policy promotion_versions_insert_own_store on public.promotion_versions for insert to authenticated
  with check (promotion_id in (select sp.id from public.store_promotions sp
    where sp.store_id in (select public.kago_my_store_ids())));
create policy promotion_versions_stop_own_store on public.promotion_versions for update to authenticated
  using (promotion_id in (select sp.id from public.store_promotions sp where sp.store_id in (select public.kago_my_store_ids())))
  with check (promotion_id in (select sp.id from public.store_promotions sp where sp.store_id in (select public.kago_my_store_ids())));

-- Experiments: own store staff define; customers read conditions and their own arm only.
-- Assignments have no user write path (APP-10 decides the mechanism; arms are not user input).
create policy experiments_read on public.experiments for select to authenticated using (
  store_id in (select public.kago_my_store_ids()) or (select public.kago_has_role('customer'))
  or store_id = (select public.kago_my_device_store_id()));
create policy experiments_insert_own_store on public.experiments for insert to authenticated
  with check (store_id in (select public.kago_my_store_ids()));
create policy experiment_assignments_read_own on public.experiment_assignments for select to authenticated
  using (user_id = (select auth.uid()) and (select public.kago_has_role('customer')));

-- Selections and events: the customer's own visit only. Cart events come from APP-02's function.
-- Customer events are always 'operated' and must fall inside the visit's time window.
create policy selections_read_own on public.selections for select to authenticated
  using (visit_id in (select id from public.visits));
create policy selection_items_read_own on public.selection_items for select to authenticated
  using (selection_id in (select id from public.selections));
create policy events_read_own on public.events for select to authenticated
  using (user_id = (select auth.uid()) and (select public.kago_has_role('customer')));
create policy events_insert_own on public.events for insert to authenticated with check (
  user_id = (select auth.uid()) and public.kago_owns_visit(visit_id)
  and data_origin = 'operated' and public.kago_event_time_ok(visit_id, occurred_at)
  and event_type not in ('cart_item_added','cart_quantity_changed','cart_item_removed'));

-- Signage: a device reads and writes its own plays/estimates; store staff read their store's.
create policy signage_devices_read on public.signage_devices for select to authenticated using (
  id = (select public.kago_my_device_id()) or store_id in (select public.kago_my_store_ids())
  or ((select public.kago_has_role('maker_staff')) and is_active));
create policy signage_plays_read on public.signage_plays for select to authenticated using (
  device_id = (select public.kago_my_device_id())
  or device_id in (select d.id from public.signage_devices d where d.store_id in (select public.kago_my_store_ids())));
create policy signage_plays_insert_own_device on public.signage_plays for insert to authenticated
  with check (device_id = (select public.kago_my_device_id()));
create policy audience_estimates_read on public.audience_estimates for select to authenticated
  using (play_id in (select id from public.signage_plays));
create policy audience_estimates_insert_own_device on public.audience_estimates for insert to authenticated
  with check (play_id in (select p.id from public.signage_plays p where p.device_id = (select public.kago_my_device_id())));

commit;
