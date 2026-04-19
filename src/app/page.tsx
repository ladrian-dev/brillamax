import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { TasaWidget } from "@/components/brillamax/TasaWidget";
import { AlertBanner } from "@/components/brillamax/AlertBanner";
import { createClient } from "@/lib/supabase/server";
import { getDashboardKpis } from "@/features/reports/actions";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Defense-in-depth: el middleware (proxy.ts) ya gatea, pero la página
  // también redirige para que sea robusta si el middleware no corriera
  // (tests unit, server offline con caché, etc.).
  if (!user) redirect("/auth/login");
  const tenantId = user.app_metadata?.tenant_id as string | undefined;
  if (!tenantId) redirect("/onboarding");

  const kpis = await getDashboardKpis();
  const phone = user.phone ?? user.email ?? "—";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 bg-background px-5 py-8 text-foreground">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Brillamax</h1>
          <p className="text-sm text-muted-foreground">{phone}</p>
        </div>
        <form action="/auth/signout" method="post">
          <Button type="submit" variant="outline" size="sm">
            Salir
          </Button>
        </form>
      </header>

      <TasaWidget />

      {kpis ? (
        <>
          {!kpis.alerts.hasTodayRate ? (
            <AlertBanner
              tone="warning"
              title="Falta capturar tasa del día"
              action={
                <span className="text-sm font-medium text-primary">
                  Usa el widget arriba
                </span>
              }
            >
              Sin tasa no puedes registrar ventas ni compras que crucen monedas.
            </AlertBanner>
          ) : null}
          {kpis.alerts.lowStockCount > 0 ? (
            <AlertBanner
              tone="warning"
              title={`${kpis.alerts.lowStockCount} MP por debajo del mínimo`}
              action={
                <Link
                  href="/inventario"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Ver inventario →
                </Link>
              }
            >
              Revisa qué materias primas necesitas comprar.
            </AlertBanner>
          ) : null}

          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiCard
              label="Ventas hoy"
              value={`$${kpis.today.salesUsd.toFixed(2)}`}
              sub={`${kpis.today.salesCount} ${kpis.today.salesCount === 1 ? "venta" : "ventas"}`}
            />
            <KpiCard
              label="Semana"
              value={`$${kpis.weekUsd.toFixed(2)}`}
              sub="últimos 7 días"
            />
            <KpiCard
              label="Mes"
              value={`$${kpis.monthUsd.toFixed(2)}`}
              sub="acumulado"
            />
            <KpiCard
              label="CxC abierta"
              value={`$${kpis.receivables.totalUsd.toFixed(2)}`}
              sub={`${kpis.receivables.debtorCount} clientes`}
              tone={kpis.receivables.totalUsd > 0 ? "warning" : "default"}
            />
            <KpiCard
              label="Inventario"
              value={`$${kpis.inventoryUsd.toFixed(2)}`}
              sub="MP + FG valorado"
            />
            <KpiCard
              label="Producción hoy"
              value={String(kpis.today.completedOps)}
              sub="OPs completadas"
            />
            <KpiCard
              label="Stock bajo"
              value={String(kpis.alerts.lowStockCount)}
              sub="MP bajo mínimo"
              tone={kpis.alerts.lowStockCount > 0 ? "warning" : "default"}
            />
            <KpiCard
              label="Tasa hoy"
              value={
                kpis.alerts.hasTodayRate
                  ? kpis.alerts.todayRate.toFixed(2)
                  : "—"
              }
              sub="VEF / USD"
              tone={kpis.alerts.hasTodayRate ? "default" : "warning"}
            />
          </section>
        </>
      ) : null}

      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Módulos
        </h2>
        <nav className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          <ModuleLink href="/catalogo" label="Catálogo" />
          <ModuleLink href="/inventario" label="Inventario" />
          <ModuleLink href="/recetas" label="Recetas" />
          <ModuleLink href="/produccion" label="Producción" />
          <ModuleLink href="/compras" label="Compras" />
          <ModuleLink href="/ventas" label="Ventas" />
          <ModuleLink href="/cxc" label="CxC" />
          <ModuleLink href="/reportes" label="Reportes" />
        </nav>
      </section>
    </main>
  );
}

function KpiCard({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "warning";
}) {
  return (
    <div className="rounded-xl border bg-card p-3 shadow-sm">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={`mt-1 text-lg font-semibold tabular-nums ${
          tone === "warning" ? "text-destructive" : "text-card-foreground"
        }`}
      >
        {value}
      </div>
      {sub ? (
        <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>
      ) : null}
    </div>
  );
}

function ModuleLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-center rounded-lg border bg-background px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
    >
      {label}
    </Link>
  );
}
