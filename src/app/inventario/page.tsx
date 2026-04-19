import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertBanner } from "@/components/brillamax/AlertBanner";
import {
  listProducts,
  listRawMaterials,
} from "@/features/catalog/actions";
import {
  listStockOnHand,
  listWarehouses,
} from "@/features/inventory/actions";
import { StockList } from "./stock-list";
import { InitialCountWizard } from "./initial-count-wizard";

export const metadata = {
  title: "Inventario · Brillamax",
};

export default async function InventarioPage() {
  const [stock, warehouses, rawMaterials, products] = await Promise.all([
    listStockOnHand(),
    listWarehouses(),
    listRawMaterials(),
    listProducts(),
  ]);

  const defaultWarehouse =
    warehouses.find((w) => w.isDefault) ?? warehouses[0] ?? null;

  const mp = stock.filter((s) => s.itemKind === "raw_material");
  const fg = stock.filter((s) => s.itemKind === "finished_good");
  const lowStockItems = stock.filter((s) => s.lowStock);
  const totalValueUsd = stock.reduce((sum, s) => sum + s.valueUsd, 0);

  const catalogIsEmpty = rawMaterials.length === 0 && products.length === 0;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-6 bg-background px-5 py-8 text-foreground">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inventario</h1>
          <p className="text-sm text-muted-foreground">
            Stock actual · valor total{" "}
            <span className="font-semibold text-foreground tabular-nums">
              ${totalValueUsd.toFixed(2)}
            </span>
          </p>
        </div>
        <Link href="/">
          <Button variant="outline" size="sm">
            Volver
          </Button>
        </Link>
      </header>

      {catalogIsEmpty ? (
        <AlertBanner
          tone="warning"
          title="Tu catálogo está vacío"
          action={
            <Link href="/catalogo" className="text-sm font-medium text-primary hover:underline">
              Ir a catálogo →
            </Link>
          }
        >
          Para registrar inventario primero necesitas crear productos y materias
          primas.
        </AlertBanner>
      ) : null}

      {lowStockItems.length > 0 ? (
        <AlertBanner tone="warning" title="Stock bajo mínimo">
          {lowStockItems.length}{" "}
          {lowStockItems.length === 1 ? "materia prima" : "materias primas"}{" "}
          bajo el mínimo configurado. Considerá reponer.
        </AlertBanner>
      ) : null}

      {!catalogIsEmpty && defaultWarehouse ? (
        <InitialCountWizard
          warehouses={warehouses}
          defaultWarehouseId={defaultWarehouse.id}
          rawMaterials={rawMaterials.map((r) => ({
            id: r.id,
            sku: r.sku,
            name: r.name,
            uomId: r.uomId,
          }))}
          products={products.map((p) => ({
            id: p.id,
            sku: p.sku,
            name: p.name,
          }))}
        />
      ) : null}

      <Tabs defaultValue="mp" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="mp">Materia prima ({mp.length})</TabsTrigger>
          <TabsTrigger value="fg">Terminados ({fg.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="mp">
          <StockList items={mp} emptyMessage="No hay MP con stock aún." />
        </TabsContent>
        <TabsContent value="fg">
          <StockList items={fg} emptyMessage="No hay producto terminado en stock." />
        </TabsContent>
      </Tabs>
    </main>
  );
}
