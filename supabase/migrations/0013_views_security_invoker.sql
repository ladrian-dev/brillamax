-- 0013 — Fuerza security_invoker en vistas para respetar RLS de tablas base.
--
-- Sin esta bandera, las vistas en Postgres se ejecutan con los privilegios
-- del owner (postgres superuser) y SALTAN automáticamente las policies
-- tenant_isolation de las tablas fuente. Esto contradice ADR-005 (RLS día 1):
-- un SELECT sin filtro explícito de tenant podría leakear filas cross-tenant.
--
-- `security_invoker = true` hace que la vista corra con los privilegios del
-- caller, aplicando sus RLS policies sobre las tablas base. Es el default
-- recomendado por Supabase para vistas en `public`.
--
-- Ya tenían la bandera: recipe_cost_current, recipe_ingredient_breakdown
-- (ver 0006_recipes.sql). Este archivo cubre el resto.

alter view public.stock_on_hand        set (security_invoker = true);
alter view public.sale_balances        set (security_invoker = true);
alter view public.customer_receivables set (security_invoker = true);
alter view public.daily_sales          set (security_invoker = true);
alter view public.sales_by_product     set (security_invoker = true);
alter view public.margin_by_product    set (security_invoker = true);
alter view public.stock_valuation      set (security_invoker = true);
alter view public.low_stock_alerts     set (security_invoker = true);
