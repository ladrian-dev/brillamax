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
  archiveSupplier,
  upsertSupplier,
} from "@/features/catalog/actions";
import {
  initialCatalogState,
  type SupplierRow,
} from "@/features/catalog/schema";

export function SupplierSection({ items }: { items: SupplierRow[] }) {
  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          {items.length} {items.length === 1 ? "proveedor" : "proveedores"}
        </p>
        <SupplierDialog />
      </div>

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Registra a quién le compras insumos para enlazarlos con las materias
          primas.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((s) => (
            <li key={s.id} className="rounded-lg border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-card-foreground">
                    {s.name}
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    {s.contactPerson ? <span>{s.contactPerson}</span> : null}
                    {s.phone ? <span>· {s.phone}</span> : null}
                    {s.rif ? <span>· {s.rif}</span> : null}
                    {s.preferredCurrency ? (
                      <span>· Prefiere {s.preferredCurrency}</span>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <SupplierDialog row={s} />
                <ArchiveButton id={s.id} />
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
        if (!confirm("¿Archivar este proveedor?")) return;
        startTransition(() => {
          archiveSupplier(id);
        });
      }}
    >
      {pending ? "Archivando…" : "Archivar"}
    </Button>
  );
}

function SupplierDialog({ row }: { row?: SupplierRow }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isEdit = !!row;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await upsertSupplier(initialCatalogState, formData);
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
          {isEdit ? "Editar" : "Nuevo proveedor"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Editar proveedor" : "Nuevo proveedor"}
          </DialogTitle>
          <DialogDescription>
            Quién te vende insumos. Se enlaza opcionalmente a cada materia prima.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          {row ? <input type="hidden" name="id" value={row.id} /> : null}
          <div className="space-y-1.5">
            <Label htmlFor="name">Nombre</Label>
            <Input
              id="name"
              name="name"
              required
              maxLength={120}
              defaultValue={row?.name ?? ""}
              placeholder="Químicos Andinos C.A."
              disabled={pending}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="contactPerson">Contacto</Label>
              <Input
                id="contactPerson"
                name="contactPerson"
                maxLength={80}
                defaultValue={row?.contactPerson ?? ""}
                placeholder="Luis Pérez"
                disabled={pending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Teléfono</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                maxLength={30}
                defaultValue={row?.phone ?? ""}
                placeholder="+58 412 555 1234"
                disabled={pending}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rif">RIF (opcional)</Label>
              <Input
                id="rif"
                name="rif"
                maxLength={20}
                defaultValue={row?.rif ?? ""}
                disabled={pending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="preferredCurrency">Moneda preferida</Label>
              <select
                id="preferredCurrency"
                name="preferredCurrency"
                defaultValue={row?.preferredCurrency ?? ""}
                disabled={pending}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
              >
                <option value="">—</option>
                <option value="USD">USD</option>
                <option value="VEF">VEF</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notas (opcional)</Label>
            <Input
              id="notes"
              name="notes"
              maxLength={500}
              defaultValue={row?.notes ?? ""}
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
