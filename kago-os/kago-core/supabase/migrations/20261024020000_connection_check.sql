-- COM-02: read-only connectivity probe. Business tables and RLS belong to DB-06.
begin;

create or replace function public.kago_connection_check()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select auth.uid() is not null;
$$;

revoke all on function public.kago_connection_check() from public, anon;
grant execute on function public.kago_connection_check() to authenticated;

commit;
