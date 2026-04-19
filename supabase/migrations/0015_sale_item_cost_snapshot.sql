-- 0015 — Captura cost_snapshot_usd en sale_items al momento de la venta.
--
-- Motivación: margin_by_product calcula margen usando avg_cost_usd ACTUAL del
-- balance FG, no el costo al vender. Si el costo cambia tras la venta
-- (ej. nueva compra de MP a precio distinto que sube/baja el costo del FG
-- producido después), los márgenes históricos drift. ADR-002 exige que los
-- documentos financieros sean inmutables; el reporte de margen debe respetarlo.
--
-- Estrategia:
--   1. Añadir columna cost_snapshot_usd a sale_items (nullable para filas
--      pre-existentes; backfill con avg_cost_usd actual del balance).
--   2. Reescribir register_sale para leer el avg_cost_usd del balance FG
--      ANTES del sale_issue y persistirlo en el sale_item.
--   3. Reescribir margin_by_product para usar cost_snapshot_usd.

alter table public.sale_items
  add column if not exists cost_snapshot_usd numeric(14,4);

-- Backfill filas pre-existentes con el costo actual (aproximación).
update public.sale_items si
   set cost_snapshot_usd = coalesce((
     select avg(sb.avg_cost_usd)
       from public.stock_balance sb
      where sb.tenant_id = si.tenant_id
        and sb.item_kind = 'finished_good'
        and sb.item_id = si.product_id
   ), 0)
 where cost_snapshot_usd is null;

---------- register_sale v2: captura cost_snapshot_usd ----------
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
  v_today_rate numeric;
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
  v_cost_snapshot numeric;
begin
  if v_tenant is null then
    raise exception 'no tenant' using errcode = '42501';
  end if;

  -- Hard-block ADR-002
  v_today_rate := public.require_today_rate();
  if p_exchange_rate is null or p_exchange_rate <= 0 then
    raise exception 'exchange_rate inválido';
  end if;
  if abs(p_exchange_rate - v_today_rate) > 0.0001 then
    raise exception 'La tasa del payload (%) no coincide con la tasa del día (%).',
      p_exchange_rate, v_today_rate using errcode = 'P0001';
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

    -- Capturar snapshot de costo ANTES de emitir stock.
    select coalesce(avg(avg_cost_usd), 0) into v_cost_snapshot
      from public.stock_balance
     where tenant_id = v_tenant
       and item_kind = 'finished_good'
       and item_id = v_product.id
       and (v_batch is null or batch_code = v_batch);

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
      warehouse_id, batch_code, stock_movement_id,
      cost_snapshot_usd
    ) values (
      v_tenant, v_id, v_product.id, v_qty, v_item->>'uom_id',
      v_unit, v_disc, v_line,
      v_warehouse, v_batch, v_movement_id,
      v_cost_snapshot
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

---------- margin_by_product v2: usa snapshot por sale_item ----------
drop view if exists public.margin_by_product;
create view public.margin_by_product
with (security_invoker = true)
as
with sold as (
  select
    si.tenant_id,
    si.product_id,
    sum(si.qty)::numeric(14,3)            as qty_sold,
    sum(si.line_total_usd)::numeric(14,2) as revenue_usd,
    -- Costo = suma(qty_item × cost_snapshot_item). Fallback a avg actual
    -- si el snapshot es null (filas pre-backfill).
    sum(si.qty * coalesce(si.cost_snapshot_usd, 0))::numeric(14,2) as cost_usd
  from public.sale_items si
  join public.sales s on s.id = si.sale_id
  where s.status in ('confirmed', 'delivered')
  group by si.tenant_id, si.product_id
)
select
  sold.tenant_id,
  sold.product_id,
  p.sku,
  p.name as product_name,
  sold.qty_sold,
  sold.revenue_usd,
  case when sold.qty_sold > 0
       then (sold.cost_usd / sold.qty_sold)::numeric(14,4)
       else 0::numeric(14,4)
  end as avg_cost_usd,
  (sold.revenue_usd - sold.cost_usd)::numeric(14,2) as margin_usd,
  case when sold.revenue_usd > 0
       then ((sold.revenue_usd - sold.cost_usd) / sold.revenue_usd * 100)::numeric(6,2)
       else 0::numeric(6,2)
  end as margin_pct
from sold
join public.products p on p.id = sold.product_id;

grant select on public.margin_by_product to authenticated;
