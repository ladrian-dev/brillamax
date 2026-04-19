"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  roundMoney,
  usdToVef,
  vefToUsd,
} from "@/lib/domain/rate-snapshot";
import { cn } from "@/lib/utils";

type Props = {
  /** Nombre del hidden que carga el monto en USD (fuente de verdad). */
  name: string;
  /** Tasa VEF/USD snapshot del día (null = hard-block). */
  rate: number | null;
  /** Label visible arriba de los inputs. */
  label: string;
  /** Valor inicial en USD. */
  defaultUsd?: number;
  /** Cuál campo recibe foco inicialmente (UX: venta suele ser USD; cobro VEF). */
  primary?: "USD" | "VEF";
  required?: boolean;
  disabled?: boolean;
  className?: string;
  /** Render custom cuando no hay tasa. Por defecto: link a capturarla. */
  noRateFallback?: React.ReactNode;
};

/**
 * Input dual-currency (ADR-002). USD es la fuente de verdad; VEF se deriva
 * con la tasa snapshot que el documento guardará. El hidden input `name`
 * submite el USD redondeado a 2 decimales; un segundo hidden `${name}Rate`
 * lleva el valor de la tasa para que el server action la persista.
 *
 * Comportamiento:
 *   - Editar USD → VEF se recalcula como USD * rate.
 *   - Editar VEF → USD se recalcula como VEF / rate (2 decimales).
 *   - El usuario puede saltar entre ambos; el último editado es el ancla.
 *   - Si rate es null, muestra fallback (CTA para capturar tasa).
 */
export function CurrencyDualInput({
  name,
  rate,
  label,
  defaultUsd = 0,
  primary = "USD",
  required,
  disabled,
  className,
  noRateFallback,
}: Props) {
  const idBase = useId();
  const usdId = `${idBase}-usd`;
  const vefId = `${idBase}-vef`;

  // Estado: guardamos strings para respetar exactamente lo que el usuario
  // escribió (evita ping-pong cuando editás "10." y se re-formatea a "10").
  const [usdText, setUsdText] = useState<string>(
    defaultUsd ? defaultUsd.toFixed(2) : "",
  );
  const [vefText, setVefText] = useState<string>(() =>
    rate && defaultUsd ? roundMoney(usdToVef(defaultUsd, rate)).toFixed(2) : "",
  );

  if (rate === null) {
    return (
      <div
        className={cn(
          "rounded-lg border border-dashed border-warning/40 bg-warning/5 p-4",
          className,
        )}
      >
        <Label className="mb-1 block text-sm">{label}</Label>
        {noRateFallback ?? (
          <p className="text-sm text-muted-foreground">
            Captura la{" "}
            <Link href="/" className="font-medium text-primary hover:underline">
              tasa de hoy
            </Link>{" "}
            para poder ingresar montos.
          </p>
        )}
      </div>
    );
  }

  function onUsdChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setUsdText(raw);
    const n = Number(raw);
    if (raw === "" || !Number.isFinite(n)) {
      setVefText("");
      return;
    }
    setVefText(roundMoney(usdToVef(n, rate!)).toFixed(2));
  }

  function onVefChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setVefText(raw);
    const n = Number(raw);
    if (raw === "" || !Number.isFinite(n)) {
      setUsdText("");
      return;
    }
    setUsdText(roundMoney(vefToUsd(n, rate!)).toFixed(2));
  }

  // Lo que submitimos es siempre USD redondeado, aunque el usuario haya
  // tipeado VEF. Así la DB mantiene USD funcional + rate snapshot.
  const usdSubmit = (() => {
    const n = Number(usdText);
    return Number.isFinite(n) && usdText !== "" ? roundMoney(n).toFixed(2) : "";
  })();

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-baseline justify-between">
        <Label>{label}</Label>
        <span className="text-xs text-muted-foreground tabular-nums">
          Tasa {rate.toFixed(4)} VEF/USD
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label
            htmlFor={usdId}
            className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground"
          >
            USD
          </Label>
          <Input
            id={usdId}
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            required={required}
            disabled={disabled}
            value={usdText}
            onChange={onUsdChange}
            autoFocus={primary === "USD"}
            placeholder="0.00"
            className="h-11 text-base tabular-nums"
          />
        </div>
        <div>
          <Label
            htmlFor={vefId}
            className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground"
          >
            VEF
          </Label>
          <Input
            id={vefId}
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            disabled={disabled}
            value={vefText}
            onChange={onVefChange}
            autoFocus={primary === "VEF"}
            placeholder="0.00"
            className="h-11 text-base tabular-nums"
          />
        </div>
      </div>
      <input type="hidden" name={name} value={usdSubmit} />
      <input type="hidden" name={`${name}Rate`} value={rate.toFixed(4)} />
    </div>
  );
}
