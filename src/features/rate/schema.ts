import { z } from "zod";

export const rateSourceSchema = z.enum([
  "BCV",
  "Paralelo",
  "Custom",
  "Imported",
]);

export const setRateSchema = z.object({
  /** ISO YYYY-MM-DD. Por defecto el server asume hoy (fecha local servidor). */
  rateDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)"),
  value: z
    .coerce.number()
    .finite("Valor inválido")
    .positive("La tasa debe ser > 0")
    .max(1_000_000, "Valor fuera de rango"),
  source: rateSourceSchema.default("Custom"),
  note: z.string().trim().max(140).optional(),
});

export type SetRateInput = z.infer<typeof setRateSchema>;
export type RateSource = z.infer<typeof rateSourceSchema>;

export type TodayRate = {
  rateDate: string;
  value: number;
  source: RateSource;
  note: string | null;
  setAt: string;
};

export type SetRateState = {
  ok: boolean;
  error?: string;
};

export const initialSetRateState: SetRateState = { ok: false };

export type RateSuggestion = {
  source: RateSource;
  value: number;
  updatedAt: string;
};

/** Formato dd/mm/yyyy amigable para UI, dada una fecha ISO. */
export function formatRateDateEs(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** ISO YYYY-MM-DD del día actual en hora local del servidor. */
export function todayIsoLocal(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
