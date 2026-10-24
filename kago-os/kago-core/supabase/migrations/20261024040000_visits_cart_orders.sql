-- DB-03. Requires DB-02. Checkout transaction is implemented separately in DB-07.
begin;

create table public.visits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  store_id uuid not null references public.stores(id) on delete restrict,
  status text not null default 'active' check (status in ('active','completed','abandoned')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  last_activity_at timestamptz not null default now(),
  cart_version integer not null default 0 check (cart_version >= 0),
  unique (id,user_id,store_id),
  check ((status = 'active' and ended_at is null) or
         (status in ('completed','abandoned') and ended_at is not null and ended_at >= started_at)),
  check (last_activity_at >= started_at)
);
create index visits_user_started_idx on public.visits(user_id,started_at desc);
create index visits_store_started_idx on public.visits(store_id,started_at desc);

create table public.cart_items (
  visit_id uuid not null references public.visits(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity integer not null check (quantity >= 1),
  updated_at timestamptz not null default now(),
  primary key (visit_id,product_id)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null unique,
  user_id uuid not null,
  store_id uuid not null,
  ordered_at timestamptz not null default now(),
  total integer not null check (total >= 0),
  idempotency_key uuid not null unique,
  cart_version integer not null check (cart_version >= 0),
  data_origin text not null check (data_origin in ('operated','seeded','synthetic')),
  created_at timestamptz not null default now(),
  foreign key (visit_id,user_id,store_id) references public.visits(id,user_id,store_id) on delete restrict
);
create index orders_user_ordered_idx on public.orders(user_id,ordered_at desc);
create index orders_store_ordered_idx on public.orders(store_id,ordered_at desc);

create table public.order_items (
  order_id uuid not null references public.orders(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  product_name text not null check (btrim(product_name) <> ''),
  unit_price integer not null check (unit_price >= 0),
  quantity integer not null check (quantity >= 1),
  primary key (order_id,product_id)
);

-- Keep visit ownership stable and serialize cart writes with checkout's visit lock.
create function public.kago_guard_visit_update()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if (new.id,new.user_id,new.store_id,new.started_at) is distinct from
     (old.id,old.user_id,old.store_id,old.started_at) then
    raise exception 'Visit identity is immutable' using errcode = '23514';
  end if;
  if old.status <> 'active' and new is distinct from old then
    raise exception 'Ended visits are immutable' using errcode = '23514';
  end if;
  if new.cart_version < old.cart_version or new.last_activity_at < old.last_activity_at then
    raise exception 'Visit version and activity must not go backwards' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger visits_guard before update on public.visits
for each row execute function public.kago_guard_visit_update();

create function public.kago_guard_cart_item()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v public.visits%rowtype; target_visit uuid;
begin
  if tg_op = 'UPDATE' and (new.visit_id,new.product_id) is distinct from (old.visit_id,old.product_id) then
    raise exception 'Cart identity is immutable' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then target_visit := old.visit_id; else target_visit := new.visit_id; end if;
  select * into v from public.visits where id=target_visit for update;
  if not found then raise exception 'Unknown visit' using errcode = '23503'; end if;
  if v.status <> 'active' then raise exception 'Cart requires active visit' using errcode = '23514'; end if;
  if tg_op <> 'DELETE' then
    perform 1 from public.store_products where store_id=v.store_id and product_id=new.product_id
      and is_active for share;
    if not found then raise exception 'Product is not active in visit store' using errcode = '23503'; end if;
    new.updated_at := statement_timestamp();
    return new;
  end if;
  return old;
end;
$$;
create trigger cart_items_guard before insert or update or delete on public.cart_items
for each row execute function public.kago_guard_cart_item();

-- Existing master price/name changes never update these snapshots.
create function public.kago_guard_order_item()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'Order snapshots are immutable' using errcode = '23514';
  end if;
  perform 1 from public.orders o join public.store_products sp
    on sp.store_id=o.store_id and sp.product_id=new.product_id where o.id=new.order_id;
  if not found then raise exception 'Product is not listed in order store' using errcode = '23503'; end if;
  return new;
end;
$$;
create trigger order_items_guard before insert or update or delete on public.order_items
for each row execute function public.kago_guard_order_item();

create function public.kago_reject_order_mutation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  raise exception 'Orders are immutable' using errcode = '23514';
end;
$$;
create trigger orders_immutable before update or delete on public.orders
for each row execute function public.kago_reject_order_mutation();

revoke all on function public.kago_guard_visit_update(), public.kago_guard_cart_item(),
  public.kago_guard_order_item(), public.kago_reject_order_mutation() from public,anon,authenticated;

alter table public.visits enable row level security;
alter table public.cart_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
revoke all on table public.visits,public.cart_items,public.orders,public.order_items from public,anon,authenticated;
grant select,insert,update,delete on table public.visits,public.cart_items to service_role;
grant select,insert on table public.orders,public.order_items to service_role;
commit;
