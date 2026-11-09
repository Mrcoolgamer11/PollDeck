import type { Server as HttpServer } from "node:http";
import crypto from "node:crypto";
import { Server, type Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import type { Prisma } from "@prisma/client";
import {
  REACTIONS,
  areResultsVisible,
  ResponseValidationError,
  computeQuizPoints,
  containsFilteredWord,
  isClosed,
  isInteractive,
  isQuiz,
  isRevealed,
  matchesTextAnswer,
  responseText,
  validateResponse,
  type Reaction,
  type SlideConfigMap,
  type SlideLiveState,
} from "@polldeck/shared";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { createRedis, redis } from "../lib/redis.js";
import { logger } from "../lib/logger.js";
import { env } from "../env.js";
import { SESSION_COOKIE, userFromToken } from "../lib/auth.js";
import { presentationAccess } from "../lib/access.js";
import { getWordFilter } from "../lib/settings.js";
import {
  currentSlide,
  findActiveByCode,
  loadRuntime,
  persistState,
  setSlideState,
  slideState,
  type Runtime,
} from "./runtime.js";
import {
  audienceBroadcast,
  audienceQuestions,
  audienceResults,
  hostResults,
  hostState,
  invalidateLeaderboard,
  leaderboard,
  myResponses,
  myScore,
  questionsFor,
} from "./data.js";
import { clearPresence, forceOffline, markOffline, markOnline, onlineCount } from "./presence.js";

type AckFn = (res: { ok: boolean; data?: unknown; error?: string }) => void;

interface ParticipantData {
  kind: "participant";
  sessionId: string;
  participantId: string;
  name: string | null;
  votes: number[];
  reactions: number[];
}
interface HostData {
  kind: "host" | "screen";
  sessionId: string;
  userId: string;
}
type SocketData = ParticipantData | HostData;

let io: Server | null = null;

const roomAudience = (sid: string) => `a:${sid}`;
const roomHost = (sid: string) => `h:${sid}`;
const roomParticipant = (pid: string) => `p:${pid}`;

// ---------------------------------------------------------------------------
// Gepuffertes Schreiben von Antworten + gedrosselter Ergebnis-Broadcast
// ---------------------------------------------------------------------------
const writeBuffer: Prisma.ResponseCreateManyInput[] = [];
const dirtyResults = new Map<string, Set<string>>(); // sessionId -> slideIds
const dirtyQa = new Map<string, Set<string>>();
const dirtyCount = new Set<string>();
const dirtyLeaderboard = new Set<string>();
const BROADCAST_MS = 250; // max. 4 Updates pro Sekunde

function markDirty(map: Map<string, Set<string>>, sid: string, slideId: string) {
  const set = map.get(sid) ?? new Set<string>();
  set.add(slideId);
  map.set(sid, set);
}

async function flushWrites() {
  if (!writeBuffer.length) return;
  const batch = writeBuffer.splice(0, writeBuffer.length);
  try {
    await prisma.response.createMany({ data: batch, skipDuplicates: true });
  } catch (err) {
    logger.error({ err, count: batch.length }, "Antworten konnten nicht gespeichert werden");
  }
  for (const r of batch) {
    markDirty(dirtyResults, r.sessionId, r.slideId);
    if (r.isCorrect !== null && r.isCorrect !== undefined) dirtyLeaderboard.add(r.sessionId);
  }
}

async function flushBroadcasts() {
  if (!io) return;
  const results = new Map(dirtyResults);
  dirtyResults.clear();
  const qa = new Map(dirtyQa);
  dirtyQa.clear();
  const counts = [...dirtyCount];
  dirtyCount.clear();
  const lbs = [...dirtyLeaderboard];
  dirtyLeaderboard.clear();

  for (const [sid, slideIds] of results) {
    const rt = await loadRuntime(sid);
    if (!rt) continue;
    for (const slideId of slideIds) {
      const slide = rt.slides.find((s) => s.id === slideId);
      if (!slide) continue;
      const res = await hostResults(rt, slide);
      io.to(roomHost(sid)).emit("host:results", { slideId, results: res, count: res.voters });
      const visibleToAudience = rt.mode === "SURVEY" || currentSlide(rt)?.id === slideId;
      if (visibleToAudience) {
        io.to(roomAudience(sid)).emit("audience:results", { slideId, results: audienceResults(rt, slide, res) });
      }
    }
  }
  for (const [sid, slideIds] of qa) {
    const rt = await loadRuntime(sid);
    if (!rt) continue;
    for (const slideId of slideIds) {
      const qs = await questionsFor(rt, slideId);
      io.to(roomHost(sid)).emit("qa:update", { slideId, questions: qs });
      io.to(roomAudience(sid)).emit("qa:update", { slideId, questions: audienceQuestions(qs) });
    }
  }
  for (const sid of lbs) {
    const rt = await loadRuntime(sid);
    if (!rt) continue;
    invalidateLeaderboard(sid);
    const lb = await leaderboard(rt);
    io.to(roomHost(sid)).emit("host:leaderboard", lb);
    const cur = currentSlide(rt);
    if (cur?.type === "leaderboard") {
      io.to(roomAudience(sid)).emit("audience:leaderboard", lb.slice(0, (cur.config as { topN: number }).topN));
    }
  }
  for (const sid of counts) {
    io.to(roomHost(sid)).emit("host:count", await onlineCount(sid));
  }
}

let ticking = false;
setInterval(async () => {
  if (ticking) return;
  ticking = true;
  try {
    await flushWrites();
    await flushBroadcasts();
  } catch (err) {
    logger.error({ err }, "Broadcast-Fehler");
  } finally {
    ticking = false;
  }
}, BROADCAST_MS).unref();

// ---------------------------------------------------------------------------
// Zustandsänderungen
// ---------------------------------------------------------------------------
const timers = new Map<string, NodeJS.Timeout>();

/** Netzwerk-Toleranz nach Countdown-Ende, bevor aufgelöst wird (wie in isClosed). */
const TIMER_GRACE_MS = 1600;

/**
 * Verarbeitet abgelaufene Countdowns: Abstimmung ist geschlossen; ist
 * „Bei Ablauf automatisch auflösen“ aktiv (Standard), werden Ergebnisse und
 * Lösung eingeblendet. Läuft auch nach einem Neustart für verpasste Timer.
 */
async function processExpiredTimers(rt: Runtime) {
  if (rt.ended) return;
  const now = Date.now();
  const expired: string[] = [];
  for (const slide of rt.slides) {
    const st = rt.state.slides[slide.id];
    if (!st?.timerEndsAt || st.timerDone || now < st.timerEndsAt + TIMER_GRACE_MS - 100) continue;
    const autoReveal = slide.settings.revealOnTimerEnd !== false;
    setSlideState(rt, slide.id, autoReveal ? { timerDone: true, revealed: true, resultsVisible: true } : { timerDone: true });
    expired.push(slide.id);
  }
  if (!expired.length) return;
  await persistState(rt);
  invalidateLeaderboard(rt.id);
  dirtyLeaderboard.add(rt.id);
  for (const id of expired) markDirty(dirtyResults, rt.id, id);
  await broadcastState(rt);
}

function scheduleTimer(rt: Runtime) {
  const old = timers.get(rt.id);
  if (old) clearTimeout(old);
  if (rt.ended) return;
  const next = Object.values(rt.state.slides)
    .filter((s) => s.timerEndsAt && !s.timerDone)
    .map((s) => s.timerEndsAt as number)
    .sort((a, b) => a - b)[0];
  if (!next) return;
  timers.set(
    rt.id,
    setTimeout(async () => {
      try {
        const fresh = await loadRuntime(rt.id);
        if (!fresh) return;
        await processExpiredTimers(fresh);
        scheduleTimer(fresh);
      } catch (err) {
        logger.error({ err }, "Countdown-Verarbeitung fehlgeschlagen");
      }
    }, Math.max(0, next + TIMER_GRACE_MS - Date.now())),
  );
}

/** Sendet den aktuellen Zustand an Präsentator/Beamer und alle Teilnehmer. */
export async function broadcastState(rt: Runtime) {
  if (!io) return;
  io.to(roomHost(rt.id)).emit("host:live", { live: rt.state, ended: rt.ended, serverTime: Date.now() });
  io.to(roomAudience(rt.id)).emit("audience:state", await audienceBroadcast(rt));
}

export async function endSession(sessionId: string) {
  const rt = await loadRuntime(sessionId, true);
  if (!rt) return;
  rt.ended = true;
  await clearPresence(sessionId);
  await broadcastState(rt);
  io?.to(roomAudience(sessionId)).emit("session:ended");
  io?.to(roomHost(sessionId)).emit("session:ended");
}

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------
function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    try {
      out[k] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      out[k] = part.slice(i + 1).trim();
    }
  }
  return out;
}

