import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertBanner } from "@/components/brillamax/AlertBanner";
import { OfflineBadge } from "@/components/brillamax/OfflineBadge";
import { listCustomers, listProducts } from "@/features/catalog/actions";
import {
  listStockOnHand,
  listWarehouses,
} from "@/features/inventory/actions";
import { listSales } from "@/features/sales/actions";
import { listDeliveryNotes } from "@/features/delivery-notes/actions";
import { getTodayRate } from "@/features/rate/actions";
import { getSessionContext } from "@/features/auth/session";
import { QuickSaleDialog } from "./quick-sale-dialog";
import { IssueDeliveryNoteButton } from "./issue-note-button";
import type {
  SalePaymentStatus,
  SaleStatus,
} from "@/features/sales/schema";

export const metadata = {
  title: "Ventas · Brillamax",
};

export default async function VentasPage() {
  const [
    sales,
    products,
    customers,
    warehouses,
    stock,
    todayRate,
    session,
    deliveryNotes,
  ] = await Promise.all([
    listSales({ limit: 50 }),
    listProducts(),
    listCustomers(),
    listWarehouses(),
    listStockOnHand(),
    getTodayRate(),
    getSessionContext(),
    listDeliveryNotes(),
  ]);
  const notesBySale = new Map<
    string,
    { id: string; deliveryNumber: string; pdfVersion: number }
  >();
  for (const n of deliveryNotes) {
    notesBySale.set(n.saleId, {
      id: n.id,
      deliveryNumber: n.deliveryNumber,
      pdfVersion: n.pdfVersion,
    });
  }

  const stockByProduct = new Map<string, { qty: number; uomId: string }>();
  for (const s of stock) {
    if (s.itemKind !== "finished_good") continue;
    const prev = stockByProduct.get(s.itemId);
    stockByProduct.set(s.itemId, {
      qty: (prev?.qty ?? 0) + s.qty,
      uomId: s.uomId,
    });
  }

  const productOptions = products.map((p) => {
    const st = stockByProduct.get(p.id);
    return {
      id: p.id,
      sku: p.sku,
      name: p.name,
      priceUsd: p.priceUsd,
      stockQty: st?.qty ?? 0,
      uomId: st?.uomId ?? "un",
    };
  });

  const canSell =
    products.length > 0 &&
    warehouses.length > 0 &&
    todayRate !== null &&
    session !== null;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-6 bg-background px-5 py-8 text-foreground">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Ventas</h1>
            <p className="text-sm text-muted-foreground">
              Venta B2C rápida al mostrador. Dual-currency automático.
            </p>
          </div>
          {session ? <OfflineBadge tenantId={session.tenantId} /> : null}
        </div>
        <Link href="/">
          <Button variant="outline" size="sm">
            Volver
          </Button>
        </Link>
      </header>
      {!todayRate ? (
        <AlertBanner
          tone="warning"
          title="Falta capturar tasa del día"
          action={
            <Link
              href="/"
              className="text-sm font-medium text-primary hover:underline"
            >
              Ir al dashboard →
            </Link>
          }
        >
          Necesitas capturar la tasa antes de registrar ventas.
        </AlertBanner>
      ) : products.length === 0 ? (
        <AlertBanner
          tone="warning"
          title="Aún no hay productos"
          action={
            <Link
              href="/catalogo"
              className="text-sm font-medium text-primary hover:underline"
            >
              Ir a catálogo →
            </Link>
          }
        >
          Crea al menos un producto terminado para empezar a vender.
        </AlertBanner>
      ) : canSell && session ? (
        <QuickSaleDialog
          products={productOptions}
          customers={customers.map((c) => ({ id: c.id, name: c.name }))}
          warehouses={warehouses.map((w) => ({
            id: w.id,
            name: w.name,
            isDefault: w.isDefault,
          }))}
          todayRate={todayRate.value}
          session={session}
        />
      ) : null}

      {sales.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Aún no hay ventas registradas.
        </p>
      ) : (
        <ul className="space-y-3">
          {sales.map((s) => (
            <li key={s.id} className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="truncate font-mono text-sm font-medium text-card-foreground">
                      {s.saleNumber}
                    </div>
                    <StatusBadge status={s.status} />
                    <PaymentBadge status={s.paymentStatus} />
                  </div>
                  <div className="mt-0.5 text-sm font-medium">
                    {s.customerName ?? "Público general"}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {s.saleDate} · {s.itemCount}{" "}
                    {s.itemCount === 1 ? "producto" : "productos"}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-base font-semibold tabular-nums text-card-foreground">
                    ${s.totalUsd.toFixed(2)}
                  </div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {s.totalVef.toFixed(2)} VEF @ {s.exchangeRateUsed}
                  </div>
                </div>
              </div>
              {s.status !== "cancelled" ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <IssueDeliveryNoteButton
                    saleId={s.id}
                    saleNumber={s.saleNumber}
                    customerName={s.customerName ?? "Público general"}
                    customerPhone={s.customerPhone}
                    totalUsd={s.totalUsd}
                    totalVef={s.totalVef}
                    existing={notesBySale.get(s.id) ?? null}
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function StatusBadge({ status }: { status: SaleStatus }) {
  switch (status) {
    case "delivered":
      return <Badge>Entregada</Badge>;
    case "cancelled":
      return <Badge variant="outline">Anulada</Badge>;
    case "draft":
      return <Badge variant="outline">Borrador</Badge>;
    default:
      return <Badge variant="secondary">Confirmada</Badge>;
  }
}

function PaymentBadge({ status }: { status: SalePaymentStatus }) {
  switch (status) {
    case "paid":
      return <Badge>Pagada</Badge>;
    case "partial":
      return <Badge variant="secondary">Parcial</Badge>;
    default:
      return <Badge variant="outline">Pendiente</Badge>;
  }
}
