"use client";

import { db } from "@/lib/db";
import { markError, markSyncing, markSynced } from "@/lib/db/outbox";
import {
  initialSaleState,
  type SalePayload,
} from "@/features/sales/schema";
import { registerSale } from "@/features/sales/actions";

/**
 * Drena la cola outbox del tenant actual intentando despachar cada op pendiente
 * al server action correspondiente. Mantiene una sola llamada en vuelo a la vez
 * (mutex simple) para evitar que múltiples "online" events pisen el mismo
 * id — el server genera correlativos y repetir inserta ventas duplicadas.
 */

let draining = false;

export async function drainOutbox(tenantId: string): Promise<{
  processed: number;
  failed: number;
}> {
  if (draining) return { processed: 0, failed: 0 };
  if (typeof navigator !== "undefined" && !navigator.onLine)
    return { processed: 0, failed: 0 };
  draining = true;
  let processed = 0;
  let failed = 0;
  try {
    const ops = await db.outbox
      .where({ tenantId, status: "pending" })
      .sortBy("createdAt");

    for (const op of ops) {
      await markSyncing(op.id);
      try {
        if (op.type === "sale_b2c_create") {
          const payload = op.payload as SalePayload;
          const fd = new FormData();
          fd.set("payload", JSON.stringify(payload));
          const res = await registerSale(initialSaleState, fd);
          if (!res.ok) throw new Error(res.error ?? "registerSale failed");
          await markSynced(op.id);
          processed++;
        } else {
          // compras y pagos vendrán en su sprint; dejar como error para
          // volver a pending tras n intentos (ver política de retries).
          throw new Error(`tipo ${op.type} no soportado`);
        }
      } catch (err) {
        failed++;
        await markError(
          op.id,
          err instanceof Error ? err.message : "sync error",
        );
      }
    }
  } finally {
    draining = false;
  }
  return { processed, failed };
}

export function startOutboxWatcher(tenantId: string): () => void {
  if (typeof window === "undefined") return () => {};
  const run = () => {
    void drainOutbox(tenantId);
  };
  window.addEventListener("online", run);
  const id = window.setInterval(run, 30_000);
  run();
  return () => {
    window.removeEventListener("online", run);
    window.clearInterval(id);
  };
}
