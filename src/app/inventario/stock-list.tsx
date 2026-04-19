import type { StockOnHandRow } from "@/features/inventory/schema";

type Props = {
  items: StockOnHandRow[];
  emptyMessage?: string;
};

export function StockList({ items, emptyMessage = "Sin stock." }: Props) {
  if (items.length === 0) {
    return (
      <p className="mt-4 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </p>
    );
  }

  return (
    <ul className="mt-4 space-y-2">
      {items.map((it) => (
        <li
          key={it.id}
          className={`rounded-lg border bg-card p-4 shadow-sm ${
            it.lowStock ? "border-destructive/40" : ""
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <div className="truncate text-sm font-medium text-card-foreground">
                  {it.itemName ?? "—"}
                </div>
                {it.lowStock ? (
                  <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-destructive">
                    Bajo mínimo
                  </span>
                ) : null}
              </div>
              <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                {it.itemSku ? <span className="font-mono">{it.itemSku}</span> : null}
                {it.batchCode ? <span>· Lote {it.batchCode}</span> : null}
                <span>· CPP ${it.avgCostUsd.toFixed(4)}/{it.uomId}</span>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-lg font-semibold tabular-nums text-card-foreground">
                {it.qty.toLocaleString("es-VE", {
                  maximumFractionDigits: 3,
                })}
              </div>
              <div className="text-xs text-muted-foreground">
                {it.uomId} · ${it.valueUsd.toFixed(2)}
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
