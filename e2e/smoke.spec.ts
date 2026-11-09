import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * Smoke-Tests gegen eine laufende Instanz:
 * 1. Präsentator startet eine Sitzung, drei Teilnehmer treten mit Name und
 *    Emoji bei (Lobby), stimmen ab, das Ergebnis erscheint.
 * 2. Quiz im Auto-Modus: startet automatisch, löst sofort auf, wenn alle
 *    geantwortet haben, Punkte erscheinen auf dem Handy, Ende-Bildschirm.
 */

async function loginOrRegister(page: Page) {
  const email = process.env.E2E_EMAIL ?? `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@polldeck.test`;
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

async function newHost(browser: Browser) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const host = await ctx.newPage();
  await loginOrRegister(host);
  return host;
}

async function createPresentation(host: Page, title: string) {
  await host.getByRole("button", { name: "Neue Präsentation" }).first().click();
  await host.getByLabel("Titel", { exact: true }).fill(title);
  await host.getByRole("button", { name: "Erstellen" }).click();
  await host.waitForURL("**/edit/**");
}

async function startSession(host: Page) {
  await host.getByRole("button", { name: "Präsentieren" }).click();
  await host.waitForURL("**/present/**");
  const subtitle = await host.locator("header p").first().innerText();
  return subtitle.match(/(\d{3}) (\d{3})/)!.slice(1).join("");
}

async function joinAs(browser: Browser, code: string, name: string, avatar: string) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await p.goto(`/${code}`);
  await p.getByLabel("Dein Name").fill(name);
  await p.getByRole("radio", { name: avatar }).click();
  await p.getByRole("button", { name: "Mitmachen" }).click();
  await expect(p.getByText("Du bist dabei!")).toBeVisible();
  return p;
}

test("Präsentator startet Sitzung, 3 Teilnehmer stimmen ab, Ergebnis erscheint", async ({ browser }) => {
  const host = await newHost(browser);
  await createPresentation(host, `E2E-Smoke ${Date.now()}`);
  await host.getByLabel("Frage", { exact: true }).fill("Was ist dein Lieblingsobst?");
  await host.getByPlaceholder("Option 1").fill("Apfel");
  await host.getByPlaceholder("Option 2").fill("Banane");
  await host.getByPlaceholder("Option 3").fill("Kirsche");
  await expect(host.getByText("Gespeichert")).toBeVisible();

  const code = await startSession(host);
  expect(code).toMatch(/^\d{6}$/);

  // Lobby: Teilnehmer treten mit Name und Emoji bei und erscheinen beim Präsentator.
  const people: [string, string][] = [["Anna", "🦊"], ["Ben", "🐼"], ["Cem", "🚀"]];
  const participants: Page[] = [];
  for (const [name, avatar] of people) participants.push(await joinAs(browser, code, name, avatar));
  await expect(host.locator("header").first().getByTitle("Teilnehmer")).toContainText("3");
  for (const [name, avatar] of people) await expect(host.locator("li", { hasText: `${avatar}${name}` }).first()).toBeVisible();

  await host.getByRole("button", { name: "Präsentation starten" }).click();
  for (const p of participants) await expect(p.getByRole("heading", { name: "Was ist dein Lieblingsobst?" })).toBeVisible();

  const votes = ["Apfel", "Banane", "Apfel"];
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
  await expect(participants[0].getByText("67 %")).toBeVisible();
});

test("Quiz-Auto-Modus: automatischer Start, sofortige Auflösung, Punkte und Ende", async ({ browser }) => {
  const host = await newHost(browser);
  await createPresentation(host, `E2E-Quiz ${Date.now()}`);
  // Erste Folie in eine Quizfrage umwandeln.
  await host.getByLabel("Folientyp").selectOption("quiz_choice");
  await host.getByLabel("Frage", { exact: true }).fill("Was ist 2 + 2?");
  await host.getByPlaceholder("Antwort 1").fill("4");
  await host.getByPlaceholder("Antwort 2").fill("5");
  await expect(host.getByText("Gespeichert")).toBeVisible();
  // Auto-Modus in den Präsentations-Einstellungen aktivieren.
  await host.getByRole("button", { name: "Präsentations-Einstellungen" }).click();
  await host.getByRole("switch", { name: "Quiz-Auto-Modus" }).click();
  await host.keyboard.press("Escape");

  const code = await startSession(host);
  const a = await joinAs(browser, code, "Anna", "🦊");
  const b = await joinAs(browser, code, "Ben", "🐼");
  await host.getByRole("button", { name: "Präsentation starten" }).click();

  // Startet ohne Klick auf „Quizfrage starten“ nach kurzer Bereit-Pause.
  await expect(a.getByText("Gleich geht's los – mach dich bereit!")).toBeVisible();
  await expect(a.getByText("4", { exact: true })).toBeVisible({ timeout: 8000 });
  await a.getByText("4", { exact: true }).click();
  await b.getByText("5", { exact: true }).click();

  // Alle haben geantwortet → sofort aufgelöst (Countdown wäre 20 s).
  await expect(a.getByText("Richtig!")).toBeVisible({ timeout: 5000 });
  await expect(b.getByText("Leider falsch")).toBeVisible();
  // Aktueller Punktestand im Kopfbereich.
  await expect(a.getByRole("status", { name: /Deine Punkte: \d+/ })).toBeVisible();

  // Sitzung beenden → Ende-Bildschirm mit „Zur Startseite“ und „Ergebnisse speichern“.
  await host.getByRole("button", { name: "Sitzung beenden" }).click();
  await host.getByRole("dialog").getByRole("button", { name: "Sitzung beenden" }).click();
  await expect(a.getByText("Die Sitzung ist beendet")).toBeVisible();
  await expect(a.getByRole("link", { name: "Zur Startseite" })).toBeVisible();
  await expect(a.getByRole("heading", { name: "Meine Ergebnisse" })).toBeVisible();
  const download = a.waitForEvent("download");
  await a.getByRole("button", { name: "Ergebnisse speichern" }).click();
  expect((await download).suggestedFilename()).toContain("Meine Ergebnisse");
});
