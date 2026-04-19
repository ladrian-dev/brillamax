-- 0001 — Fundación multi-tenant: tenants, membresías, Auth hook y política base.
-- ADR-005: RLS obligatoria día 1. Toda tabla de negocio futura debe:
--   1. tener `tenant_id uuid not null references tenants(id)`
--   2. tener policy `tenant_isolation` (ver pattern abajo)
--   3. tener índice `(tenant_id, ...)` como primera clave del access path

create extension if not exists "pgcrypto";

---------- tenants ----------
create table public.tenants (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(trim(name)) > 0),
  slug         text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  cutoff_date  date,                                       -- flujo 01: fecha de corte del conteo inicial
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

---------- tenant_members ----------
-- Tabla puente user ↔ tenant. En MVP un usuario pertenece a UN tenant (ADR-006:
-- no hay roles). La primary key compuesta evita membresías duplicadas.
create table public.tenant_members (
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  user_id     uuid not null references auth.users(id)     on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create index tenant_members_user_idx on public.tenant_members(user_id);

---------- Auth hook: inyectar tenant_id en el JWT ----------
-- Supabase llama a este hook cada vez que se emite un access token.
-- Lee la primera membresía del usuario y la añade como custom claim.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  claims    jsonb;
  t_id      uuid;
begin
  select tm.tenant_id into t_id
    from public.tenant_members tm
   where tm.user_id = (event->>'user_id')::uuid
   order by tm.created_at
   limit 1;

  claims := coalesce(event->'claims', '{}'::jsonb);

  if t_id is not null then
    claims := jsonb_set(claims, '{tenant_id}', to_jsonb(t_id::text));
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

-- Permisos requeridos por el hook (documentados en Supabase Auth Hooks).
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;

---------- helper: tenant_id actual ----------
create or replace function public.current_tenant_id()
returns uuid
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'tenant_id', '')::uuid
$$;

---------- RLS: tenants ----------
alter table public.tenants enable row level security;

-- Un usuario autenticado ve sólo el tenant del que es miembro.
create policy "tenants_select_own" on public.tenants
  for select to authenticated
  using (id = public.current_tenant_id());

-- Updates limitados al propio tenant; inserts/deletes se hacen server-side
-- con service_role durante onboarding (flujo 01).
create policy "tenants_update_own" on public.tenants
  for update to authenticated
  using (id = public.current_tenant_id())
  with check (id = public.current_tenant_id());

---------- RLS: tenant_members ----------
alter table public.tenant_members enable row level security;

create policy "members_select_own_tenant" on public.tenant_members
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

---------- trigger de updated_at ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger tenants_set_updated_at
  before update on public.tenants
  for each row execute function public.set_updated_at();
