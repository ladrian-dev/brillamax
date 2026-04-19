import Dexie, { type EntityTable } from "dexie";

/**
 * IndexedDB local — esqueleto inicial.
 *
 * Sólo tres flujos usan outbox (ADR-003): venta B2C rápida, compra y pago.
 * El resto de la app lee/escribe directo contra Supabase. Los stores `cache_*`
 * sirven como hidratación del PersistQueryClient para TanStack Query.
 */

export type OutboxOpType =
  | "sale_b2c_create"
  | "purchase_create"
  | "payment_create";

export type OutboxStatus = "pending" | "syncing" | "synced" | "error";

export interface OutboxOp {
  id: string; // uuid cliente
  tenantId: string;
  userId: string;
  type: OutboxOpType;
  payload: unknown; // validado con Zod al leerse
  createdAt: string; // ISO
  attempts: number;
  lastError?: string;
  status: OutboxStatus;
}

export interface CachedEntity {
  id: string;
  tenantId: string;
  updatedAt: string;
  data: unknown;
}

export type BrillamaxDB = Dexie & {
  outbox: EntityTable<OutboxOp, "id">;
  cacheProducts: EntityTable<CachedEntity, "id">;
  cacheCustomers: EntityTable<CachedEntity, "id">;
  cacheRate: EntityTable<CachedEntity, "id">;
};

export const db = new Dexie("brillamax") as BrillamaxDB;

db.version(1).stores({
  outbox: "id, tenantId, status, createdAt",
  cacheProducts: "id, tenantId, updatedAt",
  cacheCustomers: "id, tenantId, updatedAt",
  cacheRate: "id, tenantId, updatedAt",
});
