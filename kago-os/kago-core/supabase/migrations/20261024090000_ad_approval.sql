-- DB-08: approve / reject / suspend maker ads as one consistent step each. Requires DB-04 and DB-06.
-- Only staff of the application's store may call these. Each call writes the application,
-- the placement switch and an operation log row together, or nothing.
--
-- Errors for INS-01:
--   42501            not staff of the store (or not signed in)
--   40001 + detail   'revision_changed'  the maker resubmitted after the screen was loaded; reload
--   23505            the round was already reviewed with a different decision / content
--   23514            wrong state (e.g. not submitted, placement not active), invalid period or channels
--   22023            missing or invalid arguments (reason required, 200 characters max)
begin;

-- Who did what, when. Approve/reject/suspend/supersede rows are appended by the functions below.
create table public.ad_operation_logs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  application_id uuid not null references public.ad_applications(id) on delete restrict,
  revision integer not null,
  placement_id uuid references public.ad_placements(id) on delete restrict,
  action text not null check (action in ('approve','reject','suspend','supersede')),
  actor uuid not null references auth.users(id) on delete restrict,
  reason text check (public.kago_is_short_text(reason, 200)),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (application_id, revision) references public.application_revisions(application_id, revision) on delete restrict,
  check ((action in ('reject','suspend')) = (reason is not null)),
  check ((action = 'reject') = (placement_id is null))
);
create index ad_operation_logs_application_idx on public.ad_operation_logs(application_id, created_at);
create index ad_operation_logs_store_idx on public.ad_operation_logs(store_id, created_at);
create trigger ad_operation_logs_append_only before update or delete on public.ad_operation_logs
for each row execute function public.kago_reject_mutation();

alter table public.ad_operation_logs enable row level security;
revoke all on table public.ad_operation_logs from public, anon, authenticated, service_role;
grant select on table public.ad_operation_logs to authenticated, service_role;
create policy ad_operation_logs_read on public.ad_operation_logs for select to authenticated using (
  store_id in (select public.kago_my_store_ids())
  or application_id in (select a.id from public.ad_applications a where a.maker_id in (select public.kago_my_maker_ids())));

-- Shared argument check for reasons.
create function public.kago_require_reason(p_reason text)
returns text language plpgsql immutable set search_path = '' as $$
begin
  if p_reason is null or btrim(p_reason) = '' or char_length(btrim(p_reason)) > 200 then
    raise exception 'A reason of 1-200 characters is required' using errcode = '22023';
  end if;
  return btrim(p_reason);
end;
$$;

-- Approve the current round. The previous active placement of the same application is
-- superseded in the same transaction, so at most one version is ever deliverable.
-- p_channels / period default to what the maker requested; they may only be narrowed.
create function public.kago_approve_application(
  p_application_id uuid,
  p_expected_revision integer,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_channels text[] default null
) returns table (placement_id uuid, revision integer, replayed boolean)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  actor uuid := auth.uid();
  a public.ad_applications%rowtype;
  prev public.ad_placements%rowtype;
  old_active public.ad_placements%rowtype;
  v_starts timestamptz; v_ends timestamptz; v_channels text[];
  new_id uuid := gen_random_uuid();
begin
  if p_application_id is null or p_expected_revision is null then
    raise exception 'Application and revision are required' using errcode = '22023';
  end if;
  select * into a from public.ad_applications where id = p_application_id for update;
  if not found or not public.kago_is_store_staff(a.store_id) then
    raise exception 'Application is not available' using errcode = '42501';
  end if;
  if a.revision <> p_expected_revision then
    raise exception 'The maker resubmitted; reload before reviewing' using errcode = '40001', detail = 'revision_changed';
  end if;
  v_starts := coalesce(p_starts_at, lower(a.requested_period));
  v_ends := coalesce(p_ends_at, upper(a.requested_period));
  v_channels := coalesce(p_channels, a.channels);

  if a.status = 'approved' then
    -- Resend of the same approval returns the same placement; anything else is a conflict.
    select * into prev from public.ad_placements p
      where p.application_id = a.id and p.revision = a.revision;
    if found and prev.starts_at = v_starts and prev.ends_at = v_ends
       and prev.channels @> v_channels and prev.channels <@ v_channels then
      return query select prev.id, prev.revision, true;
      return;
    end if;
    raise exception 'This round was already approved with different content' using errcode = '23505';
  elsif a.status <> 'submitted' then
    raise exception 'This round was already rejected' using errcode = '23505';
  end if;

  update public.ad_applications set status = 'approved', reviewed_by = actor, review_comment = null
    where id = a.id;

  select * into old_active from public.ad_placements p
    where p.application_id = a.id and p.status = 'active' for update;
  if found then
    update public.ad_placements set status = 'superseded' where id = old_active.id;
    insert into public.ad_operation_logs(store_id, application_id, revision, placement_id, action, actor)
      values (a.store_id, a.id, old_active.revision, old_active.id, 'supersede', actor);
  end if;

  -- DB-04's trigger re-checks version, channels, period, approver and product listing.
  insert into public.ad_placements(id, application_id, revision, store_id, creative_version_id,
    channels, starts_at, ends_at, approved_by)
  values (new_id, a.id, a.revision, a.store_id, a.creative_version_id, v_channels, v_starts, v_ends, actor);
  insert into public.ad_operation_logs(store_id, application_id, revision, placement_id, action, actor)
    values (a.store_id, a.id, a.revision, new_id, 'approve', actor);
  return query select new_id, a.revision, false;
