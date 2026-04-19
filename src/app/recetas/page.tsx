import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertBanner } from "@/components/brillamax/AlertBanner";
import { listProducts, listRawMaterials, listUoms } from "@/features/catalog/actions";
import { listRecipes } from "@/features/recipes/actions";
import { RecipeForm } from "./recipe-form";
import { RecipeCardActions } from "./recipe-actions";

export const metadata = {
  title: "Recetas · Brillamax",
};

export default async function RecetasPage() {
  const [recipes, products, rawMaterials, uoms] = await Promise.all([
    listRecipes({ includeArchived: false }),
    listProducts(),
    listRawMaterials(),
    listUoms(),
  ]);

  const catalogReady = products.length > 0 && rawMaterials.length > 0;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-6 bg-background px-5 py-8 text-foreground">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Recetas</h1>
          <p className="text-sm text-muted-foreground">
            Fórmulas versionadas con costo vivo.
          </p>
        </div>
        <Link href="/">
          <Button variant="outline" size="sm">
            Volver
          </Button>
        </Link>
      </header>

      {!catalogReady ? (
        <AlertBanner
          tone="warning"
          title="Completa el catálogo primero"
          action={
            <Link
              href="/catalogo"
              className="text-sm font-medium text-primary hover:underline"
            >
              Ir a catálogo →
            </Link>
          }
        >
          Necesitas al menos un producto terminado y una materia prima antes de
          crear recetas.
        </AlertBanner>
      ) : (
        <RecipeForm products={products} rawMaterials={rawMaterials} uoms={uoms} />
      )}

      {recipes.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Aún no hay recetas. Creá la primera cuando tengas el catálogo listo.
        </p>
      ) : (
        <ul className="space-y-3">
          {recipes.map((r) => (
            <li
              key={r.id}
              className="rounded-xl border bg-card p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="truncate text-sm font-medium text-card-foreground">
                      {r.name}
                    </div>
                    <StatusBadge status={r.status} />
                    {r.isDefault ? <Badge variant="outline">default</Badge> : null}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {r.productSku ?? "—"} · v{r.version} ·{" "}
                    {r.ingredientCount}{" "}
                    {r.ingredientCount === 1 ? "ingrediente" : "ingredientes"}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Yield {r.yieldQty} {r.yieldUomId}
                    {r.mixingTimeMinutes != null
                      ? ` · Mezcla ${r.mixingTimeMinutes} min`
                      : ""}
                    {r.phMin != null && r.phMax != null
                      ? ` · pH ${r.phMin}–${r.phMax}`
                      : ""}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-base font-semibold tabular-nums text-card-foreground">
                    ${r.totalUsd.toFixed(2)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    ${r.perUnitUsd.toFixed(4)} / {r.yieldUomId}
                  </div>
                </div>
              </div>
              <div className="mt-3">
                <RecipeCardActions recipe={r} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function StatusBadge({ status }: { status: "draft" | "active" | "archived" }) {
  if (status === "active") return <Badge>Activa</Badge>;
  if (status === "draft") return <Badge variant="secondary">Borrador</Badge>;
  return <Badge variant="outline">Archivada</Badge>;
}
