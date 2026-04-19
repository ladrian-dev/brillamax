/**
 * Dual-currency USD/VEF helpers (ADR-002).
 *
 * Regla: USD es la moneda funcional. VEF se deriva a partir del snapshot de
 * tasa que cada documento guarda al crearse (`exchange_rate_used`).
 * Cambiar la tasa del día NO afecta documentos históricos.
 */

export type ExchangeRate = {
  /** USD → VEF multiplier, e.g. 36.50 means 1 USD = 36.50 VEF. */
  value: number;
  date: string; // ISO date (YYYY-MM-DD)
  source: "BCV" | "Paralelo" | "Custom" | "Imported";
};

export function assertValidRate(rate: number): void {
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(`Invalid exchange rate: ${rate}`);
  }
}

export function usdToVef(usd: number, rate: number): number {
  assertValidRate(rate);
  return usd * rate;
}

export function vefToUsd(vef: number, rate: number): number {
  assertValidRate(rate);
  return vef / rate;
}

/**
 * Redondeo de dinero a 2 decimales (half-away-from-zero, FP-safe).
 *
 * Para aritmética exacta de sumas grandes, la fuente de verdad es Postgres
 * con NUMERIC(14,2). Esta función se usa para display/validación en cliente.
 */
export function roundMoney(value: number): number {
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(value) * 100 + Number.EPSILON)) / 100;
}

/**
 * Returns true if the rate's date matches today (tenant-local ISO date).
 * Callers must pass today's date explicitly — no implicit system time,
 * so tests are deterministic.
 */
export function isRateFreshFor(rate: ExchangeRate, todayIso: string): boolean {
  return rate.date === todayIso;
}
