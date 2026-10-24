-- COM-03 / DB-06: private, immutable raster images for maker-owned creatives.
-- Supabase Storage owns storage.buckets/objects and their table grants/RLS.
begin;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('ad-images','ad-images',false,5242880,array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;
do $$begin
  if not exists (select 1 from storage.buckets where id='ad-images' and not public
    and file_size_limit=5242880
    and allowed_mime_types @> array['image/png','image/jpeg','image/webp']::text[]
    and allowed_mime_types <@ array['image/png','image/jpeg','image/webp']::text[]) then
    raise exception 'Existing ad-images bucket has incompatible settings';
  end if;
end$$;

-- Paths are maker UUID / creative UUID / random asset UUID . raster extension.
-- Asset IDs are independent of version numbers, so uploads never replace a prior version.
create function public.kago_ad_image_path_valid(p_path text)
returns boolean language sql immutable set search_path='' as $$
  select coalesce(p_path ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\.(png|jpg|webp)$',false);
$$;

create function public.kago_can_upload_ad_image(p_path text)
returns boolean language plpgsql stable security definer set search_path='' as $$
begin
  if not public.kago_ad_image_path_valid(p_path) then return false; end if;
  return exists(select 1 from public.creatives c
    where c.id=split_part(p_path,'/',2)::uuid and c.maker_id=split_part(p_path,'/',1)::uuid
      and public.kago_is_maker_staff(c.maker_id));
end;
$$;

create function public.kago_can_read_ad_image(p_path text)
returns boolean language plpgsql stable security definer set search_path='' as $$
begin
  if not public.kago_ad_image_path_valid(p_path) then return false; end if;
  -- The maker may preview an upload before a creative_version is saved.
  if public.kago_can_upload_ad_image(p_path) then return true; end if;
  return exists(select 1 from public.creative_versions cv join public.creatives c on c.id=cv.creative_id
    where cv.image_path=p_path and c.id=split_part(p_path,'/',2)::uuid
      and c.maker_id=split_part(p_path,'/',1)::uuid
      and public.kago_creative_version_visible(cv.id));
end;
$$;

revoke all on function public.kago_ad_image_path_valid(text),public.kago_can_upload_ad_image(text),
  public.kago_can_read_ad_image(text) from public,anon;
grant execute on function public.kago_ad_image_path_valid(text),public.kago_can_upload_ad_image(text),
  public.kago_can_read_ad_image(text) to authenticated,service_role;

create policy ad_images_insert on storage.objects for insert to authenticated
  with check (bucket_id='ad-images' and public.kago_can_upload_ad_image(name));
create policy ad_images_select on storage.objects for select to authenticated
  using (bucket_id='ad-images' and public.kago_can_read_ad_image(name));
-- No UPDATE/DELETE policies: upsert, move, replace and delete are denied to API users.
-- Create a new image_path and creative_version for each replacement.
commit;
