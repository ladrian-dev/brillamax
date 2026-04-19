-- 0007 — Correlativos de documentos + módulo de Producción.
--
-- Los documentos de negocio (OP, CP, VT, NE) usan correlativos por tenant en
-- formato `PREFIJO-YYYY-NNNN`. Una tabla `doc_sequences` persiste el último
-- número por (tenant, prefijo, año) — el RPC `next_doc_number` hace UPSERT
-- atómico con SELECT FOR UPDATE.
--
-- Spec: features/produccion.md. Nota: el spec usaba uuid para uom_id, pero
-- en este repo los UoM son text (public.uoms(id)). También se omite
-- units_of_measure/warehouses uuid refs que ya viven en 0002_onboarding.

---------- doc_sequences ----------
create table public.doc_sequences (
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  prefix     text not null,            -- 'OP','CP','VT','NE'
  year       int  not null,
  last_seq   int  not null default 0,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, prefix, year)
);

alter table public.doc_sequences enable row level security;
-- Lectura permitida por tenant; escritura sólo vía RPC (security definer).
create policy "doc_sequences_tenant_read" on public.doc_sequences
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create or replace function public.next_doc_number(p_prefix text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_year   int  := extract(year from now())::int;
  v_seq    int;
begin
  if v_tenant is null then
    raise exception 'no tenant in JWT' using errcode = '42501';
  end if;
  if p_prefix is null or length(trim(p_prefix)) = 0 then
    raise exception 'prefix requerido';
  end if;

  insert into public.doc_sequences (tenant_id, prefix, year, last_seq)
    values (v_tenant, p_prefix, v_year, 1)
  on conflict (tenant_id, prefix, year) do update
    set last_seq = public.doc_sequences.last_seq + 1,
        updated_at = now()
  returning last_seq into v_seq;

  return p_prefix || '-' || v_year::text || '-' || lpad(v_seq::text, 4, '0');
end;
$$;

revoke execute on function public.next_doc_number(text) from public, anon;
grant  execute on function public.next_doc_number(text) to authenticated;

---------- production_orders ----------
create type public.production_status as enum (
  'draft', 'ready', 'in_progress', 'completed', 'cancelled'
);

create table public.production_orders (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  po_number           text not null,
  product_id          uuid not null references public.products(id) on delete restrict,
  recipe_id           uuid not null references public.recipes(id) on delete restrict,
  planned_qty         numeric(14,3) not null check (planned_qty > 0),
  planned_uom_id      text not null references public.uoms(id),
  actual_qty          numeric(14,3) check (actual_qty is null or actual_qty > 0),
  batch_code          text,
  warehouse_id        uuid references public.warehouses(id) on delete restrict,
  status              public.production_status not null default 'draft',
  total_cost_usd      numeric(14,2),
  cost_per_yield_unit numeric(14,4),
  ph_actual           numeric(3,1) check (ph_actual is null or (ph_actual >= 0 and ph_actual <= 14)),
  viscosity_actual    text,
  qc_passed           boolean,
  qc_notes            text,
  observations        text,
  started_at          timestamptz,
  completed_at        timestamptz,
  cancelled_at        timestamptz,
  cancelled_reason    text,
  created_at          timestamptz not null default now(),
  created_by          uuid references auth.users(id) on delete set null,
  updated_at          timestamptz not null default now(),
  updated_by          uuid references auth.users(id) on delete set null,
  unique (tenant_id, po_number),
  check (status <> 'completed' or (actual_qty is not null and batch_code is not null and warehouse_id is not null)),
  check (status <> 'cancelled' or cancelled_at is not null)
);

create index production_orders_tenant_status_idx
  on public.production_orders(tenant_id, status, created_at desc);
create index production_orders_tenant_product_idx
  on public.production_orders(tenant_id, product_id);

alter table public.production_orders enable row level security;
create policy "production_orders_tenant_isolation" on public.production_orders
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

create trigger production_orders_touch before update on public.production_orders
  for each row execute function public.touch_row();

---------- production_order_issues ----------
-- MP efectivamente consumida al iniciar (start) la OP. `stock_movement_id`
-- apunta al movimiento `production_issue` que se generó.
create table public.production_order_issues (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public.tenants(id) on delete cascade,
  production_order_id  uuid not null references public.production_orders(id) on delete cascade,
  raw_material_id      uuid not null references public.raw_materials(id) on delete restrict,
  batch_code_consumed  text,
  qty                  numeric(14,4) not null check (qty > 0),
  uom_id               text not null references public.uoms(id),
  unit_cost_usd        numeric(14,4),
  stock_movement_id    uuid references public.stock_movements(id) on delete set null,
  created_at           timestamptz not null default now()
);

create index production_order_issues_po_idx
  on public.production_order_issues(production_order_id);

alter table public.production_order_issues enable row level security;
create policy "production_order_issues_tenant_isolation" on public.production_order_issues
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

---------- RPC: start_production_order ----------
-- Pasa una OP de ready → in_progress, emite stock de MP según los ingredientes
-- de la receta escalados al planned_qty, y persiste cada emisión en
-- production_order_issues con snapshot de unit_cost_usd.
create or replace function public.start_production_order(
  p_production_order_id uuid,
  p_issue_warehouse_id  uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_po     public.production_orders%rowtype;
  v_recipe public.recipes%rowtype;
  v_scale  numeric;
  v_ing    record;
  v_rm     public.raw_materials%rowtype;
  v_balance public.stock_balance%rowtype;
  v_qty_issue numeric;
  v_movement_id uuid;
begin
  if v_tenant is null then
    raise exception 'no tenant' using errcode = '42501';
  end if;

  select * into v_po from public.production_orders
    where id = p_production_order_id and tenant_id = v_tenant for update;
  if not found then raise exception 'OP no encontrada'; end if;
  if v_po.status not in ('draft', 'ready') then
    raise exception 'OP no iniciable desde status=%', v_po.status;
  end if;

  select * into v_recipe from public.recipes
    where id = v_po.recipe_id and tenant_id = v_tenant;
  if not found then raise exception 'receta no encontrada'; end if;
  if v_recipe.yield_qty <= 0 then
    raise exception 'yield_qty inválido en receta';
  end if;

  v_scale := v_po.planned_qty / v_recipe.yield_qty;

  for v_ing in
    select ri.raw_material_id, ri.qty, ri.uom_id
      from public.recipe_ingredients ri
     where ri.recipe_id = v_recipe.id
  loop
    select * into v_rm from public.raw_materials
      where id = v_ing.raw_material_id and tenant_id = v_tenant;
    if not found then
      raise exception 'MP % no existe', v_ing.raw_material_id;
    end if;

    v_qty_issue := v_ing.qty * v_scale;

    -- CPP actual de la MP en el warehouse de emisión — se usa sólo para
    -- snapshot en la fila issues. apply_stock_movement mantiene el balance
    -- y el CPP (en salidas el CPP no cambia).
    select * into v_balance from public.stock_balance
      where tenant_id = v_tenant
        and warehouse_id = p_issue_warehouse_id
        and item_kind = 'raw_material'
        and item_id = v_ing.raw_material_id
      order by batch_code nulls first
      limit 1;

    v_movement_id := public.apply_stock_movement(
      p_movement_kind  => 'production_issue',
      p_item_kind      => 'raw_material',
      p_item_id        => v_ing.raw_material_id,
      p_warehouse_id   => p_issue_warehouse_id,
      p_qty            => v_qty_issue,
      p_uom_id         => v_ing.uom_id,
      p_batch_code     => null,
      p_expiry_date    => null,
      p_unit_cost_usd  => null,
      p_reference_kind => 'production_order',
      p_reference_id   => v_po.id,
      p_notes          => null,
      p_allow_negative => false
    );

    insert into public.production_order_issues (
      tenant_id, production_order_id, raw_material_id,
      qty, uom_id, unit_cost_usd, stock_movement_id
    ) values (
      v_tenant, v_po.id, v_ing.raw_material_id,
      v_qty_issue, v_ing.uom_id,
      coalesce(v_balance.avg_cost_usd, v_rm.avg_cost_usd),
      v_movement_id
    );
  end loop;

  update public.production_orders
     set status = 'in_progress',
         started_at = now()
   where id = v_po.id;
end;
$$;

revoke execute on function public.start_production_order(uuid, uuid) from public, anon;
grant  execute on function public.start_production_order(uuid, uuid) to authenticated;

---------- RPC: complete_production_order ----------
-- Cierra la OP: requiere actual_qty + QC + warehouse; genera batch_code si no
-- se pasó; suma costos de issues para total_cost_usd; ingresa FG con
-- production_output usando unit_cost = total_cost / actual_qty.
create or replace function public.complete_production_order(
  p_production_order_id uuid,
  p_actual_qty          numeric,
  p_output_warehouse_id uuid,
  p_ph_actual           numeric default null,
  p_viscosity_actual    text    default null,
  p_qc_passed           boolean default null,
  p_qc_notes            text    default null,
  p_batch_code          text    default null,
  p_expiry_date         date    default null,
  p_observations        text    default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_po     public.production_orders%rowtype;
  v_total_usd numeric;
  v_unit_cost numeric;
  v_batch text;
  v_mov uuid;
begin
  if v_tenant is null then
    raise exception 'no tenant' using errcode = '42501';
  end if;
  if p_actual_qty is null or p_actual_qty <= 0 then
    raise exception 'actual_qty debe ser > 0';
  end if;

  select * into v_po from public.production_orders
    where id = p_production_order_id and tenant_id = v_tenant for update;
  if not found then raise exception 'OP no encontrada'; end if;
  if v_po.status <> 'in_progress' then
    raise exception 'OP no completable desde status=%', v_po.status;
  end if;

  select coalesce(sum(qty * coalesce(unit_cost_usd, 0)), 0)
    into v_total_usd
    from public.production_order_issues
   where production_order_id = v_po.id;

  v_unit_cost := v_total_usd / p_actual_qty;
  v_batch := coalesce(
    p_batch_code,
    'LOT-' || to_char(now(), 'YYYY-MM-DD') || '-' ||
      lpad((floor(random()*1000))::text, 3, '0')
  );

  v_mov := public.apply_stock_movement(
    p_movement_kind  => 'production_output',
    p_item_kind      => 'finished_good',
    p_item_id        => v_po.product_id,
    p_warehouse_id   => p_output_warehouse_id,
    p_qty            => p_actual_qty,
    p_uom_id         => v_po.planned_uom_id,
    p_batch_code     => v_batch,
    p_expiry_date    => p_expiry_date,
    p_unit_cost_usd  => v_unit_cost,
    p_reference_kind => 'production_order',
    p_reference_id   => v_po.id,
    p_notes          => null,
    p_allow_negative => false
  );

  update public.production_orders
     set status = 'completed',
         actual_qty = p_actual_qty,
         batch_code = v_batch,
         warehouse_id = p_output_warehouse_id,
         total_cost_usd = v_total_usd,
         cost_per_yield_unit = v_unit_cost,
         ph_actual = p_ph_actual,
         viscosity_actual = p_viscosity_actual,
         qc_passed = p_qc_passed,
         qc_notes = p_qc_notes,
         observations = coalesce(p_observations, observations),
         completed_at = now()
   where id = v_po.id;

  return v_mov;
end;
$$;

revoke execute on function public.complete_production_order(uuid, numeric, uuid, numeric, text, boolean, text, text, date, text) from public, anon;
grant  execute on function public.complete_production_order(uuid, numeric, uuid, numeric, text, boolean, text, text, date, text) to authenticated;

comment on table public.production_orders is
  'Órdenes de producción. Flujo: draft → ready (opcional) → in_progress (RPC start) → completed (RPC complete) | cancelled.';
