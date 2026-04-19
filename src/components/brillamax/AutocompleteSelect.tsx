"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type AutocompleteOption = {
  value: string;
  label: string;
  /** Texto auxiliar para búsqueda (SKU, tipo, etc.). */
  hint?: string;
};

type Props = {
  name: string;
  options: AutocompleteOption[];
  defaultValue?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  onChange?: (value: string | null) => void;
  emptyLabel?: string;
  className?: string;
};

/**
 * Select con búsqueda textual para listas de 10–500 items. Submit en formularios
 * vía input hidden `name`. Para listas grandes (>1000) usar búsqueda server-side.
 *
 * Patrón: input visible filtra, lista flotante muestra opciones, al elegir se
 * cierra y copia el label al input. El value real va a un hidden.
 */
export function AutocompleteSelect({
  name,
  options,
  defaultValue,
  placeholder = "Buscar…",
  disabled,
  required,
  onChange,
  emptyLabel = "Sin resultados",
  className,
}: Props) {
  const listId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const initial = useMemo(
    () => options.find((o) => o.value === defaultValue) ?? null,
    [options, defaultValue],
  );
  const [query, setQuery] = useState(initial?.label ?? "");
  const [selected, setSelected] = useState<AutocompleteOption | null>(initial);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || (selected && query === selected.label)) return options.slice(0, 20);
    return options
      .filter((o) => {
        const hay = `${o.label} ${o.hint ?? ""}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 20);
  }, [options, query, selected]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function pick(opt: AutocompleteOption) {
    setSelected(opt);
    setQuery(opt.label);
    setOpen(false);
    onChange?.(opt.value);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && filtered[activeIdx]) {
      e.preventDefault();
      pick(filtered[activeIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <Input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActiveIdx(0);
          if (selected && e.target.value !== selected.label) {
            setSelected(null);
            onChange?.(null);
          }
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
      />
      <input
        type="hidden"
        name={name}
        value={selected?.value ?? ""}
        required={required}
      />
      {open && filtered.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 z-20 mt-1 max-h-60 overflow-auto rounded-md border bg-popover shadow-md"
        >
          {filtered.map((opt, idx) => (
            <li
              key={opt.value}
              role="option"
              aria-selected={opt.value === selected?.value}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(opt);
              }}
              onMouseEnter={() => setActiveIdx(idx)}
              className={cn(
                "cursor-pointer px-3 py-2 text-sm",
                idx === activeIdx
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/40",
              )}
            >
              <div className="font-medium">{opt.label}</div>
              {opt.hint ? (
                <div className="text-xs text-muted-foreground">{opt.hint}</div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : open && query.trim().length > 0 ? (
        <div className="absolute left-0 right-0 z-20 mt-1 rounded-md border bg-popover px-3 py-2 text-sm text-muted-foreground shadow-md">
          {emptyLabel}
        </div>
      ) : null}
    </div>
  );
}
