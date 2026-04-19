import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config para Brillamax PWA.
 *
 * Target: Next dev server en http://localhost:3000 contra Supabase local en
 * http://127.0.0.1:54321 (Inbucket para emails en 54324).
 *
 * Antes de correr:
 *   1. supabase start
 *   2. npm run dev  (o deja que el webServer lo haga)
 *   3. npx playwright install chromium
 *   4. npm run test:e2e
 *
 * Cada test arranca desde cero (sin seed). El flujo típico:
 *   - signup con magic link vía Inbucket
 *   - onboarding (crear tenant)
 *   - operar módulos
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false, // orden determinista; comparten Supabase local
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    viewport: { width: 390, height: 844 }, // mobile-first (Pixel 7)
  },
  projects: [
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "desktop-chrome",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
