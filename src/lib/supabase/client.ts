import { createBrowserClient } from "@supabase/ssr";

/**
 * Cliente Supabase para el navegador (Client Components).
 * Usa la publishable key (sb_publishable_...) — nunca la secret/service_role
 * key en cliente (ver CLAUDE.md).
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