/** Einfaches Sliding-Window-Limit pro Socket. */
function allow(times: number[], max: number, windowMs: number): boolean {
  const now = Date.now();
  while (times.length && now - times[0] > windowMs) times.shift();
  if (times.length >= max) return false;
  times.push(now);
  return true;
}

const ok = (ack: unknown, data?: unknown): void => {
  if (typeof ack === "function") (ack as AckFn)({ ok: true, data });
};
const fail = (ack: unknown, error: string): void => {
  if (typeof ack === "function") (ack as AckFn)({ ok: false, error });
};

function handler<T>(socket: Socket, event: string, fn: (payload: T, ack: AckFn) => Promise<unknown>) {
  socket.on(event, async (payload: T, ack: AckFn) => {
    try {
      await fn(payload, ack);
    } catch (err) {
      if (err instanceof ResponseValidationError) return fail(ack, err.code);
      if (err instanceof z.ZodError) return fail(ack, "invalid_payload");
      logger.error({ err, event }, "Socket-Handler-Fehler");
      fail(ack, "internal_error");
    }
  });
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

// ---------------------------------------------------------------------------
// Teilnehmer
// ---------------------------------------------------------------------------
async function onParticipant(socket: Socket, data: ParticipantData) {
  const sid = data.sessionId;
  const pid = data.participantId;
  socket.join([roomAudience(sid), roomParticipant(pid)]);
  await markOnline(sid, pid);
  dirtyCount.add(sid);

  socket.on("disconnect", async () => {
    await markOffline(sid, pid).catch(() => undefined);
    dirtyCount.add(sid);
    prisma.participant.update({ where: { id: pid }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
  });

  handler(socket, "audience:me", async (_p, ack) => {
    const rt = await loadRuntime(sid);
    if (!rt) return fail(ack, "not_found");
    ok(ack, { myResponses: await myResponses(rt, pid), myScore: await myScore(rt, pid) });
  });

  handler(socket, "participant:name", async (p: { name?: string }, ack) => {
    const name = z.string().trim().min(1).max(40).parse(p?.name);
    const filter = await getWordFilter();
    if (containsFilteredWord(name, filter)) return fail(ack, "name_filtered");
    await prisma.participant.update({ where: { id: pid }, data: { name } });
    data.name = name;
    invalidateLeaderboard(sid);
    ok(ack, { name });
  });

  handler(socket, "survey:open", async (p: { slideId: string }, ack) => {
    const rt = await loadRuntime(sid);
    if (!rt || rt.mode !== "SURVEY") return fail(ack, "not_survey");
    const slide = rt.slides.find((s) => s.id === p?.slideId);
    if (!slide || !isQuiz(slide.type)) return ok(ack);
    const gen = slideState(rt, slide.id).generation;
    const key = `pd:qs:${sid}:${slide.id}:${gen}:${pid}`;
    await redis.set(key, String(Date.now()), "EX", 86400 * 2, "NX");
    const started = Number(await redis.get(key));
    ok(ack, { startedAt: started, serverTime: Date.now() });
  });

  handler(socket, "audience:questions", async (p: { slideId: string }, ack) => {
    const rt = await loadRuntime(sid);
    if (!rt) return fail(ack, "not_found");
    const slide = rt.slides.find((s) => s.id === p?.slideId);
    if (!slide || slide.type !== "qa") return ok(ack, []);
    if (rt.mode === "PRESENTER" && currentSlide(rt)?.id !== slide.id) return ok(ack, []);
    ok(ack, audienceQuestions(await questionsFor(rt, slide.id)));
  });

  handler(socket, "audience:results", async (p: { slideId: string }, ack) => {
    const rt = await loadRuntime(sid);
    if (!rt) return fail(ack, "not_found");
    const slide = rt.slides.find((s) => s.id === p?.slideId);
    if (!slide || !isInteractive(slide.type)) return ok(ack, null);
    if (rt.mode === "PRESENTER" && currentSlide(rt)?.id !== slide.id) return ok(ack, null);
    ok(ack, audienceResults(rt, slide, await hostResults(rt, slide)));
  });

  handler(socket, "participant:respond", async (p: { slideId: string; value: unknown }, ack) => {
    if (!allow(data.votes, env.RATE_LIMIT_VOTES_PER_10S, 10_000)) return fail(ack, "rate_limited");
    const rt = await loadRuntime(sid);
    if (!rt) return fail(ack, "not_found");
    if (rt.ended) return fail(ack, "session_ended");
    const slide = rt.slides.find((s) => s.id === p?.slideId);
    if (!slide || !isInteractive(slide.type)) return fail(ack, "unknown_slide");
    if (rt.mode === "PRESENTER" && currentSlide(rt)?.id !== slide.id) return fail(ack, "not_current");
    const st = slideState(rt, slide.id);
    const now = Date.now();
    if (rt.mode === "PRESENTER" && isClosed(st, now)) return fail(ack, "closed");

    let elapsed: number | null = null;
    if (isQuiz(slide.type)) {
      const cfg = slide.config as SlideConfigMap["quiz_choice"];
      if (rt.mode === "PRESENTER") {
        if (!st.quizStartedAt) return fail(ack, "not_started");
        if (isRevealed(st, now)) return fail(ack, "closed");
        elapsed = now - st.quizStartedAt;
      } else {
        const started = Number(await redis.get(`pd:qs:${sid}:${slide.id}:${st.generation}:${pid}`)) || now;
        elapsed = now - started;
        if (elapsed > cfg.timeLimit * 1000 + 1500) return fail(ack, "closed");
      }
    }

    const value = validateResponse(slide, p.value);

    // Doppelabstimmung verhindern (atomar über Redis).
    const multi = slide.settings.allowMultipleSubmissions && !isQuiz(slide.type);
    const key = `pd:v:${sid}:${slide.id}:${st.generation}:${pid}`;
    if (!multi) {
      const set = await redis.set(key, "1", "EX", 86400 * 2, "NX");
      if (!set) return fail(ack, "already_answered");
    } else {
      const n = await redis.incr(key);
      if (n === 1) await redis.expire(key, 86400 * 2);
      const limit = slide.settings.responseLimit ?? 100;
      if (n > limit) {
        await redis.decr(key);
        return fail(ack, "limit_reached");
      }
    }

    let isCorrect: boolean | null = null;
    let points = 0;
    if (slide.type === "quiz_choice") {
      const cfg = slide.config as SlideConfigMap["quiz_choice"];
      isCorrect = sameSet((value as { optionIds: string[] }).optionIds, cfg.correctOptionIds);
      points = computeQuizPoints({ correct: isCorrect, elapsedMs: elapsed ?? 0, timeLimitMs: cfg.timeLimit * 1000, basePoints: cfg.basePoints });
    } else if (slide.type === "quiz_text") {
      const cfg = slide.config as SlideConfigMap["quiz_text"];
      isCorrect = matchesTextAnswer((value as { text: string }).text, cfg.correctAnswers, cfg);
      points = computeQuizPoints({ correct: isCorrect, elapsedMs: elapsed ?? 0, timeLimitMs: cfg.timeLimit * 1000, basePoints: cfg.basePoints });
    }

    let status: "APPROVED" | "PENDING" | "REJECTED" = "APPROVED";
    if (slide.type === "open_ended") {
      const text = responseText(slide.type, value) ?? "";
      if (containsFilteredWord(text, await getWordFilter())) status = "REJECTED";
      else if (slide.settings.moderation) status = "PENDING";
    }

    const id = crypto.randomUUID();
    writeBuffer.push({
      id,
      sessionId: sid,
      slideId: slide.id,
      participantId: pid,
      value: value as Prisma.InputJsonValue,
      status,
      isCorrect,
      points,
      timeMs: elapsed,
    });
    const reveal = rt.mode === "SURVEY";
    ok(ack, {
      id,
      status: status === "REJECTED" ? "PENDING" : status,
      ...(reveal && isQuiz(slide.type) ? { isCorrect, points } : {}),
    });
  });

  handler(socket, "participant:react", async (p: { reaction: Reaction }, ack) => {
    if (!REACTIONS.includes(p?.reaction)) return fail(ack, "invalid");
    if (!allow(data.reactions, 15, 10_000)) return fail(ack, "rate_limited");
    const rt = await loadRuntime(sid);
    if (!rt || !rt.state.reactionsEnabled || rt.ended) return fail(ack, "disabled");
    io?.to(roomHost(sid)).emit("reaction", { reaction: p.reaction, id: crypto.randomUUID() });
    ok(ack);
  });

  handler(socket, "qa:ask", async (p: { slideId: string; text: string }, ack) => {
    if (!allow(data.votes, env.RATE_LIMIT_VOTES_PER_10S, 10_000)) return fail(ack, "rate_limited");
    const rt = await loadRuntime(sid);
    if (!rt || rt.ended) return fail(ack, "session_ended");
    const slide = rt.slides.find((s) => s.id === p?.slideId);
    if (!slide || slide.type !== "qa") return fail(ack, "unknown_slide");
    if (rt.mode === "PRESENTER" && currentSlide(rt)?.id !== slide.id) return fail(ack, "not_current");
    if (rt.mode === "PRESENTER" && isClosed(slideState(rt, slide.id))) return fail(ack, "closed");
    const cfg = slide.config as SlideConfigMap["qa"];
    const text = z.string().trim().min(1).max(cfg.maxLength).parse(p.text);
    const status = containsFilteredWord(text, await getWordFilter())
      ? "REJECTED"
      : slide.settings.moderation
        ? "PENDING"
        : "APPROVED";
    const q = await prisma.question.create({ data: { sessionId: sid, slideId: slide.id, participantId: pid, text, status } });
    markDirty(dirtyQa, sid, slide.id);
    ok(ack, { id: q.id, status: status === "REJECTED" ? "PENDING" : status });
  });

  handler(socket, "qa:upvote", async (p: { questionId: string }, ack) => {
    if (!allow(data.votes, env.RATE_LIMIT_VOTES_PER_10S * 2, 10_000)) return fail(ack, "rate_limited");
    const q = await prisma.question.findUnique({ where: { id: String(p?.questionId) } });
    if (!q || q.sessionId !== sid) return fail(ack, "not_found");
    const rt = await loadRuntime(sid);
    const slide = rt?.slides.find((s) => s.id === q.slideId);
    if (!slide || !(slide.config as SlideConfigMap["qa"]).allowUpvotes) return fail(ack, "disabled");
    const existing = await prisma.questionUpvote.findUnique({
      where: { questionId_participantId: { questionId: q.id, participantId: pid } },
    });
    if (existing) await prisma.questionUpvote.delete({ where: { questionId_participantId: { questionId: q.id, participantId: pid } } });
    else await prisma.questionUpvote.create({ data: { questionId: q.id, participantId: pid } });
    markDirty(dirtyQa, sid, q.slideId);
    ok(ack, { upvoted: !existing });
  });

  // Erst nach Registrierung aller Handler den Anfangszustand senden.
  const rt = await loadRuntime(sid);
  if (!rt) {
    socket.disconnect(true);
    return;
  }
  socket.emit("audience:init", {
    ...(await audienceBroadcast(rt)),
    myResponses: await myResponses(rt, pid),
    myScore: await myScore(rt, pid),
    participant: { id: pid, name: data.name },
    myQuestions: (await prisma.question.findMany({ where: { sessionId: sid, participantId: pid }, select: { id: true } })).map((q) => q.id),
    myUpvotes: (await prisma.questionUpvote.findMany({ where: { participantId: pid, question: { sessionId: sid } }, select: { questionId: true } })).map((u) => u.questionId),
  });

}

// ---------------------------------------------------------------------------
// Präsentator / Beamer
// ---------------------------------------------------------------------------
async function onHost(socket: Socket, data: HostData) {
  const sid = data.sessionId;
  socket.join(roomHost(sid));
  const sendInitial = async () => {
    const rt0 = await loadRuntime(sid);
    if (!rt0) {
      socket.disconnect(true);
      return;
    }
    socket.emit("host:state", await hostState(rt0));
  };
  if (data.kind !== "host") return sendInitial(); // Beamer ist nur lesend

  const withRt = async (ack: AckFn, fn: (rt: Runtime) => Promise<unknown>) => {
    const rt = await loadRuntime(sid);
    if (!rt) return fail(ack, "not_found");
    if (rt.ended) return fail(ack, "session_ended");
    await fn(rt);
  };

  const commit = async (rt: Runtime, ack: AckFn) => {
    // Auflösungen/Resets beeinflussen das Leaderboard → neu berechnen und senden.
    invalidateLeaderboard(rt.id);
    dirtyLeaderboard.add(rt.id);
    await persistState(rt);
    scheduleTimer(rt);
    await broadcastState(rt);
    ok(ack);
  };

  handler(socket, "host:sync", async (_p, ack) => {
    const rt = await loadRuntime(sid, true);
    if (!rt) return fail(ack, "not_found");
    ok(ack, await hostState(rt));
  });

  handler(socket, "presenter:goto", async (p: { index: number }, ack) =>
    withRt(ack, async (rt) => {
      const index = z.number().int().min(0).max(rt.slides.length - 1).parse(p?.index);
      rt.state.currentIndex = index;
      await commit(rt, ack);
    }),
  );

  const patchSlide = (field: (st: SlideLiveState) => Partial<SlideLiveState>) =>
    async (p: { slideId?: string }, ack: AckFn) =>
      withRt(ack, async (rt) => {
        const slideId = p?.slideId ?? currentSlide(rt)?.id;
        const slide = rt.slides.find((s) => s.id === slideId);
        if (!slide) return fail(ack, "unknown_slide");
        setSlideState(rt, slide.id, field(slideState(rt, slide.id)));
        await commit(rt, ack);
      });

  handler(socket, "presenter:toggleResults", async (p: { slideId?: string; visible?: boolean }, ack) =>
    withRt(ack, async (rt) => {
      const slide = rt.slides.find((s) => s.id === (p?.slideId ?? currentSlide(rt)?.id));
      if (!slide) return fail(ack, "unknown_slide");
      const st = slideState(rt, slide.id);
      setSlideState(rt, slide.id, { resultsVisible: p?.visible ?? !areResultsVisible(slide, st) });
      await commit(rt, ack);
    }),
  );
  handler(socket, "presenter:lock", patchSlide((st) => ({ locked: !st.locked })));
  handler(socket, "presenter:reveal", patchSlide((st) => ({ revealed: true, timerEndsAt: st.quizStartedAt ? null : st.timerEndsAt })));

  handler(socket, "presenter:startTimer", async (p: { slideId?: string; seconds?: number | null }, ack) =>
    withRt(ack, async (rt) => {
      const slide = rt.slides.find((s) => s.id === (p?.slideId ?? currentSlide(rt)?.id));
      if (!slide) return fail(ack, "unknown_slide");
      if (p?.seconds === null) {
        setSlideState(rt, slide.id, { timerEndsAt: null });
      } else {
        const secs = z.number().int().min(3).max(3600).parse(p?.seconds ?? slide.settings.timerSeconds ?? 30);
        setSlideState(rt, slide.id, { timerEndsAt: Date.now() + secs * 1000, timerDone: false, locked: false });
      }
      await commit(rt, ack);
    }),
  );

  handler(socket, "presenter:startQuiz", async (p: { slideId?: string }, ack) =>
    withRt(ack, async (rt) => {
      const slide = rt.slides.find((s) => s.id === (p?.slideId ?? currentSlide(rt)?.id));
      if (!slide || !isQuiz(slide.type)) return fail(ack, "not_quiz");
      const st = slideState(rt, slide.id);
      if (st.quizStartedAt) return fail(ack, "already_started");
      const limit = (slide.config as SlideConfigMap["quiz_choice"]).timeLimit;
      const now = Date.now();
      setSlideState(rt, slide.id, { quizStartedAt: now, timerEndsAt: now + limit * 1000, timerDone: false, revealed: false, locked: false });
      await commit(rt, ack);
    }),
  );

  handler(socket, "presenter:reset", async (p: { slideId?: string }, ack) =>
    withRt(ack, async (rt) => {
      const slide = rt.slides.find((s) => s.id === (p?.slideId ?? currentSlide(rt)?.id));
      if (!slide) return fail(ack, "unknown_slide");
      await flushWrites();
      await prisma.$transaction([
        prisma.response.deleteMany({ where: { sessionId: sid, slideId: slide.id } }),
        prisma.question.deleteMany({ where: { sessionId: sid, slideId: slide.id } }),
      ]);
      const gen = slideState(rt, slide.id).generation + 1;
      rt.state.slides[slide.id] = {
        resultsVisible: null,
        locked: false,
        timerEndsAt: null,
        quizStartedAt: null,
        revealed: false,
        generation: gen,
        timerDone: false,
      };
      invalidateLeaderboard(sid);
      dirtyLeaderboard.add(sid);
      markDirty(dirtyResults, sid, slide.id);
      if (slide.type === "qa") markDirty(dirtyQa, sid, slide.id);
      await commit(rt, ack);
    }),
  );

  handler(socket, "presenter:settings", async (p: Partial<{ showJoinBanner: boolean; reactionsEnabled: boolean; qrFullscreen: boolean }>, ack) =>
    withRt(ack, async (rt) => {
      const body = z
        .object({ showJoinBanner: z.boolean(), reactionsEnabled: z.boolean(), qrFullscreen: z.boolean() })
        .partial()
        .parse(p ?? {});
      Object.assign(rt.state, body);
      await commit(rt, ack);
    }),
  );

  handler(socket, "presenter:moderate", async (p: { kind: "response" | "question"; id: string; status: "APPROVED" | "REJECTED" }, ack) => {
    const body = z
      .object({ kind: z.enum(["response", "question"]), id: z.string(), status: z.enum(["APPROVED", "REJECTED"]) })
      .parse(p);
    await flushWrites();
    if (body.kind === "response") {
      const r = await prisma.response.findUnique({ where: { id: body.id } });
      if (!r || r.sessionId !== sid) return fail(ack, "not_found");
      await prisma.response.update({ where: { id: r.id }, data: { status: body.status } });
      markDirty(dirtyResults, sid, r.slideId);
    } else {
      const q = await prisma.question.findUnique({ where: { id: body.id } });
      if (!q || q.sessionId !== sid) return fail(ack, "not_found");
      await prisma.question.update({ where: { id: q.id }, data: { status: body.status } });
      markDirty(dirtyQa, sid, q.slideId);
    }
    ok(ack);
  });

  handler(socket, "presenter:deleteResponse", async (p: { id: string }, ack) => {
    await flushWrites();
    const r = await prisma.response.findUnique({ where: { id: String(p?.id) } });
    if (!r || r.sessionId !== sid) return fail(ack, "not_found");
    await prisma.response.delete({ where: { id: r.id } });
    markDirty(dirtyResults, sid, r.slideId);
    if (r.isCorrect !== null) dirtyLeaderboard.add(sid);
    ok(ack);
  });

  handler(socket, "presenter:deleteQuestion", async (p: { id: string }, ack) => {
    const q = await prisma.question.findUnique({ where: { id: String(p?.id) } });
    if (!q || q.sessionId !== sid) return fail(ack, "not_found");
    await prisma.question.delete({ where: { id: q.id } });
    markDirty(dirtyQa, sid, q.slideId);
    ok(ack);
  });

  handler(socket, "qa:answered", async (p: { questionId: string; answered: boolean }, ack) => {
    const q = await prisma.question.findUnique({ where: { id: String(p?.questionId) } });
    if (!q || q.sessionId !== sid) return fail(ack, "not_found");
    await prisma.question.update({ where: { id: q.id }, data: { answered: !!p.answered } });
    markDirty(dirtyQa, sid, q.slideId);
    ok(ack);
  });

  handler(socket, "host:participants", async (_p, ack) => {
    const list = await prisma.participant.findMany({
      where: { sessionId: sid, kicked: false },
      select: { id: true, name: true, createdAt: true, _count: { select: { responses: true } } },
      orderBy: { createdAt: "asc" },
    });
    const online = new Set(Object.keys(await redis.hgetall(`pd:online:${sid}`)));
    ok(
      ack,
      list.map((x) => ({ id: x.id, name: x.name, responses: x._count.responses, online: online.has(x.id) })),
    );
  });

  handler(socket, "presenter:kick", async (p: { participantId: string }, ack) => {
    const pid = String(p?.participantId);
    const part = await prisma.participant.findUnique({ where: { id: pid } });
    if (!part || part.sessionId !== sid) return fail(ack, "not_found");
    await flushWrites();
    await prisma.$transaction([
      prisma.participant.update({ where: { id: pid }, data: { kicked: true } }),
      prisma.response.deleteMany({ where: { participantId: pid } }),
      prisma.question.deleteMany({ where: { participantId: pid } }),
      prisma.questionUpvote.deleteMany({ where: { participantId: pid } }),
    ]);
    io?.to(roomParticipant(pid)).emit("kicked");
    io?.in(roomParticipant(pid)).disconnectSockets(true);
    await forceOffline(sid, pid);
    dirtyCount.add(sid);
    const rt = await loadRuntime(sid);
    for (const s of rt?.slides ?? []) {
      if (isInteractive(s.type)) markDirty(dirtyResults, sid, s.id);
      if (s.type === "qa") markDirty(dirtyQa, sid, s.id);
    }
    invalidateLeaderboard(sid);
    dirtyLeaderboard.add(sid);
    ok(ack);
  });

  await sendInitial();
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
const participantAuth = z.object({
  role: z.literal("participant"),
  code: z.string().regex(/^\d{6}$/),
  deviceId: z.string().min(8).max(64),
  name: z.string().trim().max(40).optional().nullable(),
});
const hostAuth = z.object({ role: z.enum(["host", "screen"]), sessionId: z.string().min(1).max(64) });

export function attachSocketServer(server: HttpServer) {
  io = new Server(server, {
    path: "/socket.io",
    serveClient: false,
    transports: ["websocket", "polling"],
    pingInterval: 20_000,
    pingTimeout: 25_000,
    maxHttpBufferSize: 64 * 1024,
    cors: { origin: false },
  });
  io.adapter(createAdapter(createRedis(), createRedis()));

  io.use(async (socket, next) => {
    try {
      const auth = socket.handshake.auth ?? {};
      if (auth.role === "participant") {
        const a = participantAuth.parse(auth);
        const rt = await findActiveByCode(a.code);
        if (!rt) return next(new Error("session_not_found"));
        const name = a.name?.trim() || null;
        if (name && containsFilteredWord(name, await getWordFilter())) return next(new Error("name_filtered"));
        const part = await prisma.participant.upsert({
          where: { sessionId_deviceId: { sessionId: rt.id, deviceId: a.deviceId } },
          create: { sessionId: rt.id, deviceId: a.deviceId, name },
          update: { lastSeenAt: new Date(), ...(name ? { name } : {}) },
        });
        if (part.kicked) return next(new Error("kicked"));
        if (rt.settings.requireNames && !part.name) return next(new Error("name_required"));
        socket.data = {
          kind: "participant",
          sessionId: rt.id,
          participantId: part.id,
          name: part.name,
          votes: [],
          reactions: [],
        } satisfies ParticipantData;
        return next();
      }
      const a = hostAuth.parse(auth);
      const cookies = parseCookies(socket.handshake.headers.cookie);
      const user = await userFromToken(cookies[SESSION_COOKIE]);
      if (!user) return next(new Error("unauthorized"));
      const s = await prisma.liveSession.findUnique({ where: { id: a.sessionId }, select: { presentationId: true } });
      if (!s) return next(new Error("session_not_found"));
      const access = await presentationAccess(user, s.presentationId);
      if (!access) return next(new Error("forbidden"));
      if (a.role === "host" && access === "view") return next(new Error("forbidden"));
      socket.data = { kind: a.role, sessionId: a.sessionId, userId: user.id } satisfies HostData;
      return next();
    } catch (err) {
      if (err instanceof z.ZodError) return next(new Error("invalid_auth"));
      logger.error({ err }, "Socket-Auth-Fehler");
      return next(new Error("internal_error"));
    }
  });

  io.on("connection", (socket) => {
    const data = socket.data as SocketData;
    const run = data.kind === "participant" ? onParticipant(socket, data) : onHost(socket, data);
    run.catch((err) => {
      logger.error({ err }, "Socket-Verbindungsfehler");
      socket.disconnect(true);
    });
  });

  // Laufende Countdowns nach einem Neustart wieder einplanen.
  prisma.liveSession
    .findMany({ where: { status: "ACTIVE" }, select: { id: true } })
    .then(async (list) => {
      for (const s of list) {
        await clearPresence(s.id);
        const rt = await loadRuntime(s.id);
        if (rt) scheduleTimer(rt);
      }
    })
    .catch(() => undefined);

  return io;
}

export async function shutdownLive() {
  await flushWrites();
  await new Promise<void>((resolve) => (io ? io.close(() => resolve()) : resolve()));
}

