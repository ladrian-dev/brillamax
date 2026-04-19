import { z } from "zod";

// Tipos compartidos en client y server. Los enum reflejan los tipos Postgres
// definidos en la migración 0004_catalog.sql — mantener alineados.

export const customerTypeSchema = z.enum([
  "consumer",
  "bodega",
  "mayorista",
  "otro",
]);
export type CustomerType = z.infer<typeof customerTypeSchema>;

export const paymentTermsSchema = z.enum(["cash", "7d", "15d", "30d"]);
export type PaymentTerms = z.infer<typeof paymentTermsSchema>;

export const supplierCurrencySchema = z.enum(["USD", "VEF"]);
export type SupplierCurrency = z.infer<typeof supplierCurrencySchema>;

// Helpers de normalización. Los inputs del form vienen como strings del
// FormData, hay que limpiar espacios antes de validar.
const trimmedText = (max: number, msg = "Requerido") =>
  z.string().trim().min(1, msg).max(max);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v));

// SKU: libre (el usuario puede tener su propio esquema), pero sin espacios
// laterales y entre 1 y 40 chars. Únicos por (tenant, sku) vía constraint DB.
const skuField = z
  .string()
  .trim()
  .min(1, "SKU requerido")
  .max(40, "SKU muy largo");

// --- Products ---
export const productSchema = z.object({
  sku: skuField,
  name: trimmedText(120, "Nombre requerido"),
  presentation: optionalText(60),
  priceUsd: z.coerce
    .number()
    .finite()
    .nonnegative("Precio inválido")
    .max(1_000_000, "Fuera de rango"),
  category: optionalText(40),
  description: optionalText(500),
});
export type ProductInput = z.infer<typeof productSchema>;

// --- Raw materials ---
export const rawMaterialSchema = z.object({
  sku: skuField,
  name: trimmedText(120, "Nombre requerido"),
  uomId: trimmedText(20, "UoM requerida"),
  avgCostUsd: z.coerce
    .number()
    .finite()
    .nonnegative("Costo inválido")
    .max(1_000_000, "Fuera de rango")
    .default(0),
  minStock: z.coerce
    .number()
    .finite()
    .nonnegative("Stock mínimo inválido")
    .max(1_000_000_000, "Fuera de rango")
    .default(0),
  trackBatch: z
    .union([z.literal("on"), z.literal("true"), z.boolean()])
    .optional()
    .transform((v) => v === true || v === "on" || v === "true"),
  defaultSupplierId: z
    .string()
    .uuid()
    .optional()
    .or(z.literal("").transform(() => undefined)),
});
export type RawMaterialInput = z.infer<typeof rawMaterialSchema>;

// --- Customers ---
export const customerSchema = z.object({
  name: trimmedText(120, "Nombre requerido"),
  type: customerTypeSchema.default("consumer"),
  rif: optionalText(20),
  phone: optionalText(30),
  email: z
    .string()
    .trim()
    .email("Email inválido")
    .optional()
    .or(z.literal("").transform(() => undefined))
    .transform((v) => (v === "" || v === undefined ? null : v)),
  address: optionalText(200),
  defaultPaymentTerms: paymentTermsSchema.default("cash"),
  notes: optionalText(500),
});
export type CustomerInput = z.infer<typeof customerSchema>;

// --- Suppliers ---
export const supplierSchema = z.object({
  name: trimmedText(120, "Nombre requerido"),
  rif: optionalText(20),
  phone: optionalText(30),
  contactPerson: optionalText(80),
  preferredCurrency: supplierCurrencySchema
    .optional()
    .or(z.literal("").transform(() => undefined)),
  notes: optionalText(500),
});
export type SupplierInput = z.infer<typeof supplierSchema>;

// Estado compartido de server actions que vuelven al cliente.
export type CatalogActionState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};

export const initialCatalogState: CatalogActionState = { ok: false };

// Rows tal como los devuelve Supabase después del select. Usamos camelCase
// en el cliente: los actions hacen el mapping snake→camel.
export type ProductRow = {
  id: string;
  sku: string;
  name: string;
  presentation: string | null;
  priceUsd: number;
  category: string | null;
  description: string | null;
  archivedAt: string | null;
};

export type RawMaterialRow = {
  id: string;
  sku: string;
  name: string;
  uomId: string;
  avgCostUsd: number;
  minStock: number;
  trackBatch: boolean;
  defaultSupplierId: string | null;
  archivedAt: string | null;
};

export type CustomerRow = {
  id: string;
  name: string;
  type: CustomerType;
  rif: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  defaultPaymentTerms: PaymentTerms;
  notes: string | null;
  archivedAt: string | null;
};

export type SupplierRow = {
  id: string;
  name: string;
  rif: string | null;
  phone: string | null;
  contactPerson: string | null;
  preferredCurrency: SupplierCurrency | null;
  notes: string | null;
  archivedAt: string | null;
};

export type UomRow = { id: string; name: string; kind: string };
