import { expect, test } from "@playwright/test";

/**
 * Gating del middleware (src/lib/supabase/proxy.ts):
 *   sin sesión               → redirige a /auth/login
 *   con sesión sin tenant    → redirige a /onboarding
 *   con sesión + tenant      → renderiza la ruta pedida
 *
 * Este spec cubre el primer caso (sin sesión). Los otros se cubren en 02.
 */

test.describe("gating: sin sesión", () => {
  const protectedPaths = [
    "/",
    "/catalogo",
    "/inventario",
    "/recetas",
    "/produccion",
    "/compras",
    "/ventas",
    "/cxc",
    "/reportes",
  ];

  for (const path of protectedPaths) {
    test(`${path} redirige a /auth/login sin sesión`, async ({ page }) => {
      await page.context().clearCookies();
      await page.goto(path);
      await expect(page).toHaveURL(/\/auth\/login/);
    });
  }

  test("/auth/login renderiza el formulario", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/auth/login");
    await expect(page.getByRole("tab", { name: /tel[eé]fono/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /email/i })).toBeVisible();
  });

  test("/onboarding sin sesión redirige a /auth/login", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});
