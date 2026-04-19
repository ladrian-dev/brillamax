import { z } from "zod";

export const itemKindSchema = z.enum(["raw_material", "finished_good"]);
export type ItemKind = z.infer<typeof itemKindSchema>;

export const movementKindSchema = z.enum([
  "purchase_receipt",
  "production_output",
  "production_issue",
  "sale_issue",
  "transfer_in",
  "transfer_out",
  "adjustment_positive",
  "adjustment_negative",
  "initial_count",
]);
export type MovementKind = z.infer<typeof movementKindSchema>;

// Un renglón del conteo inicial: qty puede ser 0 para saltar ese SKU.
export const initialCountRowSchema = z.object({
  itemKind: itemKindSchema,
  itemId: z.string().uuid(),
  uomId: z.string().min(1).max(20),
  qty: z.coerce.number().nonnegative().max(1_000_000_000),
  unitCostUsd: z.coerce.number().nonnegative().max(1_000_000).optional(),
});
export type InitialCountRow = z.infer<typeof initialCountRowSchema>;

export const initialCountSchema = z.object({
  warehouseId: z.string().uuid("Almacén inválido"),
  rows: z.array(initialCountRowSchema).min(1, "Registra al menos un ítem"),
});
export type InitialCountInput = z.infer<typeof initialCountSchema>;

export const adjustmentSchema = z.object({
  warehouseId: z.string().uuid(),
  itemKind: itemKindSchema,
  itemId: z.string().uuid(),
  uomId: z.string().min(1).max(20),
  qty: z
    .coerce.number()
    .refine((n) => Number.isFinite(n) && n !== 0, "Cantidad inválida"),
  notes: z.string().trim().max(200).optional(),
  batchCode: z.string().trim().max(40).optional(),
});
export type AdjustmentInput = z.infer<typeof adjustmentSchema>;

export type StockOnHandRow = {
  id: string;
  warehouseId: string;
  itemKind: ItemKind;
  itemId: string;
  batchCode: string | null;
  uomId: string;
  qty: number;
  avgCostUsd: number;
  valueUsd: number;
  itemName: string | null;
  itemSku: string | null;
  lowStock: boolean;
};

export type InventoryActionState = {
  ok: boolean;
  error?: string;
  insertedCount?: number;
};

export const initialInventoryState: InventoryActionState = { ok: false };
