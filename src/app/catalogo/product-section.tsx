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
import {
  archiveProduct,
  upsertProduct,
} from "@/features/catalog/actions";
import {
  initialCatalogState,
  type ProductRow,
} from "@/features/catalog/schema";

export function ProductSection({ items }: { items: ProductRow[] }) {
  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          {items.length} {items.length === 1 ? "producto" : "productos"}
        </p>
        <ProductDialog />
      </div>

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Aún no has creado productos. Comienza con tus SKUs más vendidos.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((p) => (
            <li
              key={p.id}
              className="rounded-lg border bg-card p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-card-foreground">
                    {p.name}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-mono">{p.sku}</span>
                    {p.presentation ? <span>· {p.presentation}</span> : null}
                    {p.category ? <span>· {p.category}</span> : null}
                  </div>
                </div>
                <div className="flex items-baseline gap-1 tabular-nums">
                  <span className="text-base font-semibold text-card-foreground">
                    ${p.priceUsd.toFixed(2)}
                  </span>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <ProductDialog row={p} />
                <ArchiveButton id={p.id} />
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
        if (!confirm("¿Archivar este producto?")) return;
        startTransition(() => {
          archiveProduct(id);
        });
      }}
    >
      {pending ? "Archivando…" : "Archivar"}
    </Button>
  );
}

function ProductDialog({ row }: { row?: ProductRow }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isEdit = !!row;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await upsertProduct(initialCatalogState, formData);
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
          {isEdit ? "Editar" : "Nuevo producto"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Editar producto" : "Nuevo producto"}
          </DialogTitle>
          <DialogDescription>
            Define SKU, nombre, presentación y precio en USD.
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
                placeholder="DET-500"
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
                placeholder="Detergente líquido 500ml"
                disabled={pending}
              />
            </div>
          </div>
          <div className="grid grid-cols-[2fr_1fr] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="presentation">Presentación</Label>
              <Input
                id="presentation"
                name="presentation"
                maxLength={60}
                defaultValue={row?.presentation ?? ""}
                placeholder="500 ml"
                disabled={pending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="priceUsd">Precio USD</Label>
              <Input
                id="priceUsd"
                name="priceUsd"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                required
                defaultValue={row?.priceUsd ?? 0}
                disabled={pending}
                className="tabular-nums"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="category">Categoría (opcional)</Label>
            <Input
              id="category"
              name="category"
              maxLength={40}
              defaultValue={row?.category ?? ""}
              placeholder="Detergentes"
              disabled={pending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Descripción (opcional)</Label>
            <Input
              id="description"
              name="description"
              maxLength={500}
              defaultValue={row?.description ?? ""}
              disabled={pending}
            />
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
