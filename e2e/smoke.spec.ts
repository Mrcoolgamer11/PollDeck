import { expect, test, type Page } from "@playwright/test";

/**
 * Smoke-Test: Präsentator startet eine Sitzung, drei Teilnehmer stimmen ab,
 * das Ergebnis erscheint in der Präsentator-Ansicht.
 */

async function loginOrRegister(page: Page) {
  const email = process.env.E2E_EMAIL ?? `e2e-${Date.now()}@polldeck.test`;
  const password = process.env.E2E_PASSWORD ?? "e2e-passwort-123";
  if (process.env.E2E_EMAIL) {
    await page.goto("/login");
    await page.getByLabel("E-Mail", { exact: true }).fill(email);
    await page.getByLabel("Passwort", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Anmelden" }).first().click();
  } else {
    const cfg = await (await page.request.get("/api/auth/config")).json();
    if (!cfg.needsSetup && cfg.registrationMode !== "open") {
      throw new Error("Registrierung geschlossen – bitte E2E_EMAIL und E2E_PASSWORD setzen.");
    }
    await page.goto("/register");
    await page.getByLabel("Name", { exact: true }).fill("E2E-Präsentator");
    await page.getByLabel("E-Mail", { exact: true }).fill(email);
    await page.getByLabel("Passwort", { exact: true }).fill(password);
    await page.getByRole("button", { name: /Registrieren|Admin-Konto erstellen/ }).click();
  }
  await page.waitForURL("**/dashboard");
}

test("Präsentator startet Sitzung, 3 Teilnehmer stimmen ab, Ergebnis erscheint", async ({ browser }) => {
  const hostContext = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const host = await hostContext.newPage();
  await loginOrRegister(host);

  // Neue leere Präsentation (enthält eine Multiple-Choice-Folie mit 3 Optionen).
  await host.getByRole("button", { name: "Neue Präsentation" }).first().click();
  await host.getByLabel("Titel", { exact: true }).fill(`E2E-Smoke ${Date.now()}`);
  await host.getByRole("button", { name: "Erstellen" }).click();
  await host.waitForURL("**/edit/**");
  await host.getByLabel("Frage", { exact: true }).fill("Was ist dein Lieblingsobst?");
  await host.getByPlaceholder("Option 1").fill("Apfel");
  await host.getByPlaceholder("Option 2").fill("Banane");
  await host.getByPlaceholder("Option 3").fill("Kirsche");
  await expect(host.getByText("Gespeichert")).toBeVisible();

  await host.getByRole("button", { name: "Präsentieren" }).click();
  await host.waitForURL("**/present/**");
  const subtitle = await host.locator("header p").first().innerText();
  const code = subtitle.match(/(\d{3}) (\d{3})/)!.slice(1).join("");
  expect(code).toMatch(/^\d{6}$/);

  // Drei Teilnehmer treten auf "Smartphones" bei und stimmen ab.
  const votes = ["Apfel", "Banane", "Apfel"];
  const participants: Page[] = [];
  for (let i = 0; i < 3; i++) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    await p.goto(`/${code}`);
    await expect(p.getByRole("heading", { name: "Was ist dein Lieblingsobst?" })).toBeVisible();
    participants.push(p);
  }
  await expect(host.locator("header").first().getByTitle("Teilnehmer")).toContainText("3");

  for (const [i, p] of participants.entries()) {
    await p.getByText(votes[i], { exact: true }).click();
    await p.getByRole("button", { name: "Absenden" }).click();
    await expect(p.getByText("Danke! Deine Antwort ist angekommen.")).toBeVisible();
  }

  // Ergebnis in der Präsentator-Ansicht: 2× Apfel (67 %), 1× Banane (33 %).
  await expect(host.getByRole("listitem", { name: /Apfel: 2/ })).toBeVisible();
  await expect(host.getByRole("listitem", { name: /Banane: 1/ })).toBeVisible();
  await expect(host.getByRole("listitem", { name: /Kirsche: 0/ })).toBeVisible();
  await expect(host.getByText("67 %").first()).toBeVisible();

  // Teilnehmer sehen das Ergebnis ebenfalls.
  await expect(participants[0].getByText("67 %")).toBeVisible();
});
