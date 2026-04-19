# Brillamax — Audit pre-E2E

**Fecha:** 2026-04-18
**Alcance:** revisión completa del codebase contra la KB (`/Users/lmatos/Work/Ladrian/brillamax/`), los 7 ADRs vinculantes y los 10 flujos E2E del MVP.
**Objetivo:** identificar hallazgos antes de empezar pruebas end-to-end, con plan de acción accionable por prioridad.

---

## Resumen ejecutivo

Boot pasa limpio: typecheck OK, lint OK, **46 tests** (7 archivos) OK, build OK exit 0. El cuerpo de trabajo en el último commit (`21fb5cb`) es sustancial: auth completo, middleware Next-16 (`proxy.ts`), 12 migraciones SQL con RLS en todas las tablas de negocio, 8 módulos con `page.tsx` + `schema.ts` + `actions.ts`, dominio puro con tests, PWA scaffolding.

**Hay 3 bloqueadores 🔴 de seguridad y operación que impiden E2E significativas:**

1. **Vistas SQL sin `security_invoker = true`** → riesgo de fuga cross-tenant en reportes y CxC (viola ADR-005).
2. **Outbox runner solo soporta `sale_b2c_create`** → compras y pagos offline están rotos (contradice ADR-003 y flujos 05/08).
3. **PWA sin iconos** (`/public/icons/` no existe) → `manifest.webmanifest` apunta a archivos 404, install PWA falla.

Además, **8 hallazgos 🟡** importantes (hard-block tasa no está en DB, tests RLS solo cubren 1 de ~20 tablas, sin Playwright, sin `seed.sql`, etc.) y **5 🟢** cosméticos.

### Semáforo por área

| Área | Estado | Notas |
|---|---|---|
| Boot / infra | 🟢 OK | tsc + lint + 46 tests + build pasan |
| Auth + middleware | 🟢 OK | proxy.ts gating correcto, OTP+magic link implementados |
| Onboarding | 🟡 Reducido | Wizard "Paso 1 de 1" vs 11 pasos del flujo 01 (decisión MVP, no bug) |
| Migraciones SQL | 🟡 Mayormente OK | 🔴 vistas sin security_invoker; 🟡 hard-block tasa no en DB |
| RLS isolation | 🔴 Riesgo | tests solo cubren `tenants`; vistas pueden leakear cross-tenant |
| Módulos UI (8) | 🟢 Completos | 0 `TODO`/`FIXME`/`throw not implemented`; todas las rutas tienen actions |
| Offline / PWA | 🔴 Roto | Outbox parcial + iconos faltan |
| Edge Functions | 🟡 Vacío | Sin scraper DolarAPI, sin PDF generator |
| Tests E2E | 🟡 Ausente | Sin Playwright ni seed.sql |

---

## Parte A — Hallazgos

### A.1 Boot & infra

- **🟢 OK — typecheck** `npm run typecheck` → exit 0, sin errores.
- **🟢 OK — lint** `npm run lint` → exit 0, sin warnings.
- **🟢 OK — unit tests** `npm run test` → 7 archivos, **46 tests** (domain + schema) todos pasan en 1.28s.
- **🟢 OK — build** `npm run build` → exit 0 (Next 16.2.4 + webpack + Serwist).
- **🟡 Sin CI** No existe `.github/workflows/`. ADR-005 exige "Testing RLS obligatorio en CI".
- **🟡 Stack Zod** `package.json:36` declara `zod: ^4.3.6` pero CLAUDE.md marca target Zod 3. v4 es compatible con el uso actual; documentar como desviación aceptada o downgrade.

### A.2 Auth + Tenant + Middleware

