#!/usr/bin/env node
/**
 * Prüft, ob alle im Frontend verwendeten Übersetzungsschlüssel in de.json und
 * en.json vorhanden sind (und beide Dateien dieselben Schlüssel haben).
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../apps/web/src");
const de = JSON.parse(fs.readFileSync(path.join(root, "locales/de.json"), "utf8"));
const en = JSON.parse(fs.readFileSync(path.join(root, "locales/en.json"), "utf8"));

const flat = (obj, prefix = "") =>
  Object.entries(obj).flatMap(([k, v]) => (typeof v === "object" ? flat(v, `${prefix}${k}.`) : [`${prefix}${k}`]));
const deKeys = new Set(flat(de));
const enKeys = new Set(flat(en));

const files = [];
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.tsx?$/.test(e.name)) files.push(p);
  }
};
walk(root);

const used = new Set();
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  for (const m of src.matchAll(/\bt\(\s*["'`]([a-zA-Z0-9_.]+)["'`]/g)) used.add(m[1]);
}

// Pluralformen (_one/_other) zählen als vorhanden.
const has = (set, k) => set.has(k) || set.has(`${k}_one`) || set.has(`${k}_other`);
const problems = [];
for (const k of used) {
  if (!has(deKeys, k)) problems.push(`fehlt in de.json: ${k}`);
  if (!has(enKeys, k)) problems.push(`fehlt in en.json: ${k}`);
}
for (const k of deKeys) if (!enKeys.has(k)) problems.push(`nur in de.json: ${k}`);
for (const k of enKeys) if (!deKeys.has(k)) problems.push(`nur in en.json: ${k}`);

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`i18n ok: ${used.size} verwendete Schlüssel, ${deKeys.size} definiert.`);
