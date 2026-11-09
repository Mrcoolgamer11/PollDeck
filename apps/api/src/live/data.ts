import {
  areResultsVisible,
  computeLeaderboard,
  computeResults,
  hideSolutions,
  isInteractive,
  isQuiz,
  isRevealed,
  sanitizeSlideForAudience,
  type AudienceBroadcast,
  type HostState,
  type LeaderboardEntry,
  type MyResponse,
  type QaQuestion,
  type Slide,
  type SlideResults,
} from "@polldeck/shared";
import { prisma } from "../lib/prisma.js";
import { getWordFilter } from "../lib/settings.js";
import { env } from "../env.js";
import { onlineCount } from "./presence.js";
import { currentSlide, slideState, type Runtime } from "./runtime.js";

/** Ergebnisse einer Folie für die Präsentator-Ansicht (inkl. offener Moderation). */
export async function hostResults(rt: Runtime, slide: Slide): Promise<SlideResults> {
  if (!isInteractive(slide.type)) return { kind: "none", voters: 0 };
  const rows = await prisma.response.findMany({
    where: { sessionId: rt.id, slideId: slide.id },
    select: {
      id: true,
      participantId: true,
      value: true,
      status: true,
      points: true,
      isCorrect: true,
      createdAt: true,
      participant: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return computeResults(
    slide,
    rows.map((r) => ({ ...r, participantName: r.participant.name })),
    { wordFilter: await getWordFilter() },
  );
}

/** Ergebnisse, wie sie Teilnehmer sehen dürfen (ohne unmoderierte Antworten und Lösungen). */
export function audienceResults(rt: Runtime, slide: Slide, results: SlideResults): SlideResults | null {
  const st = slideState(rt, slide.id);
  if (!slide.settings.showResultsToAudience || !areResultsVisible(slide, st)) return null;
  if (isQuiz(slide.type) && !isRevealed(st) && rt.mode === "PRESENTER") return null;
  let r = results;
  if (r.kind === "open") r = { ...r, items: r.items.filter((i) => i.status === "APPROVED").map((i) => ({ ...i, status: "APPROVED" })) };
  if (isQuiz(slide.type) || slide.type === "number_guess") {
    if (!isRevealed(st) && rt.mode === "PRESENTER") r = hideSolutions(r);
  }
  return r;
}

export async function questionsFor(rt: Runtime, slideId: string): Promise<QaQuestion[]> {
  const rows = await prisma.question.findMany({
    where: { sessionId: rt.id, slideId, status: { not: "REJECTED" } },
    select: { id: true, text: true, answered: true, status: true, createdAt: true, _count: { select: { upvotes: true } } },
  });
  return rows
    .map((q) => ({
      id: q.id,
      text: q.text,
      answered: q.answered,
      status: q.status,
      createdAt: q.createdAt.toISOString(),
      upvotes: q._count.upvotes,
    }))
    .sort((a, b) => Number(a.answered) - Number(b.answered) || b.upvotes - a.upvotes || a.createdAt.localeCompare(b.createdAt));
}

export const audienceQuestions = (qs: QaQuestion[]) => qs.filter((q) => q.status === "APPROVED");

const lbCache = new Map<string, { at: number; data: LeaderboardEntry[] }>();
export function invalidateLeaderboard(sessionId: string) {
  lbCache.delete(sessionId);
}

export async function leaderboard(rt: Runtime): Promise<LeaderboardEntry[]> {
  const hit = lbCache.get(rt.id);
  if (hit && Date.now() - hit.at < 1000) return hit.data;
  const quizSlideIds = rt.slides.filter((s) => isQuiz(s.type)).map((s) => s.id);
  if (!quizSlideIds.length) return [];
  const [responses, participants] = await Promise.all([
    prisma.response.findMany({
      where: { sessionId: rt.id, slideId: { in: quizSlideIds } },
      select: { participantId: true, points: true, isCorrect: true, slideId: true },
    }),
    prisma.participant.findMany({ where: { sessionId: rt.id, kicked: false }, select: { id: true, name: true } }),
  ]);
  // Im Präsentationsmodus zählen nur aufgelöste Fragen.
  const visible =
    rt.mode === "PRESENTER" ? responses.filter((r) => isRevealed(slideState(rt, r.slideId))) : responses;
  const names = Object.fromEntries(participants.map((p) => [p.id, p.name]));
  const data = computeLeaderboard(visible.filter((r) => r.participantId in names), names);
  lbCache.set(rt.id, { at: Date.now(), data });
  return data;
}

export async function myScore(rt: Runtime, participantId: string) {
  const lb = await leaderboard(rt);
  const me = lb.find((e) => e.participantId === participantId);
  return { score: me?.score ?? 0, rank: me?.rank ?? null };
}

/** Öffentlicher Zustand für alle Teilnehmer einer Sitzung. */
export async function audienceBroadcast(rt: Runtime): Promise<AudienceBroadcast> {
  const base = {
    sessionId: rt.id,
    code: rt.code,
    mode: rt.mode,
    ended: rt.ended,
    title: rt.title,
    theme: rt.theme,
    settings: rt.settings,
    slideCount: rt.slides.length,
    serverTime: Date.now(),
  };
  if (rt.mode === "SURVEY") {
    return {
      ...base,
      index: 0,
      slide: null,
      slideState: null,
      results: null,
      slides: rt.slides.map((s) => sanitizeSlideForAudience(s, false)),
      slideStates: Object.fromEntries(rt.slides.map((s) => [s.id, slideState(rt, s.id)])),
    };
  }
  const slide = currentSlide(rt);
  if (!slide) return { ...base, index: rt.state.currentIndex, slide: null, slideState: null, results: null };
  const st = slideState(rt, slide.id);
  const reveal = isRevealed(st);
  const out: AudienceBroadcast = {
    ...base,
    index: rt.state.currentIndex,
    slide: sanitizeSlideForAudience(slide, reveal),
    slideState: st,
    results: isInteractive(slide.type) ? audienceResults(rt, slide, await hostResults(rt, slide)) : null,
  };
  if (slide.type === "qa") out.questions = audienceQuestions(await questionsFor(rt, slide.id));
  if (slide.type === "leaderboard") {
    const topN = (slide.config as { topN: number }).topN;
    out.leaderboard = (await leaderboard(rt)).slice(0, topN);
  }
  return out;
}

/** Eigene Antworten eines Teilnehmers (Quiz-Bewertung erst nach Auflösung). */
export async function myResponses(rt: Runtime, participantId: string): Promise<MyResponse[]> {
  const rows = await prisma.response.findMany({
    where: { sessionId: rt.id, participantId },
    select: { id: true, slideId: true, value: true, isCorrect: true, points: true, status: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => {
    const slide = rt.slides.find((s) => s.id === r.slideId);
    const hide = rt.mode === "PRESENTER" && slide && isQuiz(slide.type) && !isRevealed(slideState(rt, slide.id));
    return {
      id: r.id,
      slideId: r.slideId,
      value: r.value,
      status: r.status,
      isCorrect: hide ? null : r.isCorrect,
      points: hide ? undefined : r.points,
    };
  });
}

export async function hostState(rt: Runtime): Promise<HostState> {
  const results: HostState["results"] = {};
  const questions: HostState["questions"] = {};
  const responseCounts: Record<string, number> = {};
  const pending: HostState["pending"] = {};
  for (const s of rt.slides) {
    if (isInteractive(s.type)) {
      const r = await hostResults(rt, s);
      results[s.id] = r;
      responseCounts[s.id] = r.voters;
      if (r.kind === "open") {
        const p = r.items.filter((i) => i.status === "PENDING");
        if (p.length) pending[s.id] = p.map((i) => ({ id: i.id, text: i.text, createdAt: i.createdAt ?? "" }));
      }
    } else if (s.type === "qa") {
      const qs = await questionsFor(rt, s.id);
      questions[s.id] = qs;
      responseCounts[s.id] = qs.length;
    }
  }
  return {
    sessionId: rt.id,
    code: rt.code,
    mode: rt.mode,
    ended: rt.ended,
    presentationId: rt.presentationId,
    title: rt.title,
    theme: rt.theme,
    settings: rt.settings,
    slides: rt.slides,
    live: rt.state,
    participantCount: await onlineCount(rt.id),
    responseCounts,
    results,
    questions,
    leaderboard: await leaderboard(rt),
    pending,
    serverTime: Date.now(),
    joinUrl: `${env.APP_URL}/${rt.code}`,
  };
}