- **🟢 OK — Next 16 `proxy.ts`** [proxy.ts](proxy.ts) + [src/lib/supabase/proxy.ts:23-96](src/lib/supabase/proxy.ts) implementan gating correctamente: `sin sesión → /auth/login`, `sesión sin tenant → /onboarding`, `sesión + tenant → ruta solicitada`. Matcher excluye estáticos/SW/PWA.
- **🟢 OK — OTP SMS** [src/features/auth/actions.ts:23-81](src/features/auth/actions.ts) — `signInWithOtp({phone})` + `verifyOtp({type:"sms"})`. Config SMS habilitado ([supabase/config.toml:247-251](supabase/config.toml)).
- **🟢 OK — Magic link** [src/features/auth/actions.ts:92-128](src/features/auth/actions.ts) + callback [src/app/auth/callback/route.ts](src/app/auth/callback/route.ts). Origin se deriva de headers (cubre prod + localhost).
- **🟢 OK — Signout POST-only** [src/app/auth/signout/route.ts](src/app/auth/signout/route.ts) → evita CSRF por GET.
- **🟢 OK — Auth Hook + claim** Migración [supabase/migrations/0001_tenants_rls.sql:34-64](supabase/migrations/0001_tenants_rls.sql) inyecta `tenant_id` en JWT; `current_tenant_id()` lo lee. Config apunta correctamente ([supabase/config.toml:274-276](supabase/config.toml)).
- **🟢 OK — Refresh post-onboarding** [src/features/onboarding/actions.ts:55-58](src/features/onboarding/actions.ts) llama `supabase.auth.refreshSession()` tras crear tenant para forzar re-emisión del JWT con claim.
- **🟡 Desviación flujo 01** Onboarding actual es "Paso 1 de 1" (nombre + slug + warehouse). Flujo 01 KB define 11 pasos (datos negocio, tasa inicial, catálogos FG/MP, clientes, proveedores, conteo inicial, resumen). **Decisión MVP intencional** (no bug) — documentar en ADR o feature spec.
- **🟡 `enable_confirmations = false` email** [supabase/config.toml:216](supabase/config.toml). En dev local aceptable. En prod, revisar si debe exigir confirmación.
- **🟡 Rate limit email muy bajo** [supabase/config.toml:189](supabase/config.toml) `email_sent = 2/hora`. Requiere SMTP propio antes de prod.
- **🟢 Callback maneja error** [src/app/auth/callback/route.ts:21-24](src/app/auth/callback/route.ts) redirige a login con `?error=<msg>`. Mensajes de Supabase no son sensibles.

### A.3 Capa de datos (migraciones + RLS)

Revisado contra ADR-002 (dual currency), ADR-003 (offline), ADR-005 (multi-tenant RLS), ADR-006 (sin roles), y reglas duras de CLAUDE.md.

**Lo que está bien:**
- **🟢 ADR-005 — RLS universal** Todas las tablas de negocio (tenants, tenant_members, warehouses, suppliers, products, raw_materials, customers, exchange_rate_log, stock_balance, stock_movements, recipes, recipe_ingredients, doc_sequences, production_orders, production_order_issues, purchases, purchase_items, sales, sale_items, sale_payments, delivery_notes) tienen `enable row level security` + policy `tenant_isolation using (tenant_id = current_tenant_id())` + índice `(tenant_id, ...)`.
- **🟢 ADR-002 — Decimales correctos** Tasa y costos en `NUMERIC(14,4)`; totales en `NUMERIC(14,2)`.
- **🟢 ADR-002 — Snapshots de tasa** `sales.exchange_rate_used` + `total_vef` columna generada ([0009_sales.sql:30-31](supabase/migrations/0009_sales.sql)). `purchases.exchange_rate_used` + `total_original_currency` ([0008_purchases.sql:21-23](supabase/migrations/0008_purchases.sql)).
- **🟢 Inmutabilidad stock_movements** Sin policies de UPDATE/DELETE — solo INSERT + SELECT ([0005_inventory.sql:82-87](supabase/migrations/0005_inventory.sql)). Correcciones por movimiento inverso.
- **🟢 Recetas: versionado inmutable enforced** Server action [src/features/recipes/actions.ts:241-247](src/features/recipes/actions.ts) rechaza update si `status !== 'draft'`. (Nota: enforcement a nivel DB sería más fuerte, pero actualmente vive en server action con comment explicativo.)
- **🟢 CHECK constraints** Enums Postgres (movement_kind, recipe_status, sale_status, etc.) + CHECKs en qty/price/totales (>= 0).
- **🟢 Auth Hook con `security definer` + `set search_path`** Patrón correcto.

**Lo que falta o está débil:**

