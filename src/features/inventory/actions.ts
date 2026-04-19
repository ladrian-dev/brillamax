"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  adjustmentSchema,
  initialCountSchema,
  type InventoryActionState,
  type ItemKind,
  type StockOnHandRow,
} from "./schema";

export async function listStockOnHand(
  warehouseId?: string,
): Promise<StockOnHandRow[]> {
  const supabase = await createClient();
  const query = supabase
    .from("stock_on_hand")
    .select(
      "id, warehouse_id, item_kind, item_id, batch_code, uom_id, qty, avg_cost_usd, value_usd, item_name, item_sku, low_stock",
    )
    .order("item_name");
  const { data, error } = warehouseId
    ? await query.eq("warehouse_id", warehouseId)
    : await query;
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id,
    warehouseId: r.warehouse_id,
    itemKind: r.item_kind as ItemKind,
    itemId: r.item_id,
    batchCode: r.batch_code,
    uomId: r.uom_id,
    qty: Number(r.qty),
    avgCostUsd: Number(r.avg_cost_usd),
    valueUsd: Number(r.value_usd),
    itemName: r.item_name,
    itemSku: r.item_sku,
    lowStock: r.low_stock,
  }));
}

export type WarehouseRow = { id: string; name: string; isDefault: boolean };

export async function listWarehouses(): Promise<WarehouseRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("warehouses")
    .select("id, name, is_default")
    .order("name");
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id,
    name: r.name,
    isDefault: r.is_default,
  }));
}

// Registra un movimiento genérico vía RPC. Todos los flujos (venta, compra,
// producción, ajuste) convergen aquí: el RPC hace CPP + balance upsert en
// la misma transacción que el insert del movimiento.
async function callApplyMovement(args: {
  movementKind: string;
  itemKind: ItemKind;
  itemId: string;
  warehouseId: string;
  qty: number;
  uomId: string;
  batchCode?: string | null;
  expiryDate?: string | null;
  unitCostUsd?: number | null;
  referenceKind?: string | null;
  referenceId?: string | null;
  notes?: string | null;
  allowNegative?: boolean;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("apply_stock_movement", {
    p_movement_kind: args.movementKind,
    p_item_kind: args.itemKind,
    p_item_id: args.itemId,
    p_warehouse_id: args.warehouseId,
    p_qty: args.qty,
    p_uom_id: args.uomId,
    p_batch_code: args.batchCode ?? null,
    p_expiry_date: args.expiryDate ?? null,
    p_unit_cost_usd: args.unitCostUsd ?? null,
    p_reference_kind: args.referenceKind ?? null,
    p_reference_id: args.referenceId ?? null,
    p_notes: args.notes ?? null,
    p_allow_negative: args.allowNegative ?? false,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: String(data) };
}

export async function recordInitialCount(
  _prev: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const raw = formData.get("payload");
  if (typeof raw !== "string") {
    return { ok: false, error: "Payload inválido" };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return { ok: false, error: "JSON inválido" };
  }

  const parsed = initialCountSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  // Aplicamos solo rows con qty > 0. El wizard puede enviar filas vacías.
  const rows = parsed.data.rows.filter((r) => r.qty > 0);
  if (rows.length === 0) {
    return { ok: false, error: "Ninguna cantidad > 0" };
  }

  let inserted = 0;
  for (const row of rows) {
    const res = await callApplyMovement({
      movementKind: "initial_count",
      itemKind: row.itemKind,
      itemId: row.itemId,
      warehouseId: parsed.data.warehouseId,
      qty: row.qty,
      uomId: row.uomId,
      unitCostUsd: row.unitCostUsd ?? null,
      referenceKind: "initial_count",
      notes: "Conteo inicial",
    });
    if (!res.ok) {
      return {
        ok: false,
        error: `Fallo en ${row.itemId}: ${res.error}`,
        insertedCount: inserted,
      };
    }
    inserted++;
  }

  revalidatePath("/inventario");
  return { ok: true, insertedCount: inserted };
}

export async function recordAdjustment(
  _prev: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const parsed = adjustmentSchema.safeParse({
    warehouseId: formData.get("warehouseId"),
    itemKind: formData.get("itemKind"),
    itemId: formData.get("itemId"),
    uomId: formData.get("uomId"),
    qty: formData.get("qty"),
    notes: formData.get("notes") ?? undefined,
    batchCode: formData.get("batchCode") ?? undefined,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  const kind = parsed.data.qty > 0 ? "adjustment_positive" : "adjustment_negative";
  const res = await callApplyMovement({
    movementKind: kind,
    itemKind: parsed.data.itemKind,
    itemId: parsed.data.itemId,
    warehouseId: parsed.data.warehouseId,
    qty: Math.abs(parsed.data.qty),
    uomId: parsed.data.uomId,
    batchCode: parsed.data.batchCode ?? null,
    notes: parsed.data.notes ?? null,
    referenceKind: "adjustment",
  });
  if (!res.ok) return { ok: false, error: res.error };

  revalidatePath("/inventario");
  return { ok: true };
}
