/** Normalisiert einen Begriff für die Wortwolke: Trimmen, Leerzeichen zusammenfassen, Kleinschreibung. */
export function normalizeWord(input: string): string {
  return input
    .normalize("NFC")
    .replace(/[​-‍﻿]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, "")
    .toLocaleLowerCase("de-DE");
}

/** Levenshtein-Distanz (für Tippfehler-Toleranz bei Quiz-Texteingabe). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Erlaubte Tippfehler abhängig von der Wortlänge. */
export function typoTolerance(length: number): number {
  if (length <= 3) return 0;
  if (length <= 7) return 1;
  return 2;
}

export interface TextMatchOptions {
  caseSensitive?: boolean;
  allowTypos?: boolean;
}

function prepAnswer(s: string, caseSensitive: boolean) {
  const t = s.normalize("NFC").trim().replace(/\s+/g, " ");
  return caseSensitive ? t : t.toLocaleLowerCase("de-DE");
}

/** Prüft, ob eine Texteingabe einer der richtigen Antworten entspricht. */
export function matchesTextAnswer(input: string, correct: string[], opts: TextMatchOptions = {}): boolean {
  const value = prepAnswer(input, !!opts.caseSensitive);
  if (!value) return false;
  return correct.some((c) => {
    const target = prepAnswer(c, !!opts.caseSensitive);
    if (value === target) return true;
    if (opts.allowTypos) return levenshtein(value, target) <= typoTolerance(target.length);
    return false;
  });
}

/** Standard-Wortfilter (Deutsch/Englisch). Im Admin-Bereich erweiterbar. */
export const DEFAULT_WORD_FILTER: string[] = [
  // Deutsch
  "arschloch", "arsch", "fotze", "hurensohn", "hure", "wichser", "wichse", "fick", "ficken", "fickt",
  "scheisse", "scheiße", "schlampe", "missgeburt", "spast", "spasti", "behindi", "schwuchtel",
  "nazi", "kanake", "neger", "pimmel", "schwanzlutscher", "titten", "nutte", "bastard", "vollidiot",
  // Englisch
  "fuck", "fucking", "fucker", "motherfucker", "shit", "bitch", "asshole", "bastard", "cunt",
  "pussy", "slut", "whore", "nigger", "nigga", "faggot", "retard", "wanker", "twat", "cock",
];

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Liefert true, wenn der Text einen gefilterten Begriff als ganzes Wort enthält. */
export function containsFilteredWord(text: string, filter: string[]): boolean {
  if (!filter.length) return false;
  const normalized = text.normalize("NFC").toLocaleLowerCase("de-DE");
  return filter.some((w) => {
    const word = w.trim().toLocaleLowerCase("de-DE");
    if (!word) return false;
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegex(word)}($|[^\\p{L}\\p{N}])`, "u");
    return re.test(normalized);
  });
}