- **🔴 Vistas SQL sin `security_invoker = true`** ADR-005 obliga RLS. Las siguientes vistas se ejecutan con privilegios del owner (postgres superuser) y **bypasean RLS automáticamente**:
  - [stock_on_hand](supabase/migrations/0005_inventory.sql:221) (0005:221)
  - [sale_balances](supabase/migrations/0010_receivables.sql:42) (0010:42)
  - [customer_receivables](supabase/migrations/0010_receivables.sql:64) (0010:64)
  - [daily_sales](supabase/migrations/0012_reports.sql:11) (0012:11)
  - [sales_by_product](supabase/migrations/0012_reports.sql:28) (0012:28)
  - [margin_by_product](supabase/migrations/0012_reports.sql:49) (0012:49)
  - [stock_valuation](supabase/migrations/0012_reports.sql:85) (0012:85)
  - [low_stock_alerts](supabase/migrations/0012_reports.sql:111) (0012:111)

  Solo [recipe_cost_current](supabase/migrations/0006_recipes.sql:96) y [recipe_ingredient_breakdown](supabase/migrations/0006_recipes.sql:116) tienen `with (security_invoker = true)`. **Riesgo concreto:** desde `authenticated`, un `supabase.from("daily_sales").select()` sin `.eq("tenant_id", ...)` retorna filas de todos los tenants.

- **🟡 Hard-block tasa del día no en DB** ADR-002 regla 7: "Ventas/compras/pagos que crucen monedas deben tener `exchange_rate_log` para la fecha". Server actions [src/features/sales/actions.ts:108-134](src/features/sales/actions.ts) y [src/features/purchases/actions.ts:103-121](src/features/purchases/actions.ts) **no llaman `requireTodayRate()`** antes de invocar la RPC. La UI sí lo valida ([src/app/ventas/page.tsx:107-121](src/app/ventas/page.tsx)) pero es débil: un cliente que construya su propio payload salta el hard-block. Las RPCs en DB solo validan `p_exchange_rate > 0`.

- **🟡 Sin `cost_snapshot` en `sale_items`** Comment en [0012_reports.sql:47](supabase/migrations/0012_reports.sql): "Nota MVP: usa costo promedio FG actual, no snapshot al momento de venta. Mejora post-MVP." Impacto: `margin_by_product` reporta márgenes con sesgo si el costo FG cambia tras la venta.

- **🟡 `cancel_sale` no restaura CPP exacto** [0009_sales.sql:284-301](supabase/migrations/0009_sales.sql) reingresa qty con `adjustment_positive` sin `unit_cost_usd`. Comment lo documenta; aceptable MVP.

- **🟢 Hard-block vía excepción Postgres** `register_sale` y `register_purchase` lanzan `raise exception` si falta tenant en JWT (42501). Bien.

### A.4 Tests RLS anti-leak

- **🔴 Cobertura insuficiente** [supabase/tests/rls.sql](supabase/tests/rls.sql) tiene **3 asserts**, todos sobre `tenants` + `current_tenant_id()`. **No cubre** las otras ~20 tablas de negocio (suppliers, products, raw_materials, customers, warehouses, stock_balance, stock_movements, recipes, recipe_ingredients, production_orders, production_order_issues, purchases, purchase_items, sales, sale_items, sale_payments, delivery_notes, exchange_rate_log, doc_sequences).

  ADR-005: "Testing RLS obligatorio en CI". Estado actual no cumple.

- **🟡 Sin script `npm run test:rls`** `package.json` no expone comando. CLAUDE.md lo lista como ejemplo pero no existe.

### A.5 Módulos y rutas

Grep `TODO|FIXME|throw new Error("not implemented")` → 0 hits. Cada `page.tsx` tiene server actions correspondientes.

| Ruta | Flujo KB | Estado | Notas |
|---|---|---|---|
| [/](src/app/page.tsx) | dashboard | 🟢 | `getDashboardKpis()` + 8 KPIs + 2 AlertBanners (tasa, stock bajo) + 8 ModuleLinks |
| [/onboarding](src/app/onboarding/page.tsx) | 01 | 🟡 | "Paso 1 de 1" simplificado (ver A.2) |
| [/auth/login](src/app/auth/login/page.tsx) + [/verify](src/app/auth/verify/page.tsx) | 02 | 🟢 | Tabs teléfono/email, OTP form, magic link |
| [/catalogo](src/app/catalogo/page.tsx) | catálogo | 🟢 | 4 tabs (productos/MP/clientes/proveedores) + CRUD con soft-delete |
| [/inventario](src/app/inventario/page.tsx) | 03, 09 | 🟢 | InitialCountWizard + StockList con tabs MP/FG + alerta low-stock |
| [/recetas](src/app/recetas/page.tsx) | recetas | 🟢 | List + form + versionado (`cloneRecipeAsVersion`) + activate/archive |
| [/produccion](src/app/produccion/page.tsx) | 04 | 🟢 | NewOrderDialog + start/complete/cancel vía RPCs; costeo con `recipe_cost_current` |
| [/compras](src/app/compras/page.tsx) | 05 | 🟡 | UI OK; **offline roto** (ver A.6) |
| [/ventas](src/app/ventas/page.tsx) | 06, 07 | 🟢 | QuickSaleDialog + SyncMount + outbox offline + issue-note-button |
| [/cxc](src/app/cxc/page.tsx) | 08 | 🟡 | UI OK; **offline roto** (ver A.6) |
| [/reportes](src/app/reportes/page.tsx) | 10 | 🟢 | listDailySales + margin + valuation + CSV export |
| [/~offline](src/app/~offline/page.tsx) | PWA fallback | 🟢 | Fallback para SW |

