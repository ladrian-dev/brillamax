import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Rutas públicas que NO requieren sesión. */
const PUBLIC_PATHS = ["/auth/login", "/auth/verify", "/auth/callback"];
/** Rutas de auth a las que un usuario autenticado NO debería volver. */
const AUTH_ONLY_PATHS = ["/auth/login", "/auth/verify"];
/** Ruta de onboarding: requiere sesión pero NO tenant_id. */
const ONBOARDING_PATH = "/onboarding";

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Refresca la sesión de Supabase en cada request y enruta según el estado:
 *   sin sesión              → /auth/login
 *   con sesión, sin tenant  → /onboarding
 *   con sesión + tenant     → ruta solicitada
 *
 * En Next.js 16 `middleware.ts` se renombró a `proxy.ts` (función `proxy`).
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // No autenticado: forzar login salvo en rutas públicas.
  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (user) {
    // El Auth Hook (migración 0001) inyecta `tenant_id` como custom claim.
    // El cliente-servidor lo expone en `user.app_metadata.tenant_id`.
    const tenantId = (user.app_metadata?.tenant_id as string | undefined) ?? null;

    // Ya autenticado: no volver a pantallas de login.
    if (AUTH_ONLY_PATHS.includes(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = tenantId ? "/" : ONBOARDING_PATH;
      url.search = "";
      return NextResponse.redirect(url);
    }

    // Sin tenant: forzar onboarding (salvo que ya estemos allí o en signout).
    if (
      !tenantId &&
      pathname !== ONBOARDING_PATH &&
      pathname !== "/auth/signout"
    ) {
      const url = request.nextUrl.clone();
      url.pathname = ONBOARDING_PATH;
      url.search = "";
      return NextResponse.redirect(url);
    }

    // Con tenant y visitando /onboarding: ya está listo, mandar al home.
    if (tenantId && pathname === ONBOARDING_PATH) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return response;
}
