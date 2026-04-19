import { expect, type Page } from "@playwright/test";
import { clearMailbox, waitForMagicLink } from "./inbucket";

/**
 * Envía un magic link para el email dado y consume el link. Deja al usuario
 * autenticado en la página destino (callback redirige según tenant:
 * con tenant → `/`; sin tenant → `/onboarding`).
 *
 * Uso típico:
 *   const email = `e2e-${Date.now()}@brillamax.test`;
 *   await signUpWithMagicLink(page, email);
 *   // usuario nuevo → cae en /onboarding
 */
export async function signUpWithMagicLink(
  page: Page,
  email: string,
): Promise<void> {
  await clearMailbox(email);

  await page.goto("/auth/login");
  // Tab "Email"
  await page.getByRole("tab", { name: /email/i }).click();
  await page.getByLabel(/email/i).fill(email);
  await page.getByRole("button", { name: /enviar/i }).click();

  // Esperar confirmación en pantalla
  await expect(page.getByText(/enviamos un enlace/i)).toBeVisible({
    timeout: 10_000,
  });

  const magicUrl = await waitForMagicLink(email);
  await page.goto(magicUrl);
  // El callback redirige a / o /onboarding según estado.
}

/**
 * Helper para completar onboarding (crear tenant) asumiendo que el usuario
 * acaba de llegar a /onboarding tras signup.
 */
export async function completeOnboarding(
  page: Page,
  opts: { name: string; slug: string; warehouseName?: string },
): Promise<void> {
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel(/nombre de la empresa/i).fill(opts.name);
  // Slug auto-derivado; sobrescribir si se pidió
  await page.getByLabel(/identificador/i).fill(opts.slug);
  if (opts.warehouseName) {
    await page.getByLabel(/almac[eé]n/i).fill(opts.warehouseName);
  }
  await page.getByRole("button", { name: /crear f[áa]brica/i }).click();
  await expect(page).toHaveURL("/", { timeout: 10_000 });
}

export function uniqueEmail(prefix = "e2e"): string {
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${stamp}-${rand}@brillamax.test`;
}

export function slugFrom(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) + `-${Math.random().toString(36).slice(2, 6)}`
  );
}
