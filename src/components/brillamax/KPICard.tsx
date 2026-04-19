import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

type Trend = {
  /** Diferencia contra periodo anterior, expresada en la misma unidad del valor. */
  delta: number;
  /** Texto descriptivo del baseline, ej. "vs. semana pasada". */
  label?: string;
  /** Si up = good (ventas) o up = bad (devoluciones). Default: "up_is_good". */
  mode?: "up_is_good" | "down_is_good";
};

type Props = {
  label: string;
  /** Valor pre-formateado (el formateo es responsabilidad del caller). */
  value: string;
  /** Unidad opcional junto al valor, ej. "USD", "kg". */
  unit?: string;
  /** Texto secundario bajo el valor, ej. "hoy", "últimos 7 días". */
  caption?: string;
  trend?: Trend;
  className?: string;
};

/**
 * Card de KPI para el dashboard. Un dato principal por card (regla de ADR-007:
 * densidad informativa = 1 dato + metadata en muted).
 */
export function KPICard({ label, value, unit, caption, trend, className }: Props) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-5 shadow-sm",
        className,
      )}
    >
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="text-3xl font-semibold tabular-nums text-card-foreground">
          {value}
        </span>
        {unit ? (
          <span className="text-sm text-muted-foreground">{unit}</span>
        ) : null}
      </div>
      {caption || trend ? (
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          {trend ? <TrendChip trend={trend} /> : null}
          {caption ? <span>{caption}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

function TrendChip({ trend }: { trend: Trend }) {
  const mode = trend.mode ?? "up_is_good";
  const isFlat = trend.delta === 0;
  const isUp = trend.delta > 0;
  const isGood = isFlat ? null : mode === "up_is_good" ? isUp : !isUp;

  const Icon = isFlat ? Minus : isUp ? ArrowUpRight : ArrowDownRight;
  const color =
    isGood === null
      ? "text-muted-foreground"
      : isGood
        ? "text-success"
        : "text-destructive";

  return (
    <span className={cn("inline-flex items-center gap-0.5 font-medium", color)}>
      <Icon className="size-3.5" aria-hidden />
      <span className="tabular-nums">
        {trend.delta > 0 ? "+" : ""}
        {trend.delta}
      </span>
      {trend.label ? (
        <span className="ml-1 font-normal text-muted-foreground">
          {trend.label}
        </span>
      ) : null}
    </span>
  );
}
