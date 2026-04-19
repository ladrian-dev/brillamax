"use client";

import { useEffect } from "react";
import { startOutboxWatcher } from "@/lib/sync/runner";

/**
 * Arranca el watcher de outbox para el tenant autenticado. Se monta en el
 * layout root y queda activo mientras la pestaña esté abierta, cubriendo
 * /ventas, /compras, /cxc y cualquier otra ruta autenticada sin importar
 * desde dónde entre el usuario (ADR-003: outbox para venta B2C, compra, pago).
 *
 * Si no hay tenantId (rutas públicas, onboarding, signout) no hace nada.
 */
export function GlobalSync({ tenantId }: { tenantId: string | null }) {
  useEffect(() => {
    if (!tenantId) return;
    return startOutboxWatcher(tenantId);
  }, [tenantId]);
  return null;
}
