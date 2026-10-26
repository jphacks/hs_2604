-- ADS-03 (#226): immutable per-channel paths; NULL keeps the original shared-image contract.
begin;
alter table public.creative_versions add column image_paths jsonb;
comment on column public.creative_versions.image_paths is
  'NULL: legacy image_path for both channels. Object: only explicitly registered app/signage paths are available.';

create function public.kago_creative_image_path(p_version_id uuid, p_channel text)
returns text language sql stable security invoker set search_path='' as $$
  select case when cv.image_paths is null then cv.image_path else cv.image_paths->>p_channel end
  from public.creative_versions cv where cv.id=p_version_id and p_channel in ('app','signage');
$$;

create function public.kago_guard_creative_media()
returns trigger language plpgsql security definer set search_path='' as $$
declare maker uuid; entry record;
begin
  if new.image_paths is null then return new; end if;
  if jsonb_typeof(new.image_paths)<>'object' or new.image_paths='{}'::jsonb then
    raise exception 'Media paths must be a nonempty object' using errcode='23514';
  end if;
  select maker_id into maker from public.creatives where id=new.creative_id;
  for entry in select key,value from jsonb_each(new.image_paths) loop
    if entry.key not in ('app','signage') or jsonb_typeof(entry.value)<>'string'
      or not public.kago_ad_image_path_valid(entry.value #>> '{}')
      or split_part(entry.value #>> '{}','/',1) is distinct from maker::text
      or split_part(entry.value #>> '{}','/',2) is distinct from new.creative_id::text then
      raise exception 'Media path must belong to its maker and creative' using errcode='23514';
    end if;
  end loop;
  if not exists(select 1 from jsonb_each_text(new.image_paths) where value=new.image_path) then
    raise exception 'Legacy path must be one of the media paths' using errcode='23514';
  end if;
  return new;
end;
$$;
create trigger creative_media_guard before insert on public.creative_versions
for each row execute function public.kago_guard_creative_media();

create or replace function public.kago_can_read_ad_image(p_path text)
returns boolean language plpgsql stable security definer set search_path='' as $$
begin
  if not public.kago_ad_image_path_valid(p_path) then return false; end if;
  if public.kago_can_upload_ad_image(p_path) then return true; end if;
  return exists(
    select 1 from public.creative_versions cv join public.creatives c on c.id=cv.creative_id
    cross join (values('app'),('signage')) ch(channel)
    where c.id=split_part(p_path,'/',2)::uuid and c.maker_id=split_part(p_path,'/',1)::uuid
      and (case when cv.image_paths is null then cv.image_path else cv.image_paths->>ch.channel end)=p_path
      and (
        exists(select 1 from public.ad_applications a left join public.application_revisions r on r.application_id=a.id
          where (a.creative_version_id=cv.id or r.creative_version_id=cv.id) and public.kago_is_store_staff(a.store_id))
        or exists(select 1 from public.ad_placements p where p.creative_version_id=cv.id and p.status='active'
          and ch.channel=any(p.channels) and (
            (ch.channel='app' and public.kago_has_role('customer'))
            or (ch.channel='signage' and p.store_id=public.kago_my_device_store_id())))
      ));
end;
$$;

-- Invoker rights retain creative_versions RLS. Return paths only for the caller's display/review channels.
create function public.kago_ad_media_paths(p_version_ids uuid[], p_channels text[] default array['app','signage'])
returns table(version_id uuid,channel text,image_path text)
language sql stable security invoker set search_path='' as $$
  select cv.id,ch.channel,case when cv.image_paths is null then cv.image_path else cv.image_paths->>ch.channel end
  from public.creative_versions cv
  cross join (values('app'),('signage')) ch(channel)
  where cv.id=any(p_version_ids) and ch.channel=any(p_channels)
    and (case when cv.image_paths is null then cv.image_path else cv.image_paths->>ch.channel end) is not null
    and (
      public.kago_is_maker_staff((select c.maker_id from public.creatives c where c.id=cv.creative_id))
      or exists(select 1 from public.ad_applications a left join public.application_revisions r on r.application_id=a.id
        where (a.creative_version_id=cv.id or r.creative_version_id=cv.id) and public.kago_is_store_staff(a.store_id))
      or exists(select 1 from public.ad_placements p where p.creative_version_id=cv.id and p.status='active'
        and ch.channel=any(p.channels) and ((ch.channel='app' and public.kago_has_role('customer'))
          or (ch.channel='signage' and p.store_id=public.kago_my_device_store_id())))
    );
$$;
revoke all on function public.kago_creative_image_path(uuid,text),public.kago_ad_media_paths(uuid[],text[]) from public,anon;
grant execute on function public.kago_ad_media_paths(uuid[],text[]) to authenticated;
create or replace function public.kago_check_application_terms(app public.ad_applications)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.ad_calls%rowtype;
begin
  if exists(select 1 from unnest(app.channels) ch where
      public.kago_creative_image_path(app.creative_version_id,ch) is null) then
    raise exception 'Requested channel has no registered image' using errcode='23514';
  end if;
  select * into c from public.ad_calls where id = app.ad_call_id for share;
  if not found then raise exception 'Unknown ad call' using errcode = '23503'; end if;
  if c.status <> 'open' or statement_timestamp() >= c.ends_at then
    raise exception 'Ad call is not open for applications' using errcode = '23514';
  end if;
  if not (app.channels <@ c.channels) then
    raise exception 'Requested channels are outside the ad call' using errcode = '23514';
  end if;
  if not (app.requested_period <@ tstzrange(c.starts_at, c.ends_at, '[)')) then
    raise exception 'Requested period is outside the ad call period' using errcode = '23514';
  end if;
  perform 1 from public.creatives cr join public.store_products sp
    on sp.store_id = app.store_id and sp.product_id = cr.product_id and sp.is_active
    where cr.id = app.creative_id for share of sp;
  if not found then
    raise exception 'Advertised product is not active in the call store' using errcode = '23503';
  end if;
end;
$$;
commit;
