import fs from "node:fs/promises";
import path from "node:path";
import { findUploadRefs } from "@polldeck/shared";
import { prisma } from "./prisma.js";
import { redis } from "./redis.js";
import { logger } from "./logger.js";
import { getSettings } from "./settings.js";
import { env } from "../env.js";
import { invalidate } from "../live/runtime.js";
import { endSession } from "../live/server.js";

/** Laufende Sitzungen ohne Aktivität werden nach dieser Zeit automatisch beendet. */
const STALE_SESSION_HOURS = 24;
/** Neue Uploads erst nach dieser Zeit als „verwaist“ löschen (Editor speichert verzögert). */
const ORPHAN_GRACE_MS = 24 * 3600_000;
const RUN_EVERY_MS = 6 * 3600_000;

export interface RetentionReport {
  endedSessions: number;
  deletedSessions: number;
  deletedAuthSessions: number;
  deletedResetTokens: number;
  deletedInvites: number;
  deletedUploads: number;
}

/** Alle in der Datenbank referenzierten Upload-Dateien. */
async function referencedUploads(): Promise<Set<string>> {
  const refs = new Set<string>();
  const add = (v: unknown) => {
    if (v === null || v === undefined) return;
    for (const r of findUploadRefs(typeof v === "string" ? v : JSON.stringify(v))) refs.add(r);
  };
  const [slides, themes, sessions, settings] = await Promise.all([
    prisma.slide.findMany({ select: { imageUrl: true, background: true, config: true } }),
    prisma.theme.findMany({ select: { config: true } }),
    prisma.liveSession.findMany({ select: { slides: true } }),
    prisma.setting.findMany({ select: { value: true } }),
  ]);
  slides.forEach((s) => (add(s.imageUrl), add(s.background), add(s.config)));
  themes.forEach((t) => add(t.config));
  sessions.forEach((s) => add(s.slides));
  settings.forEach((s) => add(s.value));
  return refs;
}

/**
 * Löscht Daten, deren Zweck erfüllt ist (Speicherbegrenzung, Art. 5 Abs. 1 lit. e DSGVO):
 * - Sitzungen samt Antworten/Teilnehmern nach der eingestellten Aufbewahrungsfrist
 * - seit 24 h inaktive, noch laufende Sitzungen werden beendet
 * - abgelaufene Logins, Passwort-Reset-Links und Einladungen
 * - Bilder, die von keiner Präsentation/Sitzung/Einstellung mehr verwendet werden
 */
export async function runRetention(now = new Date()): Promise<RetentionReport> {
  const { retentionDays } = await getSettings();
  const report: RetentionReport = {
    endedSessions: 0,
    deletedSessions: 0,
    deletedAuthSessions: 0,
    deletedResetTokens: 0,
    deletedInvites: 0,
    deletedUploads: 0,
  };

  // Verwaiste laufende Sitzungen beenden (kein Teilnehmer/Präsentator mehr aktiv).
  const staleBefore = new Date(now.getTime() - STALE_SESSION_HOURS * 3600_000);
  const active = await prisma.liveSession.findMany({
    where: { status: "ACTIVE", startedAt: { lt: staleBefore } },
    select: { id: true, participants: { select: { lastSeenAt: true }, orderBy: { lastSeenAt: "desc" }, take: 1 } },
  });
  for (const s of active) {
    const last = s.participants[0]?.lastSeenAt;
    if (last && last > staleBefore) continue;
    if ((await redis.hlen(`pd:online:${s.id}`).catch(() => 0)) > 0) continue;
    await prisma.liveSession.update({ where: { id: s.id }, data: { status: "ENDED", endedAt: now } });
    invalidate(s.id);
    await endSession(s.id).catch(() => undefined);
    report.endedSessions++;
  }

  if (retentionDays > 0) {
    const cutoff = new Date(now.getTime() - retentionDays * 86400_000);
    const r = await prisma.liveSession.deleteMany({ where: { startedAt: { lt: cutoff }, status: "ENDED" } });
    report.deletedSessions = r.count;
  }

  report.deletedAuthSessions = (await prisma.authSession.deleteMany({ where: { expiresAt: { lt: now } } })).count;
  const dayAgo = new Date(now.getTime() - 86400_000);
  report.deletedResetTokens = (
    await prisma.passwordResetToken.deleteMany({ where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { lt: dayAgo } }] } })
  ).count;
  report.deletedInvites = (
    await prisma.invite.deleteMany({ where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { lt: dayAgo } }] } })
  ).count;

  // Verwaiste Uploads entfernen.
  try {
    const refs = await referencedUploads();
    for (const name of await fs.readdir(env.UPLOAD_DIR)) {
      if (!/^[\w-]+\.(png|jpg|gif|webp)$/.test(name) || refs.has(name)) continue;
      const file = path.join(env.UPLOAD_DIR, name);
      const stat = await fs.stat(file);
      if (now.getTime() - stat.mtimeMs < ORPHAN_GRACE_MS) continue;
      await fs.rm(file, { force: true });
      report.deletedUploads++;
    }
  } catch (err) {
    logger.warn({ err }, "Upload-Bereinigung übersprungen");
  }
  return report;
}

/** Startet die regelmäßige Bereinigung (bei mehreren Instanzen nur auf einer gleichzeitig). */
export function scheduleRetention() {
  const run = async () => {
    const lock = await redis.set("pd:retention-lock", "1", "EX", 3000, "NX").catch(() => null);
    if (!lock) return;
    try {
      const report = await runRetention();
      logger.info({ report }, "Datenbereinigung abgeschlossen");
    } catch (err) {
      logger.error({ err }, "Datenbereinigung fehlgeschlagen");
    } finally {
      await redis.del("pd:retention-lock").catch(() => undefined);
    }
  };
  setTimeout(run, 60_000).unref();
  setInterval(run, RUN_EVERY_MS).unref();
}
