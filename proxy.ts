import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

/**
 * Next.js 16: `middleware.ts` → `proxy.ts`. La función DEBE llamarse `proxy`.
 * Delegamos el refresh de sesión a @supabase/ssr.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Excluye assets estáticos, optimización de imágenes, service worker e iconos PWA.
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
