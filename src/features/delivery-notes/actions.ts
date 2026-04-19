"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  issueDeliveryNoteSchema,
  type DeliveryNoteActionState,
  type DeliveryNoteRow,
} from "./schema";

function fieldErrorFirst(
  issues: ReadonlyArray<{ message: string }>,
): string | undefined {
  return issues[0]?.message;
}

export async function listDeliveryNotes(): Promise<
  (DeliveryNoteRow & { saleNumber: string; customerName: string | null })[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("delivery_notes")
    .select(
      "id, sale_id, delivery_number, issued_at, pdf_version, received_by_name, delivered_at, shared_whatsapp_at, sales:sale_id(sale_number, customers:customer_id(name))",
    )
    .order("issued_at", { ascending: false })
    .limit(50);
  if (error || !data) return [];
  type Row = {
    id: string;
    sale_id: string;
    delivery_number: string;
    issued_at: string;
    pdf_version: number;
    received_by_name: string | null;
    delivered_at: string | null;
    shared_whatsapp_at: string | null;
    sales:
      | {
          sale_number: string;
          customers:
            | { name: string }
            | { name: string }[]
            | null;
        }
      | {
          sale_number: string;
          customers:
            | { name: string }
            | { name: string }[]
            | null;
        }[]
      | null;
  };
  return (data as unknown as Row[]).map((r) => {
    const sale = Array.isArray(r.sales) ? r.sales[0] : r.sales;
    const customers = sale
      ? Array.isArray(sale.customers)
        ? sale.customers[0]
        : sale.customers
      : null;
    return {
      id: r.id,
      saleId: r.sale_id,
      deliveryNumber: r.delivery_number,
      issuedAt: r.issued_at,
      pdfVersion: r.pdf_version,
      receivedByName: r.received_by_name,
      deliveredAt: r.delivered_at,
      sharedWhatsappAt: r.shared_whatsapp_at,
      saleNumber: sale?.sale_number ?? "",
      customerName: customers?.name ?? null,
    };
  });
}

export async function getDeliveryNoteForSale(
  saleId: string,
): Promise<DeliveryNoteRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("delivery_notes")
    .select(
      "id, sale_id, delivery_number, issued_at, pdf_version, received_by_name, delivered_at, shared_whatsapp_at",
    )
    .eq("sale_id", saleId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    saleId: data.sale_id,
    deliveryNumber: data.delivery_number,
    issuedAt: data.issued_at,
    pdfVersion: data.pdf_version,
    receivedByName: data.received_by_name,
    deliveredAt: data.delivered_at,
    sharedWhatsappAt: data.shared_whatsapp_at,
  };
}

export async function issueDeliveryNote(
  _prev: DeliveryNoteActionState,
  formData: FormData,
): Promise<DeliveryNoteActionState> {
  const raw = formData.get("payload");
  if (typeof raw !== "string") return { ok: false, error: "Payload inválido" };
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return { ok: false, error: "JSON inválido" };
  }
  const parsed = issueDeliveryNoteSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return {
      ok: false,
      error: fieldErrorFirst(parsed.error.issues) ?? "Datos inválidos",
    };
  }
  const input = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("issue_delivery_note", {
    p_sale_id: input.saleId,
    p_received_by_name: input.receivedByName,
    p_customer_signature_url: input.customerSignatureUrl,
  });
  if (error) return { ok: false, error: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { ok: false, error: "No se pudo emitir NE" };
  revalidatePath("/ventas");
  revalidatePath("/notas-entrega");
  return {
    ok: true,
    deliveryNumber: row.delivery_number as string,
    pdfVersion: row.pdf_version as number,
  };
}

export async function markDeliveryNoteShared(
  deliveryNoteId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_delivery_note_shared", {
    p_delivery_note_id: deliveryNoteId,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/notas-entrega");
  return { ok: true };
}
