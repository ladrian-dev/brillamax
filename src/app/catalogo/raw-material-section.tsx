"use client";

import { useState, useTransition } from "react";
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
import { AutocompleteSelect } from "@/components/brillamax/AutocompleteSelect";
import {
  archiveRawMaterial,
  upsertRawMaterial,
} from "@/features/catalog/actions";
import {
  initialCatalogState,
  type RawMaterialRow,
  type SupplierRow,
  type UomRow,
} from "@/features/catalog/schema";

type Props = {
  items: RawMaterialRow[];
  uoms: UomRow[];
  suppliers: SupplierRow[];
};

export function RawMaterialSection({ items, uoms, suppliers }: Props) {
  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          {items.length} {items.length === 1 ? "materia prima" : "materias primas"}
        </p>
        <RawMaterialDialog uoms={uoms} suppliers={suppliers} />
      </div>

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Registra tus insumos: soda cáustica, fragancias, envases, etiquetas.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((r) => (
            <li
              key={r.id}
              className="rounded-lg border bg-card p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-card-foreground">
                    {r.name}
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    <span className="font-mono">{r.sku}</span>
                    <span>· UoM {r.uomId}</span>
                    <span>· Costo prom. ${r.avgCostUsd.toFixed(4)}</span>
                    {r.minStock > 0 ? (
                      <span>· mín {r.minStock} {r.uomId}</span>
                    ) : null}
                    {r.trackBatch ? <span>· lote+vence</span> : null}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <RawMaterialDialog row={r} uoms={uoms} suppliers={suppliers} />
                <ArchiveButton id={r.id} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ArchiveButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (!confirm("¿Archivar esta materia prima?")) return;
        startTransition(() => {
          archiveRawMaterial(id);
        });
      }}
    >
      {pending ? "Archivando…" : "Archivar"}
    </Button>
  );
}

function RawMaterialDialog({
  row,
  uoms,
  suppliers,
}: {
  row?: RawMaterialRow;
  uoms: UomRow[];
  suppliers: SupplierRow[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isEdit = !!row;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await upsertRawMaterial(initialCatalogState, formData);
      if (result.ok) setOpen(false);
      else setError(result.error ?? "Error al guardar");
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant={isEdit ? "outline" : "default"}
          size="sm"
        >
          {isEdit ? "Editar" : "Nueva MP"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Editar materia prima" : "Nueva materia prima"}
          </DialogTitle>
          <DialogDescription>
            Insumos que se consumen en recetas. El costo promedio se recalcula
            con cada compra.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          {row ? <input type="hidden" name="id" value={row.id} /> : null}
          <div className="grid grid-cols-[1fr_2fr] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sku">SKU</Label>
              <Input
                id="sku"
                name="sku"
                required
                maxLength={40}
                defaultValue={row?.sku ?? ""}
                placeholder="SOD-001"
                className="font-mono"
                disabled={pending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="name">Nombre</Label>
              <Input
                id="name"
                name="name"
                required
                maxLength={120}
                defaultValue={row?.name ?? ""}
                placeholder="Soda cáustica"
                disabled={pending}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="uomId">UoM</Label>
              <select
                id="uomId"
                name="uomId"
                required
                defaultValue={row?.uomId ?? ""}
                disabled={pending}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
              >
                <option value="" disabled>
                  —
                </option>
                {uoms.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.id}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="avgCostUsd">Costo USD</Label>
              <Input
                id="avgCostUsd"
                name="avgCostUsd"
                type="number"
                inputMode="decimal"
                step="0.0001"
                min="0"
                defaultValue={row?.avgCostUsd ?? 0}
                disabled={pending}
                className="tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="minStock">Stock mín.</Label>
              <Input
                id="minStock"
                name="minStock"
                type="number"
                inputMode="decimal"
                step="0.001"
                min="0"
                defaultValue={row?.minStock ?? 0}
                disabled={pending}
                className="tabular-nums"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Proveedor habitual (opcional)</Label>
            <AutocompleteSelect
              name="defaultSupplierId"
              defaultValue={row?.defaultSupplierId ?? undefined}
              options={suppliers.map((s) => ({
                value: s.id,
                label: s.name,
                hint: s.rif ?? undefined,
              }))}
              placeholder="Buscar proveedor…"
              disabled={pending}
              emptyLabel="Sin proveedores. Créalos en la pestaña Proveedores."
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              name="trackBatch"
              defaultChecked={row?.trackBatch ?? false}
              disabled={pending}
              className="size-4"
            />
            Requiere lote + fecha de vencimiento
          </label>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
