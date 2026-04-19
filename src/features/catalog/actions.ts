"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  customerSchema,
  productSchema,
  rawMaterialSchema,
  supplierSchema,
  type CatalogActionState,
  type CustomerRow,
  type ProductRow,
  type RawMaterialRow,
  type SupplierRow,
  type UomRow,
  type CustomerType,
  type PaymentTerms,
  type SupplierCurrency,
} from "./schema";

// RLS filtra por tenant automáticamente: la policy lee tenant_id del JWT
// vía current_tenant_id(). Por eso las queries no necesitan .eq("tenant_id").
// Para inserts sí hay que setear tenant_id explícito (se extrae del JWT claim).

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
    const key = issue.path[0];
    if (typeof key === "string" && !out[key]) out[key] = issue.message;
  }
  return out;
}

// ============================ LISTAS ============================

export async function listProducts(
  includeArchived = false,
): Promise<ProductRow[]> {
  const supabase = await createClient();
  const query = supabase
    .from("products")
    .select("id, sku, name, presentation, price_usd, category, description, archived_at")
    .order("name");
  const { data, error } = includeArchived
    ? await query
    : await query.is("archived_at", null);
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id,
    sku: r.sku,
    name: r.name,
    presentation: r.presentation,
    priceUsd: Number(r.price_usd),
    category: r.category,
    description: r.description,
    archivedAt: r.archived_at,
  }));
}

export async function listRawMaterials(
  includeArchived = false,
): Promise<RawMaterialRow[]> {
  const supabase = await createClient();
  const query = supabase
    .from("raw_materials")
    .select(
      "id, sku, name, uom_id, avg_cost_usd, min_stock, track_batch, default_supplier_id, archived_at",
    )
    .order("name");
  const { data, error } = includeArchived
    ? await query
    : await query.is("archived_at", null);
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id,
    sku: r.sku,
    name: r.name,
    uomId: r.uom_id,
    avgCostUsd: Number(r.avg_cost_usd),
    minStock: Number(r.min_stock),
    trackBatch: r.track_batch,
    defaultSupplierId: r.default_supplier_id,
    archivedAt: r.archived_at,
  }));
}

export async function listCustomers(
  includeArchived = false,
): Promise<CustomerRow[]> {
  const supabase = await createClient();
  const query = supabase
    .from("customers")
    .select(
      "id, name, type, rif, phone, email, address, default_payment_terms, notes, archived_at",
    )
    .order("name");
  const { data, error } = includeArchived
    ? await query
    : await query.is("archived_at", null);
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type as CustomerType,
    rif: r.rif,
    phone: r.phone,
    email: r.email,
    address: r.address,
    defaultPaymentTerms: r.default_payment_terms as PaymentTerms,
    notes: r.notes,
    archivedAt: r.archived_at,
  }));
}

export async function listSuppliers(
  includeArchived = false,
): Promise<SupplierRow[]> {
  const supabase = await createClient();
  const query = supabase
    .from("suppliers")
    .select(
      "id, name, rif, phone, contact_person, preferred_currency, notes, archived_at",
    )
    .order("name");
  const { data, error } = includeArchived
    ? await query
    : await query.is("archived_at", null);
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id,
    name: r.name,
    rif: r.rif,
    phone: r.phone,
    contactPerson: r.contact_person,
    preferredCurrency: r.preferred_currency as SupplierCurrency | null,
    notes: r.notes,
    archivedAt: r.archived_at,
  }));
}

export async function listUoms(): Promise<UomRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("uoms")
    .select("id, name, kind")
    .order("name");
  if (error || !data) return [];
  return data;
}

// ============================ MUTATIONS ============================

function mapPgError(code: string | undefined, fallback: string): string {
  if (code === "23505") return "Ya existe un registro con ese SKU.";
  if (code === "23514") return "Algún campo tiene un valor fuera de rango.";
  return fallback;
}

export async function upsertProduct(
  _prev: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const id = formData.get("id");
  const parsed = productSchema.safeParse({
    sku: formData.get("sku"),
    name: formData.get("name"),
    presentation: formData.get("presentation") ?? undefined,
    priceUsd: formData.get("priceUsd"),
    category: formData.get("category") ?? undefined,
    description: formData.get("description") ?? undefined,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  const supabase = await createClient();
  const payload = {
    sku: parsed.data.sku,
    name: parsed.data.name,
    presentation: parsed.data.presentation,
    price_usd: parsed.data.priceUsd,
    category: parsed.data.category,
    description: parsed.data.description,
  };

  if (typeof id === "string" && id.length > 0) {
    const { error } = await supabase
      .from("products")
      .update(payload)
      .eq("id", id);
    if (error) return { ok: false, error: mapPgError(error.code, error.message) };
  } else {
    const tenantId = await tenantIdOrThrow();
    const { error } = await supabase
      .from("products")
      .insert({ ...payload, tenant_id: tenantId });
    if (error) return { ok: false, error: mapPgError(error.code, error.message) };
  }

  revalidatePath("/catalogo");
  return { ok: true };
}

export async function archiveProduct(id: string): Promise<CatalogActionState> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/catalogo");
  return { ok: true };
}

export async function restoreProduct(id: string): Promise<CatalogActionState> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update({ archived_at: null })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/catalogo");
  return { ok: true };
}

