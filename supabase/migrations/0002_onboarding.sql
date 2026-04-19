-- 0002 — Infraestructura de onboarding: UoMs globales, warehouses por tenant,
-- y RPC transaccional create_tenant que arma el mínimo viable (tenant +
-- membresía + warehouse default) en una sola llamada.
--
-- Flujo 01 (onboarding): tras verificar OTP, el usuario llama a create_tenant.
-- El Auth Hook (0001) inyecta tenant_id en el siguiente JWT emitido, por lo
-- que el cliente debe refrescar la sesión tras el éxito.

---------- unidades de medida (globales) ----------
-- Compartidas entre tenants en MVP. Si un cliente necesita UoMs custom
-- (raro en productos de limpieza), se migra a per-tenant en el futuro.
create type public.uom_kind as enum ('mass', 'volume', 'count', 'length');

create table public.uoms (
  id     text primary key,                 -- 'kg', 'L', 'unidad', etc.
  name   text not null,
  kind   public.uom_kind not null,
  -- Factor a la UoM base de su `kind`: base de mass=kg, volume=L, count=unidad.
  -- Un gramo tiene factor 0.001 contra kg; un ml tiene 0.001 contra L.
  factor_to_base numeric(18,6) not null check (factor_to_base > 0)
);

insert into public.uoms (id, name, kind, factor_to_base) values
  ('kg',     'Kilogramo', 'mass',   1),
  ('g',      'Gramo',     'mass',   0.001),
  ('L',      'Litro',     'volume', 1),
  ('ml',     'Mililitro', 'volume', 0.001),
  ('unidad', 'Unidad',    'count',  1),
  ('caja',   'Caja',      'count',  1),
  ('pallet', 'Pallet',    'count',  1);

alter table public.uoms enable row level security;

create policy "uoms_select_all_authenticated" on public.uoms
  for select to authenticated using (true);

---------- warehouses (per-tenant) ----------
create table public.warehouses (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  is_default  boolean not null default false,
  created_at  timestamptz not null default now()
);

create index warehouses_tenant_idx on public.warehouses(tenant_id);

-- Un único warehouse default por tenant.
create unique index warehouses_one_default_per_tenant
  on public.warehouses(tenant_id)
  where is_default;

alter table public.warehouses enable row level security;

create policy "warehouses_tenant_isolation" on public.warehouses
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

---------- RPC: create_tenant ----------
-- Se llama tras el primer login cuando el usuario todavía no tiene tenant_id
-- en el JWT. SECURITY DEFINER bypasea las policies RLS para permitir la
-- inserción atómica de tenant + membresía + warehouse default.
create or replace function public.create_tenant(
  p_name text,
  p_slug text,
  p_warehouse_name text default 'Almacén principal'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_existing_tenant uuid;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Si el usuario ya pertenece a un tenant, devolvemos ese (idempotente).
  select tenant_id into v_existing_tenant
    from public.tenant_members
   where user_id = v_user_id
   limit 1;

  if v_existing_tenant is not null then
    return v_existing_tenant;
  end if;

  insert into public.tenants (name, slug)
    values (trim(p_name), lower(trim(p_slug)))
    returning id into v_tenant_id;

  insert into public.tenant_members (tenant_id, user_id)
    values (v_tenant_id, v_user_id);

  insert into public.warehouses (tenant_id, name, is_default)
    values (v_tenant_id, trim(p_warehouse_name), true);

  return v_tenant_id;
end;
$$;

revoke execute on function public.create_tenant from public, anon;
grant  execute on function public.create_tenant to authenticated;
