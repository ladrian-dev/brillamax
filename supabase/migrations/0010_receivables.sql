-- 0010 — Cuentas por Cobrar (CxC).
--
-- Espejo del spec features/clientes-cxc.md con adaptaciones:
--  - customer_receivables: view simple (no materialized) porque el volumen
--    del MVP es bajo; se puede promover a matview en Sprint 9-10 con los
--    reportes pesados.
--  - apply_payment_fifo: aplica un pago del cliente contra sus ventas abiertas
--    empezando por la más antigua, actualizando payment_status por venta.
--  - apply_payment_to_sale: aplica directo a una venta específica.
--  - Ambos insertan en sale_payments y recalculan payment_status.

---------- helper: recompute_sale_payment_status ----------
create or replace function public.recompute_sale_payment_status(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale public.sales%rowtype;
  v_paid numeric;
  v_status public.sale_payment_status;
begin
  select * into v_sale from public.sales where id = p_sale_id;
  if not found then
    raise exception 'venta no encontrada';
  end if;
  select coalesce(sum(amount_usd), 0) into v_paid
    from public.sale_payments where sale_id = p_sale_id;
  v_status := case
    when v_sale.total_usd <= 0 then 'paid'::public.sale_payment_status
    when v_paid <= 0 then 'pending'::public.sale_payment_status
    when v_paid + 0.005 < v_sale.total_usd then 'partial'::public.sale_payment_status
    else 'paid'::public.sale_payment_status
  end;
  update public.sales set payment_status = v_status where id = p_sale_id;
end;
$$;

---------- view: sale_balances ----------
-- Un registro por venta abierta/cancelada con paid_usd y balance.
create view public.sale_balances as
select
  s.id              as sale_id,
  s.tenant_id,
  s.customer_id,
  s.sale_number,
  s.sale_date,
  s.status,
  s.payment_status,
  s.total_usd,
  s.exchange_rate_used,
  coalesce(sum(sp.amount_usd), 0)::numeric(14,2) as paid_usd,
  (s.total_usd - coalesce(sum(sp.amount_usd), 0))::numeric(14,2) as balance_usd
from public.sales s
left join public.sale_payments sp on sp.sale_id = s.id
group by s.id;

grant select on public.sale_balances to authenticated;

---------- view: customer_receivables ----------
-- Un registro por cliente con datos agregados de CxC. Sólo considera ventas
-- confirmed/delivered (no cancelled) y con saldo > 0.
create view public.customer_receivables as
select
  c.tenant_id,
  c.id            as customer_id,
  c.name,
  c.phone,
  c.type,
  coalesce(sum(sb.balance_usd) filter (
    where sb.status != 'cancelled' and sb.balance_usd > 0
  ), 0)::numeric(14,2) as open_balance_usd,
  count(*) filter (
    where sb.status != 'cancelled' and sb.balance_usd > 0
  )::int as unpaid_count,
  min(sb.sale_date) filter (
    where sb.status != 'cancelled' and sb.balance_usd > 0
  ) as oldest_unpaid_date
from public.customers c
left join public.sale_balances sb on sb.customer_id = c.id
where c.archived_at is null
group by c.tenant_id, c.id, c.name, c.phone, c.type;

grant select on public.customer_receivables to authenticated;

---------- RPC: apply_payment_to_sale ----------
-- Aplica un pago a una venta específica.
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

revoke execute on function public.apply_payment_to_sale(uuid, public.sale_payment_method, numeric, date, numeric, text, text, text) from public, anon;
grant  execute on function public.apply_payment_to_sale(uuid, public.sale_payment_method, numeric, date, numeric, text, text, text) to authenticated;

---------- RPC: apply_payment_fifo ----------
-- Aplica el pago contra las ventas abiertas del cliente desde la más antigua.
-- Si sobra dinero lanza error (no hay crédito a favor en MVP).
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

revoke execute on function public.apply_payment_fifo(uuid, public.sale_payment_method, numeric, date, numeric, text, text, text) from public, anon;
grant  execute on function public.apply_payment_fifo(uuid, public.sale_payment_method, numeric, date, numeric, text, text, text) to authenticated;
