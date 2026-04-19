import { db, type OutboxOp, type OutboxOpType } from "./index";

/**
 * API mínima sobre la tabla outbox. El runner de sync (lib/sync/runner.ts)
 * la consumirá; las mutaciones offline pasan por `enqueue`.
 */

export async function enqueue(
  op: Omit<OutboxOp, "createdAt" | "attempts" | "status"> & {
    status?: OutboxOp["status"];
  },
): Promise<void> {
  await db.outbox.add({
    ...op,
    createdAt: new Date().toISOString(),
    attempts: 0,
    status: op.status ?? "pending",
  });
}

export function pending(tenantId: string) {
  return db.outbox
    .where({ tenantId, status: "pending" })
    .sortBy("createdAt");
}

export async function markSyncing(id: string) {
  await db.outbox.update(id, { status: "syncing" });
}

export async function markSynced(id: string) {
  await db.outbox.update(id, { status: "synced" });
}

export async function markError(id: string, error: string) {
  const op = await db.outbox.get(id);
  if (!op) return;
  await db.outbox.update(id, {
    status: "error",
    lastError: error,
    attempts: op.attempts + 1,
  });
}

export async function countPendingByType(
  tenantId: string,
): Promise<Record<OutboxOpType, number>> {
  const ops = await db.outbox.where({ tenantId, status: "pending" }).toArray();
  const acc: Record<OutboxOpType, number> = {
    sale_b2c_create: 0,
    purchase_create: 0,
    payment_create: 0,
  };
  for (const op of ops) acc[op.type]++;
  return acc;
}
