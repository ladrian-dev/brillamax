import { describe, expect, it } from "vitest";
import {
  assertValidRate,
  isRateFreshFor,
  roundMoney,
  usdToVef,
  vefToUsd,
} from "./rate-snapshot";

describe("rate-snapshot", () => {
  it("converts USD→VEF with given rate", () => {
    expect(usdToVef(10, 36.5)).toBeCloseTo(365, 10);
  });

  it("converts VEF→USD with given rate", () => {
    expect(vefToUsd(365, 36.5)).toBeCloseTo(10, 10);
  });

  it("roundtrips USD→VEF→USD without drift for typical values", () => {
    const original = 123.45;
    const rate = 36.5078;
    const back = vefToUsd(usdToVef(original, rate), rate);
    expect(back).toBeCloseTo(original, 10);
  });

  it("rejects non-positive and non-finite rates", () => {
    expect(() => assertValidRate(0)).toThrow();
    expect(() => assertValidRate(-1)).toThrow();
    expect(() => assertValidRate(Number.POSITIVE_INFINITY)).toThrow();
    expect(() => assertValidRate(Number.NaN)).toThrow();
  });

  it("rounds money to 2 decimals", () => {
    expect(roundMoney(1.234)).toBe(1.23);
    expect(roundMoney(1.235)).toBe(1.24);
    expect(roundMoney(1.999)).toBe(2.0);
    expect(roundMoney(-1.235)).toBe(-1.24);
    expect(roundMoney(0)).toBe(0);
    // Valor FP clásico (0.1 + 0.2 = 0.30000000000000004) redondea limpio.
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
  });

  it("flags rate as stale when date is not today", () => {
    const rate = {
      value: 36.5,
      date: "2026-04-17",
      source: "BCV" as const,
    };
    expect(isRateFreshFor(rate, "2026-04-18")).toBe(false);
    expect(isRateFreshFor(rate, "2026-04-17")).toBe(true);
  });
});