### A.6 Offline + PWA

- **🔴 Outbox runner incompleto** [src/lib/sync/runner.ts:38-50](src/lib/sync/runner.ts) solo maneja `sale_b2c_create`. Para `purchase_create` y `payment_create` lanza `throw new Error(\`tipo ${op.type} no soportado\`)` → se marca como `error` y se re-intenta sin éxito. ADR-003 establece: "solo venta B2C rápida, compra y pago usan outbox". **Estado real: solo venta B2C funciona offline.**

- **🔴 Iconos PWA faltan** [src/app/manifest.ts:18-30](src/app/manifest.ts) referencia `/icons/icon-192.png` y `/icons/icon-512.png`. `ls /public/` → existe `sw.js`, `swe-worker-*.js`, pero **no hay carpeta `/public/icons/`**. Install PWA fallará por ícono 404.

- **🟢 Dexie schema versionado** [src/lib/db/index.ts:46-51](src/lib/db/index.ts) `db.version(1).stores(...)` declara 4 stores (outbox + 3 caches). OK para MVP.

- **🟢 Service Worker** [src/app/sw.ts](src/app/sw.ts) usa Serwist con `defaultCache` + fallback `/~offline`. `skipWaiting: true` para auto-update.

- **🟢 Sync mount en /ventas** [src/app/ventas/sync-mount.tsx](src/app/ventas/sync-mount.tsx) arranca `startOutboxWatcher` al montar — interval 30s + listener `online`.

- **🟡 Sync solo monta en /ventas** Si el usuario opera offline desde `/compras` o `/cxc` sin pasar por `/ventas` antes, el runner nunca arranca.

### A.7 Tooling E2E

- **🟡 Sin Playwright** No hay `playwright.config.ts`, `@playwright/test`, ni `tests/e2e/`.
- **🟡 Sin `seed.sql`** [supabase/config.toml:65](supabase/config.toml) apunta a `./seed.sql` pero el archivo no existe. Significa que `supabase db reset` no carga fixtures y los tests E2E deberían pasar por onboarding completo cada vez.
- **🟡 Sin `supabase/functions/`** Vacío. Scraper DolarAPI y PDF de NE no existen (espera para sprints 7-10 según roadmap; aceptable).
- **🟡 Sin `.env.example` completo** [/.env.example](.env.example) tiene solo 2 vars. Faltan notas sobre cuáles son `NEXT_PUBLIC_` vs secretos, variables opcionales y variables de test.
- **🟡 Sin CI** No hay `.github/workflows/`. Sin gate automático de typecheck/lint/test/rls.
- **🟢 `_offline` fallback existe** Listo para Playwright offline tests.

---

## Parte B — Plan de acción priorizado

### Prioridad 1 — Bloqueadores 🔴 (arreglar antes de E2E)

#### B.1 Activar `security_invoker = true` en todas las vistas
**Problema:** 8 vistas (reportes, CxC, inventario) se ejecutan con privilegios del owner y pueden leakear data cross-tenant. Viola ADR-005.

**Archivos:** nueva migración `supabase/migrations/0013_views_security_invoker.sql`.

**Cambio propuesto:**
```sql
-- 0013 — Fuerza security_invoker en vistas para respetar RLS de tablas base.
-- Sin esta bandera, las vistas se ejecutan con privilegios del creador
-- (postgres) y saltan las policies tenant_isolation de las tablas fuente.

alter view public.stock_on_hand        set (security_invoker = true);
alter view public.sale_balances        set (security_invoker = true);
alter view public.customer_receivables set (security_invoker = true);
alter view public.daily_sales          set (security_invoker = true);
alter view public.sales_by_product     set (security_invoker = true);
alter view public.margin_by_product    set (security_invoker = true);
alter view public.stock_valuation      set (security_invoker = true);
alter view public.low_stock_alerts     set (security_invoker = true);
```

