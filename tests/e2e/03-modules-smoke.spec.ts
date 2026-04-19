import { expect, test } from "@playwright/test";
import {
  completeOnboarding,
  signUpWithMagicLink,
  slugFrom,
  uniqueEmail,
} from "./helpers/auth";

/**
 * Smoke de cada módulo: tras onboarding, cada ruta protegida renderiza sin
 * errores y muestra su heading. No testea operaciones — solo que la ruta
 * carga con sesión válida.
 */

test.describe("módulos smoke tras onboarding", () => {
  test.beforeEach(async ({ page }) => {
    const email = uniqueEmail();
    await signUpWithMagicLink(page, email);
    await completeOnboarding(page, {
      name: "Smoke Co",
      slug: slugFrom("smoke-co"),
    });
    await expect(page).toHaveURL("/");
  });

  const routes: Array<{ path: string; heading: RegExp }> = [
    { path: "/catalogo",   heading: /cat[aá]logo/i },
    { path: "/inventario", heading: /inventario/i },
    { path: "/recetas",    heading: /recetas/i },
    { path: "/produccion", heading: /producci[oó]n/i },
    { path: "/compras",    heading: /compras/i },
    { path: "/ventas",     heading: /ventas/i },
    { path: "/cxc",        heading: /(cxc|cuentas por cobrar)/i },
    { path: "/reportes",   heading: /reportes/i },
  ];

  for (const { path, heading } of routes) {
    test(`${path} renderiza`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(path);
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    });
  }

  test("signout regresa a login y bloquea rutas protegidas", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /salir/i }).click();
    await expect(page).toHaveURL(/\/auth\/login/);

    await page.goto("/");
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});
