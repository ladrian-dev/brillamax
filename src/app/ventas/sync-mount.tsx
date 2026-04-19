"use client";

import { useEffect } from "react";
import { startOutboxWatcher } from "@/lib/sync/runner";

/**
 * Mounts del runner de sync para el tenant actual. Se monta en /ventas porque
 * es donde se registran las ventas B2C offline; los hooks del runner también
 * corren cuando el usuario está en otras rutas siempre que esta página se haya
 * montado al menos una vez (el intervalo queda vivo mientras el tab esté).
 */
export function SyncMount({ tenantId }: { tenantId: string }) {
  useEffect(() => startOutboxWatcher(tenantId), [tenantId]);
  return null;
}