**Verificación:** tras `supabase db reset`, desde dos usuarios distintos de tenants A y B, `supabase.from("daily_sales").select()` sólo debe devolver filas del tenant del usuario.

**ADR:** ADR-005.

---

#### B.2 Extender outbox runner para `purchase_create` y `payment_create`
**Problema:** flujos 05 (compra offline) y 08 (pago offline) fallan porque el runner lanza "tipo X no soportado".

**Archivos:** [src/lib/sync/runner.ts](src/lib/sync/runner.ts), [src/features/purchases/actions.ts](src/features/purchases/actions.ts), [src/features/receivables/actions.ts](src/features/receivables/actions.ts).

**Cambio propuesto (en `runner.ts`):**
```ts
import { registerPurchase } from "@/features/purchases/actions";
import { applyPayment } from "@/features/receivables/actions";
import { initialPurchaseState, type PurchasePayload } from "@/features/purchases/schema";
import { initialPaymentState, type PaymentPayload } from "@/features/receivables/schema";

// dentro del for-loop, reemplazar el else:
if (op.type === "sale_b2c_create") { /* existente */ }
else if (op.type === "purchase_create") {
  const payload = op.payload as PurchasePayload;
  const fd = new FormData();
  fd.set("payload", JSON.stringify(payload));
  const res = await registerPurchase(initialPurchaseState, fd);
  if (!res.ok) throw new Error(res.error ?? "registerPurchase failed");
  await markSynced(op.id);
  processed++;
} else if (op.type === "payment_create") {
  const payload = op.payload as PaymentPayload;
  const res = await applyPayment(payload);
  if (!res.ok) throw new Error(res.error ?? "applyPayment failed");
  await markSynced(op.id);
  processed++;
}
```

**Nota adicional:** `SyncMount` solo se monta en `/ventas`. Mover a un layout compartido o layout root (una vez que el usuario tenga tenant) para que corra también en `/compras` y `/cxc`.

**Verificación:** offline, abrir `/compras`, registrar compra → volver online → verificar que se creó en DB y aparece sin duplicados.

**ADR:** ADR-003.

---

#### B.3 Generar iconos PWA
**Problema:** `manifest.webmanifest` apunta a `/icons/icon-192.png` y `/icons/icon-512.png` que no existen. Install PWA falla.

**Archivos:** nuevos `public/icons/icon-192.png`, `public/icons/icon-512.png` (y opcionalmente `favicon.ico` para reemplazar el default Next).

**Cambio propuesto:**
```bash
mkdir -p public/icons
# Generar desde SVG fuente, o con herramienta como pwa-asset-generator:
npx pwa-asset-generator logo.svg public/icons \
  --icon-only --favicon --type png --opaque false \
  --background "#fffaf7"
```

O manualmente: producir dos PNGs 192×192 y 512×512 con fondo `#fffaf7` y el logo Brillamax (color primario `#c75146`).

**Verificación:** Chrome DevTools → Application → Manifest → ver iconos sin errores. Test "Install app" debe funcionar.

**ADR:** ADR-001 (stack PWA).

---

### Prioridad 2 — Importantes 🟡

#### B.4 Implementar hard-block de tasa del día en server actions
**Problema:** ADR-002 regla 7 exige que ventas/compras cross-moneda tengan `exchange_rate_log` para la fecha. El helper [src/features/rate/require-rate.ts](src/features/rate/require-rate.ts) existe pero **nadie lo llama**.

**Archivos:** [src/features/sales/actions.ts:85-141](src/features/sales/actions.ts), [src/features/purchases/actions.ts:80-128](src/features/purchases/actions.ts).

**Cambio propuesto (inicio de `registerSale` y `registerPurchase`):**
```ts
import { requireTodayRate, MissingRateError } from "@/features/rate/require-rate";

try {
  const todayRate = await requireTodayRate();
  // validar que el payload traiga la misma tasa (anti-tampering):
  if (Number(parsed.data.exchangeRateUsed) !== todayRate.value) {
    return { ok: false, error: "La tasa del payload no coincide con la del día" };
  }
} catch (e) {
  if (e instanceof MissingRateError) {
    return { ok: false, error: e.message };
  }
  throw e;
}
```

