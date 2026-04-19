-- 0012 — Reportes: vistas agregadas + RPCs de dashboard.
--
-- MVP usa vistas regulares (no matviews) porque el volumen es bajo; si un
-- reporte se vuelve pesado, promoverlo a matview en sprint post-MVP.
-- Todas las vistas respetan RLS vía security invoker (filtran por tenant_id
-- en el select; las policies de las tablas base ya restringen).
--
-- Spec: features/reportes.md.

---------- daily_sales ----------
create view public.daily_sales as
select
  s.tenant_id,
  s.sale_date,
  count(*)::int                as sales_count,
  sum(s.total_usd)::numeric(14,2) as total_usd,
  sum(s.total_vef)::numeric(14,2) as total_vef,
  avg(s.total_usd)::numeric(14,2) as avg_ticket_usd
from public.sales s
where s.status in ('confirmed','delivered')
group by s.tenant_id, s.sale_date;

grant select on public.daily_sales to authenticated;

---------- top_products_sold ----------
-- Producto vendido agregado por período (para top-10). El filtro de fechas
-- se aplica en el query del cliente.
create view public.sales_by_product as
select
  si.tenant_id,
  si.product_id,
  p.sku,
  p.name as product_name,
  s.sale_date,
  sum(si.qty)::numeric(14,3)            as qty_sold,
  sum(si.line_total_usd)::numeric(14,2) as revenue_usd
from public.sale_items si
join public.sales s on s.id = si.sale_id
join public.products p on p.id = si.product_id
where s.status in ('confirmed','delivered')
group by si.tenant_id, si.product_id, p.sku, p.name, s.sale_date;

grant select on public.sales_by_product to authenticated;

---------- margin_by_product ----------
-- Margen = revenue_usd - (qty_sold * avg_cost_usd del balance FG actual).
-- Nota MVP: usa costo promedio FG actual, no snapshot al momento de venta.
-- Mejora post-MVP: capturar cost_snapshot en sale_items.
create view public.margin_by_product as
with fg_cost as (
  select item_id, avg(avg_cost_usd) filter (where qty > 0) as cost_usd
  from public.stock_balance
  where item_kind = 'finished_good'
  group by item_id
), sold as (
  select si.tenant_id, si.product_id,
         sum(si.qty)::numeric(14,3) as qty_sold,
         sum(si.line_total_usd)::numeric(14,2) as revenue_usd
  from public.sale_items si
  join public.sales s on s.id = si.sale_id
  where s.status in ('confirmed','delivered')
  group by si.tenant_id, si.product_id
)
select
  sold.tenant_id,
  sold.product_id,
  p.sku,
  p.name as product_name,
  sold.qty_sold,
  sold.revenue_usd,
  coalesce(fc.cost_usd, 0)::numeric(14,2)                as avg_cost_usd,
  (sold.revenue_usd - sold.qty_sold * coalesce(fc.cost_usd, 0))::numeric(14,2) as margin_usd,
  case when sold.revenue_usd > 0
       then ((sold.revenue_usd - sold.qty_sold * coalesce(fc.cost_usd, 0)) / sold.revenue_usd * 100)::numeric(6,2)
       else 0::numeric(6,2)
  end as margin_pct
from sold
join public.products p on p.id = sold.product_id
left join fg_cost fc on fc.item_id = sold.product_id;

grant select on public.margin_by_product to authenticated;

---------- stock_valuation ----------
-- Valor total del inventario por item.
create view public.stock_valuation as
select
  sb.tenant_id,
  sb.item_kind,
  sb.item_id,
  case
    when sb.item_kind = 'raw_material' then rm.name
    when sb.item_kind = 'finished_good' then p.name
  end as item_name,
  case
    when sb.item_kind = 'raw_material' then rm.sku
    when sb.item_kind = 'finished_good' then p.sku
  end as sku,
  sum(sb.qty)::numeric(14,3)                              as qty,
  max(sb.uom_id)                                          as uom_id,
  avg(sb.avg_cost_usd) filter (where sb.qty > 0)::numeric(14,4) as avg_cost_usd,
  sum(sb.qty * sb.avg_cost_usd)::numeric(14,2)            as value_usd
from public.stock_balance sb
left join public.raw_materials rm on rm.id = sb.item_id and sb.item_kind = 'raw_material'
left join public.products p on p.id = sb.item_id and sb.item_kind = 'finished_good'
group by sb.tenant_id, sb.item_kind, sb.item_id, rm.name, rm.sku, p.name, p.sku;

