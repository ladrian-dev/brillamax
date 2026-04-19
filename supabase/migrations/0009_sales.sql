-- 0009 — Ventas: B2C rápida y B2B con pagos múltiples, dual-currency.
--
-- Espejo del spec features/ventas.md con adaptaciones al esquema local:
--  - uom_id es text (public.uoms), no uuid.
--  - total_vef se calcula en la RPC (no columna generada) porque
--    exchange_rate_used queda fijo por venta.
--  - MVP: sin delivery_note_id (nota de entrega llega en sprint 7-8).
--  - MVP: customer_id = NULL ⇒ "público general".
--  - register_sale crea la venta en estado 'confirmed' (atómica).
--    Para draft/borradores y múltiples pagos diferidos, ver roadmap CxC.

create type public.sale_status as enum ('draft', 'confirmed', 'delivered', 'cancelled');
create type public.sale_payment_status as enum ('pending', 'partial', 'paid');
create type public.sale_payment_method as enum (
  'cash_usd', 'cash_vef', 'zelle', 'transfer_vef', 'pago_movil', 'usdt', 'mixed', 'other'
);

create table public.sales (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null references public.tenants(id) on delete cascade,
  sale_number             text not null,
  customer_id             uuid references public.customers(id) on delete restrict,
  sale_date               date not null default current_date,
  status                  public.sale_status not null default 'confirmed',
  payment_status          public.sale_payment_status not null default 'pending',
  payment_terms           text,
  subtotal_usd            numeric(14,2) not null default 0 check (subtotal_usd >= 0),
  discount_usd            numeric(14,2) not null default 0 check (discount_usd >= 0),
  total_usd               numeric(14,2) not null default 0 check (total_usd >= 0),
  exchange_rate_used      numeric(14,4) not null check (exchange_rate_used > 0),
  total_vef               numeric(14,2) generated always as (total_usd * exchange_rate_used) stored,
  notes                   text,
  cancelled_at            timestamptz,
  cancelled_reason        text,
  delivered_at            timestamptz,
  created_at              timestamptz not null default now(),
  created_by              uuid references auth.users(id) on delete set null,
  unique (tenant_id, sale_number)
);

create index sales_tenant_date_idx on public.sales(tenant_id, sale_date desc);
create index sales_tenant_customer_idx on public.sales(tenant_id, customer_id) where customer_id is not null;

alter table public.sales enable row level security;
create policy "sales_tenant_isolation" on public.sales
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

create table public.sale_items (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  sale_id           uuid not null references public.sales(id) on delete cascade,
  product_id        uuid not null references public.products(id) on delete restrict,
  qty               numeric(14,3) not null check (qty > 0),
  uom_id            text not null references public.uoms(id),
  unit_price_usd    numeric(14,2) not null check (unit_price_usd >= 0),
  discount_usd      numeric(14,2) not null default 0 check (discount_usd >= 0),
  line_total_usd    numeric(14,2) not null check (line_total_usd >= 0),
  warehouse_id      uuid not null references public.warehouses(id) on delete restrict,
  batch_code        text,
  stock_movement_id uuid references public.stock_movements(id) on delete set null
);

create index sale_items_sale_idx on public.sale_items(sale_id);
create index sale_items_product_idx on public.sale_items(tenant_id, product_id);

alter table public.sale_items enable row level security;
create policy "sale_items_tenant_isolation" on public.sale_items
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

create table public.sale_payments (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  sale_id            uuid not null references public.sales(id) on delete cascade,
  payment_date       date not null default current_date,
  method             public.sale_payment_method not null,
  amount_usd         numeric(14,2) not null check (amount_usd > 0),
  amount_original    numeric(14,2),
  original_currency  text check (original_currency in ('USD','VEF')),
  reference          text,
  notes              text,
  created_at         timestamptz not null default now(),
  created_by         uuid references auth.users(id) on delete set null
);

create index sale_payments_sale_idx on public.sale_payments(sale_id);

alter table public.sale_payments enable row level security;
create policy "sale_payments_tenant_isolation" on public.sale_payments
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

