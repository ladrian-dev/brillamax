"use client";

import { useMemo, useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
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
import { saveRecipe } from "@/features/recipes/actions";
import {
  initialRecipeState,
  type RecipePayload,
} from "@/features/recipes/schema";

type ProductRef = { id: string; sku: string; name: string };
type RawMaterialRef = {
  id: string;
  sku: string;
  name: string;
  uomId: string;
  avgCostUsd: number;
};
type UomRef = { id: string; name: string };

type IngredientRow = {
  key: string;
  rawMaterialId: string;
  qty: string;
  uomId: string;
  notes: string;
};

let rowSeq = 0;
const newRow = (): IngredientRow => ({
  key: `ing-${++rowSeq}`,
  rawMaterialId: "",
  qty: "",
  uomId: "",
  notes: "",
});

type Props = {
  products: ProductRef[];
  rawMaterials: RawMaterialRef[];
  uoms: UomRef[];
  trigger?: React.ReactNode;
};

export function RecipeForm({ products, rawMaterials, uoms, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [name, setName] = useState("");
  const [version, setVersion] = useState("1.0");
  const [yieldQty, setYieldQty] = useState("");
  const [yieldUomId, setYieldUomId] = useState("");
  const [mixingTimeMinutes, setMixingTimeMinutes] = useState("");
  const [phMin, setPhMin] = useState("");
  const [phMax, setPhMax] = useState("");
  const [instructions, setInstructions] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [ingredients, setIngredients] = useState<IngredientRow[]>([newRow()]);

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const rmById = useMemo(
    () => new Map(rawMaterials.map((m) => [m.id, m])),
    [rawMaterials],
  );

  const estimatedCost = useMemo(() => {
    let total = 0;
    for (const row of ingredients) {
      const rm = rmById.get(row.rawMaterialId);
      const qty = Number(row.qty);
      if (!rm || !Number.isFinite(qty) || qty <= 0) continue;
      total += qty * rm.avgCostUsd;
    }
    return total;
  }, [ingredients, rmById]);

  function updateRow(key: string, patch: Partial<IngredientRow>) {
    setIngredients((rows) =>
      rows.map((r) => {
        if (r.key !== key) return r;
        const next = { ...r, ...patch };
        // Al seleccionar MP, autocompletar UoM si aún está vacía.
        if (patch.rawMaterialId && !r.uomId) {
          const rm = rmById.get(patch.rawMaterialId);
          if (rm) next.uomId = rm.uomId;
        }
        return next;
      }),
    );
  }

  function resetForm() {
    setProductId("");
    setName("");
    setVersion("1.0");
    setYieldQty("");
    setYieldUomId("");
    setMixingTimeMinutes("");
    setPhMin("");
    setPhMax("");
    setInstructions("");
    setIsDefault(false);
    setIngredients([newRow()]);
    setError(null);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const validIngredients = ingredients
      .filter((r) => r.rawMaterialId && Number(r.qty) > 0 && r.uomId)
      .map((r, idx) => ({
        rawMaterialId: r.rawMaterialId,
        qty: Number(r.qty),
        uomId: r.uomId,
        orderIndex: idx,
        notes: r.notes.trim() || null,
      }));

    if (validIngredients.length === 0) {
      setError("Agrega al menos un ingrediente con MP, qty y UoM.");
      return;
    }

    const payload: RecipePayload = {
      header: {
        productId,
        name,
        version,
        category: null,
        yieldQty: Number(yieldQty),
        yieldUomId,
        mixingTimeMinutes:
          mixingTimeMinutes === "" ? null : Number(mixingTimeMinutes),
        phMin: phMin === "" ? null : Number(phMin),
        phMax: phMax === "" ? null : Number(phMax),
        viscosityTarget: null,
        instructions: instructions.trim() || null,
        isDefault,
      },
      ingredients: validIngredients,
    };

    const fd = new FormData();
    fd.set("payload", JSON.stringify(payload));

    startTransition(async () => {
      const res = await saveRecipe(initialRecipeState, fd);
      if (res.ok) {
        setOpen(false);
        resetForm();
      } else {
        setError(res.error ?? "Error al guardar");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="default" className="w-full sm:w-auto">
            Nueva receta
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nueva receta (borrador)</DialogTitle>
          <DialogDescription>
            Se guarda como borrador editable. Actívala para usarla en producción.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="flex h-full flex-col gap-4 overflow-hidden"
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="productId">Producto</Label>
                <select
                  id="productId"
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
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
                <Label htmlFor="name">Nombre</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={pending}
                  required
                  placeholder="Lavavajilla Verde 500ml"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="version">Versión</Label>
                <Input
                  id="version"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  disabled={pending}
                  required
                  placeholder="1.0"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="yieldQty">Yield (qty)</Label>
                <Input
                  id="yieldQty"
                  type="number"
                  inputMode="decimal"
                  step="0.001"
                  min="0"
                  value={yieldQty}
                  onChange={(e) => setYieldQty(e.target.value)}
                  disabled={pending}
                  required
                  placeholder="100"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="yieldUomId">UoM yield</Label>
                <select
                  id="yieldUomId"
                  value={yieldUomId}
                  onChange={(e) => setYieldUomId(e.target.value)}
                  disabled={pending}
                  required
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
                >
                  <option value="">—</option>
                  {uoms.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.id})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="mixingTime">Mezcla (min)</Label>
                <Input
                  id="mixingTime"
                  type="number"
                  min="1"
                  value={mixingTimeMinutes}
                  onChange={(e) => setMixingTimeMinutes(e.target.value)}
                  disabled={pending}
                  placeholder="45"
                />
              </div>

              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="phMin">pH min</Label>
                  <Input
                    id="phMin"
                    type="number"
                    min="0"
                    max="14"
                    step="0.1"
                    value={phMin}
                    onChange={(e) => setPhMin(e.target.value)}
                    disabled={pending}
                  />
                </div>
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="phMax">pH max</Label>
                  <Input
                    id="phMax"
                    type="number"
                    min="0"
                    max="14"
                    step="0.1"
                    value={phMax}
                    onChange={(e) => setPhMax(e.target.value)}
                    disabled={pending}
                  />
                </div>
              </div>
            </div>

            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Ingredientes
                </h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIngredients((rs) => [...rs, newRow()])}
                  disabled={pending}
                >
                  <Plus className="size-4" /> Añadir
                </Button>
              </div>
              <div className="space-y-2">
                {ingredients.map((row) => (
                  <div
                    key={row.key}
                    className="grid grid-cols-[1fr_auto_auto_auto] items-end gap-2 rounded-md border bg-card px-3 py-2"
                  >
                    <div className="space-y-1">
                      <select
                        value={row.rawMaterialId}
                        onChange={(e) =>
                          updateRow(row.key, { rawMaterialId: e.target.value })
                        }
                        disabled={pending}
                        className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                      >
                        <option value="">— MP —</option>
                        {rawMaterials.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.sku} · {m.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.0001"
                      min="0"
                      placeholder="Qty"
                      value={row.qty}
                      onChange={(e) =>
                        updateRow(row.key, { qty: e.target.value })
                      }
                      disabled={pending}
                      className="h-9 w-24 tabular-nums"
                    />
                    <select
                      value={row.uomId}
                      onChange={(e) =>
                        updateRow(row.key, { uomId: e.target.value })
                      }
                      disabled={pending}
                      className="flex h-9 w-24 rounded-md border border-input bg-background px-2 text-sm"
                    >
                      <option value="">UoM</option>
                      {uoms.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.id}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setIngredients((rs) =>
                          rs.length === 1 ? rs : rs.filter((r) => r.key !== row.key),
                        )
                      }
                      disabled={pending}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Costo estimado actual:{" "}
                <span className="font-semibold text-foreground tabular-nums">
                  ${estimatedCost.toFixed(2)}
                </span>{" "}
                (usa CPP vigente de cada MP)
              </p>
            </section>

            <div className="space-y-1.5">
              <Label htmlFor="instructions">Instrucciones</Label>
              <Textarea
                id="instructions"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                disabled={pending}
                rows={4}
                placeholder="1. Agregar agua a 40°C..."
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                disabled={pending}
                className="size-4"
              />
              Marcar como receta default del producto al activar
            </label>
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setOpen(false);
                resetForm();
              }}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Guardar borrador"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
