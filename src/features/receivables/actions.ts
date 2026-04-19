"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  applyPaymentSchema,
  type CustomerReceivableRow,
  type PaymentActionState,
  type SaleBalanceRow,
} from "./schema";

function daysBetween(isoDate: string): number {
  const d = new Date(isoDate + "T00:00:00");
  const today = new Date();
  const ms = today.getTime() - d.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

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

export async function listCustomerReceivables(): Promise<
  CustomerReceivableRow[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_receivables")
    .select(
      "customer_id, name, phone, type, open_balance_usd, unpaid_count, oldest_unpaid_date",
    )
    .gt("open_balance_usd", 0)
    .order("open_balance_usd", { ascending: false });
  if (error || !data) return [];
  return data.map((r) => ({
    customerId: r.customer_id,
    name: r.name,
    phone: r.phone,
    type: r.type,
    openBalanceUsd: Number(r.open_balance_usd),
    unpaidCount: Number(r.unpaid_count),
    oldestUnpaidDate: r.oldest_unpaid_date,
    daysOldest: r.oldest_unpaid_date ? daysBetween(r.oldest_unpaid_date) : null,
  }));
}

export async function listSaleBalancesForCustomer(
  customerId: string,
): Promise<SaleBalanceRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sale_balances")
    .select(
      "sale_id, sale_number, sale_date, total_usd, paid_usd, balance_usd, status, payment_status",
    )
    .eq("customer_id", customerId)
    .neq("status", "cancelled")
    .gt("balance_usd", 0)
    .order("sale_date", { ascending: true });
  if (error || !data) return [];
  return data.map((r) => ({
    saleId: r.sale_id,
    saleNumber: r.sale_number,
    saleDate: r.sale_date,
    totalUsd: Number(r.total_usd),
    paidUsd: Number(r.paid_usd),
    balanceUsd: Number(r.balance_usd),
    status: r.status,
    paymentStatus: r.payment_status,
  }));
}

export async function applyPayment(
  _prev: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  const raw = formData.get("payload");
  if (typeof raw !== "string") return { ok: false, error: "Payload inválido" };
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return { ok: false, error: "JSON inválido" };
  }
  const parsed = applyPaymentSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }
  const input = parsed.data;
  const supabase = await createClient();

  if (input.targetKind === "sale") {
    if (!input.saleId) return { ok: false, error: "Venta requerida" };
    const { error } = await supabase.rpc("apply_payment_to_sale", {
      p_sale_id: input.saleId,
      p_method: input.method,
      p_amount_usd: input.amountUsd,
      p_payment_date: input.paymentDate ?? null,
      p_amount_original: input.amountOriginal ?? null,
      p_original_currency: input.originalCurrency ?? null,
      p_reference: input.reference,
      p_notes: input.notes,
    });
    if (error) return { ok: false, error: error.message };
    revalidatePath("/cxc");
    revalidatePath("/ventas");
    return { ok: true, applied: 1 };
  }

  if (!input.customerId) return { ok: false, error: "Cliente requerido" };
  const { data, error } = await supabase.rpc("apply_payment_fifo", {
    p_customer_id: input.customerId,
    p_method: input.method,
    p_amount_usd: input.amountUsd,
    p_payment_date: input.paymentDate ?? null,
    p_amount_original: input.amountOriginal ?? null,
    p_original_currency: input.originalCurrency ?? null,
    p_reference: input.reference,
    p_notes: input.notes,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/cxc");
  revalidatePath("/ventas");
  return { ok: true, applied: Number(data ?? 0) };
}
