-- 0005 — Inventario: stock_balance (snapshot denormalizado) + stock_movements
-- (log append-only). CPP incremental se computa en el RPC apply_stock_movement.
--
-- Spec: features/inventario.md. Implementa venta, compra, producción, ajuste,
-- transferencia y conteo inicial bajo un solo punto de entrada (RPC) para
-- que tanto server actions como el sync runner offline persistan igual.

---------- tipos ----------
create type public.item_kind as enum ('raw_material', 'finished_good');

create type public.movement_kind as enum (
  'purchase_receipt',       -- entra MP por compra (+CPP)
  'production_output',      -- entra FG producido (+CPP desde costo receta)
  'production_issue',       -- sale MP consumida en OP
  'sale_issue',             -- sale FG vendido
  'transfer_in',
  'transfer_out',
  'adjustment_positive',    -- ajuste manual +
  'adjustment_negative',    -- ajuste manual - (merma, pérdida, rotura)
  'initial_count'           -- setea stock desde 0 en onboarding
);

---------- stock_balance ----------
-- Snapshot actual por (tenant, warehouse, kind, item_id, batch). Se mantiene
-- sincronizado con la suma de movements vía el trigger/RPC. Único por tupla.
create table public.stock_balance (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  warehouse_id  uuid not null references public.warehouses(id) on delete restrict,
  item_kind     public.item_kind not null,
  item_id       uuid not null,            -- ref lógica a raw_materials.id o products.id
  batch_code    text,                     -- NULL si el ítem no trackea lotes
  uom_id        text not null references public.uoms(id),
  qty           numeric(14,3) not null default 0 check (qty >= 0 or qty is null),
  avg_cost_usd  numeric(14,4) not null default 0 check (avg_cost_usd >= 0),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, warehouse_id, item_kind, item_id, batch_code)
);

-- Lookup rápido: "todo el stock del tenant en un warehouse"
create index stock_balance_tenant_wh_idx
  on public.stock_balance(tenant_id, warehouse_id);
create index stock_balance_tenant_item_idx
  on public.stock_balance(tenant_id, item_kind, item_id);

alter table public.stock_balance enable row level security;
create policy "stock_balance_tenant_isolation" on public.stock_balance
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

---------- stock_movements ----------
-- Log inmutable. No hay UPDATE ni DELETE: correcciones se hacen con un
-- movimiento inverso. Esto da trazabilidad limpia y auditoría permanente.
create table public.stock_movements (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  movement_kind  public.movement_kind not null,
  item_kind      public.item_kind not null,
  item_id        uuid not null,
  warehouse_id   uuid not null references public.warehouses(id) on delete restrict,
  batch_code     text,
  expiry_date    date,
  qty            numeric(14,3) not null check (qty <> 0),  -- signo: +entra, -sale
  uom_id         text not null references public.uoms(id),
  unit_cost_usd  numeric(14,4),            -- sólo entradas con costo conocido
  reference_kind text,                     -- 'purchase'|'production_order'|'sale'|…
  reference_id   uuid,
  notes          text,
  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users(id) on delete set null
);

create index stock_movements_tenant_date_idx
  on public.stock_movements(tenant_id, created_at desc);
create index stock_movements_tenant_item_date_idx
  on public.stock_movements(tenant_id, item_kind, item_id, created_at desc);

alter table public.stock_movements enable row level security;
-- Inserciones y lecturas sólo del tenant. Sin UPDATE/DELETE policies → nunca se
-- pueden ejecutar desde roles `authenticated`.
create policy "stock_movements_tenant_read" on public.stock_movements
  for select to authenticated
  using (tenant_id = public.current_tenant_id());
create policy "stock_movements_tenant_insert" on public.stock_movements
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id());

---------- helper: signo esperado por tipo de movimiento ----------
create or replace function public.movement_sign(m public.movement_kind)
returns int
language sql
immutable
as $$
  select case m
    when 'purchase_receipt'    then  1
    when 'production_output'   then  1
    when 'transfer_in'         then  1
    when 'adjustment_positive' then  1
    when 'initial_count'       then  1
    else -1
  end;
$$;