**Alternativa (más robusta):** agregar constraint DB en la RPC:
```sql
-- dentro de register_sale/register_purchase, antes de insertar:
if not exists (
  select 1 from public.exchange_rate_log
  where tenant_id = v_tenant and rate_date = current_date
) then
  raise exception 'Falta capturar la tasa del día';
end if;
```

**Verificación:** sin fila en `exchange_rate_log` para hoy, llamar `register_sale` directamente → debe fallar con mensaje amistoso.

**ADR:** ADR-002.

---

#### B.5 Extender tests RLS a todas las tablas de negocio
**Problema:** ADR-005 exige testing RLS en CI. Actual solo cubre `tenants` (3 asserts).

**Archivos:** [supabase/tests/rls.sql](supabase/tests/rls.sql) (extender), nuevo script en `package.json`.

**Cambio propuesto (patrón por tabla):**
```sql
-- dentro del mismo begin/rollback, después del setup de tenants A/B:
insert into public.products (id, tenant_id, sku, name)
  values ('aaaaaaaa-0000-0000-0000-000000000001',
          '11111111-1111-1111-1111-111111111111', 'SKU-A', 'Producto A'),
         ('bbbbbbbb-0000-0000-0000-000000000001',
          '22222222-2222-2222-2222-222222222222', 'SKU-B', 'Producto B');

set local request.jwt.claims to
  '{"sub":"aaaaaaaa-...","tenant_id":"11111111-..."}';

select is(
  (select count(*)::int from public.products),
  1,
  'products: usuario A sólo ve productos de tenant A'
);

-- Repetir por: suppliers, raw_materials, customers, warehouses, stock_balance,
-- stock_movements, recipes, recipe_ingredients, production_orders,
-- production_order_issues, purchases, purchase_items, sales, sale_items,
-- sale_payments, delivery_notes, exchange_rate_log, doc_sequences
-- + vistas tras B.1: stock_on_hand, sale_balances, customer_receivables,
--   daily_sales, sales_by_product, margin_by_product, stock_valuation,
--   low_stock_alerts.
```

**Agregar script** en [package.json](package.json):
```json
"scripts": {
  "test:rls": "supabase test db"
}
```

**Verificación:** `npm run test:rls` → todos los asserts pasan. Inyectar deliberadamente un `select *` sin filtro y confirmar que sigue aislado.

**ADR:** ADR-005.

---

#### B.6 Configurar Playwright y crear smoke tests
**Problema:** sin framework E2E no se pueden hacer pruebas end-to-end automáticas.

**Archivos:** nuevo `playwright.config.ts`, nuevo `tests/e2e/`, `package.json`.

**Cambio propuesto:**

`package.json` scripts:
```json
"test:e2e": "playwright test",
"test:e2e:ui": "playwright test --ui"
```

`playwright.config.ts`:
```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    viewport: { width: 390, height: 844 }, // mobile-first
  },
  projects: [
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
    { name: "desktop-chrome", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
  },
});
```

`tests/e2e/01-auth-onboarding.spec.ts`:
```ts
import { test, expect } from "@playwright/test";

test("flujo nuevo usuario: login → onboarding → home", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/auth\/login/);
  // … usar Supabase Inbucket (http://127.0.0.1:54324) para leer magic link
});

test("sesión con tenant va directo a /", async ({ page }) => {
  // pre-seed cookies con sesión válida (ver B.7)
});
```

**Verificación:** `npm run test:e2e` corre al menos el smoke test de login.

---

#### B.7 Crear `supabase/seed.sql` con fixtures de test
**Problema:** sin seed, cada test E2E debe pasar por login + onboarding completo. Además `config.toml` ya apunta a `./seed.sql` pero el archivo no existe.

**Archivos:** nuevo [supabase/seed.sql](supabase/seed.sql).

