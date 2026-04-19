-- 0008 — Compras: recepción de MP con conversión VEF→USD y update de CPP.
--
-- Espejo del spec features/compras.md con adaptaciones:
--  - uom_id es text (public.uoms), no uuid.
--  - `total_vef` generada via expression (USD * rate).
--  - Cada purchase_item genera un stock_movement purchase_receipt vía RPC.
--  - purchase_payments se difiere: para MVP asumimos todas las compras `paid`
--    al momento (pago parcial se agregará post-MVP). La columna existe para
--    no bloquear la feature, pero el flujo inicial sólo usa payment_status.

create type public.purchase_currency as enum ('USD', 'VEF');
create type public.purchase_payment_status as enum ('paid', 'pending', 'partial');

create table public.purchases (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null references public.tenants(id) on delete cascade,
  purchase_number         text not null,
  supplier_id             uuid not null references public.suppliers(id) on delete restrict,
  purchase_date           date not null default current_date,
  currency                public.purchase_currency not null default 'USD',
  exchange_rate_used      numeric(14,4) not null check (exchange_rate_used > 0),
  total_usd               numeric(14,2) not null default 0 check (total_usd >= 0),
  total_original_currency numeric(14,2) not null default 0 check (total_original_currency >= 0),
  payment_status          public.purchase_payment_status not null default 'paid',
  payment_method          text,
  notes                   text,
  created_at              timestamptz not null default now(),
  created_by              uuid references auth.users(id) on delete set null,
  unique (tenant_id, purchase_number)
);

create index purchases_tenant_date_idx
  on public.purchases(tenant_id, purchase_date desc);

alter table public.purchases enable row level security;
create policy "purchases_tenant_isolation" on public.purchases
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

create table public.purchase_items (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references public.tenants(id) on delete cascade,
  purchase_id            uuid not null references public.purchases(id) on delete cascade,
  raw_material_id        uuid not null references public.raw_materials(id) on delete restrict,
  qty                    numeric(14,4) not null check (qty > 0),
  uom_id                 text not null references public.uoms(id),
  unit_price_original    numeric(14,4) not null check (unit_price_original >= 0),
  unit_price_usd         numeric(14,4) not null check (unit_price_usd >= 0),
  line_total_usd         numeric(14,2) not null check (line_total_usd >= 0),
  batch_code             text,
  expiry_date            date,
  warehouse_id           uuid not null references public.warehouses(id) on delete restrict,
  stock_movement_id      uuid references public.stock_movements(id) on delete set null
);

create index purchase_items_purchase_idx on public.purchase_items(purchase_id);
create index purchase_items_rm_idx on public.purchase_items(tenant_id, raw_material_id);

alter table public.purchase_items enable row level security;
create policy "purchase_items_tenant_isolation" on public.purchase_items
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

