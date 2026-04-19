import { describe, expect, it } from "vitest";
import { formatRateDateEs, setRateSchema, todayIsoLocal } from "./schema";

describe("setRateSchema", () => {
  it("coerce string a number para value", () => {
    const r = setRateSchema.parse({
      rateDate: "2026-04-18",
      value: "36.50",
      source: "BCV",
    });
    expect(r.value).toBe(36.5);
  });

  it("rechaza tasa 0 o negativa", () => {
    expect(() =>
      setRateSchema.parse({
        rateDate: "2026-04-18",
        value: 0,
        source: "Custom",
      }),
    ).toThrow();
    expect(() =>
      setRateSchema.parse({
        rateDate: "2026-04-18",
        value: -1,
        source: "Custom",
      }),
    ).toThrow();
  });

  it("rechaza fecha con formato inválido", () => {
    expect(() =>
      setRateSchema.parse({
        rateDate: "18-04-2026",
        value: 36.5,
        source: "Custom",
      }),
    ).toThrow();
  });

  it("por defecto source es Custom", () => {
    const r = setRateSchema.parse({
      rateDate: "2026-04-18",
      value: 36.5,
    });
    expect(r.source).toBe("Custom");
  });
});

describe("formatRateDateEs", () => {
  it("formatea ISO a dd/mm/yyyy", () => {
    expect(formatRateDateEs("2026-04-18")).toBe("18/04/2026");
  });
});

describe("todayIsoLocal", () => {
  it("devuelve YYYY-MM-DD de una fecha fija", () => {
    const d = new Date(2026, 3, 18); // abril = mes 3 en JS
    expect(todayIsoLocal(d)).toBe("2026-04-18");
  });

  it("pad con ceros para un solo dígito", () => {
    const d = new Date(2026, 0, 5);
    expect(todayIsoLocal(d)).toBe("2026-01-05");
  });
});
