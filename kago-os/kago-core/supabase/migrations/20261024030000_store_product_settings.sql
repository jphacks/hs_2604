-- DB-02: shared master data. Apply after COM-02 connection_check.
begin;

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (btrim(name) <> ''),
  branch_name text check (branch_name is null or btrim(branch_name) <> ''),
  timezone text not null default 'Asia/Tokyo' check (timezone = 'Asia/Tokyo'),
  created_at timestamptz not null default now()
);

create table public.store_members (
  store_id uuid not null references public.stores(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  role text not null default 'staff' check (role = 'staff'),
  created_at timestamptz not null default now(),
  primary key (store_id, user_id)
);
create index store_members_user_id_idx on public.store_members(user_id);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = btrim(code) and code <> ''),
  name text not null check (btrim(name) <> ''),
  category text not null check (btrim(category) <> ''),
  created_at timestamptz not null default now()
);

create table public.store_products (
  store_id uuid not null references public.stores(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  price integer not null check (price >= 0),
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (store_id, product_id)
);
create index store_products_product_id_idx on public.store_products(product_id);

create table public.customer_settings (
  user_id uuid primary key references auth.users(id) on delete restrict,
  slug text unique check (slug is null or slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  use_purchase_history boolean not null default false,
  use_current_cart boolean not null default false,
  updated_at timestamptz not null default now()
);

create function public.kago_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := statement_timestamp();
  return new;
end;
$$;
revoke all on function public.kago_set_updated_at() from public, anon, authenticated;

create trigger store_products_updated_at
before insert or update on public.store_products
for each row execute function public.kago_set_updated_at();

create trigger customer_settings_updated_at
before insert or update on public.customer_settings
for each row execute function public.kago_set_updated_at();

-- Deny browser/terminal access until DB-06 adds reviewed grants and policies.
-- Supabase may provide default grants; revoke them explicitly.
alter table public.stores enable row level security;
alter table public.store_members enable row level security;
alter table public.products enable row level security;
alter table public.store_products enable row level security;
alter table public.customer_settings enable row level security;

revoke all on table public.stores, public.store_members, public.products,
  public.store_products, public.customer_settings from public, anon, authenticated;
grant select, insert, update, delete on table public.stores, public.store_members,
  public.products, public.store_products, public.customer_settings to service_role;

commit;
