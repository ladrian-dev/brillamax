"use client";

import { Minus, Plus } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Props = {
  name: string;
  defaultValue?: number;
  min?: number;
  max?: number;
  /** Incremento por tap. Para unidades enteras: 1. Para kilos: 0.1 o 0.25. */
  step?: number;
  /** Número de decimales a mostrar (default: derivado de step). */
  decimals?: number;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  onChange?: (value: number) => void;
  ariaLabel?: string;
};

/**
 * Stepper touch-friendly (targets ≥ 44×44px) con input numérico editable.
 * Se usa en selección de cantidades: venta B2C, items de compra, conteo
 * inicial, recetas. El valor submite vía `name` (el input).
 */
export function QuantityStepper({
  name,
  defaultValue = 0,
  min = 0,
  max = 1_000_000,
  step = 1,
  decimals,
  required,
  disabled,
  className,
  onChange,
  ariaLabel,
}: Props) {
  const effectiveDecimals =
    decimals ?? (Number.isInteger(step) ? 0 : String(step).split(".")[1]?.length ?? 2);
  const format = (n: number) => n.toFixed(effectiveDecimals);

  const [text, setText] = useState<string>(() => format(defaultValue));

  function apply(next: number) {
    const clamped = Math.min(Math.max(next, min), max);
    const rounded = Number(clamped.toFixed(effectiveDecimals));
    setText(format(rounded));
    onChange?.(rounded);
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setText(raw);
    const n = Number(raw);
    if (Number.isFinite(n)) onChange?.(n);
  }

  function onInputBlur() {
    const n = Number(text);
    if (!Number.isFinite(n) || text === "") {
      apply(min);
      return;
    }
    apply(n);
  }

  return (
    <div className={cn("inline-flex items-stretch rounded-md border", className)}>
      <button
        type="button"
        aria-label={`Restar ${step}`}
        disabled={disabled || Number(text) <= min}
        onClick={() => apply((Number(text) || 0) - step)}
        className="flex size-11 items-center justify-center text-muted-foreground hover:bg-accent/40 disabled:opacity-40"
      >
        <Minus className="size-4" aria-hidden />
      </button>
      <Input
        type="number"
        name={name}
        inputMode="decimal"
        step={step}
        min={min}
        max={max}
        required={required}
        disabled={disabled}
        value={text}
        onChange={onInputChange}
        onBlur={onInputBlur}
        aria-label={ariaLabel}
        className="h-11 w-20 rounded-none border-0 text-center text-base tabular-nums shadow-none focus-visible:ring-0"
      />
      <button
        type="button"
        aria-label={`Sumar ${step}`}
        disabled={disabled || Number(text) >= max}
        onClick={() => apply((Number(text) || 0) + step)}
        className="flex size-11 items-center justify-center text-muted-foreground hover:bg-accent/40 disabled:opacity-40"
      >
        <Plus className="size-4" aria-hidden />
      </button>
    </div>
  );
}
