import type { Prisma } from "@prisma/client";
import {
  BUILTIN_THEMES,
  defaultSlideLiveState,
  presentationSettingsSchema,
  type PresentationSettings,
  type SessionLiveState,
  type Slide,
  type SlideLiveState,
  type ThemeConfig,
} from "@polldeck/shared";
import { prisma } from "../lib/prisma.js";
import { createRedis, redis } from "../lib/redis.js";
import { resolveTheme } from "../routes/presentations.js";

/** Im Speicher gehaltener Zustand einer laufenden Sitzung. */
export interface Runtime {
  id: string;
  code: string;
  presentationId: string;
  ownerId: string;
  title: string;
  mode: "PRESENTER" | "SURVEY";
  ended: boolean;
  slides: Slide[];
  state: SessionLiveState;
  theme: ThemeConfig;
  settings: PresentationSettings;
}

const cache = new Map<string, { rt: Runtime; at: number }>();
const CACHE_MS = 60_000;
const INVALIDATE_CHANNEL = "pd:session-invalidate";
const INSTANCE = Math.random().toString(36).slice(2);

// Mehrere API-Instanzen: Cache bei Änderungen über Redis invalidieren.
const sub = createRedis();
sub.subscribe(INVALIDATE_CHANNEL).catch(() => undefined);
sub.on("message", (_ch, msg: string) => {
  const [from, id] = msg.split(":");
  if (from !== INSTANCE) cache.delete(id);
});

export function defaultLiveState(settings: PresentationSettings): SessionLiveState {
  return {
    currentIndex: 0,
    slides: {},
    showJoinBanner: settings.showJoinBanner,
    reactionsEnabled: settings.reactionsEnabled,
    qrFullscreen: false,
  };
}

export async function loadRuntime(sessionId: string, fresh = false): Promise<Runtime | null> {
  const hit = cache.get(sessionId);
  if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.rt;
  const s = await prisma.liveSession.findUnique({
    where: { id: sessionId },
    include: { presentation: { select: { ownerId: true, title: true, themeId: true, builtinTheme: true, settings: true } } },
  });
  if (!s) {
    cache.delete(sessionId);
    return null;
  }
  const settings = presentationSettingsSchema.parse(s.presentation.settings ?? {});
  const rt: Runtime = {
    id: s.id,
    code: s.code,
    presentationId: s.presentationId,
    ownerId: s.presentation.ownerId,
    title: s.presentation.title,
    mode: s.mode,
    ended: s.status === "ENDED",
    slides: s.slides as unknown as Slide[],
    state: { ...defaultLiveState(settings), ...(s.state as object) } as SessionLiveState,
    theme: await resolveTheme(s.presentation).catch(() => BUILTIN_THEMES[0].config),
    settings,
  };
  cache.set(sessionId, { rt, at: Date.now() });
  return rt;
}

export async function findActiveByCode(code: string): Promise<Runtime | null> {
  const s = await prisma.liveSession.findFirst({ where: { code, status: "ACTIVE" }, select: { id: true } });
  return s ? loadRuntime(s.id) : null;
}

export function slideState(rt: Runtime, slideId: string): SlideLiveState {
  return { ...defaultSlideLiveState(), ...(rt.state.slides[slideId] ?? {}) };
}

export function setSlideState(rt: Runtime, slideId: string, patch: Partial<SlideLiveState>) {
  rt.state.slides[slideId] = { ...slideState(rt, slideId), ...patch };
}

export function currentSlide(rt: Runtime): Slide | null {
  return rt.slides[rt.state.currentIndex] ?? null;
}

/** Speichert den Zustand und benachrichtigt andere Instanzen. */
export async function persistState(rt: Runtime) {
  await prisma.liveSession.update({
    where: { id: rt.id },
    data: { state: rt.state as unknown as Prisma.InputJsonValue },
  });
  cache.set(rt.id, { rt, at: Date.now() });
  await redis.publish(INVALIDATE_CHANNEL, `${INSTANCE}:${rt.id}`).catch(() => undefined);
}

export function invalidate(sessionId: string) {
  cache.delete(sessionId);
  redis.publish(INVALIDATE_CHANNEL, `${INSTANCE}:${sessionId}`).catch(() => undefined);
}

/** Generiert einen freien 6-stelligen Beitrittscode. */
export async function generateCode(): Promise<string> {
  for (let i = 0; i < 50; i++) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const taken = await prisma.liveSession.findFirst({ where: { code, status: "ACTIVE" }, select: { id: true } });
    if (!taken) return code;
  }
  throw new Error("Kein freier Code gefunden");
}
