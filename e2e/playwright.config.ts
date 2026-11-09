import { defineConfig, devices } from "@playwright/test";

/**
 * E2E-Smoke-Test gegen eine laufende PollDeck-Instanz.
 *   BASE_URL=http://localhost:5173 pnpm e2e
 * Optional: E2E_EMAIL / E2E_PASSWORD für ein bestehendes Präsentator-Konto.
 * Eigener Chromium-Pfad (z. B. in CI-Containern): PW_CHROMIUM_PATH=/pfad/zu/chrome
 */
export default defineConfig({
  testDir: ".",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:5173",
    locale: "de-DE",
    trace: "off",
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
