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
import { Textarea } from "@/components/ui/textarea";
import {
  cancelProductionOrder,
  completeProductionOrder,
  startProductionOrder,
} from "@/features/production/actions";
import {
  initialProductionState,
  type ProductionOrderRow,
} from "@/features/production/schema";

type WarehouseRef = { id: string; name: string; isDefault: boolean };

export function OrderCardActions({
  order,
  warehouses,
}: {
  order: ProductionOrderRow;
  warehouses: WarehouseRef[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleStart() {
    const defaultWh = warehouses.find((w) => w.isDefault) ?? warehouses[0];
    if (!defaultWh) {
      setError("No hay almacén configurado.");
      return;
    }
    if (
      !window.confirm(
        `¿Iniciar ${order.poNumber}? Se descuenta la MP del almacén ${defaultWh.name}.`,
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      const res = await startProductionOrder(order.id, defaultWh.id);
      if (!res.ok) setError(res.error ?? "Error al iniciar");
    });
  }

  function handleCancel() {
    const reason = window.prompt("Motivo de cancelación:");
    if (!reason) return;
    setError(null);
    startTransition(async () => {
      const res = await cancelProductionOrder(order.id, reason);
      if (!res.ok) setError(res.error ?? "Error al cancelar");
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {order.status === "draft" || order.status === "ready" ? (
        <Button size="sm" onClick={handleStart} disabled={pending}>
          Iniciar
        </Button>
      ) : null}
      {order.status === "in_progress" ? (
        <CompleteDialog order={order} warehouses={warehouses} />
      ) : null}
      {order.status === "draft" ||
      order.status === "ready" ||
      order.status === "in_progress" ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={handleCancel}
          disabled={pending}
        >
          Cancelar
        </Button>
      ) : null}
      {error ? (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      ) : null}
    </div>
  );
}

function CompleteDialog({
  order,
  warehouses,
}: {
  order: ProductionOrderRow;
  warehouses: WarehouseRef[];
}) {
  const [open, setOpen] = useState(false);
  const defaultWh = warehouses.find((w) => w.isDefault) ?? warehouses[0];
  const [actualQty, setActualQty] = useState(String(order.plannedQty));
  const [warehouseId, setWarehouseId] = useState(defaultWh?.id ?? "");
  const [batchCode, setBatchCode] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [phActual, setPhActual] = useState("");
  const [viscosity, setViscosity] = useState("");
  const [qcPassed, setQcPassed] = useState(true);
  const [qcNotes, setQcNotes] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set("productionOrderId", order.id);
    fd.set("actualQty", actualQty);
    fd.set("outputWarehouseId", warehouseId);
    fd.set("qcPassed", qcPassed ? "on" : "");
    if (batchCode.trim()) fd.set("batchCode", batchCode);
    if (expiryDate) fd.set("expiryDate", expiryDate);
    if (phActual) fd.set("phActual", phActual);
    if (viscosity.trim()) fd.set("viscosityActual", viscosity);
    if (qcNotes.trim()) fd.set("qcNotes", qcNotes);

    startTransition(async () => {
      const res = await completeProductionOrder(initialProductionState, fd);
      if (res.ok) setOpen(false);
      else setError(res.error ?? "Error al completar");
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Completar</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Completar {order.poNumber}</DialogTitle>
          <DialogDescription>
            Ingresa yield real + QC. El FG se ingresa al almacén elegido con
            costo = total MP / yield real.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="actualQty">Yield real ({order.plannedUomId})</Label>
            <Input
              id="actualQty"
              type="number"
              inputMode="decimal"
              step="0.001"
              min="0"
              value={actualQty}
              onChange={(e) => setActualQty(e.target.value)}
              disabled={pending}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="outputWarehouseId">Almacén destino</Label>
            <select
              id="outputWarehouseId"
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              disabled={pending}
              required
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="batchCode">Lote (opc.)</Label>
            <Input
              id="batchCode"
              value={batchCode}
              onChange={(e) => setBatchCode(e.target.value)}
              disabled={pending}
              placeholder="auto si vacío"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="expiryDate">Vence</Label>
            <Input
              id="expiryDate"
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              disabled={pending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phActual">pH real</Label>
            <Input
              id="phActual"
              type="number"
              min="0"
              max="14"
              step="0.1"
              value={phActual}
              onChange={(e) => setPhActual(e.target.value)}
              disabled={pending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="viscosity">Viscosidad</Label>
            <Input
              id="viscosity"
              value={viscosity}
              onChange={(e) => setViscosity(e.target.value)}
              disabled={pending}
            />
          </div>
          <label className="sm:col-span-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={qcPassed}
              onChange={(e) => setQcPassed(e.target.checked)}
              disabled={pending}
              className="size-4"
            />
            QC aprobado
          </label>
          <div className="sm:col-span-2 space-y-1.5">
            <Label htmlFor="qcNotes">Notas QC</Label>
            <Textarea
              id="qcNotes"
              rows={2}
              value={qcNotes}
              onChange={(e) => setQcNotes(e.target.value)}
              disabled={pending}
            />
          </div>
          {error ? (
            <p role="alert" className="sm:col-span-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter className="sm:col-span-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Cerrando…" : "Completar lote"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