---------- RPC: register_sale ----------
-- Crea venta en estado 'confirmed', descuenta stock de FG vía sale_issue,
-- inserta pagos y deriva payment_status según suma de pagos vs total.
-- Recibe items y payments como jsonb arrays.
--
-- p_items:    [{product_id, qty, uom_id, unit_price_usd, discount_usd?, warehouse_id, batch_code?}]
-- p_payments: [{method, amount_usd, amount_original?, original_currency?, reference?, notes?}]
--
-- Devuelve el id de la venta.
create or replace function public.register_sale(
  p_customer_id       uuid,
  p_sale_date         date,
  p_exchange_rate     numeric,
  p_payment_terms     text,
  p_discount_usd      numeric,
  p_notes             text,
  p_items             jsonb,
  p_payments          jsonb,
  p_allow_negative    boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_number text;
  v_id uuid;
  v_item jsonb;
  v_pay jsonb;
  v_product public.products%rowtype;
  v_qty numeric;
  v_unit numeric;
  v_disc numeric;
  v_line numeric;
  v_subtotal numeric := 0;
  v_total numeric;
  v_paid numeric := 0;
  v_discount numeric := coalesce(p_discount_usd, 0);
  v_warehouse uuid;
  v_batch text;
  v_movement_id uuid;
  v_payment_status public.sale_payment_status;
begin
  if v_tenant is null then
    raise exception 'no tenant' using errcode = '42501';
  end if;
  if p_exchange_rate is null or p_exchange_rate <= 0 then
    raise exception 'exchange_rate inválido';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'items requeridos';
  end if;
  if p_payments is null then
    p_payments := '[]'::jsonb;
  end if;

  v_number := public.next_doc_number('VT');

  insert into public.sales (
    tenant_id, sale_number, customer_id, sale_date,
    status, exchange_rate_used, payment_terms, discount_usd, notes,
    created_by
  ) values (
    v_tenant, v_number, p_customer_id, p_sale_date,
    'confirmed', p_exchange_rate, p_payment_terms, v_discount, p_notes,
    auth.uid()
  )
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'qty')::numeric;
    v_unit := (v_item->>'unit_price_usd')::numeric;
    v_disc := coalesce((v_item->>'discount_usd')::numeric, 0);
    v_line := round(v_qty * v_unit - v_disc, 2);
    if v_line < 0 then
      raise exception 'descuento de línea excede subtotal';
    end if;
    v_subtotal := v_subtotal + v_line;
    v_warehouse := (v_item->>'warehouse_id')::uuid;
    v_batch := nullif(v_item->>'batch_code', '');

    select * into v_product from public.products
      where id = (v_item->>'product_id')::uuid and tenant_id = v_tenant;
    if not found then
      raise exception 'producto % no pertenece al tenant', v_item->>'product_id';
    end if;

    v_movement_id := public.apply_stock_movement(
      p_movement_kind  => 'sale_issue',
      p_item_kind      => 'finished_good',
      p_item_id        => v_product.id,
      p_warehouse_id   => v_warehouse,
      p_qty            => v_qty,
      p_uom_id         => v_item->>'uom_id',
      p_batch_code     => v_batch,
      p_expiry_date    => null,
      p_unit_cost_usd  => null,
      p_reference_kind => 'sale',
      p_reference_id   => v_id,
      p_notes          => null,
      p_allow_negative => p_allow_negative
    );

    insert into public.sale_items (
      tenant_id, sale_id, product_id, qty, uom_id,
      unit_price_usd, discount_usd, line_total_usd,
      warehouse_id, batch_code, stock_movement_id
    ) values (
      v_tenant, v_id, v_product.id, v_qty, v_item->>'uom_id',
      v_unit, v_disc, v_line,
      v_warehouse, v_batch, v_movement_id
    );
  end loop;

  v_total := greatest(v_subtotal - v_discount, 0);

  for v_pay in select * from jsonb_array_elements(p_payments)
  loop
    insert into public.sale_payments (
      tenant_id, sale_id, payment_date, method,
      amount_usd, amount_original, original_currency, reference, notes,
      created_by
    ) values (
      v_tenant, v_id, coalesce((v_pay->>'payment_date')::date, p_sale_date),
      (v_pay->>'method')::public.sale_payment_method,
      (v_pay->>'amount_usd')::numeric,
      nullif(v_pay->>'amount_original','')::numeric,
      nullif(v_pay->>'original_currency',''),
      nullif(v_pay->>'reference',''),
      nullif(v_pay->>'notes',''),
      auth.uid()
    );
    v_paid := v_paid + (v_pay->>'amount_usd')::numeric;
  end loop;

  v_payment_status := case
    when v_total = 0 then 'paid'::public.sale_payment_status
    when v_paid <= 0 then 'pending'::public.sale_payment_status
    when v_paid + 0.005 < v_total then 'partial'::public.sale_payment_status
    else 'paid'::public.sale_payment_status
  end;

  update public.sales
     set subtotal_usd = v_subtotal,
         total_usd = v_total,
         payment_status = v_payment_status
   where id = v_id;

  return v_id;
end;
$$;

revoke execute on function public.register_sale(uuid, date, numeric, text, numeric, text, jsonb, jsonb, boolean) from public, anon;
grant  execute on function public.register_sale(uuid, date, numeric, text, numeric, text, jsonb, jsonb, boolean) to authenticated;

---------- RPC: cancel_sale ----------
-- Marca la venta como cancelled y reingresa stock vía adjustment_positive
-- por cada sale_item (usa unit_cost del costo al vender no disponible aquí,
-- así que cancelación sólo reingresa qty; CPP del balance se mantiene).
create or replace function public.cancel_sale(
  p_sale_id uuid,
  p_reason  text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_sale public.sales%rowtype;
  v_item public.sale_items%rowtype;
begin
  if v_tenant is null then
    raise exception 'no tenant' using errcode = '42501';
  end if;
  select * into v_sale from public.sales
    where id = p_sale_id and tenant_id = v_tenant for update;
  if not found then
    raise exception 'venta no encontrada';
  end if;
  if v_sale.status = 'cancelled' then
    raise exception 'venta ya cancelada';
  end if;

  for v_item in select * from public.sale_items where sale_id = p_sale_id and tenant_id = v_tenant
  loop
    perform public.apply_stock_movement(
      p_movement_kind  => 'adjustment_positive',
      p_item_kind      => 'finished_good',
      p_item_id        => v_item.product_id,
      p_warehouse_id   => v_item.warehouse_id,
      p_qty            => v_item.qty,
      p_uom_id         => v_item.uom_id,
      p_batch_code     => v_item.batch_code,
      p_expiry_date    => null,
      p_unit_cost_usd  => null,
      p_reference_kind => 'sale_cancel',
      p_reference_id   => p_sale_id,
      p_notes          => 'Reingreso por anulación: ' || coalesce(p_reason,''),
      p_allow_negative => false
    );
  end loop;

  update public.sales
     set status = 'cancelled',
         cancelled_at = now(),
         cancelled_reason = p_reason
   where id = p_sale_id;
end;
$$;

revoke execute on function public.cancel_sale(uuid, text) from public, anon;
grant  execute on function public.cancel_sale(uuid, text) to authenticated;
