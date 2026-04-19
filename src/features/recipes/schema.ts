import { z } from "zod";

// Tipos compartidos para recetas. Espejo de 0006_recipes.sql.

export const recipeStatusSchema = z.enum(["draft", "active", "archived"]);
export type RecipeStatus = z.infer<typeof recipeStatusSchema>;

const trimmedText = (max: number, msg = "Requerido") =>
  z.string().trim().min(1, msg).max(max);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v));

const optionalPh = z
  .union([
    z.coerce.number().finite().min(0).max(14),
    z.literal(""),
    z.literal(null),
    z.undefined(),
  ])
  .optional()
  .transform((v) => (v === "" || v === null || v === undefined ? null : (v as number)));

// Input del form header. Los ingredientes viajan por separado (array).
export const recipeHeaderSchema = z.object({
  productId: z.string().uuid("Producto requerido"),
  name: trimmedText(120, "Nombre requerido"),
  version: trimmedText(20, "Versión requerida"),
  category: optionalText(40),
  yieldQty: z.coerce
    .number()
    .finite()
    .positive("Yield debe ser > 0")
    .max(1_000_000),
  yieldUomId: trimmedText(20, "UoM del yield requerida"),
  mixingTimeMinutes: z
    .union([z.coerce.number().int().positive(), z.literal(""), z.undefined()])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : (v as number))),
  phMin: optionalPh,
  phMax: optionalPh,
  viscosityTarget: optionalText(60),
  instructions: optionalText(4000),
  isDefault: z
    .union([z.literal("on"), z.literal("true"), z.boolean()])
    .optional()
    .transform((v) => v === true || v === "on" || v === "true"),
});
export type RecipeHeaderInput = z.infer<typeof recipeHeaderSchema>;

export const recipeIngredientInputSchema = z.object({
  rawMaterialId: z.string().uuid(),
  qty: z.coerce.number().finite().positive("qty > 0"),
  uomId: trimmedText(20, "UoM requerida"),
  orderIndex: z.coerce.number().int().nonnegative().default(0),
  notes: optionalText(200),
});
export type RecipeIngredientInput = z.infer<typeof recipeIngredientInputSchema>;

export const recipePayloadSchema = z.object({
  header: recipeHeaderSchema,
  ingredients: z
    .array(recipeIngredientInputSchema)
    .min(1, "Agrega al menos un ingrediente"),
});
export type RecipePayload = z.infer<typeof recipePayloadSchema>;

export type RecipeActionState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  recipeId?: string;
};

export const initialRecipeState: RecipeActionState = { ok: false };

export type RecipeRow = {
  id: string;
  productId: string;
  productSku: string | null;
  productName: string | null;
  name: string;
  version: string;
  category: string | null;
  yieldQty: number;
  yieldUomId: string;
  mixingTimeMinutes: number | null;
  phMin: number | null;
  phMax: number | null;
  viscosityTarget: string | null;
  instructions: string | null;
  status: RecipeStatus;
  isDefault: boolean;
  archivedReason: string | null;
  archivedAt: string | null;
  totalUsd: number;
  perUnitUsd: number;
  ingredientCount: number;
};

export type RecipeIngredientBreakdownRow = {
  id: string;
  recipeId: string;
  rawMaterialId: string;
  rmSku: string;
  rmName: string;
  qty: number;
  uomId: string;
  orderIndex: number;
  notes: string | null;
  unitCostUsd: number;
  subtotalUsd: number;
};