---------- RPC: apply_stock_movement ----------
-- Registra el movimiento + actualiza stock_balance atómicamente. El caller
-- pasa `qty` siempre positiva; la función aplica el signo según movement_kind.
-- Devuelve el id del movimiento insertado.
create or replace function public.apply_stock_movement(
  p_movement_kind  public.movement_kind,
  p_item_kind      public.item_kind,
  p_item_id        uuid,
  p_warehouse_id   uuid,
  p_qty            numeric,
  p_uom_id         text,
  p_batch_code     text default null,
  p_expiry_date    date default null,
  p_unit_cost_usd  numeric default null,
  p_reference_kind text default null,
  p_reference_id   uuid default null,
  p_notes          text default null,
  p_allow_negative boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_sign int := public.movement_sign(p_movement_kind);
  v_signed_qty numeric := v_sign * abs(p_qty);
  v_balance public.stock_balance%rowtype;
  v_new_qty numeric;
  v_new_cost numeric;
  v_movement_id uuid;
begin
  if v_tenant is null then
    raise exception 'no tenant in JWT' using errcode = '42501';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'qty debe ser > 0 (el signo lo pone movement_kind)';
  end if;
  -- Validación del warehouse — misma tenant (RLS lo respalda, pero mejor explícito).
  perform 1 from public.warehouses
    where id = p_warehouse_id and tenant_id = v_tenant;
  if not found then
    raise exception 'warehouse no pertenece al tenant';
  end if;

  -- Upsert del balance. SELECT … FOR UPDATE previene race de CPP.
  select * into v_balance
    from public.stock_balance
   where tenant_id = v_tenant
     and warehouse_id = p_warehouse_id
     and item_kind = p_item_kind
     and item_id = p_item_id
     and batch_code is not distinct from p_batch_code
   for update;

  if not found then
    -- Balance nuevo: qty empieza en 0 y costo en 0.
    v_new_qty := v_signed_qty;
    if v_new_qty < 0 and not p_allow_negative then
      raise exception 'stock insuficiente (no existe balance)';
    end if;
    v_new_cost := coalesce(p_unit_cost_usd, 0);
    insert into public.stock_balance
      (tenant_id, warehouse_id, item_kind, item_id, batch_code, uom_id,
       qty, avg_cost_usd, updated_at)
    values
      (v_tenant, p_warehouse_id, p_item_kind, p_item_id, p_batch_code, p_uom_id,
       v_new_qty, v_new_cost, now());
  else
    v_new_qty := v_balance.qty + v_signed_qty;
    if v_new_qty < 0 and not p_allow_negative then
      raise exception 'stock insuficiente: % + % < 0', v_balance.qty, v_signed_qty;
    end if;

    -- CPP incremental sólo en entradas con unit_cost conocido.
    if v_sign = 1 and p_unit_cost_usd is not null and p_unit_cost_usd >= 0 then
      if v_balance.qty <= 0 then
        v_new_cost := p_unit_cost_usd;
      else
        v_new_cost := (v_balance.qty * v_balance.avg_cost_usd
                       + abs(p_qty) * p_unit_cost_usd) / v_new_qty;
      end if;
    else
      v_new_cost := v_balance.avg_cost_usd;
    end if;

    update public.stock_balance
       set qty = v_new_qty,
           avg_cost_usd = v_new_cost,
           uom_id = p_uom_id,
           updated_at = now()
     where id = v_balance.id;
  end if;

  insert into public.stock_movements (
    tenant_id, movement_kind, item_kind, item_id, warehouse_id,
    batch_code, expiry_date, qty, uom_id, unit_cost_usd,
    reference_kind, reference_id, notes, created_by
  ) values (
    v_tenant, p_movement_kind, p_item_kind, p_item_id, p_warehouse_id,
    p_batch_code, p_expiry_date, v_signed_qty, p_uom_id, p_unit_cost_usd,
    p_reference_kind, p_reference_id, p_notes, auth.uid()
  )
  returning id into v_movement_id;

  return v_movement_id;
end;
$$;

revoke execute on function public.apply_stock_movement from public, anon;
grant  execute on function public.apply_stock_movement to authenticated;

---------- vista: stock_on_hand (join con nombres para UI) ----------
-- La UI de inventario suele querer "nombre + stock + costo + valor". Un view
-- RLS-safe (depende de stock_balance que ya tiene RLS).
create or replace view public.stock_on_hand as
select
  b.id,
  b.tenant_id,
  b.warehouse_id,
  b.item_kind,
  b.item_id,
  b.batch_code,
  b.uom_id,
  b.qty,
  b.avg_cost_usd,
  (b.qty * b.avg_cost_usd)::numeric(18,2) as value_usd,
  case b.item_kind
    when 'raw_material'  then rm.name
    when 'finished_good' then pr.name
  end as item_name,
  case b.item_kind
    when 'raw_material'  then rm.sku
    when 'finished_good' then pr.sku
  end as item_sku,
  case
    when b.item_kind = 'raw_material' and rm.min_stock > 0
      then b.qty < rm.min_stock
    else false
  end as low_stock
from public.stock_balance b
left join public.raw_materials rm
  on b.item_kind = 'raw_material' and rm.id = b.item_id
left join public.products pr
  on b.item_kind = 'finished_good' and pr.id = b.item_id;
