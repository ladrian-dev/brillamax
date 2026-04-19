import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Cliente Supabase para Server Components, Server Actions y Route Handlers.
 * El proxy (proxy.ts raíz) se encarga de refrescar la sesión; aquí solo leemos
 * y escribimos cookies cuando Supabase lo requiere.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Component: no se pueden escribir cookies. El refresh se
            // aplica desde proxy.ts; aquí ignoramos silenciosamente.
          }
        },
      },
    },
  );
}
