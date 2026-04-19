"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { MissingRateError, requireTodayRate } from "@/features/rate/require-rate";
import {
  salePayloadSchema,
  type SaleActionState,
  type SalePaymentStatus,
  type SaleRow,
  type SaleStatus,
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

export async function listSales(
  opts: { limit?: number; onlyOpen?: boolean } = {},
): Promise<SaleRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("sales")
    .select(
      `
      id, sale_number, customer_id, sale_date, status, payment_status,
      subtotal_usd, discount_usd, total_usd, exchange_rate_used, total_vef, notes,
      customer:customers ( name, phone )
      `,
    )
    .order("sale_date", { ascending: false })
    .order("sale_number", { ascending: false });

  if (opts.onlyOpen) {
    query = query.in("payment_status", ["pending", "partial"]);
  }
  if (opts.limit) query = query.limit(opts.limit);

  const { data, error } = await query;
  if (error || !data) return [];

  const ids = data.map((r) => r.id);
  const counts = new Map<string, number>();
  if (ids.length > 0) {
    const { data: items } = await supabase
      .from("sale_items")
      .select("sale_id")
      .in("sale_id", ids);
    for (const r of items ?? []) {
      counts.set(r.sale_id, (counts.get(r.sale_id) ?? 0) + 1);
    }
  }

  return data.map((r) => {
    const customer = (Array.isArray(r.customer) ? r.customer[0] : r.customer) as
      | { name: string | null; phone: string | null }
      | null;
    return {
      id: r.id,
      saleNumber: r.sale_number,
      customerId: r.customer_id,
      customerName: customer?.name ?? null,
      customerPhone: customer?.phone ?? null,
      saleDate: r.sale_date,
      status: r.status as SaleStatus,
      paymentStatus: r.payment_status as SalePaymentStatus,
      subtotalUsd: Number(r.subtotal_usd),
      discountUsd: Number(r.discount_usd),
      totalUsd: Number(r.total_usd),
      exchangeRateUsed: Number(r.exchange_rate_used),
      totalVef: Number(r.total_vef),
      notes: r.notes,
      itemCount: counts.get(r.id) ?? 0,
    };
  });
}

export async function registerSale(
  _prev: SaleActionState,
  formData: FormData,
): Promise<SaleActionState> {
  const raw = formData.get("payload");
  if (typeof raw !== "string") return { ok: false, error: "Payload inválido" };

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return { ok: false, error: "JSON inválido" };
  }

  const parsed = salePayloadSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  // Hard-block ADR-002: ventas cruzan monedas por definición (USD ↔ VEF).
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

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("register_sale", {
    p_customer_id: parsed.data.customerId ?? null,
    p_sale_date: parsed.data.saleDate,
    p_exchange_rate: parsed.data.exchangeRateUsed,
    p_payment_terms: parsed.data.paymentTerms,
    p_discount_usd: parsed.data.discountUsd,
    p_notes: parsed.data.notes,
    p_items: parsed.data.items.map((it) => ({
      product_id: it.productId,
      qty: it.qty,
      uom_id: it.uomId,
      unit_price_usd: it.unitPriceUsd,
      discount_usd: it.discountUsd,
      warehouse_id: it.warehouseId,
      batch_code: it.batchCode,
    })),
    p_payments: parsed.data.payments.map((p) => ({
      method: p.method,
      amount_usd: p.amountUsd,
      amount_original: p.amountOriginal ?? null,
      original_currency: p.originalCurrency ?? null,
      reference: p.reference ?? null,
      notes: p.notes ?? null,
    })),
    p_allow_negative: parsed.data.allowNegativeStock,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/ventas");
  revalidatePath("/inventario");
  return { ok: true, saleId: String(data) };
}

export async function cancelSale(
  saleId: string,
  reason: string,
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = reason.trim();
  if (trimmed.length < 3) return { ok: false, error: "Motivo requerido" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_sale", {
    p_sale_id: saleId,
    p_reason: trimmed,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/ventas");
  revalidatePath("/inventario");
  return { ok: true };
}
