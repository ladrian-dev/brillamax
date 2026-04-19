import { z } from "zod";

export const saleStatusSchema = z.enum([
  "draft",
  "confirmed",
  "delivered",
  "cancelled",
]);
export type SaleStatus = z.infer<typeof saleStatusSchema>;

export const salePaymentStatusSchema = z.enum(["pending", "partial", "paid"]);
export type SalePaymentStatus = z.infer<typeof salePaymentStatusSchema>;

export const salePaymentMethodSchema = z.enum([
  "cash_usd",
  "cash_vef",
  "zelle",
  "transfer_vef",
  "pago_movil",
  "usdt",
  "mixed",
  "other",
]);
export type SalePaymentMethod = z.infer<typeof salePaymentMethodSchema>;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v));

export const saleItemInputSchema = z.object({
  productId: z.string().uuid(),
  qty: z.coerce.number().finite().positive(),
  uomId: z.string().trim().min(1).max(20),
  unitPriceUsd: z.coerce.number().finite().nonnegative(),
  discountUsd: z.coerce.number().finite().nonnegative().default(0),
  warehouseId: z.string().uuid(),
  batchCode: optionalText(40),
});
export type SaleItemInput = z.infer<typeof saleItemInputSchema>;

export const salePaymentInputSchema = z.object({
  method: salePaymentMethodSchema,
  amountUsd: z.coerce.number().finite().positive(),
  amountOriginal: z.coerce.number().finite().positive().optional(),
  originalCurrency: z.enum(["USD", "VEF"]).optional(),
  reference: optionalText(80),
  notes: optionalText(200),
});
export type SalePaymentInput = z.infer<typeof salePaymentInputSchema>;

export const salePayloadSchema = z.object({
  customerId: z.string().uuid().nullable().optional(),
  saleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  exchangeRateUsed: z.coerce.number().finite().positive("Tasa > 0"),
  paymentTerms: optionalText(40),
  discountUsd: z.coerce.number().finite().nonnegative().default(0),
  notes: optionalText(500),
  items: z.array(saleItemInputSchema).min(1, "Agrega al menos 1 ítem"),
  payments: z.array(salePaymentInputSchema).default([]),
  allowNegativeStock: z.boolean().default(false),
});
export type SalePayload = z.infer<typeof salePayloadSchema>;

export type SaleActionState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  saleId?: string;
};

export const initialSaleState: SaleActionState = { ok: false };

export type SaleRow = {
  id: string;
  saleNumber: string;
  customerId: string | null;
  customerName: string | null;
  saleDate: string;
  status: SaleStatus;
  paymentStatus: SalePaymentStatus;
  subtotalUsd: number;
  discountUsd: number;
  totalUsd: number;
  exchangeRateUsed: number;
  totalVef: number;
  notes: string | null;
  itemCount: number;
  customerPhone: string | null;
};