export async function upsertRawMaterial(
  _prev: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const id = formData.get("id");
  const parsed = rawMaterialSchema.safeParse({
    sku: formData.get("sku"),
    name: formData.get("name"),
    uomId: formData.get("uomId"),
    avgCostUsd: formData.get("avgCostUsd"),
    minStock: formData.get("minStock"),
    trackBatch: formData.get("trackBatch") ?? undefined,
    defaultSupplierId: formData.get("defaultSupplierId") ?? undefined,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  const supabase = await createClient();
  const payload = {
    sku: parsed.data.sku,
    name: parsed.data.name,
    uom_id: parsed.data.uomId,
    avg_cost_usd: parsed.data.avgCostUsd,
    min_stock: parsed.data.minStock,
    track_batch: parsed.data.trackBatch ?? false,
    default_supplier_id: parsed.data.defaultSupplierId ?? null,
  };

  if (typeof id === "string" && id.length > 0) {
    const { error } = await supabase
      .from("raw_materials")
      .update(payload)
      .eq("id", id);
    if (error) return { ok: false, error: mapPgError(error.code, error.message) };
  } else {
    const tenantId = await tenantIdOrThrow();
    const { error } = await supabase
      .from("raw_materials")
      .insert({ ...payload, tenant_id: tenantId });
    if (error) return { ok: false, error: mapPgError(error.code, error.message) };
  }

  revalidatePath("/catalogo");
  return { ok: true };
}

export async function archiveRawMaterial(
  id: string,
): Promise<CatalogActionState> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("raw_materials")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/catalogo");
  return { ok: true };
}

export async function upsertCustomer(
  _prev: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const id = formData.get("id");
  const parsed = customerSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type") ?? undefined,
    rif: formData.get("rif") ?? undefined,
    phone: formData.get("phone") ?? undefined,
    email: formData.get("email") ?? undefined,
    address: formData.get("address") ?? undefined,
    defaultPaymentTerms: formData.get("defaultPaymentTerms") ?? undefined,
    notes: formData.get("notes") ?? undefined,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  const supabase = await createClient();
  const payload = {
    name: parsed.data.name,
    type: parsed.data.type,
    rif: parsed.data.rif,
    phone: parsed.data.phone,
    email: parsed.data.email,
    address: parsed.data.address,
    default_payment_terms: parsed.data.defaultPaymentTerms,
    notes: parsed.data.notes,
  };

  if (typeof id === "string" && id.length > 0) {
    const { error } = await supabase
      .from("customers")
      .update(payload)
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
  } else {
    const tenantId = await tenantIdOrThrow();
    const { error } = await supabase
      .from("customers")
      .insert({ ...payload, tenant_id: tenantId });
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/catalogo");
  return { ok: true };
}

export async function archiveCustomer(
  id: string,
): Promise<CatalogActionState> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("customers")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/catalogo");
  return { ok: true };
}

export async function upsertSupplier(
  _prev: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const id = formData.get("id");
  const parsed = supplierSchema.safeParse({
    name: formData.get("name"),
    rif: formData.get("rif") ?? undefined,
    phone: formData.get("phone") ?? undefined,
    contactPerson: formData.get("contactPerson") ?? undefined,
    preferredCurrency: formData.get("preferredCurrency") ?? undefined,
    notes: formData.get("notes") ?? undefined,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  const supabase = await createClient();
  const payload = {
    name: parsed.data.name,
    rif: parsed.data.rif,
    phone: parsed.data.phone,
    contact_person: parsed.data.contactPerson,
    preferred_currency: parsed.data.preferredCurrency ?? null,
    notes: parsed.data.notes,
  };

  if (typeof id === "string" && id.length > 0) {
    const { error } = await supabase
      .from("suppliers")
      .update(payload)
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
  } else {
    const tenantId = await tenantIdOrThrow();
    const { error } = await supabase
      .from("suppliers")
      .insert({ ...payload, tenant_id: tenantId });
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/catalogo");
  return { ok: true };
}

export async function archiveSupplier(
  id: string,
): Promise<CatalogActionState> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("suppliers")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/catalogo");
  return { ok: true };
}