---------- RPC: register_purchase ----------
-- Inserta cabecera + items y aplica stock_movements de tipo purchase_receipt
-- atómicamente. Recibe los items como jsonb array; cada item:
-- { raw_material_id, qty, uom_id, unit_price_original, batch_code?, expiry_date?, warehouse_id }
-- Convierte a USD según currency + exchange_rate_used. Devuelve el id de la compra.
create or replace function public.register_purchase(
  p_supplier_id           uuid,
  p_purchase_date         date,
  p_currency              public.purchase_currency,
  p_exchange_rate_used    numeric,
  p_payment_status        public.purchase_payment_status,
  p_payment_method        text,
  p_notes                 text,
  p_items                 jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_number text;
  v_id     uuid;
  v_item   jsonb;
  v_rm     public.raw_materials%rowtype;
  v_qty    numeric;
  v_unit_orig numeric;
  v_unit_usd  numeric;
  v_line_usd  numeric;
  v_total_usd numeric := 0;
  v_total_orig numeric := 0;
  v_movement_id uuid;
  v_batch text;
  v_expiry date;
  v_warehouse uuid;
begin
  if v_tenant is null then
    raise exception 'no tenant' using errcode = '42501';
  end if;
  if p_exchange_rate_used is null or p_exchange_rate_used <= 0 then
    raise exception 'exchange_rate_used inválido';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'items requeridos';
  end if;

  v_number := public.next_doc_number('CP');

  insert into public.purchases (
    tenant_id, purchase_number, supplier_id, purchase_date,
    currency, exchange_rate_used, payment_status, payment_method, notes,
    created_by
  ) values (
    v_tenant, v_number, p_supplier_id, p_purchase_date,
    p_currency, p_exchange_rate_used, p_payment_status, p_payment_method, p_notes,
    auth.uid()
  )
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'qty')::numeric;
    v_unit_orig := (v_item->>'unit_price_original')::numeric;
    if p_currency = 'VEF' then
      v_unit_usd := v_unit_orig / p_exchange_rate_used;
    else
      v_unit_usd := v_unit_orig;
    end if;
    v_line_usd := round(v_qty * v_unit_usd, 2);
    v_total_usd := v_total_usd + v_line_usd;
    v_total_orig := v_total_orig + round(v_qty * v_unit_orig, 2);

    v_batch := nullif(v_item->>'batch_code', '');
    v_expiry := nullif(v_item->>'expiry_date', '')::date;
    v_warehouse := (v_item->>'warehouse_id')::uuid;

    select * into v_rm from public.raw_materials
      where id = (v_item->>'raw_material_id')::uuid and tenant_id = v_tenant;
    if not found then
      raise exception 'MP % no pertenece al tenant', v_item->>'raw_material_id';
    end if;
    if v_rm.track_batch and v_batch is null then
      raise exception 'MP % requiere batch_code', v_rm.sku;
    end if;

    v_movement_id := public.apply_stock_movement(
      p_movement_kind  => 'purchase_receipt',
      p_item_kind      => 'raw_material',
      p_item_id        => v_rm.id,
      p_warehouse_id   => v_warehouse,
      p_qty            => v_qty,
      p_uom_id         => v_item->>'uom_id',
      p_batch_code     => v_batch,
      p_expiry_date    => v_expiry,
      p_unit_cost_usd  => v_unit_usd,
      p_reference_kind => 'purchase',
      p_reference_id   => v_id,
      p_notes          => null,
      p_allow_negative => false
    );

    insert into public.purchase_items (
      tenant_id, purchase_id, raw_material_id, qty, uom_id,
      unit_price_original, unit_price_usd, line_total_usd,
      batch_code, expiry_date, warehouse_id, stock_movement_id
    ) values (
      v_tenant, v_id, v_rm.id, v_qty, v_item->>'uom_id',
      v_unit_orig, v_unit_usd, v_line_usd,
      v_batch, v_expiry, v_warehouse, v_movement_id
    );

    -- Sincronizar avg_cost_usd del raw_materials con el balance fresco
    -- (útil para recipe_cost_current que lo lee de rm). Tomamos el CPP
    -- agregado ponderado de TODOS los balances de la MP en el tenant.
    update public.raw_materials set avg_cost_usd = (
      select case when sum(qty) > 0
                  then sum(qty * avg_cost_usd) / sum(qty)
                  else 0
             end
        from public.stock_balance
       where tenant_id = v_tenant
         and item_kind = 'raw_material'
         and item_id = v_rm.id
    )
    where id = v_rm.id;
  end loop;

  update public.purchases
     set total_usd = v_total_usd,
         total_original_currency = v_total_orig
   where id = v_id;

  return v_id;
end;
$$;

revoke execute on function public.register_purchase(uuid, date, public.purchase_currency, numeric, public.purchase_payment_status, text, text, jsonb) from public, anon;
grant  execute on function public.register_purchase(uuid, date, public.purchase_currency, numeric, public.purchase_payment_status, text, text, jsonb) to authenticated;
