"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  recipePayloadSchema,
  type RecipeActionState,
  type RecipeIngredientBreakdownRow,
  type RecipeRow,
  type RecipeStatus,
} from "./schema";

async function tenantIdOrThrow(): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const tenantId = data.user?.app_metadata?.tenant_id as string | undefined;
  if (!tenantId) {
    throw new Error("Sin tenant asociado. Completa el onboarding.");
  }
  return tenantId;
}

function fieldErrorsFrom(
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    // Para payload anidado: header.yieldQty → "yieldQty"; ingredients.0.qty → "ingredients"
    const head = issue.path[0];
    const second = issue.path[1];
    const key =
      head === "header" && typeof second === "string"
        ? second
        : typeof head === "string"
          ? head
          : undefined;
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}

function mapPgError(code: string | undefined, fallback: string): string {
  if (code === "23505") return "Ya existe una receta con esa versión";
  return fallback;
}

// ============================ LISTA ============================

export async function listRecipes(
  opts: { status?: RecipeStatus; productId?: string; includeArchived?: boolean } = {},
): Promise<RecipeRow[]> {
  const supabase = await createClient();

  // Paso 1: recipes con join a products.
  let query = supabase
    .from("recipes")
    .select(
      `
      id, product_id, name, version, category,
      yield_qty, yield_uom_id, mixing_time_minutes,
      ph_min, ph_max, viscosity_target, instructions,
      status, is_default, archived_reason, archived_at,
      product:products ( sku, name )
      `,
    )
    .order("product_id")
    .order("version", { ascending: false });

  if (!opts.includeArchived) query = query.is("archived_at", null);
  if (opts.status) query = query.eq("status", opts.status);
  if (opts.productId) query = query.eq("product_id", opts.productId);

  const { data, error } = await query;
  if (error || !data) return [];

  const ids = data.map((r) => r.id);
  // Paso 2: costos de todas las recetas en un solo query.
  const costsById = new Map<
    string,
    { totalUsd: number; perUnitUsd: number }
  >();
  if (ids.length > 0) {
    const { data: costs } = await supabase
      .from("recipe_cost_current")
      .select("recipe_id, total_usd, per_unit_usd")
      .in("recipe_id", ids);
    for (const c of costs ?? []) {
      costsById.set(c.recipe_id, {
        totalUsd: Number(c.total_usd),
        perUnitUsd: Number(c.per_unit_usd),
      });
    }
  }

  // Paso 3: conteo de ingredientes por receta.
  const countsById = new Map<string, number>();
  if (ids.length > 0) {
    const { data: ings } = await supabase
      .from("recipe_ingredients")
      .select("recipe_id")
      .in("recipe_id", ids);
    for (const row of ings ?? []) {
      countsById.set(row.recipe_id, (countsById.get(row.recipe_id) ?? 0) + 1);
    }
  }

  return data.map((r) => {
    const product = (Array.isArray(r.product) ? r.product[0] : r.product) as
      | { sku: string | null; name: string | null }
      | null;
    const cost = costsById.get(r.id) ?? { totalUsd: 0, perUnitUsd: 0 };
    return {
      id: r.id,
      productId: r.product_id,
      productSku: product?.sku ?? null,
      productName: product?.name ?? null,
      name: r.name,
      version: r.version,
      category: r.category,
      yieldQty: Number(r.yield_qty),
      yieldUomId: r.yield_uom_id,
      mixingTimeMinutes: r.mixing_time_minutes,
      phMin: r.ph_min === null ? null : Number(r.ph_min),
      phMax: r.ph_max === null ? null : Number(r.ph_max),
      viscosityTarget: r.viscosity_target,
      instructions: r.instructions,
      status: r.status as RecipeStatus,
      isDefault: r.is_default,
      archivedReason: r.archived_reason,
      archivedAt: r.archived_at,
      totalUsd: cost.totalUsd,
      perUnitUsd: cost.perUnitUsd,
      ingredientCount: countsById.get(r.id) ?? 0,
    };
  });
}

// ============================ DETALLE ============================

export type RecipeDetail = {
  recipe: RecipeRow;
  ingredients: RecipeIngredientBreakdownRow[];
};

export async function getRecipeDetail(
  recipeId: string,
): Promise<RecipeDetail | null> {
  const [list, breakdown] = await Promise.all([
    listRecipes({ includeArchived: true }).then((rs) =>
      rs.find((r) => r.id === recipeId),
    ),
    (async () => {
      const supabase = await createClient();
      const { data } = await supabase
        .from("recipe_ingredient_breakdown")
        .select(
          "id, recipe_id, raw_material_id, rm_sku, rm_name, qty, uom_id, order_index, notes, unit_cost_usd, subtotal_usd",
        )
        .eq("recipe_id", recipeId)
        .order("order_index");
      return (data ?? []).map((r) => ({
        id: r.id,
        recipeId: r.recipe_id,
        rawMaterialId: r.raw_material_id,
        rmSku: r.rm_sku,
        rmName: r.rm_name,
        qty: Number(r.qty),
        uomId: r.uom_id,
        orderIndex: r.order_index,
        notes: r.notes,
        unitCostUsd: Number(r.unit_cost_usd),
        subtotalUsd: Number(r.subtotal_usd),
      }));
    })(),
  ]);

  if (!list) return null;
  return { recipe: list, ingredients: breakdown };
}

// ============================ SAVE ============================

