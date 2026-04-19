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
  archiveCustomer,
  upsertCustomer,
} from "@/features/catalog/actions";
import {
  initialCatalogState,
  type CustomerRow,
} from "@/features/catalog/schema";

const TYPE_LABELS: Record<CustomerRow["type"], string> = {
  consumer: "Consumidor",
  bodega: "Bodega",
  mayorista: "Mayorista",
  otro: "Otro",
};

const TERMS_LABELS: Record<CustomerRow["defaultPaymentTerms"], string> = {
  cash: "Contado",
  "7d": "7 días",
  "15d": "15 días",
  "30d": "30 días",
};

export function CustomerSection({ items }: { items: CustomerRow[] }) {
  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          {items.length} {items.length === 1 ? "cliente" : "clientes"}
        </p>
        <CustomerDialog />
      </div>

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Registra tus clientes para poder asignarles deudas y notas de entrega.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((c) => (
            <li key={c.id} className="rounded-lg border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-card-foreground">
                    {c.name}
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    <span>{TYPE_LABELS[c.type]}</span>
                    {c.phone ? <span>· {c.phone}</span> : null}
                    {c.rif ? <span>· {c.rif}</span> : null}
                    <span>· Pago {TERMS_LABELS[c.defaultPaymentTerms]}</span>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <CustomerDialog row={c} />
                <ArchiveButton id={c.id} />
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
        if (!confirm("¿Archivar este cliente?")) return;
        startTransition(() => {
          archiveCustomer(id);
        });
      }}
    >
      {pending ? "Archivando…" : "Archivar"}
    </Button>
  );
}

function CustomerDialog({ row }: { row?: CustomerRow }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isEdit = !!row;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await upsertCustomer(initialCatalogState, formData);
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
          {isEdit ? "Editar" : "Nuevo cliente"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Editar cliente" : "Nuevo cliente"}
          </DialogTitle>
          <DialogDescription>
            Datos mínimos para registrar ventas y contactarlo por WhatsApp.
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
              placeholder="Bodega Los Andes"
              disabled={pending}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="type">Tipo</Label>
              <select
                id="type"
                name="type"
                defaultValue={row?.type ?? "consumer"}
                disabled={pending}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
              >
                <option value="consumer">Consumidor</option>
                <option value="bodega">Bodega</option>
                <option value="mayorista">Mayorista</option>
                <option value="otro">Otro</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="defaultPaymentTerms">Condición de pago</Label>
              <select
                id="defaultPaymentTerms"
                name="defaultPaymentTerms"
                defaultValue={row?.defaultPaymentTerms ?? "cash"}
                disabled={pending}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
              >
                <option value="cash">Contado</option>
                <option value="7d">7 días</option>
                <option value="15d">15 días</option>
                <option value="30d">30 días</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
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
            <div className="space-y-1.5">
              <Label htmlFor="rif">RIF (opcional)</Label>
              <Input
                id="rif"
                name="rif"
                maxLength={20}
                defaultValue={row?.rif ?? ""}
                placeholder="J-12345678-9"
                disabled={pending}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email (opcional)</Label>
            <Input
              id="email"
              name="email"
              type="email"
              defaultValue={row?.email ?? ""}
              disabled={pending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="address">Dirección (opcional)</Label>
            <Input
              id="address"
              name="address"
              maxLength={200}
              defaultValue={row?.address ?? ""}
              disabled={pending}
            />
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