**Cambio propuesto:**
```sql
-- Fixtures deterministas para dev + E2E. `supabase db reset` los carga.
-- IDs fijos permiten login automático en Playwright vía cookies pre-firmadas.

insert into auth.users (id, email, phone)
  values ('e2e0e2e0-e2e0-e2e0-e2e0-e2e0e2e0e2e0', 'e2e@brillamax.test', '+584141234567')
  on conflict do nothing;

insert into public.tenants (id, name, slug, cutoff_date)
  values ('11111111-1111-1111-1111-111111111111', 'Brillamax E2E', 'brillamax-e2e', '2026-04-01')
  on conflict do nothing;

insert into public.tenant_members (tenant_id, user_id)
  values ('11111111-1111-1111-1111-111111111111', 'e2e0e2e0-e2e0-e2e0-e2e0-e2e0e2e0e2e0')
  on conflict do nothing;

insert into public.warehouses (id, tenant_id, name, is_default) values
  ('22222222-2222-2222-2222-222222222222',
   '11111111-1111-1111-1111-111111111111',
   'Almacén principal', true)
  on conflict do nothing;

-- Tasa del día para destrabar flujos cross-moneda en tests.
insert into public.exchange_rate_log (tenant_id, rate_date, value, source)
  values ('11111111-1111-1111-1111-111111111111', current_date, 36.50, 'Custom')
  on conflict do nothing;

-- Catálogo mínimo: 1 proveedor, 1 MP, 1 producto.
insert into public.suppliers (id, tenant_id, name) values
  ('33333333-3333-3333-3333-333333333333',
   '11111111-1111-1111-1111-111111111111', 'Proveedor E2E')
  on conflict do nothing;

insert into public.raw_materials (id, tenant_id, sku, name, uom_id, avg_cost_usd) values
  ('44444444-4444-4444-4444-444444444444',
   '11111111-1111-1111-1111-111111111111', 'MP-E2E', 'MP de test', 'kg', 2.5)
  on conflict do nothing;

insert into public.products (id, tenant_id, sku, name, price_usd) values
  ('55555555-5555-5555-5555-555555555555',
   '11111111-1111-1111-1111-111111111111', 'FG-E2E', 'Producto E2E', 10.0)
  on conflict do nothing;
```

**Verificación:** `supabase db reset` → login con `+584141234567` (OTP en Inbucket) → debería saltar onboarding e ir directo a `/`.

---

#### B.8 Mover `SyncMount` a layout para cubrir compras/cxc
**Problema:** si el usuario abre `/compras` offline sin pasar antes por `/ventas`, el runner nunca arranca.

**Archivos:** crear `src/app/(app)/layout.tsx` que envuelva rutas autenticadas + `SyncMount`; mover `src/app/ventas/sync-mount.tsx` a `src/components/brillamax/` o `src/lib/sync/`.

**Cambio propuesto:** grupo de rutas `(app)` que incluye `/`, `/ventas`, `/compras`, `/cxc`, `/inventario`, etc. — añadir `<SyncMount tenantId={...} />` en su `layout.tsx`.

**Verificación:** abrir `/compras` con red desconectada en DevTools, registrar compra, volver online → debe sincronizar sin haber visitado `/ventas` primero.

**ADR:** ADR-003.

---

#### B.9 Capturar `cost_snapshot` en `sale_items`
**Problema:** `margin_by_product` calcula con costo FG actual, no al momento de venta. Error acumulativo en el tiempo.

**Archivos:** nueva migración `0014_sale_item_cost_snapshot.sql`, [0009_sales.sql](supabase/migrations/0009_sales.sql) (RPC `register_sale`), [0012_reports.sql](supabase/migrations/0012_reports.sql) (view `margin_by_product`).

**Cambio:** añadir columna `cost_snapshot_usd numeric(14,4)` a `sale_items`; en `register_sale`, capturar `(select avg_cost_usd from stock_balance where item_id = product_id)` al momento del sale_issue; actualizar `margin_by_product` para usarlo.

**Verificación:** vender, luego cambiar avg_cost del producto vía compra, ejecutar reporte margen → margen de la venta original no cambia.

**ADR:** ADR-002 (documentos financieros inmutables).

---

#### B.10 Completar `.env.example` con notas
**Problema:** `.env.example` minimalista; onboarding de nuevo dev no tiene guía.

**Archivos:** [.env.example](.env.example).

**Cambio propuesto:**
```bash
# --- Supabase (obligatorias) ---
# Local: http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_URL=
# Publishable key (sb_publishable_...). NUNCA usar service_role en cliente.
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=

# --- Opcionales ---
# Para Supabase Studio AI (no afecta producción):
# OPENAI_API_KEY=

# Playwright E2E:
# PLAYWRIGHT_BASE_URL=http://localhost:3000
```

---

### Prioridad 3 — Cosméticos 🟢

