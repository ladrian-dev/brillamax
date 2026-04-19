import { describe, expect, it } from "vitest";
import { computeWeightedAverageCost } from "./cpp";

describe("computeWeightedAverageCost", () => {
  it("replaces avg cost when current stock is zero", () => {
    const r = computeWeightedAverageCost({
      currentStock: 0,
      currentAvgCostUsd: 0,
      incomingQty: 10,
      incomingUnitCostUsd: 5,
    });
    expect(r.newStock).toBe(10);
    expect(r.newAvgCostUsd).toBe(5);
  });

  it("weights correctly when incoming matches current", () => {
    const r = computeWeightedAverageCost({
      currentStock: 10,
      currentAvgCostUsd: 4,
      incomingQty: 10,
      incomingUnitCostUsd: 6,
    });
    expect(r.newStock).toBe(20);
    expect(r.newAvgCostUsd).toBe(5);
  });

  it("accumulates precision across many entries without drift", () => {
    // Simulate 100 compras de 3 unidades a costos crecientes.
    let stock = 0;
    let avg = 0;
    let totalValue = 0;
    for (let i = 0; i < 100; i++) {
      const cost = 1 + i * 0.01;
      totalValue += 3 * cost;
      const r = computeWeightedAverageCost({
        currentStock: stock,
        currentAvgCostUsd: avg,
        incomingQty: 3,
        incomingUnitCostUsd: cost,
      });
      stock = r.newStock;
      avg = r.newAvgCostUsd;
    }
    expect(stock).toBe(300);
    expect(avg).toBeCloseTo(totalValue / stock, 8);
  });

  it("throws on non-positive incoming qty", () => {
    expect(() =>
      computeWeightedAverageCost({
        currentStock: 10,
        currentAvgCostUsd: 5,
        incomingQty: 0,
        incomingUnitCostUsd: 5,
      }),
    ).toThrow();
  });

  it("throws on negative incoming cost", () => {
    expect(() =>
      computeWeightedAverageCost({
        currentStock: 10,
        currentAvgCostUsd: 5,
        incomingQty: 1,
        incomingUnitCostUsd: -0.01,
      }),
    ).toThrow();
  });
});
