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
import { submitSaleOnlineOrQueue } from "@/features/sales/client";
import {
  type SalePaymentMethod,
  type SalePayload,
} from "@/features/sales/schema";

type ProductRef = {
  id: string;
  sku: string;
  name: string;
  priceUsd: number;
  stockQty: number;
  uomId: string;
};
type CustomerRef = { id: string; name: string };
type WarehouseRef = { id: string; name: string; isDefault: boolean };

type ItemRow = {
  key: string;
  productId: string;
  qty: string;
  unitPriceUsd: string;
  warehouseId: string;
};

let seq = 0;
const newRow = (defaultWhId: string): ItemRow => ({
  key: `itm-${++seq}`,
  productId: "",
  qty: "1",
  unitPriceUsd: "",
  warehouseId: defaultWhId,
});

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

export function QuickSaleDialog({
  products,
  customers,
  warehouses,
  todayRate,
  session,
}: {
  products: ProductRef[];
  customers: CustomerRef[];
  warehouses: WarehouseRef[];
  todayRate: number;
  session: { tenantId: string; userId: string };
}) {
  const defaultWh = warehouses.find((w) => w.isDefault) ?? warehouses[0];
  const defaultWhId = defaultWh?.id ?? "";

  const [open, setOpen] = useState(false);
  const [customerId, setCustomerId] = useState<string>("");
  const [saleDate, setSaleDate] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [items, setItems] = useState<ItemRow[]>([newRow(defaultWhId)]);
  const [paymentMethod, setPaymentMethod] =
    useState<SalePaymentMethod>("cash_usd");
  const [amountReceived, setAmountReceived] = useState("");
  const [reference, setReference] = useState("");
  const [allowNegative, setAllowNegative] = useState(false);

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const productsById = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );

  const total = useMemo(() => {
    let t = 0;
    for (const r of items) {
      const q = Number(r.qty);
      const p = Number(r.unitPriceUsd);
      if (Number.isFinite(q) && Number.isFinite(p)) t += q * p;
    }
    return Math.round(t * 100) / 100;
  }, [items]);

  const amountRecvNum = Number(amountReceived);
  const change =
    Number.isFinite(amountRecvNum) && amountRecvNum > total
      ? Math.round((amountRecvNum - total) * 100) / 100
      : 0;

  function updateItem(key: string, patch: Partial<ItemRow>) {
    setItems((rows) =>
      rows.map((r) => {
        if (r.key !== key) return r;
        const next = { ...r, ...patch };
        if (patch.productId) {
          const p = productsById.get(patch.productId);
          if (p && !r.unitPriceUsd) next.unitPriceUsd = p.priceUsd.toFixed(2);
        }
        return next;
      }),
    );
  }

  function resetForm() {
    setCustomerId("");
    setSaleDate(new Date().toISOString().slice(0, 10));
    setItems([newRow(defaultWhId)]);
    setPaymentMethod("cash_usd");
    setAmountReceived("");
    setReference("");
    setAllowNegative(false);
    setError(null);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const cleanItems = items
      .map((r) => {
        const p = productsById.get(r.productId);
        if (!p) return null;
        const qty = Number(r.qty);
        const price = Number(r.unitPriceUsd);
        if (!Number.isFinite(qty) || qty <= 0) return null;
        if (!Number.isFinite(price) || price < 0) return null;
        if (!r.warehouseId) return null;
        return {
          productId: r.productId,
          qty,
          uomId: p.uomId,
          unitPriceUsd: price,
          discountUsd: 0,
          warehouseId: r.warehouseId,
          batchCode: null,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (cleanItems.length === 0) {
      setError("Agrega al menos un producto con cantidad y precio válidos.");
      return;
    }

    const received = Number(amountReceived);
    const amountUsd =
      Number.isFinite(received) && received > 0
        ? Math.min(received, total)
        : total;

    const payload: SalePayload = {
      customerId: customerId || null,
      saleDate,
      exchangeRateUsed: todayRate,
      paymentTerms: customerId ? "cash" : null,
      discountUsd: 0,
      notes: null,
      items: cleanItems,
      payments:
        amountUsd > 0
          ? [
              {
                method: paymentMethod,
                amountUsd,
                reference: reference.trim() || null,
                notes: null,
              },
            ]
          : [],
      allowNegativeStock: allowNegative,
    };

    startTransition(async () => {
      const res = await submitSaleOnlineOrQueue(payload, session);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (res.mode === "queued") {
        setInfo(
          "Sin conexión — venta guardada localmente. Se sincronizará al reconectar.",
        );
        setTimeout(() => {
          setOpen(false);
          resetForm();
          setInfo(null);
        }, 1200);
      } else {
        setOpen(false);
        resetForm();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg" className="w-full sm:w-auto">
          + Venta rápida
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Venta rápida</DialogTitle>
          <DialogDescription>
            Público general por defecto. Tasa del día: {todayRate.toFixed(2)}{" "}
            VEF/USD.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="flex h-full flex-col gap-4 overflow-hidden"
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="customerId">Cliente</Label>
                <select
                  id="customerId"
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  disabled={pending}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
                >
                  <option value="">Público general</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="saleDate">Fecha</Label>
                <Input
                  id="saleDate"
                  type="date"
                  value={saleDate}
                  onChange={(e) => setSaleDate(e.target.value)}
                  disabled={pending}
                  required
                />
              </div>
            </div>

            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Productos
                </h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setItems((rs) => [...rs, newRow(defaultWhId)])
                  }
                  disabled={pending}
                >
                  <Plus className="size-4" /> Añadir
                </Button>
              </div>
              <div className="space-y-2">
                {items.map((row) => {
                  const prod = productsById.get(row.productId);
                  const noStock = prod ? prod.stockQty <= 0 : false;
                  return (
                    <div
                      key={row.key}
                      className="rounded-md border bg-card p-2"
                    >
                      <div className="grid grid-cols-[1fr_auto_auto_auto] items-end gap-2">
                        <select
                          value={row.productId}
                          onChange={(e) =>
                            updateItem(row.key, { productId: e.target.value })
                          }
                          disabled={pending}
                          className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                        >
                          <option value="">— Producto —</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.sku} · {p.name}
                              {p.stockQty <= 0 ? " (sin stock)" : ""}
                            </option>
                          ))}
                        </select>
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="0.001"
                          min="0"
                          placeholder="Qty"
                          value={row.qty}
                          onChange={(e) =>
                            updateItem(row.key, { qty: e.target.value })
                          }
                          disabled={pending}
                          className="h-9 w-20 tabular-nums"
                        />
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min="0"
                          placeholder="P/u $"
                          value={row.unitPriceUsd}
                          onChange={(e) =>
                            updateItem(row.key, {
                              unitPriceUsd: e.target.value,
                            })
                          }
                          disabled={pending}
                          className="h-9 w-24 tabular-nums"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setItems((rs) =>
                              rs.length === 1
                                ? rs
                                : rs.filter((r) => r.key !== row.key),
                            )
                          }
                          disabled={pending}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                      {prod ? (
                        <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>
                            Stock: {prod.stockQty.toFixed(2)} {prod.uomId}
                            {" · "}
                            Almacén:{" "}
                            {warehouses.find((w) => w.id === row.warehouseId)
                              ?.name ?? "—"}
                          </span>
                          {noStock ? (
                            <span className="font-medium text-destructive">
                              sin stock
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Pago
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="paymentMethod">Método</Label>
                  <select
                    id="paymentMethod"
                    value={paymentMethod}
                    onChange={(e) =>
                      setPaymentMethod(e.target.value as SalePaymentMethod)
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
                  <Label htmlFor="amountReceived">Monto recibido (USD)</Label>
                  <Input
                    id="amountReceived"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={amountReceived}
                    onChange={(e) => setAmountReceived(e.target.value)}
                    disabled={pending}
                    placeholder={total.toFixed(2)}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="reference">Referencia</Label>
                  <Input
                    id="reference"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    disabled={pending}
                    placeholder="Código Zelle, ref Pago Móvil…"
                  />
                </div>
              </div>
            </section>

            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={allowNegative}
                onChange={(e) => setAllowNegative(e.target.checked)}
                disabled={pending}
                className="h-4 w-4"
              />
              Permitir venta aunque no haya stock suficiente
            </label>
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          {info ? (
            <p
              role="status"
              className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-foreground"
            >
              {info}
            </p>
          ) : null}

          <DialogFooter className="flex-col items-stretch gap-2 sm:flex-col sm:gap-2">
            <div className="rounded-md bg-muted px-3 py-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Total</span>
                <span className="text-lg font-semibold tabular-nums">
                  ${total.toFixed(2)} ·{" "}
                  <span className="text-muted-foreground">
                    {(total * todayRate).toFixed(2)} VEF
                  </span>
                </span>
              </div>
              {change > 0 ? (
                <div className="mt-1 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Vuelto</span>
                  <span className="font-medium tabular-nums">
                    ${change.toFixed(2)}
                  </span>
                </div>
              ) : null}
            </div>
            <div className="flex justify-end gap-2">
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
              <Button type="submit" disabled={pending || total <= 0}>
                {pending ? "Registrando…" : "Confirmar venta"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
