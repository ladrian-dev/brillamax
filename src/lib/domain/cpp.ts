/**
 * Costo Promedio Ponderado (CPP) — Weighted Average Cost.
 *
 * Regla de negocio (feature [[inventario]]): cada vez que entra stock de un
 * ítem, el costo unitario promedio se recalcula ponderando stock actual vs
 * nuevo. Si stock actual es 0, el nuevo costo reemplaza directamente.
 *
 * Trabaja en USD (moneda funcional). No conoce VEF — los callers deben
 * convertir antes de pasar `incomingUnitCostUsd`.
 */

export type CppInput = {
  currentStock: number;
  currentAvgCostUsd: number;
  incomingQty: number;
  incomingUnitCostUsd: number;
};

export type CppResult = {
  newStock: number;
  newAvgCostUsd: number;
};

export function computeWeightedAverageCost(input: CppInput): CppResult {
  const { currentStock, currentAvgCostUsd, incomingQty, incomingUnitCostUsd } =
    input;

  if (incomingQty <= 0) {
    throw new Error("incomingQty must be > 0");
  }
  if (incomingUnitCostUsd < 0) {
    throw new Error("incomingUnitCostUsd must be >= 0");
  }

  const newStock = currentStock + incomingQty;

  if (currentStock <= 0) {
    return { newStock, newAvgCostUsd: incomingUnitCostUsd };
  }

  const totalValue =
    currentStock * currentAvgCostUsd + incomingQty * incomingUnitCostUsd;
  const newAvgCostUsd = totalValue / newStock;

  return { newStock, newAvgCostUsd };
}
