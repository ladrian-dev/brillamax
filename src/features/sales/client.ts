"use client";

import { db } from "@/lib/db";
import { enqueue } from "@/lib/db/outbox";
import {
  initialSaleState,
  type SalePayload,
} from "./schema";
import { registerSale } from "./actions";
import { drainOutbox } from "@/lib/sync/runner";

/**
 * Dispatcher híbrido: si hay conexión, llama al server action. Si no, guarda
 * la venta en el outbox de Dexie y deja que el sync runner la despache cuando
 * vuelva la red. La UI se entera del modo via la variante devuelta.
 */
export async function submitSaleOnlineOrQueue(
  payload: SalePayload,
  ctx: { tenantId: string; userId: string },
): Promise<
  | { ok: true; mode: "online"; saleId: string }
  | { ok: true; mode: "queued"; opId: string }
  | { ok: false; error: string }
> {
  const online = typeof navigator === "undefined" ? true : navigator.onLine;

  if (online) {
    const fd = new FormData();
    fd.set("payload", JSON.stringify(payload));
    const res = await registerSale(initialSaleState, fd);
    if (res.ok && res.saleId) {
      void drainOutbox(ctx.tenantId);
      return { ok: true, mode: "online", saleId: res.saleId };
    }
    // fallback: si el servidor falla por red (no por validación), encolar
    if (
      res.error &&
      /network|fetch|econnrefused|timeout/i.test(res.error) === true
    ) {
      const opId = crypto.randomUUID();
      await enqueue({
        id: opId,
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        type: "sale_b2c_create",
        payload,
      });
      return { ok: true, mode: "queued", opId };
    }
    return { ok: false, error: res.error ?? "Error al registrar venta" };
  }

  const opId = crypto.randomUUID();
  try {
    await enqueue({
      id: opId,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      type: "sale_b2c_create",
      payload,
    });
    return { ok: true, mode: "queued", opId };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "No se pudo guardar local",
    };
  }
}

/** Helper expuesto para el OfflineBadge y tests de integración. */
export function outboxDb() {
  return db;
}
