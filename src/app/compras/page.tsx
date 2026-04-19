import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertBanner } from "@/components/brillamax/AlertBanner";
import {
  listRawMaterials,
  listSuppliers,
} from "@/features/catalog/actions";
import { listWarehouses } from "@/features/inventory/actions";
import { listPurchases } from "@/features/purchases/actions";
import { getTodayRate } from "@/features/rate/actions";
import { NewPurchaseDialog } from "./new-purchase-dialog";
import type { PurchasePaymentStatus } from "@/features/purchases/schema";

export const metadata = {
  title: "Compras · Brillamax",
};

export default async function ComprasPage() {
  const [purchases, suppliers, rawMaterials, warehouses, todayRate] =
    await Promise.all([
      listPurchases({ limit: 50 }),
      listSuppliers(),
      listRawMaterials(),
      listWarehouses(),
      getTodayRate(),
    ]);

  const canCreate =
    suppliers.length > 0 && rawMaterials.length > 0 && warehouses.length > 0;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-6 bg-background px-5 py-8 text-foreground">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Compras</h1>
          <p className="text-sm text-muted-foreground">
            Recepción de materia prima. VEF se convierte a USD con snapshot de
            tasa.
          </p>
        </div>
        <Link href="/">
          <Button variant="outline" size="sm">
            Volver
          </Button>
        </Link>
      </header>

      {!canCreate ? (
        <AlertBanner
          tone="warning"
          title="Faltan datos de catálogo"
          action={
            <Link
              href="/catalogo"
              className="text-sm font-medium text-primary hover:underline"
            >
              Ir a catálogo →
            </Link>
          }
        >
          Necesitas al menos un proveedor, una materia prima y un almacén para
          registrar compras.
        </AlertBanner>
      ) : (
        <NewPurchaseDialog
          suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
          rawMaterials={rawMaterials.map((m) => ({
            id: m.id,
            sku: m.sku,
            name: m.name,
            uomId: m.uomId,
          }))}
          warehouses={warehouses.map((w) => ({
            id: w.id,
            name: w.name,
            isDefault: w.isDefault,
          }))}
          todayRate={todayRate?.value ?? null}
        />
      )}

      {purchases.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Aún no hay compras registradas.
        </p>
      ) : (
        <ul className="space-y-3">
          {purchases.map((p) => (
            <li key={p.id} className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="truncate font-mono text-sm font-medium text-card-foreground">
                      {p.purchaseNumber}
                    </div>
                    <PaymentBadge status={p.paymentStatus} />
                  </div>
                  <div className="mt-0.5 text-sm font-medium">
                    {p.supplierName ?? "—"}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {p.purchaseDate} · {p.itemCount}{" "}
                    {p.itemCount === 1 ? "línea" : "líneas"}
                    {p.paymentMethod ? ` · ${p.paymentMethod}` : ""}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-base font-semibold tabular-nums text-card-foreground">
                    ${p.totalUsd.toFixed(2)}
                  </div>
                  {p.currency === "VEF" ? (
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {p.totalOriginalCurrency.toFixed(2)} VEF @{" "}
                      {p.exchangeRateUsed}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">USD</div>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function PaymentBadge({ status }: { status: PurchasePaymentStatus }) {
  switch (status) {
    case "paid":
      return <Badge>Pagada</Badge>;
    case "partial":
      return <Badge variant="secondary">Parcial</Badge>;
    default:
      return <Badge variant="outline">Pendiente</Badge>;
  }
}
