"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createTenantSchema } from "./schema";

export type OnboardingState = {
  ok: boolean;
  error?: string;
  values?: {
    name?: string;
    slug?: string;
    warehouseName?: string;
  };
};

export const initialOnboardingState: OnboardingState = { ok: false };

export async function createTenantAction(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const values = {
    name: String(formData.get("name") ?? ""),
    slug: String(formData.get("slug") ?? ""),
    warehouseName: String(formData.get("warehouseName") ?? ""),
  };

  const parsed = createTenantSchema.safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      values,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_tenant", {
    p_name: parsed.data.name,
    p_slug: parsed.data.slug,
    p_warehouse_name: parsed.data.warehouseName,
  });

  if (error) {
    // Conflicto de slug único (Postgres 23505) → mensaje amistoso.
    const friendly =
      error.code === "23505"
        ? "Ese identificador ya está tomado, prueba con otro."
        : error.message;
    return { ok: false, error: friendly, values };
  }

  // Forzar emisión de un nuevo JWT para que el Auth Hook inyecte tenant_id.
  // Sin esto, el cliente seguiría navegando con el access token sin claim.
  await supabase.auth.refreshSession();

  redirect("/");
}
