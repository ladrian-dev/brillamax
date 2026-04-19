import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  listDailySales,
  listMarginByProduct,
  listStockValuation,
} from "@/features/reports/actions";
import { ExportCsvButton } from "./export-button";

export const metadata = {
  title: "Reportes · Brillamax",
};

export default async function ReportsPage() {
  const [daily, margins, valuation] = await Promise.all([
    listDailySales(),
    listMarginByProduct(),
    listStockValuation(),
  ]);

  const salesByMonth = new Map<string, { usd: number; count: number }>();
  for (const d of daily) {
    const mk = d.saleDate.slice(0, 7);
    const prev = salesByMonth.get(mk) ?? { usd: 0, count: 0 };
    salesByMonth.set(mk, {
      usd: prev.usd + d.totalUsd,
      count: prev.count + d.salesCount,
    });
  }
  const months = Array.from(salesByMonth.entries())
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .slice(0, 6);

  const totalInventory = valuation.reduce((acc, r) => acc + r.valueUsd, 0);
  const rmValue = valuation
    .filter((r) => r.itemKind === "raw_material")
    .reduce((acc, r) => acc + r.valueUsd, 0);
  const fgValue = valuation
    .filter((r) => r.itemKind === "finished_good")
    .reduce((acc, r) => acc + r.valueUsd, 0);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col gap-6 bg-background px-5 py-8 text-foreground">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reportes</h1>
          <p className="text-sm text-muted-foreground">
            Ventas, margen y valoración de inventario · snapshot en USD
          </p>
        </div>
        <Link href="/">
          <Button variant="outline" size="sm">
            Volver
          </Button>
        </Link>
      </header>

      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Ventas por mes
          </h2>
          <ExportCsvButton
            filename="ventas-mensuales.csv"
            rows={months.map(([month, v]) => ({
              month,
              sales_usd: v.usd.toFixed(2),
              count: v.count,
            }))}
            columns={[
              { key: "month", header: "Mes" },
              { key: "sales_usd", header: "Total USD" },
              { key: "count", header: "# Ventas" },
            ]}
          />
        </div>
        {months.length === 0 ? (
          <EmptyState text="Aún no hay ventas registradas." />
        ) : (
          <ul className="divide-y divide-border">
            {months.map(([month, v]) => (
              <li
                key={month}
                className="flex items-center justify-between py-2 text-sm"
              >
                <span className="font-mono text-card-foreground">{month}</span>
                <div className="text-right">
                  <div className="font-semibold tabular-nums">
                    ${v.usd.toFixed(2)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {v.count} {v.count === 1 ? "venta" : "ventas"}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Ventas últimos 30 días
          </h2>
          <ExportCsvButton
            filename="ventas-diarias.csv"
            rows={daily.map((d) => ({
              date: d.saleDate,
              count: d.salesCount,
              total_usd: d.totalUsd.toFixed(2),
              total_vef: d.totalVef.toFixed(2),
              avg_ticket: d.avgTicketUsd.toFixed(2),
            }))}
            columns={[
              { key: "date", header: "Fecha" },
              { key: "count", header: "# Ventas" },
              { key: "total_usd", header: "Total USD" },
              { key: "total_vef", header: "Total VEF" },
              { key: "avg_ticket", header: "Ticket prom" },
            ]}
          />
        </div>
        {daily.length === 0 ? (
          <EmptyState text="Aún no hay ventas registradas." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="pb-2 font-medium">Fecha</th>
                  <th className="pb-2 font-medium text-right"># Ventas</th>
                  <th className="pb-2 font-medium text-right">Total USD</th>
                  <th className="pb-2 font-medium text-right">Ticket</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {daily.slice(0, 30).map((d) => (
                  <tr key={d.saleDate}>
                    <td className="py-1.5 font-mono">{d.saleDate}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {d.salesCount}
                    </td>
                    <td className="py-1.5 text-right font-semibold tabular-nums">
                      ${d.totalUsd.toFixed(2)}
                    </td>
                    <td className="py-1.5 text-right text-muted-foreground tabular-nums">
                      ${d.avgTicketUsd.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Margen por producto
          </h2>
          <ExportCsvButton
            filename="margen-por-producto.csv"
            rows={margins.map((m) => ({
              sku: m.sku,
              name: m.productName,
              qty: m.qtySold.toFixed(3),
              revenue: m.revenueUsd.toFixed(2),
              cost: m.avgCostUsd.toFixed(2),
              margin: m.marginUsd.toFixed(2),
              margin_pct: m.marginPct.toFixed(2),
            }))}
            columns={[
              { key: "sku", header: "SKU" },
              { key: "name", header: "Producto" },
              { key: "qty", header: "Cant" },
              { key: "revenue", header: "Ingresos USD" },
              { key: "cost", header: "Costo prom USD" },
              { key: "margin", header: "Margen USD" },
              { key: "margin_pct", header: "Margen %" },
            ]}
          />
        </div>
        {margins.length === 0 ? (
          <EmptyState text="Aún no hay productos vendidos con costo registrado." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="pb-2 font-medium">SKU</th>
                  <th className="pb-2 font-medium">Producto</th>
                  <th className="pb-2 font-medium text-right">Cant</th>
                  <th className="pb-2 font-medium text-right">Ingresos</th>
                  <th className="pb-2 font-medium text-right">Margen</th>
                  <th className="pb-2 font-medium text-right">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {margins.slice(0, 15).map((m) => (
                  <tr key={m.productId}>
                    <td className="py-1.5 font-mono text-xs">{m.sku}</td>
                    <td className="py-1.5">{m.productName}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {m.qtySold.toFixed(2)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      ${m.revenueUsd.toFixed(2)}
                    </td>
                    <td className="py-1.5 text-right font-semibold tabular-nums">
                      ${m.marginUsd.toFixed(2)}
                    </td>
                    <td
                      className={`py-1.5 text-right tabular-nums ${
                        m.marginPct < 0
                          ? "text-destructive"
                          : m.marginPct < 20
                            ? "text-muted-foreground"
                            : "text-card-foreground"
                      }`}
                    >
                      {m.marginPct.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Valoración de inventario
          </h2>
          <ExportCsvButton
            filename="valoracion-inventario.csv"
            rows={valuation.map((r) => ({
              kind: r.itemKind === "raw_material" ? "MP" : "FG",
              sku: r.sku ?? "",
              name: r.itemName ?? "",
              qty: r.qty.toFixed(3),
              uom: r.uomId ?? "",
              cost: r.avgCostUsd.toFixed(4),
              value: r.valueUsd.toFixed(2),
            }))}
            columns={[
              { key: "kind", header: "Tipo" },
              { key: "sku", header: "SKU" },
              { key: "name", header: "Ítem" },
              { key: "qty", header: "Cant" },
              { key: "uom", header: "UoM" },
              { key: "cost", header: "Costo prom USD" },
              { key: "value", header: "Valor USD" },
            ]}
          />
        </div>
        <div className="mb-4 grid grid-cols-3 gap-3">
          <Summary label="Total" value={`$${totalInventory.toFixed(2)}`} />
          <Summary label="Materia prima" value={`$${rmValue.toFixed(2)}`} />
          <Summary label="Producto term." value={`$${fgValue.toFixed(2)}`} />
        </div>
        {valuation.length === 0 ? (
          <EmptyState text="Aún no hay stock valorado." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="pb-2 font-medium">Tipo</th>
                  <th className="pb-2 font-medium">Ítem</th>
                  <th className="pb-2 font-medium text-right">Cant</th>
                  <th className="pb-2 font-medium text-right">Valor USD</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {valuation.slice(0, 20).map((r) => (
                  <tr key={`${r.itemKind}-${r.itemId}`}>
                    <td className="py-1.5 text-xs uppercase text-muted-foreground">
                      {r.itemKind === "raw_material" ? "MP" : "FG"}
                    </td>
                    <td className="py-1.5">
                      <span className="font-mono text-xs text-muted-foreground">
                        {r.sku}
                      </span>{" "}
                      {r.itemName}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {r.qty.toFixed(2)} {r.uomId}
                    </td>
                    <td className="py-1.5 text-right font-semibold tabular-nums">
                      ${r.valueUsd.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
      {text}
    </p>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background p-2.5">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-base font-semibold tabular-nums text-card-foreground">
        {value}
      </div>
    </div>
  );
}