end;
$$;

-- Reject the current round with a reason. An approved earlier round keeps running.
create function public.kago_reject_application(
  p_application_id uuid,
  p_expected_revision integer,
  p_reason text
) returns table (revision integer, replayed boolean)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  actor uuid := auth.uid();
  a public.ad_applications%rowtype;
  v_reason text;
begin
  if p_application_id is null or p_expected_revision is null then
    raise exception 'Application and revision are required' using errcode = '22023';
  end if;
  v_reason := public.kago_require_reason(p_reason);
  select * into a from public.ad_applications where id = p_application_id for update;
  if not found or not public.kago_is_store_staff(a.store_id) then
    raise exception 'Application is not available' using errcode = '42501';
  end if;
  if a.revision <> p_expected_revision then
    raise exception 'The maker resubmitted; reload before reviewing' using errcode = '40001', detail = 'revision_changed';
  end if;
  if a.status = 'rejected' then
    if a.review_comment = v_reason then
      return query select a.revision, true;
      return;
    end if;
    raise exception 'This round was already rejected with a different reason' using errcode = '23505';
  elsif a.status <> 'submitted' then
    raise exception 'This round was already approved' using errcode = '23505';
  end if;
  update public.ad_applications set status = 'rejected', reviewed_by = actor, review_comment = v_reason
    where id = a.id;
  insert into public.ad_operation_logs(store_id, application_id, revision, action, actor, reason)
    values (a.store_id, a.id, a.revision, 'reject', actor, v_reason);
  return query select a.revision, false;
end;
$$;

-- Stop an active placement. Resuming means a new resubmission and approval.
create function public.kago_suspend_placement(
  p_placement_id uuid,
  p_reason text
) returns table (placement_id uuid, replayed boolean)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  actor uuid := auth.uid();
  p public.ad_placements%rowtype;
  v_reason text;
begin
  if p_placement_id is null then
    raise exception 'Placement is required' using errcode = '22023';
  end if;
  v_reason := public.kago_require_reason(p_reason);
  select * into p from public.ad_placements where id = p_placement_id;
  if not found or not public.kago_is_store_staff(p.store_id) then
    raise exception 'Placement is not available' using errcode = '42501';
  end if;
  -- Same lock order as approval (application, then placement) to avoid deadlocks.
  perform 1 from public.ad_applications where id = p.application_id for update;
  select * into p from public.ad_placements where id = p_placement_id for update;
  if p.status = 'suspended' then
    if p.suspend_reason = v_reason then
      return query select p.id, true;
      return;
    end if;
    raise exception 'Placement was already suspended with a different reason' using errcode = '23505';
  elsif p.status <> 'active' then
    raise exception 'Only active placements can be suspended' using errcode = '23514';
  end if;
  update public.ad_placements set status = 'suspended', suspend_reason = v_reason, suspended_by = actor
    where id = p.id;
  insert into public.ad_operation_logs(store_id, application_id, revision, placement_id, action, actor, reason)
    values (p.store_id, p.application_id, p.revision, p.id, 'suspend', actor, v_reason);
  return query select p.id, false;
end;
$$;

revoke all on function public.kago_require_reason(text) from public, anon, authenticated;
revoke all on function public.kago_approve_application(uuid, integer, timestamptz, timestamptz, text[]),
  public.kago_reject_application(uuid, integer, text), public.kago_suspend_placement(uuid, text)
  from public, anon;
grant execute on function public.kago_approve_application(uuid, integer, timestamptz, timestamptz, text[]),
  public.kago_reject_application(uuid, integer, text), public.kago_suspend_placement(uuid, text)
  to authenticated;
commit;
