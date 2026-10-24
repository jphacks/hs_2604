-- Administrator read-only check. No customer identifiers, rows or credentials.
-- A successful App deployment does not prove these DB prerequisites are installed.
with required(name, signature) as (values
  ('app_get_cart', 'public.app_get_cart(uuid)'),
  ('app_list_products', 'public.app_list_products(uuid,text,integer)'),
  ('app_lookup_product', 'public.app_lookup_product(uuid,uuid,text,uuid,text)'),
  ('app_set_cart_item', 'public.app_set_cart_item(uuid,uuid,uuid,integer,integer,text,uuid)')
), functions as (
  select r.name, p.oid, p.prosecdef, p.proconfig,
    coalesce(has_function_privilege('authenticated', p.oid, 'execute'), false) as customer_execute,
    coalesce(has_function_privilege('anon', p.oid, 'execute'), false) as anonymous_execute
  from required r left join pg_proc p on p.oid = to_regprocedure(r.signature)
), receipt as (
  select c.oid, c.relrowsecurity,
    coalesce(has_table_privilege('authenticated', c.oid, 'select,insert,update,delete'), false) as customer_direct_access,
    coalesce(has_table_privilege('anon', c.oid, 'select,insert,update,delete'), false) as anonymous_direct_access
  from (values (1)) seed(n) left join pg_class c on c.oid = to_regclass('public.app_cart_requests')
)
select
  count(f.oid)::integer as installed_functions,
  array_agg(f.name order by f.name) filter (where f.oid is null) as missing_functions,
  bool_and(f.customer_execute) as customer_execute,
  bool_and(not f.anonymous_execute) as anonymous_denied,
  bool_and(coalesce(f.prosecdef and 'search_path=""' = any(f.proconfig), false)) as function_guards,
  coalesce((select relrowsecurity and not customer_direct_access and not anonymous_direct_access from receipt), false) as receipt_protected,
  count(f.oid) = 4 and bool_and(f.customer_execute and not f.anonymous_execute
    and coalesce(f.prosecdef and 'search_path=""' = any(f.proconfig), false))
    and coalesce((select relrowsecurity and not customer_direct_access and not anonymous_direct_access from receipt), false) as ready
from functions f;
