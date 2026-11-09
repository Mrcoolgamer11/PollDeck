import { DEFAULT_WORD_FILTER, instanceSettingsSchema, type InstanceSettings } from "@polldeck/shared";
import { prisma } from "./prisma.js";
import { env } from "../env.js";

const KEY = "instance";
let cache: { value: InstanceSettings; at: number } | null = null;

export function defaultSettings(): InstanceSettings {
  return {
    appName: env.APP_NAME,
    logoUrl: null,
    defaultLocale: env.DEFAULT_LOCALE,
    registrationMode: env.REGISTRATION_MODE,
    wordFilter: [],
    useDefaultWordFilter: true,
    maxUploadMb: env.MAX_UPLOAD_MB,
    imprint: "",
    privacy: "",
    retentionDays: 365,
  };
}

/** Instanz-Einstellungen (in der DB gespeicherte Werte überschreiben die ENV-Standardwerte). */
export async function getSettings(): Promise<InstanceSettings> {
  if (cache && Date.now() - cache.at < 10_000) return cache.value;
  const row = await prisma.setting.findUnique({ where: { key: KEY } });
  const merged = { ...defaultSettings(), ...((row?.value as object) ?? {}) };
  const parsed = instanceSettingsSchema.safeParse(merged);
  const value = parsed.success ? parsed.data : defaultSettings();
  cache = { value, at: Date.now() };
  return value;
}

export async function updateSettings(patch: Partial<InstanceSettings>): Promise<InstanceSettings> {
  const current = await getSettings();
  const value = instanceSettingsSchema.parse({ ...current, ...patch });
  await prisma.setting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
  cache = { value, at: Date.now() };
  return value;
}

export async function getWordFilter(): Promise<string[]> {
  const s = await getSettings();
  return [...(s.useDefaultWordFilter ? DEFAULT_WORD_FILTER : []), ...s.wordFilter];
}
