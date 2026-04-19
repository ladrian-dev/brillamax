-- 0003 — Bitácora de tasa de cambio USD → VEF (ADR-002).
--
-- Cada tenant mantiene una tasa por día. Los documentos financieros
-- (ventas, compras, pagos) guardan el snapshot `exchange_rate_used` al crearse;
-- editar retroactivamente esta tabla NO afecta documentos históricos.
--
-- Hard-block: los server actions de venta/compra/pago que crucen monedas
-- DEBEN verificar que existe una fila para la fecha actual antes de persistir.

create type public.rate_source as enum ('BCV', 'Paralelo', 'Custom', 'Imported');

create table public.exchange_rate_log (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  rate_date    date not null,
  value        numeric(14,4) not null check (value > 0),
  source       public.rate_source not null default 'Custom',
  set_by       uuid references auth.users(id) on delete set null,
  note         text,
  created_at   timestamptz not null default now()
);

-- Una sola tasa por día por tenant. Si el usuario quiere corregirla, se hace
-- UPDATE explícito (RLS lo permite) en vez de apilar filas.
create unique index exchange_rate_one_per_day
  on public.exchange_rate_log(tenant_id, rate_date);

-- Access path típico: "tasa de hoy del tenant X" → descendente por fecha.
create index exchange_rate_tenant_date_idx
  on public.exchange_rate_log(tenant_id, rate_date desc);

alter table public.exchange_rate_log enable row level security;

create policy "rate_tenant_isolation" on public.exchange_rate_log
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

---------- helper: tasa del día para el tenant actual ----------
-- Devuelve NULL si no hay tasa hoy. Los callers de escritura cross-moneda
-- deben tratar NULL como hard-block y pedir al usuario capturar la tasa.
create or replace function public.today_rate()
returns numeric
language sql
stable
as $$
  select value
    from public.exchange_rate_log
   where tenant_id = public.current_tenant_id()
     and rate_date = current_date
   limit 1
$$;
