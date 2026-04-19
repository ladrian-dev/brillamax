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
import { recordInitialCount } from "@/features/inventory/actions";
import {
  initialInventoryState,
  type InitialCountInput,
} from "@/features/inventory/schema";

type MpRef = { id: string; sku: string; name: string; uomId: string };
type ProdRef = { id: string; sku: string; name: string };
type WarehouseRef = { id: string; name: string; isDefault: boolean };

type Props = {
  warehouses: WarehouseRef[];
  defaultWarehouseId: string;
  rawMaterials: MpRef[];
  products: ProdRef[];
};

/**
 * Wizard de conteo inicial: el usuario ingresa la cantidad que hay hoy de cada
 * ítem del catálogo. Los que deje en 0 no generan movimiento. El submit manda
 * un JSON al server action que itera aplicando `apply_stock_movement` con
 * `movement_kind = 'initial_count'`.
 */
export function InitialCountWizard({
  warehouses,
  defaultWarehouseId,
  rawMaterials,
  products,
}: Props) {
  const [open, setOpen] = useState(false);
  const [warehouseId, setWarehouseId] = useState(defaultWarehouseId);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [costs, setCosts] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const nonZeroCount = useMemo(
    () =>
      Object.values(quantities).filter((v) => {
        const n = Number(v);
        return Number.isFinite(n) && n > 0;
      }).length,
    [quantities],
  );

  function setQty(key: string, v: string) {
    setQuantities((q) => ({ ...q, [key]: v }));
  }
  function setCost(key: string, v: string) {
    setCosts((c) => ({ ...c, [key]: v }));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const rows: InitialCountInput["rows"] = [];
    for (const rm of rawMaterials) {
      const key = `rm:${rm.id}`;
      const qty = Number(quantities[key] ?? "0");
      const unitCost = Number(costs[key] ?? "0");
      if (!Number.isFinite(qty) || qty <= 0) continue;
      rows.push({
        itemKind: "raw_material",
        itemId: rm.id,
        uomId: rm.uomId,
        qty,
        unitCostUsd:
          Number.isFinite(unitCost) && unitCost > 0 ? unitCost : undefined,
      });
    }
    for (const p of products) {
      const key = `fg:${p.id}`;
      const qty = Number(quantities[key] ?? "0");
      if (!Number.isFinite(qty) || qty <= 0) continue;
      rows.push({
        itemKind: "finished_good",
        itemId: p.id,
        uomId: "unidad",
        qty,
      });
    }

    if (rows.length === 0) {
      setError("Ingresa al menos una cantidad > 0.");
      return;
    }

    const payload = JSON.stringify({ warehouseId, rows });
    const formData = new FormData();
    formData.set("payload", payload);

    startTransition(async () => {
      const res = await recordInitialCount(initialInventoryState, formData);
      if (res.ok) {
        setOpen(false);
        setQuantities({});
        setCosts({});
      } else {
        setError(res.error ?? "Error al guardar");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          Registrar conteo inicial
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Conteo inicial</DialogTitle>
          <DialogDescription>
            Anota el stock de cada ítem. Los que dejes en 0 no se crean.
            Para MP podés poner el costo USD por unidad (fija el CPP inicial).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex h-full flex-col gap-4 overflow-hidden">
          <div className="space-y-1.5">
            <Label htmlFor="warehouseId">Almacén</Label>
            <select
              id="warehouseId"
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              disabled={pending}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                  {w.isDefault ? " (default)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            {rawMaterials.length > 0 ? (
              <section>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Materias primas
                </h3>
                <div className="space-y-2">
                  {rawMaterials.map((rm) => {
                    const key = `rm:${rm.id}`;
                    return (
                      <div
                        key={rm.id}
                        className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-md border bg-card px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">
                            {rm.name}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {rm.sku} · {rm.uomId}
                          </div>
                        </div>
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="0.001"
                          min="0"
                          placeholder="Qty"
                          value={quantities[key] ?? ""}
                          onChange={(e) => setQty(key, e.target.value)}
                          disabled={pending}
                          className="h-9 w-24 tabular-nums"
                        />
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="0.0001"
                          min="0"
                          placeholder="$/u"
                          value={costs[key] ?? ""}
                          onChange={(e) => setCost(key, e.target.value)}
                          disabled={pending}
                          className="h-9 w-24 tabular-nums"
                        />
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {products.length > 0 ? (
              <section>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Productos terminados
                </h3>
                <div className="space-y-2">
                  {products.map((p) => {
                    const key = `fg:${p.id}`;
                    return (
                      <div
                        key={p.id}
                        className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-md border bg-card px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">
                            {p.name}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {p.sku}
                          </div>
                        </div>
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="1"
                          min="0"
                          placeholder="Qty"
                          value={quantities[key] ?? ""}
                          onChange={(e) => setQty(key, e.target.value)}
                          disabled={pending}
                          className="h-9 w-24 tabular-nums"
                        />
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-2">
            <div className="mr-auto text-xs text-muted-foreground">
              {nonZeroCount} {nonZeroCount === 1 ? "ítem" : "ítems"} con
              cantidad
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || nonZeroCount === 0}>
              {pending ? "Guardando…" : "Registrar conteo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