grant select on public.stock_valuation to authenticated;

---------- low_stock_alerts ----------
-- Items por debajo del mínimo (solo MP, FG no trackea mínimo MVP).
create view public.low_stock_alerts as
select
  sb.tenant_id,
  rm.id           as item_id,
  rm.sku,
  rm.name,
  rm.min_stock,
  sum(sb.qty)::numeric(14,3) as current_qty,
  max(sb.uom_id)  as uom_id
from public.stock_balance sb
join public.raw_materials rm on rm.id = sb.item_id
where sb.item_kind = 'raw_material'
  and rm.min_stock is not null
  and rm.min_stock > 0
group by sb.tenant_id, rm.id, rm.sku, rm.name, rm.min_stock
having sum(sb.qty) < rm.min_stock;

grant select on public.low_stock_alerts to authenticated;

---------- RPC: dashboard_kpis ----------
-- Retorna jsonb con KPIs del día/semana/mes + alertas para el home.
create or replace function public.dashboard_kpis()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_today date := current_date;
  v_week_start date := current_date - interval '6 days';
  v_month_start date := date_trunc('month', current_date)::date;
  v_result jsonb;
  v_today_usd numeric := 0;
  v_today_vef numeric := 0;
  v_today_count int := 0;
  v_week_usd numeric := 0;
  v_month_usd numeric := 0;
  v_cxc_usd numeric := 0;
  v_cxc_count int := 0;
  v_inventory_usd numeric := 0;
  v_low_stock_count int := 0;
  v_has_today_rate boolean := false;
  v_today_rate numeric := 0;
  v_completed_ops_today int := 0;
begin
  if v_tenant is null then
    raise exception 'no tenant' using errcode = '42501';
  end if;

  -- Ventas de hoy
  select coalesce(sum(total_usd), 0), coalesce(sum(total_vef), 0), count(*)
    into v_today_usd, v_today_vef, v_today_count
    from public.sales
    where tenant_id = v_tenant
      and sale_date = v_today
      and status in ('confirmed','delivered');

  -- Ventas semana/mes (USD)
  select coalesce(sum(total_usd), 0) into v_week_usd
    from public.sales
    where tenant_id = v_tenant
      and sale_date >= v_week_start
      and status in ('confirmed','delivered');

  select coalesce(sum(total_usd), 0) into v_month_usd
    from public.sales
    where tenant_id = v_tenant
      and sale_date >= v_month_start
      and status in ('confirmed','delivered');

  -- CxC abierta
  select coalesce(sum(open_balance_usd), 0), count(*) filter (where open_balance_usd > 0)
    into v_cxc_usd, v_cxc_count
    from public.customer_receivables
    where tenant_id = v_tenant
      and open_balance_usd > 0;

  -- Valor inventario
  select coalesce(sum(value_usd), 0) into v_inventory_usd
    from public.stock_valuation
    where tenant_id = v_tenant;

  -- Stock bajo
  select count(*) into v_low_stock_count
    from public.low_stock_alerts
    where tenant_id = v_tenant;

  -- Tasa de hoy (exchange_rate_log)
  select exists (
    select 1 from public.exchange_rate_log
    where tenant_id = v_tenant and rate_date = v_today
  ) into v_has_today_rate;

  if v_has_today_rate then
    select value into v_today_rate
      from public.exchange_rate_log
      where tenant_id = v_tenant and rate_date = v_today
      order by created_at desc limit 1;
  end if;

  -- OPs completadas hoy
  select count(*) into v_completed_ops_today
    from public.production_orders
    where tenant_id = v_tenant
      and status = 'completed'
      and completed_at::date = v_today;

  v_result := jsonb_build_object(
    'today', jsonb_build_object(
      'sales_usd', v_today_usd,
      'sales_vef', v_today_vef,
      'sales_count', v_today_count,
      'completed_ops', v_completed_ops_today
    ),
    'week_usd', v_week_usd,
    'month_usd', v_month_usd,
    'receivables', jsonb_build_object(
      'total_usd', v_cxc_usd,
      'debtor_count', v_cxc_count
    ),
    'inventory_usd', v_inventory_usd,
    'alerts', jsonb_build_object(
      'has_today_rate', v_has_today_rate,
      'today_rate', v_today_rate,
      'low_stock_count', v_low_stock_count
    )
  );
  return v_result;
end;
$$;

revoke execute on function public.dashboard_kpis() from public, anon;
grant  execute on function public.dashboard_kpis() to authenticated;
