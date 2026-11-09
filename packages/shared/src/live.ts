import type { Slide } from "./slides.js";
import type { SlideResults } from "./results.js";
import type { LeaderboardEntry } from "./quiz.js";
import type { PresentationSettings, ThemeConfig, Reaction } from "./api.js";

/** Live-Zustand einer einzelnen Folie innerhalb einer Sitzung. */
export interface SlideLiveState {
  /** null = Standard gemäß Folieneinstellung „Ergebnisse verbergen bis Freigabe“ */
  resultsVisible: boolean | null;
  locked: boolean;
  /** Countdown-Ende (ms seit Epoch) */
  timerEndsAt: number | null;
  /** Quiz: Start der Frage (ms seit Epoch) */
  quizStartedAt: number | null;
  /** Quiz: Auflösung angezeigt */
  revealed: boolean;
  /** Wird beim Zurücksetzen der Folie erhöht */
  generation: number;
  /** Ablauf des aktuellen Countdowns wurde vom Server verarbeitet */
  timerDone: boolean;
}

export const defaultSlideLiveState = (): SlideLiveState => ({
  resultsVisible: null,
  locked: false,
  timerEndsAt: null,
  quizStartedAt: null,
  revealed: false,
  generation: 0,
  timerDone: false,
});

/**
 * Folie gilt als aufgelöst, wenn der Präsentator aufgelöst hat oder der Server
 * beim Ablauf des Countdowns automatisch aufgelöst hat (Einstellung
 * „revealOnTimerEnd“). `now` bleibt für Aufrufer-Kompatibilität erhalten.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function isRevealed(st: SlideLiveState | null | undefined, _now = Date.now()): boolean {
  return !!st?.revealed;
}

/** Sind die Ergebnisse (für Beamer/Teilnehmer) freigegeben? */
export function areResultsVisible(slide: Slide, st: SlideLiveState | null | undefined): boolean {
  const v = st?.resultsVisible ?? null;
  if (v !== null) return v;
  return !slide.settings.hideResultsUntilReveal;
}

/** Abstimmung ist geschlossen (gesperrt oder Countdown abgelaufen). */
export function isClosed(st: SlideLiveState | null | undefined, now = Date.now()): boolean {
  if (!st) return false;
  return st.locked || (st.timerEndsAt !== null && now > st.timerEndsAt + 1500);
}

export interface SessionLiveState {
  currentIndex: number;
  slides: Record<string, SlideLiveState>;
  showJoinBanner: boolean;
  reactionsEnabled: boolean;
  qrFullscreen: boolean;
}

export interface QaQuestion {
  id: string;
  text: string;
  upvotes: number;
  answered: boolean;
  status: "APPROVED" | "PENDING" | "REJECTED";
  createdAt: string;
  upvotedByMe?: boolean;
  mine?: boolean;
}

/** An Teilnehmer gesendeter Zustand. */
export interface AudienceState {
  sessionId: string;
  code: string;
  mode: "PRESENTER" | "SURVEY";
  ended: boolean;
  title: string;
  theme: ThemeConfig;
  settings: PresentationSettings;
  slideCount: number;
  index: number;
  slide: Slide | null;
  slideState: SlideLiveState | null;
  /** Survey-Modus: alle Folien (ohne Lösungen) */
  slides?: Slide[];
  slideStates?: Record<string, SlideLiveState>;
  results: SlideResults | null;
  myResponses: MyResponse[];
  questions?: QaQuestion[];
  leaderboard?: LeaderboardEntry[];
  myScore?: { score: number; rank: number | null };
  serverTime: number;
  participant: { id: string; name: string | null };
}

/** An Präsentator- und Beamer-Ansicht gesendeter Zustand. */
export interface HostState {
  sessionId: string;
  code: string;
  mode: "PRESENTER" | "SURVEY";
  ended: boolean;
  presentationId: string;
  title: string;
  theme: ThemeConfig;
  settings: PresentationSettings;
  slides: Slide[];
  live: SessionLiveState;
  participantCount: number;
  responseCounts: Record<string, number>;
  results: Record<string, SlideResults>;
  questions: Record<string, QaQuestion[]>;
  leaderboard: LeaderboardEntry[];
  pending: Record<string, { id: string; text: string; createdAt: string }[]>;
  serverTime: number;
  joinUrl: string;
}

export interface MyResponse {
  id: string;
  slideId: string;
  value: unknown;
  isCorrect?: boolean | null;
  points?: number;
  status?: "APPROVED" | "PENDING" | "REJECTED";
}

/** Öffentlicher Teil des Zustands, der bei jeder Änderung an alle Teilnehmer gesendet wird. */
export type AudienceBroadcast = Omit<AudienceState, "myResponses" | "participant" | "myScore">;

export interface ReactionEvent {
  reaction: Reaction;
  id: string;
}

export type Ack<T = unknown> = (res: { ok: true; data?: T } | { ok: false; error: string }) => void;