- **B.11** Agregar `.github/workflows/ci.yml` con typecheck + lint + test + test:rls como gate de PR.
- **B.12** Documentar desviación de Zod 4 vs Zod 3 en CLAUDE.md o ADR nuevo.
- **B.13** Revisar rate limits de email en `config.toml` (línea 189, `email_sent = 2`) antes de prod.
- **B.14** Generar Edge Function `suggest-exchange-rate` (scraper DolarAPI) cuando lleguen los sprints 1-2 formales. Stub hoy: retornar tasa mock.
- **B.15** Documentar en ADR nuevo la decisión de onboarding simplificado a "Paso 1 de 1" con catálogos diferidos.

---

## Parte C — Matriz de flujos KB ↔ estado

| # | Flujo KB | Runnable hoy | Bloqueador | Notas |
|---|---|---|---|---|
| 01 | Onboarding setup inicial | 🟡 Parcial | Wizard simplificado (intencional) | Funciona para crear tenant + warehouse; resto pendiente |
| 02 | Actualizar tasa diaria | 🟢 Sí | — | TasaWidget + TasaDialog + helpers; scraper automático pendiente (B.14) |
| 03 | Crear receta | 🟢 Sí | — | Form + versionado + costeo funcionales |
| 04 | Producir lote | 🟢 Sí | — | start/complete RPCs + issues + batch_code auto |
| 05 | Registrar compra MP | 🟡 Online-only | B.2 runner offline | Online funciona; offline rompe |
| 06 | Venta B2C rápida | 🟢 Sí | — | QuickSaleDialog + outbox offline OK |
| 07 | Venta B2B con NE | 🟡 Parcial | PDF no se genera aún | issueNote marca DB; pdf_path vacío |
| 08 | Cobrar deuda | 🟡 Online-only | B.2 runner offline | FIFO + apply_payment_to_sale OK online |
| 09 | Revisar stock bajo | 🟢 Sí | — | low_stock_alerts + AlertBanner |
| 10 | Cierre de mes | 🟡 Parcial | Reportes con leak potencial (B.1) | Vistas funcionales; security_invoker es bloqueador |

**Leyenda:**
- 🟢 Runnable: todo el flujo E2E se puede probar end-to-end hoy.
- 🟡 Parcial: partes del flujo corren; otras fallan o están incompletas.
- 🔴 No runnable: flujo bloqueado.

---

## Parte D — Stack de testing E2E recomendado

### Configuración mínima

1. **Instalar Playwright:**
   ```bash
   npm i -D @playwright/test
   npx playwright install --with-deps chromium
   ```

2. **Crear [playwright.config.ts](playwright.config.ts)** (contenido en B.6).

3. **Crear [supabase/seed.sql](supabase/seed.sql)** (contenido en B.7).

4. **Tests iniciales sugeridos** (`tests/e2e/`):
   - `01-auth-login.spec.ts` — OTP via Inbucket.
   - `02-onboarding.spec.ts` — crear tenant y verificar redirect a `/`.
   - `03-catalogo-crud.spec.ts` — crear producto + MP.
   - `04-venta-b2c-offline.spec.ts` — desconectar red, registrar venta, reconectar, verificar sync.
   - `05-multi-tenant-isolation.spec.ts` — login como usuario A, consultar datos, logout, login como usuario B, verificar que no ve los de A (valida B.1).

### Orden de ejecución pre-E2E

1. **B.1** (vistas security_invoker) → sin esto los tests de aislamiento fallan.
2. **B.3** (iconos PWA) → sin esto Lighthouse PWA falla.
3. **B.4** (hard-block tasa DB) → sin esto no se puede probar anti-tampering.
4. **B.7** (seed.sql) → desbloquea tests sin recorrer onboarding.
5. **B.5** (tests RLS) → validación de backend pre-E2E.
6. **B.6** (Playwright) → framework.
7. **B.2** (outbox completo) + **B.8** (SyncMount global) → flujos 05/08 offline.
8. **B.9** (cost snapshot) + **B.10** (.env.example) → pulido.

---

## Apéndice — Comandos de verificación ejecutados

```bash
$ npm run typecheck
# exit 0

$ npm run lint
# exit 0

$ npm run test
# Test Files  7 passed (7) | Tests  46 passed (46) | Duration 1.28s

$ npm run build
# exit 0 (Next 16.2.4 + webpack + Serwist)

$ ls /public/icons
# ls: /public/icons/: No such file or directory
```
