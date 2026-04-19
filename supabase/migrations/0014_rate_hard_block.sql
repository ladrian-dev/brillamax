-- 0014 — Hard-block tasa del día en DB (ADR-002 regla 7).
--
-- Las RPCs register_sale y register_purchase ya reciben exchange_rate_used
-- del cliente, pero NO validan que exista una fila en exchange_rate_log
-- para la fecha actual del tenant. Esto permite que un cliente construya su
-- propio payload y salte la validación UI.
--
-- Esta migración:
--   1. Agrega helper require_today_rate() que lanza excepción si falta.
--   2. Reemplaza register_sale y register_purchase para llamar al helper
--      y verificar que el exchange_rate del payload coincida con la tasa
--      registrada del día (anti-tampering).

---------- helper: require_today_rate ----------
create or replace function public.require_today_rate()
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_value  numeric;
begin
  if v_tenant is null then
    raise exception 'no tenant in JWT' using errcode = '42501';
  end if;
  select value into v_value
    from public.exchange_rate_log
   where tenant_id = v_tenant and rate_date = current_date
   limit 1;
  if v_value is null then
    raise exception 'Falta capturar la tasa del día. Captúrala antes de registrar ventas, compras o pagos cross-moneda.'
      using errcode = 'P0001';
  end if;
  return v_value;
end;
$$;

revoke execute on function public.require_today_rate() from public, anon;
grant  execute on function public.require_today_rate() to authenticated;

---------- reemplazar register_sale con hard-block ----------
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
begin
  if v_tenant is null then
    raise exception 'no tenant' using errcode = '42501';
  end if;

  -- Hard-block ADR-002: debe existir tasa para HOY y debe coincidir con la del payload.
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

---------- reemplazar register_purchase con hard-block ----------
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
  v_today_rate numeric;
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

  -- Hard-block ADR-002: solo si es compra cross-moneda (VEF) exigir tasa del día.
  -- Compras en USD puro no requieren exchange_rate_log (guardamos 1.0 por convención).
  if p_currency = 'VEF' then
    v_today_rate := public.require_today_rate();
    if p_exchange_rate_used is null or p_exchange_rate_used <= 0 then
      raise exception 'exchange_rate_used inválido';
    end if;
    if abs(p_exchange_rate_used - v_today_rate) > 0.0001 then
      raise exception 'La tasa del payload (%) no coincide con la tasa del día (%).',
        p_exchange_rate_used, v_today_rate using errcode = 'P0001';
    end if;
  else
    if p_exchange_rate_used is null or p_exchange_rate_used <= 0 then
      raise exception 'exchange_rate_used inválido';
    end if;
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

---------- reemplazar apply_payment_to_sale con hard-block (si pago en VEF) ----------
create or replace function public.apply_payment_to_sale(
  p_sale_id          uuid,
  p_method           public.sale_payment_method,
  p_amount_usd       numeric,
  p_payment_date     date,
  p_amount_original  numeric,
  p_original_currency text,
  p_reference        text,
  p_notes            text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_sale public.sales%rowtype;
  v_balance numeric;
  v_payment_id uuid;
begin
  if v_tenant is null then
    raise exception 'no tenant' using errcode = '42501';
  end if;
  if p_amount_usd is null or p_amount_usd <= 0 then
    raise exception 'monto inválido';
  end if;
  if p_original_currency = 'VEF' then
    perform public.require_today_rate();
  end if;
  select * into v_sale from public.sales
    where id = p_sale_id and tenant_id = v_tenant for update;
  if not found then
    raise exception 'venta no encontrada';
  end if;
  if v_sale.status = 'cancelled' then
    raise exception 'venta anulada';
  end if;
  select (v_sale.total_usd - coalesce(sum(amount_usd), 0))
    into v_balance
    from public.sale_payments where sale_id = p_sale_id;
  if p_amount_usd > v_balance + 0.005 then
    raise exception 'monto % excede saldo %', p_amount_usd, v_balance;
  end if;

  insert into public.sale_payments (
    tenant_id, sale_id, payment_date, method,
    amount_usd, amount_original, original_currency, reference, notes,
    created_by
  ) values (
    v_tenant, p_sale_id, coalesce(p_payment_date, current_date),
    p_method, p_amount_usd,
    nullif(p_amount_original, 0),
    nullif(p_original_currency, ''),
    nullif(p_reference, ''),
    nullif(p_notes, ''),
    auth.uid()
  ) returning id into v_payment_id;

  perform public.recompute_sale_payment_status(p_sale_id);
  return v_payment_id;
end;
$$;

---------- reemplazar apply_payment_fifo con hard-block (si pago en VEF) ----------
create or replace function public.apply_payment_fifo(
  p_customer_id      uuid,
  p_method           public.sale_payment_method,
  p_amount_usd       numeric,
  p_payment_date     date,
  p_amount_original  numeric,
  p_original_currency text,
  p_reference        text,
  p_notes            text
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_remaining numeric := p_amount_usd;
  v_applied int := 0;
  v_sale record;
  v_take numeric;
begin
  if v_tenant is null then
    raise exception 'no tenant' using errcode = '42501';
  end if;
  if p_amount_usd is null or p_amount_usd <= 0 then
    raise exception 'monto inválido';
  end if;
  if p_original_currency = 'VEF' then
    perform public.require_today_rate();
  end if;

  for v_sale in
    select sb.sale_id, sb.balance_usd
      from public.sale_balances sb
     where sb.tenant_id = v_tenant
       and sb.customer_id = p_customer_id
       and sb.status != 'cancelled'
       and sb.balance_usd > 0
     order by sb.sale_date asc, sb.sale_number asc
     for update
  loop
    exit when v_remaining <= 0;
    v_take := least(v_remaining, v_sale.balance_usd);
    insert into public.sale_payments (
      tenant_id, sale_id, payment_date, method,
      amount_usd, amount_original, original_currency, reference, notes,
      created_by
    ) values (
      v_tenant, v_sale.sale_id,
      coalesce(p_payment_date, current_date),
      p_method, v_take,
      nullif(p_amount_original, 0),
      nullif(p_original_currency, ''),
      nullif(p_reference, ''),
      nullif(p_notes, ''),
      auth.uid()
    );
    perform public.recompute_sale_payment_status(v_sale.sale_id);
    v_remaining := v_remaining - v_take;
    v_applied := v_applied + 1;
  end loop;

  if v_remaining > 0.005 then
    raise exception 'pago excede la deuda total por $%', v_remaining;
  end if;

  return v_applied;
end;
$$;
