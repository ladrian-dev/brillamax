/**
 * FIFO application of a customer payment against open sales
 * (feature [[clientes-cxc]]).
 *
 * Business rule: when a customer pays, by default the amount is applied to
 * the oldest open sale first. Partial payments split across multiple sales.
 * Caller must persist resulting allocations + payment record atomically.
 */

export type OpenSale = {
  saleId: string;
  createdAt: string; // ISO timestamp
  amountOwedUsd: number; // outstanding (total - already applied)
};

export type FifoAllocation = {
  saleId: string;
  appliedUsd: number;
};

export type FifoResult = {
  allocations: FifoAllocation[];
  unappliedUsd: number; // credit left over (customer overpaid)
};

export function applyPaymentFifo(
  paymentUsd: number,
  openSales: OpenSale[],
): FifoResult {
  if (paymentUsd < 0) {
    throw new Error("paymentUsd must be >= 0");
  }
  if (paymentUsd === 0) {
    return { allocations: [], unappliedUsd: 0 };
  }

  const sorted = [...openSales].sort((a, b) =>
    a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0,
  );

  let remaining = paymentUsd;
  const allocations: FifoAllocation[] = [];

  for (const sale of sorted) {
    if (remaining <= 0) break;
    if (sale.amountOwedUsd <= 0) continue;
    const applied = Math.min(remaining, sale.amountOwedUsd);
    allocations.push({ saleId: sale.saleId, appliedUsd: applied });
    remaining -= applied;
  }

  return { allocations, unappliedUsd: remaining };
}
