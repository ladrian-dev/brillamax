"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { MissingRateError, requireTodayRate } from "@/features/rate/require-rate";
import {
  purchasePayloadSchema,
  type PurchaseActionState,
  type PurchaseCurrency,
  type PurchasePaymentStatus,
  type PurchaseRow,
} from "./schema";

function fieldErrorsFrom(
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const head = i.path[0];
    const key = typeof head === "string" ? head : undefined;
    if (key && !out[key]) out[key] = i.message;
  }
  return out;
}

export async function listPurchases(
  opts: { limit?: number } = {},
): Promise<PurchaseRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("purchases")
    .select(
      `
      id, purchase_number, supplier_id, purchase_date,
      currency, exchange_rate_used, total_usd, total_original_currency,
      payment_status, payment_method, notes,
      supplier:suppliers ( name )
      `,
    )
    .order("purchase_date", { ascending: false })
    .order("purchase_number", { ascending: false });
  if (opts.limit) query = query.limit(opts.limit);

  const { data, error } = await query;
  if (error || !data) return [];

  const ids = data.map((r) => r.id);
  const counts = new Map<string, number>();
  if (ids.length > 0) {
    const { data: items } = await supabase
      .from("purchase_items")
      .select("purchase_id")
      .in("purchase_id", ids);
    for (const r of items ?? []) {
      counts.set(r.purchase_id, (counts.get(r.purchase_id) ?? 0) + 1);
    }
  }

  return data.map((r) => {
    const supplier = (Array.isArray(r.supplier) ? r.supplier[0] : r.supplier) as
      | { name: string | null }
      | null;
    return {
      id: r.id,
      purchaseNumber: r.purchase_number,
      supplierId: r.supplier_id,
      supplierName: supplier?.name ?? null,
      purchaseDate: r.purchase_date,
      currency: r.currency as PurchaseCurrency,
      exchangeRateUsed: Number(r.exchange_rate_used),
      totalUsd: Number(r.total_usd),
      totalOriginalCurrency: Number(r.total_original_currency),
      paymentStatus: r.payment_status as PurchasePaymentStatus,
      paymentMethod: r.payment_method,
      notes: r.notes,
      itemCount: counts.get(r.id) ?? 0,
    };
  });
}

export async function registerPurchase(
  _prev: PurchaseActionState,
  formData: FormData,
): Promise<PurchaseActionState> {
  const raw = formData.get("payload");
  if (typeof raw !== "string") return { ok: false, error: "Payload inválido" };

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return { ok: false, error: "JSON inválido" };
  }

  const parsed = purchasePayloadSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  // Hard-block ADR-002 solo cuando la compra cruza monedas (VEF).
  if (parsed.data.currency === "VEF") {
    try {
      const todayRate = await requireTodayRate();
      if (Math.abs(parsed.data.exchangeRateUsed - todayRate.value) > 0.0001) {
        return {
          ok: false,
          error: `La tasa del payload (${parsed.data.exchangeRateUsed}) no coincide con la tasa del día (${todayRate.value}). Refresca la pantalla.`,
        };
      }
    } catch (e) {
      if (e instanceof MissingRateError) {
        return { ok: false, error: e.message };
      }
      throw e;
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("register_purchase", {
    p_supplier_id: parsed.data.supplierId,
    p_purchase_date: parsed.data.purchaseDate,
    p_currency: parsed.data.currency,
    p_exchange_rate_used: parsed.data.exchangeRateUsed,
    p_payment_status: parsed.data.paymentStatus,
    p_payment_method: parsed.data.paymentMethod,
    p_notes: parsed.data.notes,
    p_items: parsed.data.items.map((it) => ({
      raw_material_id: it.rawMaterialId,
      qty: it.qty,
      uom_id: it.uomId,
      unit_price_original: it.unitPriceOriginal,
      warehouse_id: it.warehouseId,
      batch_code: it.batchCode,
      expiry_date: it.expiryDate,
    })),
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/compras");
  revalidatePath("/inventario");
  return { ok: true, purchaseId: String(data) };
}
