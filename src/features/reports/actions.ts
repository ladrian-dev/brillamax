"use server";

import { createClient } from "@/lib/supabase/server";

export type DashboardKpis = {
  today: {
    salesUsd: number;
    salesVef: number;
    salesCount: number;
    completedOps: number;
  };
  weekUsd: number;
  monthUsd: number;
  receivables: { totalUsd: number; debtorCount: number };
  inventoryUsd: number;
  alerts: {
    hasTodayRate: boolean;
    todayRate: number;
    lowStockCount: number;
  };
};

export async function getDashboardKpis(): Promise<DashboardKpis | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("dashboard_kpis");
  if (error || !data) return null;
  type Raw = {
    today: {
      sales_usd: number;
      sales_vef: number;
      sales_count: number;
      completed_ops: number;
    };
    week_usd: number;
    month_usd: number;
    receivables: { total_usd: number; debtor_count: number };
    inventory_usd: number;
    alerts: {
      has_today_rate: boolean;
      today_rate: number;
      low_stock_count: number;
    };
  };
  const r = data as Raw;
  return {
    today: {
      salesUsd: Number(r.today.sales_usd),
      salesVef: Number(r.today.sales_vef),
      salesCount: Number(r.today.sales_count),
      completedOps: Number(r.today.completed_ops),
    },
    weekUsd: Number(r.week_usd),
    monthUsd: Number(r.month_usd),
    receivables: {
      totalUsd: Number(r.receivables.total_usd),
      debtorCount: Number(r.receivables.debtor_count),
    },
    inventoryUsd: Number(r.inventory_usd),
    alerts: {
      hasTodayRate: Boolean(r.alerts.has_today_rate),
      todayRate: Number(r.alerts.today_rate),
      lowStockCount: Number(r.alerts.low_stock_count),
    },
  };
}

export type DailySalesRow = {
  saleDate: string;
  salesCount: number;
  totalUsd: number;
  totalVef: number;
  avgTicketUsd: number;
};

export async function listDailySales(
  opts: { since?: string; until?: string } = {},
): Promise<DailySalesRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("daily_sales")
    .select("sale_date, sales_count, total_usd, total_vef, avg_ticket_usd")
    .order("sale_date", { ascending: false })
    .limit(60);
  if (opts.since) query = query.gte("sale_date", opts.since);
  if (opts.until) query = query.lte("sale_date", opts.until);
  const { data, error } = await query;
  if (error || !data) return [];
  return data.map((r) => ({
    saleDate: r.sale_date,
    salesCount: Number(r.sales_count),
    totalUsd: Number(r.total_usd),
    totalVef: Number(r.total_vef),
    avgTicketUsd: Number(r.avg_ticket_usd),
  }));
}

export type MarginByProductRow = {
  productId: string;
  sku: string;
  productName: string;
  qtySold: number;
  revenueUsd: number;
  avgCostUsd: number;
  marginUsd: number;
  marginPct: number;
};

export async function listMarginByProduct(): Promise<MarginByProductRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("margin_by_product")
    .select(
      "product_id, sku, product_name, qty_sold, revenue_usd, avg_cost_usd, margin_usd, margin_pct",
    )
    .order("revenue_usd", { ascending: false });
  if (error || !data) return [];
  return data.map((r) => ({
    productId: r.product_id,
    sku: r.sku,
    productName: r.product_name,
    qtySold: Number(r.qty_sold),
    revenueUsd: Number(r.revenue_usd),
    avgCostUsd: Number(r.avg_cost_usd),
    marginUsd: Number(r.margin_usd),
    marginPct: Number(r.margin_pct),
  }));
}

export type StockValuationRow = {
  itemKind: "raw_material" | "finished_good";
  itemId: string;
  sku: string | null;
  itemName: string | null;
  qty: number;
  uomId: string | null;
  avgCostUsd: number;
  valueUsd: number;
};

export async function listStockValuation(): Promise<StockValuationRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stock_valuation")
    .select(
      "item_kind, item_id, sku, item_name, qty, uom_id, avg_cost_usd, value_usd",
    )
    .order("value_usd", { ascending: false });
  if (error || !data) return [];
  return data.map((r) => ({
    itemKind: r.item_kind as "raw_material" | "finished_good",
    itemId: r.item_id,
    sku: r.sku,
    itemName: r.item_name,
    qty: Number(r.qty),
    uomId: r.uom_id,
    avgCostUsd: Number(r.avg_cost_usd),
    valueUsd: Number(r.value_usd),
  }));
}

export type LowStockRow = {
  itemId: string;
  sku: string;
  name: string;
  minStock: number;
  currentQty: number;
  uomId: string;
};

export async function listLowStockAlerts(): Promise<LowStockRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("low_stock_alerts")
    .select("item_id, sku, name, min_stock, current_qty, uom_id")
    .order("current_qty", { ascending: true });
  if (error || !data) return [];
  return data.map((r) => ({
    itemId: r.item_id,
    sku: r.sku,
    name: r.name,
    minStock: Number(r.min_stock),
    currentQty: Number(r.current_qty),
    uomId: r.uom_id,
  }));
}
