@AGENTS.md

# Brillamax — Contexto para Claude Code

## Qué es esto

PWA mobile-first para una microfábrica venezolana de productos de limpieza. Reemplaza cuadernos + WhatsApp + Excel con una única herramienta que cubre inventario, recetas, producción, ventas B2C/B2B, notas de entrega, CxC y reportes. Dual-currency USD/VEF, offline-first, multi-tenant desde día 1.

**La KB es la fuente de verdad.** Antes de tocar features o decisiones de arquitectura, consulta `/Users/lmatos/Work/Ladrian/brillamax/`:

- `brillamax.md` — overview del proyecto, stack, roadmap
- `_index.md` — índice Dataview con sessions / ADRs / features / flujos
- `decisions/ADR-*.md` — 7 ADRs vinculantes (NO violar sin nueva ADR)
- `features/*.md` — 11 specs del MVP con schema SQL + UX
- `features/flujos/*.md` — 10 flujos de usuario extremo-a-extremo
- `design/tokens.md` + `design/componentes.md` — sistema de diseño

## Stack (abril 2026)

- **Next.js 16.2** (App Router, RSC por defecto) + **React 19** + **TypeScript 5**
- **Tailwind v4** (`@theme inline` + tokens CSS) + **shadcn/ui** (preset nova)
- **Serwist** (`@serwist/next`) — PWA con Service Worker
- **Supabase** — Postgres 16, Auth, Storage, Realtime, Edge Functions v2
- **Dexie 4** — IndexedDB + outbox para offline-first
- **TanStack Query v5** (con persister Dexie) + **Zustand 5** (UI state)
- **Zod 3** (validación cliente) + Postgres CHECK constraints (validación servidor)
- **react-hook-form** + **@hookform/resolvers** para formularios
- **Vitest** (unit) + **Playwright** (E2E post-sprint-9)

## Reglas duras (de los ADRs)

1. **Multi-tenant RLS desde día 1** (ADR-005). Toda tabla de negocio tiene `tenant_id uuid not null` + policy + índice `(tenant_id, ...)`. El JWT inyecta `tenant_id` como custom claim vía Auth Hook. Testing RLS obligatorio en CI.
2. **USD es funcional, VEF es presentación** (ADR-002). Todo documento financiero guarda `exchange_rate_used` snapshot. Edición retroactiva de tasa NO afecta documentos previos. `total_vef` es columna generada.
3. **Offline-first selectivo** (ADR-003). Solo venta B2C rápida, compra y pago usan outbox. NO implementar CRDTs ni sync bidireccional completo. Stock servidor = fuente de verdad; conflictos se resuelven a favor del servidor.
4. **NO facturación fiscal (SENIAT)** (ADR-004). Solo notas de entrega. No construir pipeline fiscal.
5. **NO roles de usuario en MVP** (ADR-006). 3–5 usuarios, todos con acceso completo tras auth.
6. **Recetas versionadas inmutables**. Si existe OP completada con `recipe v1.0`, no editar v1.0; forzar v1.1.
7. **Hard-block sin tasa del día**. Ventas/compras/pagos que crucen monedas deben tener `exchange_rate_log` para la fecha.
8. **Design tokens en paleta cálida tierra** (ADR-007). Nunca hexadecimales inline; siempre `bg-primary`, `text-foreground`, etc.

## Convenciones de código

- **Idioma:** docs y comentarios en español neutro; identifiers en inglés.
- **Commits:** Conventional Commits en inglés. `feat(inventory): add weighted cost calculation`.
- **Funciones puras del dominio** (cpp, recipe-cost, rate-snapshot, fifo-apply) viven en `src/lib/domain/` con tests unitarios Vitest.
- **Imports alias:** `@/` → `src/`. Nunca rutas relativas profundas (`../../../`).
- **Zod schemas** en `src/features/<feature>/schema.ts`, compartidos entre cliente y server actions.
- **Decimales:** usar `NUMERIC(14,4)` en Postgres para tasa, `NUMERIC(14,2)` para totales. En cliente, normalizar a `number` solo al mostrar.
- **Tokens semánticos:** `bg-primary`, `text-muted-foreground`, `border-input`. Nunca `bg-[#c75146]`.

## Flujo típico de trabajo

1. Tomar un feature o flujo de la KB.
2. Leer el spec + flujo + ADRs relacionados (comentados al final del feature).
3. Escribir la migración SQL primero (si toca DB). Ejecutar `supabase db reset && supabase test db`.
4. Implementar RSC + server actions con Zod validation + RLS implícito.
5. Agregar tests unitarios para dominio puro.
6. Abrir PR con referencia a `[[feature]]` o `[[flujo]]`.

## Cosas que NO hacer

- **NO** implementar dark mode hasta post-MVP (los tokens están listos, pero no se activa).
- **NO** añadir librerías fuera del stack sin nueva ADR.
- **NO** mezclar set de iconos — solo Lucide.
- **NO** comentar código obvio. Solo comentarios cuando el *por qué* no sea evidente.
- **NO** crear archivos de documentación (*.md) fuera de la KB de Obsidian sin pedirlo explícitamente.
- **NO** usar `service_role` key en código cliente; solo en Edge Functions con server context.
- **NO** bypassear RLS con `from("table").select("*")` desde código admin sin antes crear políticas explícitas.

## Estructura del repo

```
src/
  app/                     rutas, layouts, manifest.ts, sw.ts
  components/
    ui/                    shadcn auto-generados (no editar sin razón)
    brillamax/             componentes de dominio (CurrencyDualInput, TasaWidget, ...)
  lib/
    supabase/              clients (browser/server/middleware)
    db/                    Dexie schema + outbox store
    sync/                  runner de cola, conflict resolver
    domain/                funciones puras (cpp, recipe-cost, rate-snapshot, fifo)
  features/                un folder por módulo MVP (ventas, compras, produccion, ...)
supabase/
  migrations/              0001_tenants_rls.sql → ...
  functions/               edge functions (suggest-exchange-rate, generate-nota-pdf)
  tests/                   RLS anti-leak tests
```

## Scripts relevantes

```bash
npm run dev                # Next dev (Turbopack). SW está disabled en dev.
npm run build              # Build de producción con SW activo
npm run lint               # ESLint
npm run typecheck          # tsc --noEmit
npm run test               # Vitest (unit)
npm run test:rls           # Test RLS contra DB local
supabase db reset          # Reset + replay de migraciones
supabase gen types typescript --local > src/lib/supabase/types.ts
```

## Sprint roadmap (ver `brillamax.md#hoja-de-ruta`)

| Sprint | Entregable | Flujos |
|--------|------------|--------|
| 1–2 | Auth + tenant + catálogo + tasa | 01, 02 |
| 3–4 | Inventario + recetas + conteo inicial | 03, 09 |
| 5–6 | Producción + compras + venta B2C offline | 04, 05, 06 |
| 7–8 | Venta B2B + NE PDF + CxC FIFO | 07, 08 |
| 9–10 | Reportes + dashboard + pulido | 10 |
