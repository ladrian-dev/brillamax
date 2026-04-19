import { getTodayRate } from "./actions";
import type { TodayRate } from "./schema";

export class MissingRateError extends Error {
  constructor() {
    super(
      "No hay tasa del día. Captura la tasa antes de operar con dos monedas.",
    );
    this.name = "MissingRateError";
  }
}

/**
 * Hard-block de ADR-002: ventas/compras/pagos cross-moneda requieren una
 * fila en exchange_rate_log para hoy. Lanza MissingRateError si no existe.
 * La UI debe capturar el throw y redirigir/modalizar al usuario para que
 * ingrese la tasa antes de reintentar.
 */
export async function requireTodayRate(): Promise<TodayRate> {
  const rate = await getTodayRate();
  if (!rate) throw new MissingRateError();
  return rate;
}
