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
import { applyPayment } from "@/features/receivables/actions";
import {
  initialPaymentState,
  type ApplyPaymentInput,
} from "@/features/receivables/schema";
import type { SalePaymentMethod } from "@/features/sales/schema";

type SaleRef = {
  saleId: string;
  saleNumber: string;
  balanceUsd: number;
};

const PAYMENT_LABELS: Record<SalePaymentMethod, string> = {
  cash_usd: "USD efectivo",
  cash_vef: "VEF efectivo",
  zelle: "Zelle",
  transfer_vef: "Transferencia VEF",
  pago_movil: "Pago Móvil",
  usdt: "USDT",
  mixed: "Mixto",
  other: "Otro",
};

export function ApplyPaymentDialog({
  customerId,
  customerName,
  openBalanceUsd,
  openSales,
  triggerLabel = "Registrar pago",
}: {
  customerId: string;
  customerName: string;
  openBalanceUsd: number;
  openSales: SaleRef[];
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<"fifo" | "sale">("fifo");
  const [saleId, setSaleId] = useState<string>(openSales[0]?.saleId ?? "");
  const [method, setMethod] = useState<SalePaymentMethod>("cash_usd");
  const [amount, setAmount] = useState(openBalanceUsd.toFixed(2));
  const [paymentDate, setPaymentDate] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [reference, setReference] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setTarget("fifo");
    setSaleId(openSales[0]?.saleId ?? "");
    setMethod("cash_usd");
    setAmount(openBalanceUsd.toFixed(2));
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setReference("");
    setError(null);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const payload: ApplyPaymentInput = {
      targetKind: target,
      customerId: target === "fifo" ? customerId : null,
      saleId: target === "sale" ? saleId : null,
      method,
      amountUsd: Number(amount),
      paymentDate,
      reference: reference.trim() || null,
      notes: null,
    };
    const fd = new FormData();
    fd.set("payload", JSON.stringify(payload));
    startTransition(async () => {
      const res = await applyPayment(initialPaymentState, fd);
      if (res.ok) {
        setOpen(false);
        resetForm();
      } else {
        setError(res.error ?? "Error al registrar pago");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">{triggerLabel}</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar pago</DialogTitle>
          <DialogDescription>
            {customerName} · deuda ${openBalanceUsd.toFixed(2)}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="method">Método</Label>
              <select
                id="method"
                value={method}
                onChange={(e) =>
                  setMethod(e.target.value as SalePaymentMethod)
                }
                disabled={pending}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
              >
                {(Object.keys(PAYMENT_LABELS) as SalePaymentMethod[]).map(
                  (m) => (
                    <option key={m} value={m}>
                      {PAYMENT_LABELS[m]}
                    </option>
                  ),
                )}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="amount">Monto USD</Label>
              <Input
                id="amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={pending}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="paymentDate">Fecha</Label>
              <Input
                id="paymentDate"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                disabled={pending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reference">Referencia</Label>
              <Input
                id="reference"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                disabled={pending}
                placeholder="Zelle, Pago Móvil…"
              />
            </div>
          </div>

          <fieldset className="space-y-2 rounded-md border p-3 text-sm">
            <legend className="px-1 text-xs text-muted-foreground">
              Aplicar a
            </legend>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="target"
                value="fifo"
                checked={target === "fifo"}
                onChange={() => setTarget("fifo")}
                disabled={pending}
              />
              <span>Saldo general (FIFO automático)</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="target"
                value="sale"
                checked={target === "sale"}
                onChange={() => setTarget("sale")}
                disabled={pending || openSales.length === 0}
              />
              <span>Venta específica</span>
            </label>
            {target === "sale" ? (
              <select
                value={saleId}
                onChange={(e) => setSaleId(e.target.value)}
                disabled={pending}
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
              >
                {openSales.map((s) => (
                  <option key={s.saleId} value={s.saleId}>
                    {s.saleNumber} · ${s.balanceUsd.toFixed(2)}
                  </option>
                ))}
              </select>
            ) : null}
          </fieldset>

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
                resetForm();
              }}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Registrando…" : "Registrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
