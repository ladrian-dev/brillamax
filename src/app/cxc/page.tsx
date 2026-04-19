import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertBanner } from "@/components/brillamax/AlertBanner";
import {
  listCustomerReceivables,
  listSaleBalancesForCustomer,
} from "@/features/receivables/actions";
import { ApplyPaymentDialog } from "./apply-payment-dialog";

export const metadata = {
  title: "Cuentas por cobrar · Brillamax",
};

type AgingBuckets = {
  b0_7: number;
  b8_15: number;
  b16_30: number;
  b31_plus: number;
};

function bucketFor(days: number | null): keyof AgingBuckets {
  if (days === null) return "b0_7";
  if (days <= 7) return "b0_7";
  if (days <= 15) return "b8_15";
  if (days <= 30) return "b16_30";
  return "b31_plus";
}

function whatsappUrl(phone: string | null, message: string): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[^\d+]/g, "");
  if (!cleaned) return null;
  return `https://wa.me/${cleaned.replace(/^\+/, "")}?text=${encodeURIComponent(message)}`;
}

export default async function CxCPage() {
  const receivables = await listCustomerReceivables();

  const totals = receivables.reduce(
    (acc, r) => {
      acc.total += r.openBalanceUsd;
      acc.sales += r.unpaidCount;
      const k = bucketFor(r.daysOldest);
      acc.aging[k] += r.openBalanceUsd;
      if ((r.daysOldest ?? 0) > acc.oldestDays) acc.oldestDays = r.daysOldest ?? 0;
      return acc;
    },
    {
      total: 0,
      sales: 0,
      oldestDays: 0,
      aging: { b0_7: 0, b8_15: 0, b16_30: 0, b31_plus: 0 } as AgingBuckets,
    },
  );

  const openSalesByCustomer = new Map<
    string,
    { saleId: string; saleNumber: string; balanceUsd: number }[]
  >();
  await Promise.all(
    receivables.map(async (r) => {
      const sales = await listSaleBalancesForCustomer(r.customerId);
      openSalesByCustomer.set(
        r.customerId,
        sales.map((s) => ({
          saleId: s.saleId,
          saleNumber: s.saleNumber,
          balanceUsd: s.balanceUsd,
        })),
      );
    }),
  );

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-6 bg-background px-5 py-8 text-foreground">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Cuentas por cobrar
          </h1>
          <p className="text-sm text-muted-foreground">
            Aplicación FIFO por cliente · snapshot de tasa por pago
          </p>
        </div>
        <Link href="/">
          <Button variant="outline" size="sm">
            Volver
          </Button>
        </Link>
      </header>

      {receivables.length === 0 ? (
        <AlertBanner tone="info" title="Sin deudas abiertas">
          No hay clientes con saldo pendiente.
        </AlertBanner>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiCard
              label="Deuda total"
              value={`$${totals.total.toFixed(2)}`}
            />
            <KpiCard
              label="Clientes"
              value={String(receivables.length)}
            />
            <KpiCard label="Ventas abiertas" value={String(totals.sales)} />
            <KpiCard
              label="Más antigua"
              value={`${totals.oldestDays}d`}
              tone={totals.oldestDays > 30 ? "warning" : "default"}
            />
          </section>

          <section className="rounded-xl border bg-card p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Antigüedad
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <AgingCell label="0–7 días" amount={totals.aging.b0_7} />
              <AgingCell label="8–15 días" amount={totals.aging.b8_15} />
              <AgingCell
                label="16–30 días"
                amount={totals.aging.b16_30}
                tone="warning"
              />
              <AgingCell
                label="> 30 días"
                amount={totals.aging.b31_plus}
                tone="danger"
              />
            </div>
          </section>

          <ul className="space-y-3">
            {receivables.map((r) => {
              const openSales = openSalesByCustomer.get(r.customerId) ?? [];
              const wa = whatsappUrl(
                r.phone,
                `Hola ${r.name}, te recuerdo el saldo pendiente por $${r.openBalanceUsd.toFixed(2)} (${r.unpaidCount} ${r.unpaidCount === 1 ? "venta" : "ventas"}). ¡Gracias!`,
              );
              const days = r.daysOldest ?? 0;
              return (
                <li
                  key={r.customerId}
                  className="rounded-xl border bg-card p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="truncate font-medium text-card-foreground">
                          {r.name}
                        </div>
                        {days > 30 ? (
                          <Badge variant="destructive">+30d</Badge>
                        ) : days > 15 ? (
                          <Badge variant="secondary">+15d</Badge>
                        ) : null}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {r.phone ?? "Sin teléfono"} · {r.unpaidCount}{" "}
                        {r.unpaidCount === 1 ? "venta" : "ventas"}
                        {r.oldestUnpaidDate
                          ? ` · más antigua ${r.oldestUnpaidDate}`
                          : ""}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-base font-semibold tabular-nums text-card-foreground">
                        ${r.openBalanceUsd.toFixed(2)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <ApplyPaymentDialog
                      customerId={r.customerId}
                      customerName={r.name}
                      openBalanceUsd={r.openBalanceUsd}
                      openSales={openSales}
                    />
                    {wa ? (
                      <a
                        href={wa}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-xs font-medium text-foreground hover:bg-muted"
                      >
                        WhatsApp
                      </a>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </main>
  );
}

function KpiCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
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
    </div>
  );
}

function AgingCell({
  label,
  amount,
  tone = "default",
}: {
  label: string;
  amount: number;
  tone?: "default" | "warning" | "danger";
}) {
  const color =
    tone === "danger"
      ? "text-destructive"
      : tone === "warning"
        ? "text-accent-foreground"
        : "text-card-foreground";
  return (
    <div className="rounded-md border bg-background p-2">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`mt-0.5 text-sm font-semibold tabular-nums ${color}`}>
        ${amount.toFixed(2)}
      </div>
    </div>
  );
}
