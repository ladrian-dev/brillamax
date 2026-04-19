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
import { registerPurchase } from "@/features/purchases/actions";
import {
  initialPurchaseState,
  type PurchaseCurrency,
  type PurchasePaymentStatus,
  type PurchasePayload,
} from "@/features/purchases/schema";

type SupplierRef = { id: string; name: string };
type RawMaterialRef = { id: string; sku: string; name: string; uomId: string };
type WarehouseRef = { id: string; name: string; isDefault: boolean };

type ItemRow = {
  key: string;
  rawMaterialId: string;
  qty: string;
  uomId: string;
  unitPriceOriginal: string;
  warehouseId: string;
  batchCode: string;
  expiryDate: string;
};

let seq = 0;
const newRow = (defaultWarehouseId: string): ItemRow => ({
  key: `itm-${++seq}`,
  rawMaterialId: "",
  qty: "",
  uomId: "",
  unitPriceOriginal: "",
  warehouseId: defaultWarehouseId,
  batchCode: "",
  expiryDate: "",
});

export function NewPurchaseDialog({
  suppliers,
  rawMaterials,
  warehouses,
  todayRate,
}: {
  suppliers: SupplierRef[];
  rawMaterials: RawMaterialRef[];
  warehouses: WarehouseRef[];
  todayRate: number | null;
}) {
  const defaultWh = warehouses.find((w) => w.isDefault) ?? warehouses[0];
  const defaultWhId = defaultWh?.id ?? "";

  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [currency, setCurrency] = useState<PurchaseCurrency>("USD");
  const [exchangeRate, setExchangeRate] = useState(
    todayRate ? String(todayRate) : "",
  );
  const [paymentStatus, setPaymentStatus] =
    useState<PurchasePaymentStatus>("paid");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ItemRow[]>([newRow(defaultWhId)]);

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const rmById = useMemo(
    () => new Map(rawMaterials.map((m) => [m.id, m])),
    [rawMaterials],
  );

  const total = useMemo(() => {
    let orig = 0;
    for (const r of items) {
      const qty = Number(r.qty);
      const price = Number(r.unitPriceOriginal);
      if (!Number.isFinite(qty) || !Number.isFinite(price)) continue;
      orig += qty * price;
    }
    const rate = Number(exchangeRate);
    const usd =
      currency === "VEF" && Number.isFinite(rate) && rate > 0
        ? orig / rate
        : orig;
    return { orig, usd };
  }, [items, currency, exchangeRate]);

  function updateItem(key: string, patch: Partial<ItemRow>) {
    setItems((rows) =>
      rows.map((r) => {
        if (r.key !== key) return r;
        const next = { ...r, ...patch };
        if (patch.rawMaterialId && !r.uomId) {
          const rm = rmById.get(patch.rawMaterialId);
          if (rm) next.uomId = rm.uomId;
        }
        return next;
      }),
    );
  }

  function resetForm() {
    setSupplierId("");
    setPurchaseDate(new Date().toISOString().slice(0, 10));
    setCurrency("USD");
    setExchangeRate(todayRate ? String(todayRate) : "");
    setPaymentStatus("paid");
    setPaymentMethod("");
    setNotes("");
    setItems([newRow(defaultWhId)]);
    setError(null);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const cleanItems = items
      .filter(
        (r) =>
          r.rawMaterialId &&
          Number(r.qty) > 0 &&
          r.uomId &&
          Number(r.unitPriceOriginal) >= 0 &&
          r.warehouseId,
      )
      .map((r) => ({
        rawMaterialId: r.rawMaterialId,
        qty: Number(r.qty),
        uomId: r.uomId,
        unitPriceOriginal: Number(r.unitPriceOriginal),
        warehouseId: r.warehouseId,
        batchCode: r.batchCode.trim() || null,
        expiryDate: r.expiryDate || undefined,
      }));

    if (cleanItems.length === 0) {
      setError("Agrega al menos una línea completa.");
      return;
    }

    const payload: PurchasePayload = {
      supplierId,
      purchaseDate,
      currency,
      exchangeRateUsed: Number(exchangeRate),
      paymentStatus,
      paymentMethod: paymentMethod.trim() || null,
      notes: notes.trim() || null,
      items: cleanItems,
    };

    const fd = new FormData();
    fd.set("payload", JSON.stringify(payload));

    startTransition(async () => {
      const res = await registerPurchase(initialPurchaseState, fd);
      if (res.ok) {
        setOpen(false);
        resetForm();
      } else {
        setError(res.error ?? "Error al registrar compra");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Nueva compra</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Registrar compra</DialogTitle>
          <DialogDescription>
            Ingresa MP al stock. Si pagas en VEF, la tasa convierte a USD
            funcional.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="flex h-full flex-col gap-4 overflow-hidden"
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="supplierId">Proveedor</Label>
                <select
                  id="supplierId"
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  disabled={pending}
                  required
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
                >
                  <option value="">— Seleccionar —</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="purchaseDate">Fecha</Label>
                <Input
                  id="purchaseDate"
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  disabled={pending}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="currency">Moneda</Label>
                <select
                  id="currency"
                  value={currency}
                  onChange={(e) =>
                    setCurrency(e.target.value as PurchaseCurrency)
                  }
                  disabled={pending}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
                >
                  <option value="USD">USD</option>
                  <option value="VEF">VEF</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="exchangeRate">
                  Tasa usada{" "}
                  {currency === "USD" ? (
                    <span className="text-xs text-muted-foreground">
                      (informativa)
                    </span>
                  ) : null}
                </Label>
                <Input
                  id="exchangeRate"
                  type="number"
                  min="0"
                  step="0.0001"
                  value={exchangeRate}
                  onChange={(e) => setExchangeRate(e.target.value)}
                  disabled={pending}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="paymentStatus">Estado pago</Label>
                <select
                  id="paymentStatus"
                  value={paymentStatus}
                  onChange={(e) =>
                    setPaymentStatus(e.target.value as PurchasePaymentStatus)
                  }
                  disabled={pending}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
                >
                  <option value="paid">Pagada</option>
                  <option value="partial">Parcial</option>
                  <option value="pending">Pendiente</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="paymentMethod">Método</Label>
                <Input
                  id="paymentMethod"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  disabled={pending}
                  placeholder="zelle, cash_usd, transfer_vef…"
                />
              </div>
            </div>

            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Ítems ({currency})
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
                  const rm = rmById.get(row.rawMaterialId);
                  return (
                    <div
                      key={row.key}
                      className="rounded-md border bg-card p-2"
                    >
                      <div className="grid grid-cols-[1fr_auto_auto_auto] items-end gap-2">
                        <select
                          value={row.rawMaterialId}
                          onChange={(e) =>
                            updateItem(row.key, {
                              rawMaterialId: e.target.value,
                            })
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
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="0.0001"
                          min="0"
                          placeholder="Qty"
                          value={row.qty}
                          onChange={(e) =>
                            updateItem(row.key, { qty: e.target.value })
                          }
                          disabled={pending}
                          className="h-9 w-24 tabular-nums"
                        />
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="0.0001"
                          min="0"
                          placeholder={`P/u ${currency}`}
                          value={row.unitPriceOriginal}
                          onChange={(e) =>
                            updateItem(row.key, {
                              unitPriceOriginal: e.target.value,
                            })
                          }
                          disabled={pending}
                          className="h-9 w-28 tabular-nums"
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
                      {rm?.uomId && rmById.get(row.rawMaterialId) ? (
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          UoM: {row.uomId || rm.uomId}
                          {rm
                            ? ` · Almacén: ${warehouses.find((w) => w.id === row.warehouseId)?.name ?? "—"}`
                            : ""}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>

            <div className="space-y-1.5">
              <Label htmlFor="notes">Notas</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={pending}
                rows={2}
              />
            </div>
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter className="flex-col items-stretch gap-2 sm:flex-col sm:gap-2">
            <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
              <span className="text-muted-foreground">Total</span>
              <span className="font-semibold tabular-nums">
                {total.orig.toFixed(2)} {currency} · ${total.usd.toFixed(2)} USD
              </span>
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
              <Button type="submit" disabled={pending}>
                {pending ? "Guardando…" : "Registrar compra"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
