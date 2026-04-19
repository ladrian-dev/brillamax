"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setRate, suggestRates } from "@/features/rate/actions";
import type { RateSource, RateSuggestion } from "@/features/rate/schema";

type Props = {
  todayIso: string;
  triggerLabel: string;
  triggerVariant?: "default" | "outline";
  currentValue?: number;
  currentSource?: RateSource;
  currentNote?: string;
};

export function TasaDialog({
  todayIso,
  triggerLabel,
  triggerVariant = "default",
  currentValue,
  currentSource = "Custom",
  currentNote = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<RateSuggestion[] | null>(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [value, setValue] = useState(currentValue?.toString() ?? "");
  const [source, setSource] = useState<RateSource>(currentSource);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && suggestions === null && !loadingSuggestions) {
      setLoadingSuggestions(true);
      suggestRates().then((r) => {
        setSuggestions(r.suggestions);
        setLoadingSuggestions(false);
      });
    }
  }

  function pickSuggestion(s: RateSuggestion) {
    setValue(s.value.toFixed(4));
    setSource(s.source);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await setRate({ ok: false }, formData);
      if (result.ok) {
        setOpen(false);
      } else {
        setError(result.error ?? "Error al guardar");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant={triggerVariant}
          className="h-11 w-full"
        >
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tasa de cambio</DialogTitle>
          <DialogDescription>
            VEF por 1 USD para hoy. Los documentos creados a partir de ahora
            guardarán este snapshot.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="hidden" name="rateDate" value={todayIso} />
          <input type="hidden" name="source" value={source} />

          {suggestions && suggestions.length > 0 ? (
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Sugerencias DolarAPI
              </Label>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s.source}
                    type="button"
                    onClick={() => pickSuggestion(s)}
                    className="rounded-full border px-3 py-1.5 text-xs font-medium hover:border-primary hover:bg-primary/5"
                  >
                    {s.source} · {s.value.toFixed(2)}
                  </button>
                ))}
              </div>
            </div>
          ) : loadingSuggestions ? (
            <p className="text-xs text-muted-foreground">
              Consultando DolarAPI…
            </p>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="value">Tasa VEF/USD</Label>
            <Input
              id="value"
              name="value"
              type="number"
              inputMode="decimal"
              step="0.0001"
              min="0"
              required
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={pending}
              className="h-12 text-lg tabular-nums"
              placeholder="36.5000"
            />
            <p className="text-xs text-muted-foreground">
              Fuente seleccionada:{" "}
              <span className="font-medium text-foreground">{source}</span>
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="note">Nota (opcional)</Label>
            <Input
              id="note"
              name="note"
              type="text"
              maxLength={140}
              defaultValue={currentNote}
              disabled={pending}
              placeholder="Referencia interna"
              className="h-11"
            />
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
              className="h-11"
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending} className="h-11">
              {pending ? "Guardando…" : "Guardar tasa"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