/**
 * Guarda una receta completa (header + ingredientes). Solo permite edición
 * sobre recetas en estado `draft`: active/archived son inmutables (el caller
 * debe duplicar con clone_recipe_as_version para editar).
 */
export async function saveRecipe(
  _prev: RecipeActionState,
  formData: FormData,
): Promise<RecipeActionState> {
  const raw = formData.get("payload");
  if (typeof raw !== "string") return { ok: false, error: "Payload inválido" };

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return { ok: false, error: "JSON inválido" };
  }

  const parsed = recipePayloadSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  const id = formData.get("id");
  const supabase = await createClient();

  const headerPayload = {
    product_id: parsed.data.header.productId,
    name: parsed.data.header.name,
    version: parsed.data.header.version,
    category: parsed.data.header.category,
    yield_qty: parsed.data.header.yieldQty,
    yield_uom_id: parsed.data.header.yieldUomId,
    mixing_time_minutes: parsed.data.header.mixingTimeMinutes,
    ph_min: parsed.data.header.phMin,
    ph_max: parsed.data.header.phMax,
    viscosity_target: parsed.data.header.viscosityTarget,
    instructions: parsed.data.header.instructions,
    is_default: parsed.data.header.isDefault ?? false,
  };

  let recipeId: string;

  if (typeof id === "string" && id.length > 0) {
    // Update: rechazar si no es draft.
    const { data: existing, error: readErr } = await supabase
      .from("recipes")
      .select("status")
      .eq("id", id)
      .maybeSingle();
    if (readErr || !existing) {
      return { ok: false, error: "Receta no encontrada" };
    }
    if (existing.status !== "draft") {
      return {
        ok: false,
        error:
          "No se puede editar una receta activa/archivada. Duplicala como nueva versión.",
      };
    }

    const { error } = await supabase
      .from("recipes")
      .update(headerPayload)
      .eq("id", id);
    if (error) return { ok: false, error: mapPgError(error.code, error.message) };
    recipeId = id;

    // Reemplazar ingredientes (delete + insert).
    const { error: delErr } = await supabase
      .from("recipe_ingredients")
      .delete()
      .eq("recipe_id", id);
    if (delErr) return { ok: false, error: delErr.message };
  } else {
    const tenantId = await tenantIdOrThrow();
    const { data: inserted, error } = await supabase
      .from("recipes")
      .insert({ ...headerPayload, tenant_id: tenantId, status: "draft" })
      .select("id")
      .single();
    if (error || !inserted) {
      return { ok: false, error: mapPgError(error?.code, error?.message ?? "Error") };
    }
    recipeId = inserted.id;
  }

  const ingredientsRows = parsed.data.ingredients.map((ing) => ({
    recipe_id: recipeId,
    raw_material_id: ing.rawMaterialId,
    qty: ing.qty,
    uom_id: ing.uomId,
    order_index: ing.orderIndex,
    notes: ing.notes,
  }));

  const { error: insErr } = await supabase
    .from("recipe_ingredients")
    .insert(ingredientsRows);
  if (insErr) return { ok: false, error: insErr.message };

  revalidatePath("/recetas");
  return { ok: true, recipeId };
}

// ============================ ACTIVATE / ARCHIVE / CLONE ============================

/**
 * Promueve una receta draft → active. Si is_default=true, archiva cualquier
 * otra default del mismo producto (libera el índice único parcial antes del
 * update).
 */
export async function activateRecipe(
  recipeId: string,
  makeDefault: boolean,
): Promise<RecipeActionState> {
  const supabase = await createClient();

  const { data: target, error: readErr } = await supabase
    .from("recipes")
    .select("id, product_id, status")
    .eq("id", recipeId)
    .maybeSingle();
  if (readErr || !target) return { ok: false, error: "Receta no encontrada" };
  if (target.status !== "draft") {
    return { ok: false, error: "Solo se puede activar desde draft" };
  }

  if (makeDefault) {
    // Libera default previa del mismo producto marcándola como not-default.
    // Si había una default activa, el usuario probablemente quiere archivarla;
    // el flujo más limpio es crear la nueva versión vía clone + activate:
    // aquí solo quitamos el flag para respetar el unique index parcial.
    const { error: unsetErr } = await supabase
      .from("recipes")
      .update({ is_default: false })
      .eq("product_id", target.product_id)
      .eq("is_default", true)
      .is("archived_at", null);
    if (unsetErr) return { ok: false, error: unsetErr.message };
  }

  const { error } = await supabase
    .from("recipes")
    .update({ status: "active", is_default: makeDefault })
    .eq("id", recipeId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/recetas");
  return { ok: true };
}

export async function archiveRecipe(
  recipeId: string,
  reason?: string,
): Promise<RecipeActionState> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("recipes")
    .update({
      status: "archived",
      archived_at: new Date().toISOString(),
      archived_reason: reason ?? null,
      is_default: false,
    })
    .eq("id", recipeId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/recetas");
  return { ok: true };
}

export async function cloneRecipeAsVersion(
  sourceRecipeId: string,
  newVersion: string,
): Promise<RecipeActionState> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("clone_recipe_as_version", {
    p_source_recipe_id: sourceRecipeId,
    p_new_version: newVersion,
  });
  if (error) return { ok: false, error: mapPgError(error.code, error.message) };
  revalidatePath("/recetas");
  return { ok: true, recipeId: String(data) };
}
