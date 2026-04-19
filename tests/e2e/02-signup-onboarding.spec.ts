import { expect, test } from "@playwright/test";
import {
  completeOnboarding,
  signUpWithMagicLink,
  slugFrom,
  uniqueEmail,
} from "./helpers/auth";

/**
 * Flujo completo desde cero: signup → magic link → onboarding → home.
 * Requiere Supabase local corriendo (`supabase start`) con Inbucket accesible
 * en http://127.0.0.1:54324.
 */

test.describe("signup + onboarding desde cero", () => {
  test("nuevo usuario llega a /onboarding tras magic link", async ({ page }) => {
    const email = uniqueEmail();
    await signUpWithMagicLink(page, email);
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 10_000 });
    await expect(page.getByText(/configura tu f[áa]brica/i)).toBeVisible();
  });

  test("completar onboarding redirige a home con KPIs", async ({ page }) => {
    const email = uniqueEmail();
    await signUpWithMagicLink(page, email);

    await completeOnboarding(page, {
      name: "Mi Fábrica E2E",
      slug: slugFrom("mi-fabrica-e2e"),
      warehouseName: "Almacén principal",
    });

    // Home muestra el heading "Brillamax" y los 8 módulos.
    await expect(page.getByRole("heading", { name: "Brillamax" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Ventas" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Inventario" })).toBeVisible();

    // Alert banner de tasa (no capturada) debería aparecer para usuario nuevo.
    await expect(
      page.getByText(/falta capturar tasa del d[íi]a/i),
    ).toBeVisible();
  });

  test("usuario con tenant ya no vuelve a /onboarding", async ({ page }) => {
    const email = uniqueEmail();
    await signUpWithMagicLink(page, email);
    await completeOnboarding(page, {
      name: "Second Run Corp",
      slug: slugFrom("second-run-corp"),
    });

    // Intentar volver al onboarding manualmente → middleware redirige a /.
    await page.goto("/onboarding");
    await expect(page).toHaveURL("/");
  });
});
