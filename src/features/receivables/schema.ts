import { z } from "zod";
import { salePaymentMethodSchema } from "@/features/sales/schema";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v));

export const applyPaymentSchema = z.object({
  targetKind: z.enum(["sale", "fifo"]),
  customerId: z.string().uuid().nullable().optional(),
  saleId: z.string().uuid().nullable().optional(),
  method: salePaymentMethodSchema,
  amountUsd: z.coerce.number().finite().positive("Monto > 0"),
  paymentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida")
    .optional(),
  amountOriginal: z.coerce.number().finite().nonnegative().optional(),
  originalCurrency: z.enum(["USD", "VEF"]).optional(),
  reference: optionalText(80),
  notes: optionalText(200),
});
export type ApplyPaymentInput = z.infer<typeof applyPaymentSchema>;

export type PaymentActionState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  applied?: number;
};
export const initialPaymentState: PaymentActionState = { ok: false };

export type CustomerReceivableRow = {
  customerId: string;
  name: string;
  phone: string | null;
  type: string | null;
  openBalanceUsd: number;
  unpaidCount: number;
  oldestUnpaidDate: string | null;
  daysOldest: number | null;
};

export type SaleBalanceRow = {
  saleId: string;
  saleNumber: string;
  saleDate: string;
  totalUsd: number;
  paidUsd: number;
  balanceUsd: number;
  status: string;
  paymentStatus: string;
};
