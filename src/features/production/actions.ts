"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  completeOrderSchema,
  createOrderSchema,
  type ProductionActionState,
  type ProductionIssueRow,
  type ProductionOrderRow,
  type ProductionStatus,
} from "./schema";

async function tenantIdOrThrow(): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const tenantId = data.user?.app_metadata?.tenant_id as string | undefined;
  if (!tenantId) throw new Error("Sin tenant asociado.");
  return tenantId;
}

function fieldErrorsFrom(
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const k = i.path[0];
    if (typeof k === "string" && !out[k]) out[k] = i.message;
  }
  return out;
}

// ============================ LIST ============================

export async function listProductionOrders(
  opts: { status?: ProductionStatus; limit?: number } = {},
): Promise<ProductionOrderRow[]> {
  const supabase = await createClient();

  let query = supabase
    .from("production_orders")
    .select(
      `
      id, po_number, product_id, recipe_id, planned_qty, planned_uom_id,
      actual_qty, batch_code, warehouse_id, status,
      total_cost_usd, cost_per_yield_unit,
      ph_actual, viscosity_actual, qc_passed, qc_notes,
      observations, started_at, completed_at, cancelled_at, created_at,
      product:products ( sku, name ),
      recipe:recipes ( name, version ),
      warehouse:warehouses ( name )
      `,
    )
    .order("created_at", { ascending: false });

  if (opts.status) query = query.eq("status", opts.status);
  if (opts.limit) query = query.limit(opts.limit);

  const { data, error } = await query;
  if (error || !data) return [];

  return data.map((r) => {
    const product = (Array.isArray(r.product) ? r.product[0] : r.product) as
      | { sku: string | null; name: string | null }
      | null;
    const recipe = (Array.isArray(r.recipe) ? r.recipe[0] : r.recipe) as
      | { name: string | null; version: string | null }
      | null;
    const warehouse = (Array.isArray(r.warehouse) ? r.warehouse[0] : r.warehouse) as
      | { name: string | null }
      | null;
    return {
      id: r.id,
      poNumber: r.po_number,
      productId: r.product_id,
      productSku: product?.sku ?? null,
      productName: product?.name ?? null,
      recipeId: r.recipe_id,
      recipeName: recipe?.name ?? null,
      recipeVersion: recipe?.version ?? null,
      plannedQty: Number(r.planned_qty),
      plannedUomId: r.planned_uom_id,
      actualQty: r.actual_qty === null ? null : Number(r.actual_qty),
      batchCode: r.batch_code,
      warehouseId: r.warehouse_id,
      warehouseName: warehouse?.name ?? null,
      status: r.status as ProductionStatus,
      totalCostUsd: r.total_cost_usd === null ? null : Number(r.total_cost_usd),
      costPerYieldUnit:
        r.cost_per_yield_unit === null ? null : Number(r.cost_per_yield_unit),
      phActual: r.ph_actual === null ? null : Number(r.ph_actual),
      viscosityActual: r.viscosity_actual,
      qcPassed: r.qc_passed,
      qcNotes: r.qc_notes,
      observations: r.observations,
      startedAt: r.started_at,
      completedAt: r.completed_at,
      cancelledAt: r.cancelled_at,
      createdAt: r.created_at,
    };
  });
}

export async function listProductionIssues(
  productionOrderId: string,
): Promise<ProductionIssueRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("production_order_issues")
    .select(
      `
      id, raw_material_id, qty, uom_id, unit_cost_usd,
      rm:raw_materials ( sku, name )
      `,
    )
    .eq("production_order_id", productionOrderId);
  if (error || !data) return [];
  return data.map((r) => {
    const rm = (Array.isArray(r.rm) ? r.rm[0] : r.rm) as
      | { sku: string | null; name: string | null }
      | null;
    const qty = Number(r.qty);
    const unitCost = r.unit_cost_usd === null ? null : Number(r.unit_cost_usd);
    return {
      id: r.id,
      rawMaterialId: r.raw_material_id,
      rmSku: rm?.sku ?? null,
      rmName: rm?.name ?? null,
      qty,
      uomId: r.uom_id,
      unitCostUsd: unitCost,
      subtotalUsd: qty * (unitCost ?? 0),
    };
  });
}

// ============================ CREATE ============================

export async function createProductionOrder(
  _prev: ProductionActionState,
  formData: FormData,
): Promise<ProductionActionState> {
  const parsed = createOrderSchema.safeParse({
    productId: formData.get("productId"),
    recipeId: formData.get("recipeId"),
    plannedQty: formData.get("plannedQty"),
    plannedUomId: formData.get("plannedUomId"),
    observations: formData.get("observations") ?? undefined,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  const tenantId = await tenantIdOrThrow();
  const supabase = await createClient();

  const { data: numData, error: numErr } = await supabase.rpc(
    "next_doc_number",
    { p_prefix: "OP" },
  );
  if (numErr || !numData) {
    return { ok: false, error: numErr?.message ?? "No se pudo generar OP#" };
  }

  const { data, error } = await supabase
    .from("production_orders")
    .insert({
      tenant_id: tenantId,
      po_number: String(numData),
      product_id: parsed.data.productId,
      recipe_id: parsed.data.recipeId,
      planned_qty: parsed.data.plannedQty,
      planned_uom_id: parsed.data.plannedUomId,
      observations: parsed.data.observations,
      status: "draft",
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Error" };
  }

  revalidatePath("/produccion");
  return { ok: true, orderId: data.id };
}

// ============================ START ============================

export async function startProductionOrder(
  productionOrderId: string,
  issueWarehouseId: string,
): Promise<ProductionActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("start_production_order", {
    p_production_order_id: productionOrderId,
    p_issue_warehouse_id: issueWarehouseId,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/produccion");
  return { ok: true, orderId: productionOrderId };
}

// ============================ COMPLETE ============================

export async function completeProductionOrder(
  _prev: ProductionActionState,
  formData: FormData,
): Promise<ProductionActionState> {
  const parsed = completeOrderSchema.safeParse({
    productionOrderId: formData.get("productionOrderId"),
    actualQty: formData.get("actualQty"),
    outputWarehouseId: formData.get("outputWarehouseId"),
    phActual: formData.get("phActual") ?? undefined,
    viscosityActual: formData.get("viscosityActual") ?? undefined,
    qcPassed: formData.get("qcPassed") ?? undefined,
    qcNotes: formData.get("qcNotes") ?? undefined,
    batchCode: formData.get("batchCode") ?? undefined,
    expiryDate: formData.get("expiryDate") ?? undefined,
    observations: formData.get("observations") ?? undefined,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("complete_production_order", {
    p_production_order_id: parsed.data.productionOrderId,
    p_actual_qty: parsed.data.actualQty,
    p_output_warehouse_id: parsed.data.outputWarehouseId,
    p_ph_actual: parsed.data.phActual,
    p_viscosity_actual: parsed.data.viscosityActual,
    p_qc_passed: parsed.data.qcPassed,
    p_qc_notes: parsed.data.qcNotes,
    p_batch_code: parsed.data.batchCode,
    p_expiry_date: parsed.data.expiryDate ?? null,
    p_observations: parsed.data.observations,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/produccion");
  revalidatePath("/inventario");
  return { ok: true, orderId: parsed.data.productionOrderId };
}

// ============================ CANCEL ============================

export async function cancelProductionOrder(
  productionOrderId: string,
  reason: string,
): Promise<ProductionActionState> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("production_orders")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_reason: reason || "manual",
    })
    .eq("id", productionOrderId)
    .in("status", ["draft", "ready", "in_progress"]);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/produccion");
  return { ok: true, orderId: productionOrderId };
}
