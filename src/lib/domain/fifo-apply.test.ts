import { describe, expect, it } from "vitest";
import { applyPaymentFifo, type OpenSale } from "./fifo-apply";

const sales: OpenSale[] = [
  { saleId: "B", createdAt: "2026-03-20T10:00:00Z", amountOwedUsd: 50 },
  { saleId: "A", createdAt: "2026-03-15T10:00:00Z", amountOwedUsd: 30 },
  { saleId: "C", createdAt: "2026-04-01T10:00:00Z", amountOwedUsd: 20 },
];

describe("applyPaymentFifo", () => {
  it("applies to oldest sale first", () => {
    const r = applyPaymentFifo(20, sales);
    expect(r.allocations).toEqual([{ saleId: "A", appliedUsd: 20 }]);
    expect(r.unappliedUsd).toBe(0);
  });

  it("splits across multiple sales when payment exceeds one", () => {
    const r = applyPaymentFifo(45, sales);
    expect(r.allocations).toEqual([
      { saleId: "A", appliedUsd: 30 },
      { saleId: "B", appliedUsd: 15 },
    ]);
    expect(r.unappliedUsd).toBe(0);
  });

  it("leaves remainder as credit when overpaid", () => {
    const r = applyPaymentFifo(200, sales);
    expect(r.allocations).toEqual([
      { saleId: "A", appliedUsd: 30 },
      { saleId: "B", appliedUsd: 50 },
      { saleId: "C", appliedUsd: 20 },
    ]);
    expect(r.unappliedUsd).toBe(100);
  });

  it("returns empty on zero payment", () => {
    const r = applyPaymentFifo(0, sales);
    expect(r.allocations).toEqual([]);
    expect(r.unappliedUsd).toBe(0);
  });

  it("skips fully paid sales", () => {
    const mixed: OpenSale[] = [
      { saleId: "paid", createdAt: "2026-01-01", amountOwedUsd: 0 },
      { saleId: "open", createdAt: "2026-02-01", amountOwedUsd: 10 },
    ];
    const r = applyPaymentFifo(5, mixed);
    expect(r.allocations).toEqual([{ saleId: "open", appliedUsd: 5 }]);
  });

  it("rejects negative payments", () => {
    expect(() => applyPaymentFifo(-1, sales)).toThrow();
  });
});
