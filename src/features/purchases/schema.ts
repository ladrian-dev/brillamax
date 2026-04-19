import { z } from "zod";

export const purchaseCurrencySchema = z.enum(["USD", "VEF"]);
export type PurchaseCurrency = z.infer<typeof purchaseCurrencySchema>;

export const purchasePaymentStatusSchema = z.enum([
  "paid",
  "pending",
  "partial",
]);
export type PurchasePaymentStatus = z.infer<typeof purchasePaymentStatusSchema>;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v));

export const purchaseItemInputSchema = z.object({
  rawMaterialId: z.string().uuid(),
  qty: z.coerce.number().finite().positive(),
  uomId: z.string().trim().min(1).max(20),
  unitPriceOriginal: z.coerce.number().finite().nonnegative(),
  warehouseId: z.string().uuid(),
  batchCode: optionalText(40),
  expiryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("").transform(() => undefined)),
});
export type PurchaseItemInput = z.infer<typeof purchaseItemInputSchema>;

export const purchasePayloadSchema = z.object({
  supplierId: z.string().uuid("Proveedor requerido"),
  purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  currency: purchaseCurrencySchema,
  exchangeRateUsed: z.coerce.number().finite().positive("Tasa > 0"),
  paymentStatus: purchasePaymentStatusSchema.default("paid"),
  paymentMethod: optionalText(40),
  notes: optionalText(500),
  items: z.array(purchaseItemInputSchema).min(1, "Agrega al menos 1 ítem"),
});
export type PurchasePayload = z.infer<typeof purchasePayloadSchema>;

export type PurchaseActionState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  purchaseId?: string;
};

export const initialPurchaseState: PurchaseActionState = { ok: false };

export type PurchaseRow = {
  id: string;
  purchaseNumber: string;
  supplierId: string;
  supplierName: string | null;
  purchaseDate: string;
  currency: PurchaseCurrency;
  exchangeRateUsed: number;
  totalUsd: number;
  totalOriginalCurrency: number;
  paymentStatus: PurchasePaymentStatus;
  paymentMethod: string | null;
  notes: string | null;
  itemCount: number;
};
