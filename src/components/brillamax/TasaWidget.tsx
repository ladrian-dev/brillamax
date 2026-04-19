import { getTodayRate } from "@/features/rate/actions";
import { formatRateDateEs, todayIsoLocal } from "@/features/rate/schema";
import { TasaDialog } from "./TasaDialog";

/**
 * Tarjeta con la tasa del día. RSC: consulta en cada render (sin cache)
 * para mantener la info fresca entre acciones.
 *
 * Estados:
 *   - sin tasa → badge de warning + CTA primary para capturarla
 *   - con tasa → valor + fuente + botón "Actualizar"
 */
export async function TasaWidget() {
  const rate = await getTodayRate();
  const today = todayIsoLocal();

  if (!rate) {
    return (
      <div className="rounded-xl border border-dashed border-warning/40 bg-warning/5 p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <span className="rounded-full bg-warning/20 px-2.5 py-0.5 text-xs font-medium uppercase tracking-wider text-warning-foreground">
            Tasa pendiente
          </span>
          <span className="text-xs text-muted-foreground">
            {formatRateDateEs(today)}
          </span>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          No has capturado la tasa de hoy. No podrás registrar ventas ni
          compras en bolívares hasta que lo hagas.
        </p>
        <TasaDialog todayIso={today} triggerLabel="Capturar tasa de hoy" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Tasa de hoy
        </span>
        <span className="text-xs text-muted-foreground">
          {formatRateDateEs(rate.rateDate)}
        </span>
      </div>
      <div className="mb-1 flex items-baseline gap-2">
        <span className="text-3xl font-semibold tabular-nums text-card-foreground">
          {rate.value.toFixed(4)}
        </span>
        <span className="text-sm text-muted-foreground">VEF / USD</span>
      </div>
      <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="rounded-full border px-2 py-0.5">{rate.source}</span>
        {rate.note ? <span className="truncate">{rate.note}</span> : null}
      </div>
      <TasaDialog
        todayIso={today}
        currentValue={rate.value}
        currentSource={rate.source}
        currentNote={rate.note ?? ""}
        triggerLabel="Actualizar"
        triggerVariant="outline"
      />
    </div>
  );
}
