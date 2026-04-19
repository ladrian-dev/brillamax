-- 0004 — Catálogo maestro: productos terminados, materias primas, clientes,
-- proveedores. Todas las tablas son per-tenant con RLS + soft-delete
-- (archived_at) + audit mínimo (created_by/updated_*). SKU único por tenant.
--
-- Spec: features/catalogo-y-datos-maestros.md. Se omite CSV import y
-- units_of_measure per-tenant (usamos public.uoms global de 0002).

---------- helper: trigger para updated_at/updated_by ----------
create or replace function public.touch_row()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

---------- suppliers (se crea primero: raw_materials lo referencia) ----------
create type public.supplier_currency as enum ('USD', 'VEF');

create table public.suppliers (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  name            text not null check (length(trim(name)) > 0),
  rif             text,
  phone           text,
  contact_person  text,
  preferred_currency public.supplier_currency,
  notes           text,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id) on delete set null,
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users(id) on delete set null
);

create index suppliers_tenant_idx on public.suppliers(tenant_id)
  where archived_at is null;

alter table public.suppliers enable row level security;
create policy "suppliers_tenant_isolation" on public.suppliers
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

create trigger suppliers_touch before update on public.suppliers
  for each row execute function public.touch_row();

---------- products (terminados) ----------
create table public.products (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  sku           text not null check (length(trim(sku)) > 0),
  name          text not null check (length(trim(name)) > 0),
  presentation  text,
  price_usd     numeric(14,2) not null default 0 check (price_usd >= 0),
  category      text,
  description   text,
  photo_url     text,
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users(id) on delete set null,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id) on delete set null,
  unique (tenant_id, sku)
);

create index products_tenant_idx on public.products(tenant_id)
  where archived_at is null;
create index products_tenant_category_idx on public.products(tenant_id, category)
  where archived_at is null;

alter table public.products enable row level security;
create policy "products_tenant_isolation" on public.products
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

create trigger products_touch before update on public.products
  for each row execute function public.touch_row();

---------- raw_materials ----------
create table public.raw_materials (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public.tenants(id) on delete cascade,
  sku                  text not null check (length(trim(sku)) > 0),
  name                 text not null check (length(trim(name)) > 0),
  uom_id               text not null references public.uoms(id),
  avg_cost_usd         numeric(14,4) not null default 0 check (avg_cost_usd >= 0),
  min_stock            numeric(14,3) not null default 0 check (min_stock >= 0),
  track_batch          boolean not null default false,
  default_supplier_id  uuid references public.suppliers(id) on delete set null,
  archived_at          timestamptz,
  created_at           timestamptz not null default now(),
  created_by           uuid references auth.users(id) on delete set null,
  updated_at           timestamptz not null default now(),
  updated_by           uuid references auth.users(id) on delete set null,
  unique (tenant_id, sku)
);

create index raw_materials_tenant_idx on public.raw_materials(tenant_id)
  where archived_at is null;

alter table public.raw_materials enable row level security;
create policy "raw_materials_tenant_isolation" on public.raw_materials
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

create trigger raw_materials_touch before update on public.raw_materials
  for each row execute function public.touch_row();

---------- customers ----------
create type public.customer_type    as enum ('consumer', 'bodega', 'mayorista', 'otro');
create type public.payment_terms    as enum ('cash', '7d', '15d', '30d');

create table public.customers (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null references public.tenants(id) on delete cascade,
  name                    text not null check (length(trim(name)) > 0),
  type                    public.customer_type not null default 'consumer',
  rif                     text,
  phone                   text,
  email                   text,
  address                 text,
  default_payment_terms   public.payment_terms not null default 'cash',
  notes                   text,
  archived_at             timestamptz,
  created_at              timestamptz not null default now(),
  created_by              uuid references auth.users(id) on delete set null,
  updated_at              timestamptz not null default now(),
  updated_by              uuid references auth.users(id) on delete set null
);

create index customers_tenant_idx on public.customers(tenant_id)
  where archived_at is null;
create index customers_tenant_type_idx on public.customers(tenant_id, type)
  where archived_at is null;

alter table public.customers enable row level security;
create policy "customers_tenant_isolation" on public.customers
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

create trigger customers_touch before update on public.customers
  for each row execute function public.touch_row();
