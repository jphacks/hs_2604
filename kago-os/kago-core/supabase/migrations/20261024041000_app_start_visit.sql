-- APP-01: use the DB-02/03 schema. Table grants and RLS remain DB-06's job.
-- Apply after 20261024040000_visits_cart_orders.sql. No service-role bypass.
begin;

create function public.app_start_visit(
  p_store_id uuid,
  p_start_new boolean,
  p_previous_visit_id uuid default null
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  active_visit public.visits%rowtype;
  previous_visit public.visits%rowtype;
  result_id uuid;
  active_count integer;
  changed_at timestamptz;
begin
  if actor is null or not coalesce(
    (auth.jwt() -> 'app_metadata' -> 'kago' -> 'roles') @> '["customer"]'::jsonb,
    false
  ) then
    raise exception 'Customer authentication required' using errcode = '42501';
  end if;
  if p_store_id is null or p_start_new is null then
    raise exception 'Store and start mode are required' using errcode = '22023';
  end if;

  -- Serialize this function's starts for the same customer/store, including the
  -- initial request with no existing visit row to lock. Hash collisions only wait.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor::text || ':' || p_store_id::text, 0)
  );
  perform 1 from public.stores where id = p_store_id;
  if not found then
    raise exception 'Store is unavailable' using errcode = '42501';
  end if;

  if p_previous_visit_id is not null then
    select * into previous_visit from public.visits
      where id = p_previous_visit_id and user_id = actor and store_id = p_store_id
      for update;
    if not found then
      raise exception 'Previous visit is unavailable' using errcode = '42501';
    end if;
  end if;

  -- DB-03 deliberately permits historical fixtures with multiple active visits.
  -- Do not silently choose one or delete data if that invariant is not yet met.
  select count(*) into active_count from public.visits
    where user_id = actor and store_id = p_store_id and status = 'active';
  if active_count > 1 then
    raise exception 'Multiple active visits require reconciliation' using errcode = '23514';
  end if;
  select * into active_visit from public.visits
    where user_id = actor and store_id = p_store_id and status = 'active'
    for update;

  if active_visit.id is not null then
    if not p_start_new or p_previous_visit_id is distinct from active_visit.id then
      -- Resume, initial-start retry, or a repeated explicit restart after its
      -- predecessor was ended. Never end the newer visit on a stale request.
      return active_visit.id;
    end if;
    changed_at := greatest(clock_timestamp(), active_visit.started_at, active_visit.last_activity_at);
    update public.visits set status = 'abandoned', ended_at = changed_at,
      last_activity_at = changed_at where id = active_visit.id;
  elsif p_previous_visit_id is not null then
    raise exception 'Visit changed; reload before starting again' using errcode = '40001';
  else
    changed_at := clock_timestamp();
  end if;

  insert into public.visits(user_id, store_id, started_at, last_activity_at)
    values (actor, p_store_id, changed_at, changed_at) returning id into result_id;
  return result_id;
end;
$$;

revoke all on function public.app_start_visit(uuid, boolean, uuid) from public, anon;
grant execute on function public.app_start_visit(uuid, boolean, uuid) to authenticated;
-- Invoker rights intentionally keep DB-02/03's table-level denial until DB-06.
commit;
