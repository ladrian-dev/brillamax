import { describe, expect, it } from "vitest";
import {
  computeRecipeCost,
  computeUnitCost,
  type RecipeIngredient,
} from "./recipe-cost";

const ings: RecipeIngredient[] = [
  { rawMaterialId: "sles", qty: 0.2, uomId: "kg", avgCostUsd: 3 },
  { rawMaterialId: "water", qty: 0.75, uomId: "L", avgCostUsd: 0 },
  { rawMaterialId: "fragrance", qty: 0.02, uomId: "L", avgCostUsd: 20 },
];

describe("computeRecipeCost", () => {
  it("sums line costs correctly", () => {
    const r = computeRecipeCost(ings);
    expect(r.totalUsd).toBeCloseTo(0.2 * 3 + 0.75 * 0 + 0.02 * 20, 10);
    // 0.6 + 0 + 0.4 = 1.0
    expect(r.totalUsd).toBeCloseTo(1.0, 10);
  });

  it("computes percentage per line", () => {
    const r = computeRecipeCost(ings);
    const sles = r.lines.find((l) => l.rawMaterialId === "sles")!;
    expect(sles.percent).toBeCloseTo(60, 6);
  });

  it("returns zeros for empty recipe", () => {
    const r = computeRecipeCost([]);
    expect(r.totalUsd).toBe(0);
    expect(r.lines).toEqual([]);
  });

  it("throws on negative qty or cost", () => {
    expect(() =>
      computeRecipeCost([
        { rawMaterialId: "x", qty: -1, uomId: "kg", avgCostUsd: 1 },
      ]),
    ).toThrow();
    expect(() =>
      computeRecipeCost([
        { rawMaterialId: "x", qty: 1, uomId: "kg", avgCostUsd: -1 },
      ]),
    ).toThrow();
  });
});

describe("computeUnitCost", () => {
  it("divides total by yield", () => {
    expect(computeUnitCost(10, 4)).toBe(2.5);
  });

  it("throws on non-positive yield", () => {
    expect(() => computeUnitCost(10, 0)).toThrow();
    expect(() => computeUnitCost(10, -1)).toThrow();
  });
});
