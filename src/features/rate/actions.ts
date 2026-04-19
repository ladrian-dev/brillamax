"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  setRateSchema,
  todayIsoLocal,
  type RateSource,
  type RateSuggestion,
  type SetRateState,
  type TodayRate,
} from "./schema";

/**
 * Devuelve la tasa del día del tenant actual, o null si no se ha capturado.
 * El caller (UI, o un helper tipo `requireTodayRate`) decide qué hacer con null.
 */
export async function getTodayRate(): Promise<TodayRate | null> {
  const supabase = await createClient();
  const today = todayIsoLocal();

  const { data, error } = await supabase
    .from("exchange_rate_log")
    .select("rate_date, value, source, note, created_at")
    .eq("rate_date", today)
    .maybeSingle();

  if (error || !data) return null;

  return {
    rateDate: data.rate_date,
    value: Number(data.value),
    source: data.source as RateSource,
    note: data.note ?? null,
    setAt: data.created_at,
  };
}

export async function setRate(
  _prev: SetRateState,
  formData: FormData,
): Promise<SetRateState> {
  const parsed = setRateSchema.safeParse({
    rateDate: formData.get("rateDate"),
    value: formData.get("value"),
    source: formData.get("source") ?? undefined,
    note: formData.get("note") ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Inválido" };
  }

  const supabase = await createClient();
  const { data: userResult } = await supabase.auth.getUser();
  const userId = userResult.user?.id ?? null;

  // Upsert: el índice único (tenant_id, rate_date) garantiza 1 fila por día.
  // RLS añade tenant_id implícitamente vía la policy check.
  const { error } = await supabase.from("exchange_rate_log").upsert(
    {
      rate_date: parsed.data.rateDate,
      value: parsed.data.value,
      source: parsed.data.source,
      note: parsed.data.note ?? null,
      set_by: userId,
      tenant_id: userResult.user?.app_metadata?.tenant_id as string | undefined,
    },
    { onConflict: "tenant_id,rate_date" },
  );

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/");
  return { ok: true };
}

/**
 * Consulta DolarAPI sin autenticación y devuelve sugerencias de tasa.
 * Público, no-bloqueante: si la API falla, el usuario puede ingresar a mano.
 *
 * Cuando migremos cron para actualizar tasas automáticamente, esto se
 * convierte en una Edge Function programada (Supabase Scheduled Functions).
 */
export async function suggestRates(): Promise<{
  suggestions: RateSuggestion[];
  error?: string;
}> {
  try {
    const res = await fetch("https://ve.dolarapi.com/v1/dolares", {
      next: { revalidate: 900 }, // cache 15 min
    });
    if (!res.ok) {
      return { suggestions: [], error: `DolarAPI HTTP ${res.status}` };
    }
    const rows = (await res.json()) as Array<{
      fuente?: string;
      nombre?: string;
      promedio?: number;
      fechaActualizacion?: string;
    }>;
    const suggestions: RateSuggestion[] = [];
    for (const r of rows) {
      const name = (r.nombre ?? "").toLowerCase();
      if (typeof r.promedio !== "number" || !r.fechaActualizacion) continue;
      if (name.includes("oficial")) {
        suggestions.push({
          source: "BCV",
          value: r.promedio,
          updatedAt: r.fechaActualizacion,
        });
      } else if (name.includes("paralelo")) {
        suggestions.push({
          source: "Paralelo",
          value: r.promedio,
          updatedAt: r.fechaActualizacion,
        });
      }
    }
    return { suggestions };
  } catch (e) {
    return {
      suggestions: [],
      error: e instanceof Error ? e.message : "Error consultando DolarAPI",
    };
  }
}
