import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertBanner } from "@/components/brillamax/AlertBanner";
import { listProducts } from "@/features/catalog/actions";
import { listRecipes } from "@/features/recipes/actions";
import { listWarehouses } from "@/features/inventory/actions";
import { listProductionOrders } from "@/features/production/actions";
import { NewOrderDialog } from "./new-order-dialog";
import { OrderCardActions } from "./order-card-actions";
import type { ProductionStatus } from "@/features/production/schema";

export const metadata = {
  title: "Producción · Brillamax",
};

export default async function ProduccionPage() {
  const [orders, products, recipes, warehouses] = await Promise.all([
    listProductionOrders({ limit: 50 }),
    listProducts(),
    listRecipes({ status: "active" }),
    listWarehouses(),
  ]);

  const canCreate = products.length > 0 && recipes.length > 0;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-6 bg-background px-5 py-8 text-foreground">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Producción</h1>
          <p className="text-sm text-muted-foreground">
            Órdenes de lote: draft → iniciar (emite MP) → completar (ingresa FG).
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
          title="Primero necesitas recetas activas"
          action={
            <Link
              href="/recetas"
              className="text-sm font-medium text-primary hover:underline"
            >
              Ir a recetas →
            </Link>
          }
        >
          No hay productos con recetas activas. Crea y activa al menos una
          receta antes de producir.
        </AlertBanner>
      ) : (
        <NewOrderDialog
          products={products}
          recipes={recipes.map((r) => ({
            id: r.id,
            productId: r.productId,
            name: r.name,
            version: r.version,
            yieldUomId: r.yieldUomId,
            yieldQty: r.yieldQty,
            isDefault: r.isDefault,
          }))}
        />
      )}

      {orders.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Aún no hay órdenes de producción.
        </p>
      ) : (
        <ul className="space-y-3">
          {orders.map((o) => (
            <li key={o.id} className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="truncate font-mono text-sm font-medium text-card-foreground">
                      {o.poNumber}
                    </div>
                    <StatusBadge status={o.status} />
                  </div>
                  <div className="mt-0.5 text-sm font-medium">
                    {o.productName ?? o.productId}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {o.recipeName ?? "—"} v{o.recipeVersion ?? "—"} · Planeado{" "}
                    {o.plannedQty} {o.plannedUomId}
                    {o.actualQty != null
                      ? ` · Real ${o.actualQty} ${o.plannedUomId}`
                      : ""}
                    {o.batchCode ? ` · Lote ${o.batchCode}` : ""}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  {o.totalCostUsd != null ? (
                    <>
                      <div className="text-base font-semibold tabular-nums text-card-foreground">
                        ${o.totalCostUsd.toFixed(2)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        ${(o.costPerYieldUnit ?? 0).toFixed(4)} /{" "}
                        {o.plannedUomId}
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-muted-foreground">
                      costo al completar
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-3">
                <OrderCardActions order={o} warehouses={warehouses} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function StatusBadge({ status }: { status: ProductionStatus }) {
  switch (status) {
    case "completed":
      return <Badge>Completada</Badge>;
    case "in_progress":
      return <Badge variant="secondary">En curso</Badge>;
    case "cancelled":
      return <Badge variant="outline">Cancelada</Badge>;
    case "ready":
      return <Badge variant="secondary">Lista</Badge>;
    default:
      return <Badge variant="outline">Borrador</Badge>;
  }
}
