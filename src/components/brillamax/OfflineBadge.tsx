"use client";

import { CloudOff, RefreshCw } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";

type Props = {
  /** Tenant actual. Si cambia, se resetea el contador. */
  tenantId?: string;
  className?: string;
};

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}
const getOnline = () => navigator.onLine;
// En SSR asumimos online para evitar flicker en hydration.
const getOnlineServer = () => true;

/**
 * Badge persistente en el header que avisa al usuario cuando:
 *   - No hay conexión (navigator.onLine === false)
 *   - Hay operaciones pendientes de sync en el outbox de Dexie
 *
 * Si todo está OK (online + cola vacía) → no renderiza nada. Siguiendo el
 * principio minimalista: el UI no grita "estás online", solo avisa anomalías.
 */
export function OfflineBadge({ tenantId, className }: Props) {
  const online = useSyncExternalStore(
    subscribeOnline,
    getOnline,
    getOnlineServer,
  );
  const [pending, setPending] = useState(0);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const n = await db.outbox
          .where({ tenantId, status: "pending" })
          .count();
        if (!cancelled) setPending(n);
      } catch {
        /* IndexedDB puede fallar en SSR/preview; no romper render. */
      }
    };
    const interval = setInterval(refresh, 5_000);
    refresh();
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [tenantId]);

  if (online && pending === 0) return null;

  const tone = online
    ? "border-warning/40 bg-warning/10 text-warning-foreground"
    : "border-destructive/40 bg-destructive/10 text-destructive";

  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        tone,
        className,
      )}
    >
      {online ? (
        <RefreshCw className="size-3.5 animate-spin-slow" aria-hidden />
      ) : (
        <CloudOff className="size-3.5" aria-hidden />
      )}
      {online
        ? `${pending} pend${pending === 1 ? "iente" : "ientes"}`
        : "Offline"}
      {!online && pending > 0 ? <span>· {pending}</span> : null}
    </span>
  );
}
