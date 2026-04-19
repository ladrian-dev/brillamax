/**
 * Recipe cost computation (feature [[recetas-formulas]]).
 *
 * Costo total de una receta = Σ (qty_ingrediente × avg_cost_usd_actual).
 * Se usa al mostrar en el editor de receta; al completar una OP se
 * persiste el costo REAL del lote usando costos de los batches consumidos
 * (no este cálculo).
 */

export type RecipeIngredient = {
  rawMaterialId: string;
  qty: number;
  uomId: string;
  /** CPP actual del MP en USD por unidad del UoM declarado. */
  avgCostUsd: number;
};

export type RecipeCostBreakdown = {
  totalUsd: number;
  lines: Array<{
    rawMaterialId: string;
    lineCostUsd: number;
    percent: number;
  }>;
};

export function computeRecipeCost(
  ingredients: RecipeIngredient[],
): RecipeCostBreakdown {
  if (ingredients.length === 0) {
    return { totalUsd: 0, lines: [] };
  }

  const lineCosts = ingredients.map((ing) => {
    if (ing.qty < 0) {
      throw new Error(`negative qty for ${ing.rawMaterialId}`);
    }
    if (ing.avgCostUsd < 0) {
      throw new Error(`negative avg cost for ${ing.rawMaterialId}`);
    }
    return {
      rawMaterialId: ing.rawMaterialId,
      lineCostUsd: ing.qty * ing.avgCostUsd,
    };
  });

  const totalUsd = lineCosts.reduce((sum, l) => sum + l.lineCostUsd, 0);

  const lines = lineCosts.map((l) => ({
    rawMaterialId: l.rawMaterialId,
    lineCostUsd: l.lineCostUsd,
    percent: totalUsd === 0 ? 0 : (l.lineCostUsd / totalUsd) * 100,
  }));

  return { totalUsd, lines };
}

/**
 * Unit cost per yield unit (cost per L/kg/unit producido).
 */
export function computeUnitCost(
  totalUsd: number,
  yieldQty: number,
): number {
  if (yieldQty <= 0) {
    throw new Error("yieldQty must be > 0");
  }
  return totalUsd / yieldQty;
}
