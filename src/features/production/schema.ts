import { z } from "zod";

export const productionStatusSchema = z.enum([
  "draft",
  "ready",
  "in_progress",
  "completed",
  "cancelled",
]);
export type ProductionStatus = z.infer<typeof productionStatusSchema>;

const trimmedText = (max: number, msg = "Requerido") =>
  z.string().trim().min(1, msg).max(max);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v));

export const createOrderSchema = z.object({
  productId: z.string().uuid("Producto requerido"),
  recipeId: z.string().uuid("Receta requerida"),
  plannedQty: z.coerce.number().finite().positive("Cantidad > 0"),
  plannedUomId: trimmedText(20, "UoM requerida"),
  observations: optionalText(500),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const completeOrderSchema = z.object({
  productionOrderId: z.string().uuid(),
  actualQty: z.coerce.number().finite().positive("qty real > 0"),
  outputWarehouseId: z.string().uuid("Almacén requerido"),
  phActual: z
    .union([z.coerce.number().finite().min(0).max(14), z.literal(""), z.undefined()])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : (v as number))),
  viscosityActual: optionalText(60),
  qcPassed: z
    .union([z.literal("on"), z.literal("true"), z.boolean()])
    .optional()
    .transform((v) => v === true || v === "on" || v === "true"),
  qcNotes: optionalText(500),
  batchCode: optionalText(40),
  expiryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  observations: optionalText(500),
});
export type CompleteOrderInput = z.infer<typeof completeOrderSchema>;

export type ProductionActionState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  orderId?: string;
};

export const initialProductionState: ProductionActionState = { ok: false };

export type ProductionOrderRow = {
  id: string;
  poNumber: string;
  productId: string;
  productSku: string | null;
  productName: string | null;
  recipeId: string;
  recipeName: string | null;
  recipeVersion: string | null;
  plannedQty: number;
  plannedUomId: string;
  actualQty: number | null;
  batchCode: string | null;
  warehouseId: string | null;
  warehouseName: string | null;
  status: ProductionStatus;
  totalCostUsd: number | null;
  costPerYieldUnit: number | null;
  phActual: number | null;
  viscosityActual: string | null;
  qcPassed: boolean | null;
  qcNotes: string | null;
  observations: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
};

export type ProductionIssueRow = {
  id: string;
  rawMaterialId: string;
  rmSku: string | null;
  rmName: string | null;
  qty: number;
  uomId: string;
  unitCostUsd: number | null;
  subtotalUsd: number;
};
