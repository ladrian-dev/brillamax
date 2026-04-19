-- 0006 — Recetas / fórmulas versionadas.
--
-- Cada producto puede tener varias recetas (versiones). El versionado es
-- inmutable: si una receta ya fue usada en una OP completada, editarla crea
-- una nueva versión y deja la anterior como archived. MVP no tiene
-- production_orders todavía, así que la enforcement vive en el server action
-- (status='draft' => editable; active/archived => read-only).
--
-- Spec: features/recetas-formulas.md.

---------- enum de estados ----------
create type public.recipe_status as enum ('draft', 'active', 'archived');

---------- recipes ----------
create table public.recipes (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public.tenants(id) on delete cascade,
  product_id           uuid not null references public.products(id) on delete restrict,
  name                 text not null check (length(trim(name)) > 0),
  version              text not null check (length(trim(version)) > 0),
  category             text,
  yield_qty            numeric(14,3) not null check (yield_qty > 0),
  yield_uom_id         text not null references public.uoms(id),
  mixing_time_minutes  integer check (mixing_time_minutes is null or mixing_time_minutes > 0),
  ph_min               numeric(3,1) check (ph_min is null or (ph_min >= 0 and ph_min <= 14)),
  ph_max               numeric(3,1) check (ph_max is null or (ph_max >= 0 and ph_max <= 14)),
  viscosity_target     text,
  instructions         text,
  status               public.recipe_status not null default 'draft',
  is_default           boolean not null default false,
  archived_reason      text,
  archived_at          timestamptz,
  created_at           timestamptz not null default now(),
  created_by           uuid references auth.users(id) on delete set null,
  updated_at           timestamptz not null default now(),
  updated_by           uuid references auth.users(id) on delete set null,
  unique (tenant_id, product_id, version),
  check (ph_min is null or ph_max is null or ph_min <= ph_max),
  check (status <> 'archived' or archived_at is not null)
);

create index recipes_tenant_product_idx on public.recipes(tenant_id, product_id)
  where archived_at is null;

create index recipes_tenant_status_idx on public.recipes(tenant_id, status)
  where archived_at is null;

-- Solo una receta default por producto activa (archived no cuentan).
create unique index recipes_default_per_product_idx
  on public.recipes(tenant_id, product_id)
  where is_default = true and archived_at is null;

alter table public.recipes enable row level security;
create policy "recipes_tenant_isolation" on public.recipes
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

create trigger recipes_touch before update on public.recipes
  for each row execute function public.touch_row();

---------- recipe_ingredients ----------
create table public.recipe_ingredients (
  id               uuid primary key default gen_random_uuid(),
  recipe_id        uuid not null references public.recipes(id) on delete cascade,
  raw_material_id  uuid not null references public.raw_materials(id) on delete restrict,
  qty              numeric(14,4) not null check (qty > 0),
  uom_id           text not null references public.uoms(id),
  order_index      integer not null default 0,
  notes            text,
  unique (recipe_id, raw_material_id)
);

create index recipe_ingredients_recipe_idx on public.recipe_ingredients(recipe_id);

-- RLS: ingredientes son accesibles sólo si la receta padre pertenece al tenant.
alter table public.recipe_ingredients enable row level security;
create policy "recipe_ingredients_via_recipe" on public.recipe_ingredients
  for all to authenticated
  using (exists (
    select 1 from public.recipes r
    where r.id = recipe_ingredients.recipe_id
      and r.tenant_id = public.current_tenant_id()
  ))
  with check (exists (
    select 1 from public.recipes r
    where r.id = recipe_ingredients.recipe_id
      and r.tenant_id = public.current_tenant_id()
  ));

---------- vista: costo actual de cada receta ----------
-- breakdown por ingrediente + total, usando avg_cost_usd de raw_materials.
-- Nota: no convierte UoM todavía (MVP asume que el ingrediente se ingresa en
-- la misma unidad base que la MP). La conversión vendrá con el feature UoM.
create view public.recipe_cost_current
with (security_invoker = true)
as
select
  r.id                as recipe_id,
  r.tenant_id         as tenant_id,
  r.yield_qty         as yield_qty,
  r.yield_uom_id      as yield_uom_id,
  coalesce(sum(ri.qty * rm.avg_cost_usd), 0)::numeric(14,4) as total_usd,
  case
    when r.yield_qty > 0
      then (coalesce(sum(ri.qty * rm.avg_cost_usd), 0) / r.yield_qty)::numeric(14,4)
    else 0
  end                 as per_unit_usd
from public.recipes r
left join public.recipe_ingredients ri on ri.recipe_id = r.id
left join public.raw_materials rm       on rm.id = ri.raw_material_id
group by r.id, r.tenant_id, r.yield_qty, r.yield_uom_id;

---------- vista: detalle de ingredientes con costo ----------
create view public.recipe_ingredient_breakdown
with (security_invoker = true)
as
select
  ri.id                         as id,
  ri.recipe_id                  as recipe_id,
  r.tenant_id                   as tenant_id,
  ri.raw_material_id            as raw_material_id,
  rm.sku                        as rm_sku,
  rm.name                       as rm_name,
  ri.qty                        as qty,
  ri.uom_id                     as uom_id,
  ri.order_index                as order_index,
  ri.notes                      as notes,
  rm.avg_cost_usd               as unit_cost_usd,
  (ri.qty * rm.avg_cost_usd)::numeric(14,4) as subtotal_usd
from public.recipe_ingredients ri
join public.recipes r       on r.id = ri.recipe_id
join public.raw_materials rm on rm.id = ri.raw_material_id;

---------- RPC: duplicar receta como nueva versión ----------
-- Clona la receta origen con nueva versión y copia sus ingredientes.
-- No activa automáticamente (se crea en draft). El caller decide cuándo
-- promover a active y archivar la anterior.
create or replace function public.clone_recipe_as_version(
  p_source_recipe_id uuid,
  p_new_version      text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source   public.recipes%rowtype;
  v_tenant   uuid;
  v_new_id   uuid;
begin
  v_tenant := public.current_tenant_id();
  if v_tenant is null then
    raise exception 'Sin tenant en contexto';
  end if;

  select * into v_source from public.recipes
    where id = p_source_recipe_id and tenant_id = v_tenant;
  if not found then
    raise exception 'Receta origen no encontrada';
  end if;

  insert into public.recipes (
    tenant_id, product_id, name, version, category,
    yield_qty, yield_uom_id, mixing_time_minutes,
    ph_min, ph_max, viscosity_target, instructions,
    status, is_default, created_by
  ) values (
    v_tenant, v_source.product_id, v_source.name, p_new_version, v_source.category,
    v_source.yield_qty, v_source.yield_uom_id, v_source.mixing_time_minutes,
    v_source.ph_min, v_source.ph_max, v_source.viscosity_target, v_source.instructions,
    'draft', false, auth.uid()
  )
  returning id into v_new_id;

  insert into public.recipe_ingredients (
    recipe_id, raw_material_id, qty, uom_id, order_index, notes
  )
  select v_new_id, raw_material_id, qty, uom_id, order_index, notes
  from public.recipe_ingredients
  where recipe_id = p_source_recipe_id;

  return v_new_id;
end;
$$;

revoke all on function public.clone_recipe_as_version(uuid, text) from public;
grant execute on function public.clone_recipe_as_version(uuid, text) to authenticated;

comment on table public.recipes is
  'Recetas versionadas inmutables. Draft se edita libre; active/archived solo-lectura — editar genera nueva versión.';
comment on view public.recipe_cost_current is
  'Costo total y por unidad de yield de cada receta según avg_cost_usd vigente de cada MP.';
