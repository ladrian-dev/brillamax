-- Tests RLS anti-leak. Correr con `supabase test db`.
-- Simula dos tenants y verifica que el usuario A no ve datos del tenant B
-- en ninguna tabla de negocio ni vista. ADR-005: "Testing RLS obligatorio en CI".
--
-- Estructura:
--   Setup (como superuser): dos tenants, dos usuarios, un warehouse por tenant,
--   y una fila por tabla en cada tenant.
--   Fase A: set JWT usuario A, contar filas por tabla y verificar == 1.
--   Fase B: set JWT usuario B, contar filas por tabla y verificar == 1.
--   Fase C: verificar INSERT con tenant_id ajeno es rechazado.
--   Fase D: verificar vistas (post-migración 0013) respetan RLS.

begin;

select plan(57);

-- =========================================================================
-- SETUP (como superuser — RLS no aplica todavía)
-- =========================================================================

insert into public.tenants (id, name, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Tenant A', 'tenant-a'),
  ('22222222-2222-2222-2222-222222222222', 'Tenant B', 'tenant-b');

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@brillamax.test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@brillamax.test');

insert into public.tenant_members (tenant_id, user_id) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

-- Warehouses
insert into public.warehouses (id, tenant_id, name, is_default) values
  ('a1111111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'WA', true),
  ('b1111111-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'WB', true);

-- Suppliers
insert into public.suppliers (id, tenant_id, name) values
  ('a2222222-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Prov A'),
  ('b2222222-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Prov B');

-- Customers
insert into public.customers (id, tenant_id, name) values
  ('a3333333-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Cli A'),
  ('b3333333-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Cli B');

-- Raw materials
insert into public.raw_materials (id, tenant_id, sku, name, uom_id) values
  ('a4444444-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'MP-A', 'MP A', 'kg'),
  ('b4444444-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'MP-B', 'MP B', 'kg');

-- Products
insert into public.products (id, tenant_id, sku, name, price_usd) values
  ('a5555555-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'FG-A', 'FG A', 1.0),
  ('b5555555-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'FG-B', 'FG B', 1.0);

-- Exchange rate log
insert into public.exchange_rate_log (tenant_id, rate_date, value, source) values
  ('11111111-1111-1111-1111-111111111111', current_date, 36.0, 'Custom'),
  ('22222222-2222-2222-2222-222222222222', current_date, 36.0, 'Custom');

-- Recipes + ingredients
insert into public.recipes (id, tenant_id, product_id, name, version, yield_qty, yield_uom_id, status) values
  ('a6666666-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'a5555555-0000-0000-0000-000000000001', 'Rec A', '1.0', 1, 'unidad', 'draft'),
  ('b6666666-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
   'b5555555-0000-0000-0000-000000000001', 'Rec B', '1.0', 1, 'unidad', 'draft');

insert into public.recipe_ingredients (id, recipe_id, raw_material_id, qty, uom_id) values
  ('a7777777-0000-0000-0000-000000000001', 'a6666666-0000-0000-0000-000000000001',
   'a4444444-0000-0000-0000-000000000001', 1, 'kg'),
  ('b7777777-0000-0000-0000-000000000001', 'b6666666-0000-0000-0000-000000000001',
   'b4444444-0000-0000-0000-000000000001', 1, 'kg');

-- Stock balance (requerido para vistas stock_on_hand/stock_valuation)
insert into public.stock_balance (
  id, tenant_id, warehouse_id, item_kind, item_id, uom_id, qty, avg_cost_usd
) values
  ('a8888888-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111',
   'a1111111-0000-0000-0000-000000000001',
   'finished_good', 'a5555555-0000-0000-0000-000000000001', 'unidad', 10, 2.0),
  ('b8888888-0000-0000-0000-000000000001',
   '22222222-2222-2222-2222-222222222222',
   'b1111111-0000-0000-0000-000000000001',
   'finished_good', 'b5555555-0000-0000-0000-000000000001', 'unidad', 10, 2.0);

-- Stock movements (log)
insert into public.stock_movements (
  id, tenant_id, movement_kind, item_kind, item_id, warehouse_id, qty, uom_id
) values
  ('a9999999-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111', 'initial_count', 'finished_good',
   'a5555555-0000-0000-0000-000000000001', 'a1111111-0000-0000-0000-000000000001', 10, 'unidad'),
  ('b9999999-0000-0000-0000-000000000001',
   '22222222-2222-2222-2222-222222222222', 'initial_count', 'finished_good',
   'b5555555-0000-0000-0000-000000000001', 'b1111111-0000-0000-0000-000000000001', 10, 'unidad');

-- Sales + items + payments
insert into public.sales (
  id, tenant_id, sale_number, sale_date, status, exchange_rate_used, subtotal_usd, total_usd
) values
  ('aa000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'VT-2026-0001', current_date, 'confirmed', 36.0, 5, 5),
  ('bb000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
   'VT-2026-0001', current_date, 'confirmed', 36.0, 5, 5);

insert into public.sale_items (
  id, tenant_id, sale_id, product_id, qty, uom_id, unit_price_usd, line_total_usd, warehouse_id
) values
  ('aa100000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'aa000000-0000-0000-0000-000000000001', 'a5555555-0000-0000-0000-000000000001',
   1, 'unidad', 5, 5, 'a1111111-0000-0000-0000-000000000001'),
  ('bb100000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
   'bb000000-0000-0000-0000-000000000001', 'b5555555-0000-0000-0000-000000000001',
   1, 'unidad', 5, 5, 'b1111111-0000-0000-0000-000000000001');

insert into public.sale_payments (id, tenant_id, sale_id, method, amount_usd) values
  ('aa200000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'aa000000-0000-0000-0000-000000000001', 'cash_usd', 5),
  ('bb200000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
   'bb000000-0000-0000-0000-000000000001', 'cash_usd', 5);

-- Purchases + items
insert into public.purchases (
  id, tenant_id, purchase_number, supplier_id, purchase_date, currency, exchange_rate_used
) values
  ('ac000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'CP-2026-0001', 'a2222222-0000-0000-0000-000000000001', current_date, 'USD', 1.0),
  ('bc000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
   'CP-2026-0001', 'b2222222-0000-0000-0000-000000000001', current_date, 'USD', 1.0);

insert into public.purchase_items (
  id, tenant_id, purchase_id, raw_material_id, qty, uom_id, unit_price_original,
  unit_price_usd, line_total_usd, warehouse_id
) values
  ('ac100000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'ac000000-0000-0000-0000-000000000001', 'a4444444-0000-0000-0000-000000000001',
   1, 'kg', 2, 2, 2, 'a1111111-0000-0000-0000-000000000001'),
  ('bc100000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
   'bc000000-0000-0000-0000-000000000001', 'b4444444-0000-0000-0000-000000000001',
   1, 'kg', 2, 2, 2, 'b1111111-0000-0000-0000-000000000001');

-- Production orders + issues
insert into public.production_orders (
  id, tenant_id, po_number, product_id, recipe_id, planned_qty, planned_uom_id
) values
  ('ad000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'OP-2026-0001', 'a5555555-0000-0000-0000-000000000001',
   'a6666666-0000-0000-0000-000000000001', 10, 'unidad'),
  ('bd000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
   'OP-2026-0001', 'b5555555-0000-0000-0000-000000000001',
   'b6666666-0000-0000-0000-000000000001', 10, 'unidad');

insert into public.production_order_issues (
  id, tenant_id, production_order_id, raw_material_id, qty, uom_id
) values
  ('ad100000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'ad000000-0000-0000-0000-000000000001', 'a4444444-0000-0000-0000-000000000001', 1, 'kg'),
  ('bd100000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
   'bd000000-0000-0000-0000-000000000001', 'b4444444-0000-0000-0000-000000000001', 1, 'kg');

-- Delivery notes
insert into public.delivery_notes (id, tenant_id, sale_id, delivery_number) values
  ('ae000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'aa000000-0000-0000-0000-000000000001', 'NE-2026-0001'),
  ('be000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
   'bb000000-0000-0000-0000-000000000001', 'NE-2026-0001');

-- Doc sequences
insert into public.doc_sequences (tenant_id, prefix, year, last_seq) values
  ('11111111-1111-1111-1111-111111111111', 'VT', 2026, 1),
  ('22222222-2222-2222-2222-222222222222', 'VT', 2026, 1);

-- =========================================================================
-- FASE A: JWT de usuario A, sólo debe ver filas del tenant A.
-- =========================================================================

set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","tenant_id":"11111111-1111-1111-1111-111111111111"}';

select is((select count(*)::int from public.tenants),                      1, 'A.tenants');
select is((select count(*)::int from public.tenant_members),               1, 'A.tenant_members');
select is((select count(*)::int from public.warehouses),                   1, 'A.warehouses');
select is((select count(*)::int from public.suppliers),                    1, 'A.suppliers');
select is((select count(*)::int from public.customers),                    1, 'A.customers');
select is((select count(*)::int from public.raw_materials),                1, 'A.raw_materials');
select is((select count(*)::int from public.products),                     1, 'A.products');
select is((select count(*)::int from public.exchange_rate_log),            1, 'A.exchange_rate_log');
select is((select count(*)::int from public.recipes),                      1, 'A.recipes');
select is((select count(*)::int from public.recipe_ingredients),           1, 'A.recipe_ingredients');
select is((select count(*)::int from public.stock_balance),                1, 'A.stock_balance');
select is((select count(*)::int from public.stock_movements),              1, 'A.stock_movements');
select is((select count(*)::int from public.sales),                        1, 'A.sales');
select is((select count(*)::int from public.sale_items),                   1, 'A.sale_items');
select is((select count(*)::int from public.sale_payments),                1, 'A.sale_payments');
select is((select count(*)::int from public.purchases),                    1, 'A.purchases');
select is((select count(*)::int from public.purchase_items),               1, 'A.purchase_items');
select is((select count(*)::int from public.production_orders),            1, 'A.production_orders');
select is((select count(*)::int from public.production_order_issues),      1, 'A.production_order_issues');
select is((select count(*)::int from public.delivery_notes),               1, 'A.delivery_notes');
select is((select count(*)::int from public.doc_sequences),                1, 'A.doc_sequences');

-- Vistas (requiere migración 0013 con security_invoker)
select is((select count(*)::int from public.stock_on_hand),                1, 'A.view.stock_on_hand');
select is((select count(*)::int from public.sale_balances),                1, 'A.view.sale_balances');
select is((select count(*)::int from public.customer_receivables),         1, 'A.view.customer_receivables');
select is((select count(*)::int from public.daily_sales),                  1, 'A.view.daily_sales');
select is((select count(*)::int from public.sales_by_product),             1, 'A.view.sales_by_product');
select is((select count(*)::int from public.margin_by_product),            1, 'A.view.margin_by_product');
select is((select count(*)::int from public.stock_valuation),              1, 'A.view.stock_valuation');

-- current_tenant_id del JWT
select is(public.current_tenant_id()::text,
          '11111111-1111-1111-1111-111111111111',
          'A.current_tenant_id');

-- =========================================================================
-- FASE B: JWT de usuario B, sólo debe ver filas del tenant B.
-- =========================================================================

set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","tenant_id":"22222222-2222-2222-2222-222222222222"}';

select is((select count(*)::int from public.tenants),                      1, 'B.tenants');
select is((select count(*)::int from public.warehouses),                   1, 'B.warehouses');
select is((select count(*)::int from public.suppliers),                    1, 'B.suppliers');
select is((select count(*)::int from public.customers),                    1, 'B.customers');
select is((select count(*)::int from public.raw_materials),                1, 'B.raw_materials');
select is((select count(*)::int from public.products),                     1, 'B.products');
select is((select count(*)::int from public.exchange_rate_log),            1, 'B.exchange_rate_log');
select is((select count(*)::int from public.recipes),                      1, 'B.recipes');
select is((select count(*)::int from public.recipe_ingredients),           1, 'B.recipe_ingredients');
select is((select count(*)::int from public.stock_balance),                1, 'B.stock_balance');
select is((select count(*)::int from public.stock_movements),              1, 'B.stock_movements');
select is((select count(*)::int from public.sales),                        1, 'B.sales');
select is((select count(*)::int from public.sale_items),                   1, 'B.sale_items');
select is((select count(*)::int from public.sale_payments),                1, 'B.sale_payments');
select is((select count(*)::int from public.purchases),                    1, 'B.purchases');
select is((select count(*)::int from public.purchase_items),               1, 'B.purchase_items');
select is((select count(*)::int from public.production_orders),            1, 'B.production_orders');
select is((select count(*)::int from public.production_order_issues),      1, 'B.production_order_issues');
select is((select count(*)::int from public.delivery_notes),               1, 'B.delivery_notes');

-- Vistas bajo JWT B
select is((select count(*)::int from public.stock_on_hand),                1, 'B.view.stock_on_hand');
select is((select count(*)::int from public.sale_balances),                1, 'B.view.sale_balances');
select is((select count(*)::int from public.margin_by_product),            1, 'B.view.margin_by_product');

-- Intento de leer por ID del tenant A debe regresar 0 filas
select is((select count(*)::int from public.products
          where id = 'a5555555-0000-0000-0000-000000000001'),              0, 'B.no_leak.products');
select is((select count(*)::int from public.sales
          where id = 'aa000000-0000-0000-0000-000000000001'),              0, 'B.no_leak.sales');
select is((select count(*)::int from public.recipes
          where id = 'a6666666-0000-0000-0000-000000000001'),              0, 'B.no_leak.recipes');

-- =========================================================================
-- FASE C: INSERT cross-tenant debe fallar por policy WITH CHECK.
-- =========================================================================

-- Usuario B intentando insertar un producto con tenant_id del tenant A
select throws_ok(
  $$insert into public.products (tenant_id, sku, name, price_usd)
    values ('11111111-1111-1111-1111-111111111111', 'HACK', 'hack', 1)$$,
  NULL,
  'C.no_cross_insert.products'
);

select throws_ok(
  $$insert into public.sales (tenant_id, sale_number, sale_date, exchange_rate_used, total_usd)
    values ('11111111-1111-1111-1111-111111111111', 'HACK-001', current_date, 36, 1)$$,
  NULL,
  'C.no_cross_insert.sales'
);

select * from finish();
rollback;
