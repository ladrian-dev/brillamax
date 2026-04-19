"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createProductionOrder } from "@/features/production/actions";
import { initialProductionState } from "@/features/production/schema";

type ProductRef = { id: string; sku: string; name: string };
type RecipeRef = {
  id: string;
  productId: string;
  name: string;
  version: string;
  yieldUomId: string;
  yieldQty: number;
  isDefault: boolean;
};

export function NewOrderDialog({
  products,
  recipes,
}: {
  products: ProductRef[];
  recipes: RecipeRef[];
}) {
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [recipeId, setRecipeId] = useState("");
  const [plannedQty, setPlannedQty] = useState("");
  const [observations, setObservations] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const recipesForProduct = useMemo(
    () => recipes.filter((r) => r.productId === productId),
    [recipes, productId],
  );

  const selectedRecipe = recipes.find((r) => r.id === recipeId);
  const plannedUomId = selectedRecipe?.yieldUomId ?? "";

  function onProductChange(v: string) {
    setProductId(v);
    // Auto-seleccionar default recipe del producto si existe.
    const def = recipes.find((r) => r.productId === v && r.isDefault);
    const fallback = recipes.find((r) => r.productId === v);
    setRecipeId(def?.id ?? fallback?.id ?? "");
  }

  function reset() {
    setProductId("");
    setRecipeId("");
    setPlannedQty("");
    setObservations("");
    setError(null);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set("productId", productId);
    fd.set("recipeId", recipeId);
    fd.set("plannedQty", plannedQty);
    fd.set("plannedUomId", plannedUomId);
    if (observations.trim()) fd.set("observations", observations);

    startTransition(async () => {
      const res = await createProductionOrder(initialProductionState, fd);
      if (res.ok) {
        setOpen(false);
        reset();
      } else {
        setError(res.error ?? "Error al crear OP");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Nueva OP</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Orden de producción</DialogTitle>
          <DialogDescription>
            Se crea en borrador. Iniciarla descuenta la MP.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="productId">Producto</Label>
            <select
              id="productId"
              value={productId}
              onChange={(e) => onProductChange(e.target.value)}
              disabled={pending}
              required
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
            >
              <option value="">— Seleccionar —</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} · {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="recipeId">Receta</Label>
            <select
              id="recipeId"
              value={recipeId}
              onChange={(e) => setRecipeId(e.target.value)}
              disabled={pending || recipesForProduct.length === 0}
              required
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
            >
              <option value="">— Seleccionar —</option>
              {recipesForProduct.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} v{r.version}
                  {r.isDefault ? " (default)" : ""}
                </option>
              ))}
            </select>
            {productId && recipesForProduct.length === 0 ? (
              <p className="text-xs text-destructive">
                Este producto no tiene recetas activas. Creá una en /recetas.
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
            <div className="space-y-1.5">
              <Label htmlFor="plannedQty">Cantidad planeada</Label>
              <Input
                id="plannedQty"
                type="number"
                inputMode="decimal"
                step="0.001"
                min="0"
                value={plannedQty}
                onChange={(e) => setPlannedQty(e.target.value)}
                disabled={pending}
                required
              />
            </div>
            <div className="min-w-16 rounded-md border border-input bg-muted px-3 py-2 text-sm tabular-nums">
              {plannedUomId || "—"}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="observations">Observaciones</Label>
            <Textarea
              id="observations"
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              disabled={pending}
              rows={2}
            />
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setOpen(false);
                reset();
              }}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || !recipeId}>
              {pending ? "Creando…" : "Crear OP"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
