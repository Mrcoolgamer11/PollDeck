import { normalizeWord, containsFilteredWord, matchesTextAnswer } from "./text.js";
import type { Slide, SlideConfigMap } from "./slides.js";
import type { ResponseValueMap } from "./responses.js";

/** Minimale Antwort-Darstellung für die Ergebnisberechnung. */
export interface ResultResponse {
  id: string;
  participantId: string;
  value: unknown;
  status?: "APPROVED" | "PENDING" | "REJECTED";
  points?: number;
  isCorrect?: boolean | null;
  createdAt?: string | Date;
  participantName?: string | null;
}

export interface ChoiceResults {
  kind: "choice";
  counts: Record<string, number>;
  voters: number;
  correctOptionIds?: string[];
  correctCount?: number;
}
export interface WordCloudResults {
  kind: "words";
  words: { text: string; count: number }[];
  voters: number;
}
export interface OpenResults {
  kind: "open";
  items: { id: string; text: string; status: string; createdAt?: string; name?: string | null }[];
  voters: number;
}
export interface ScaleResults {
  kind: "scale";
  statements: Record<string, { average: number | null; count: number; distribution: Record<number, number> }>;
  voters: number;
}
export interface RankingResults {
  kind: "ranking";
  ranking: { optionId: string; score: number; averagePosition: number | null }[];
  voters: number;
}
export interface PointsResults {
  kind: "points";
  totals: Record<string, number>;
  averages: Record<string, number>;
  voters: number;
}
export interface GridResults {
  kind: "grid";
  items: Record<string, { x: number | null; y: number | null; count: number; points: { x: number; y: number }[] }>;
  voters: number;
}
export interface NumberResults {
  kind: "number";
  count: number;
  mean: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
  bins: { from: number; to: number; count: number }[];
  correctAnswer?: number | null;
  voters: number;
}
export interface QuizTextResults {
  kind: "quiz_text";
  answers: { text: string; count: number; correct: boolean }[];
  correctCount: number;
  voters: number;
  correctAnswers?: string[];
}
export interface EmptyResults {
  kind: "none";
  voters: number;
}

export type SlideResults =
  | ChoiceResults
  | WordCloudResults
  | OpenResults
  | ScaleResults
  | RankingResults
  | PointsResults
  | GridResults
  | NumberResults
  | QuizTextResults
  | EmptyResults;

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

function uniqueVoters(responses: ResultResponse[]) {
  return new Set(responses.map((r) => r.participantId)).size;
}

/** Zählt Auswahl-Stimmen pro Option. */
export function computeChoiceResults(options: { id: string }[], responses: ResultResponse[]): ChoiceResults {
  const counts: Record<string, number> = Object.fromEntries(options.map((o) => [o.id, 0]));
  for (const r of responses) {
    for (const id of (r.value as ResponseValueMap["multiple_choice"]).optionIds ?? []) {
      if (id in counts) counts[id]++;
    }
  }
  return { kind: "choice", counts, voters: uniqueVoters(responses) };
}

/**
 * Wortwolke: Begriffe werden normalisiert (Trimmen, Groß/Klein), gefilterte
 * Begriffe werden ausgeblendet. Angezeigt wird die häufigste Schreibweise.
 */
export function computeWordCloud(responses: ResultResponse[], filter: string[] = []): WordCloudResults {
  const groups = new Map<string, { count: number; spellings: Map<string, number> }>();
  for (const r of responses) {
    const seen = new Set<string>();
    for (const raw of (r.value as ResponseValueMap["word_cloud"]).words ?? []) {
      const key = normalizeWord(raw);
      if (!key || seen.has(key)) continue;
      if (containsFilteredWord(key, filter)) continue;
      seen.add(key);
      const display = raw.trim().replace(/\s+/g, " ").replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, "");
      const g = groups.get(key) ?? { count: 0, spellings: new Map() };
      g.count++;
      g.spellings.set(display, (g.spellings.get(display) ?? 0) + 1);
      groups.set(key, g);
    }
  }
  const words = [...groups.values()]
    .map((g) => {
      const best = [...g.spellings.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
      return { text: best, count: g.count };
    })
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text));
  return { kind: "words", words, voters: uniqueVoters(responses) };
}

/**
 * Gewichtete Rangliste: Bei n Optionen erhält Platz 1 n Punkte, Platz 2 n-1 …
 * Nicht einsortierte Optionen erhalten 0 Punkte.
 */
export function computeRanking(options: { id: string }[], responses: ResultResponse[]): RankingResults {
  const n = options.length;
  const score: Record<string, number> = Object.fromEntries(options.map((o) => [o.id, 0]));
  const posSum: Record<string, number> = Object.fromEntries(options.map((o) => [o.id, 0]));
  const posCount: Record<string, number> = Object.fromEntries(options.map((o) => [o.id, 0]));
  for (const r of responses) {
    const order = (r.value as ResponseValueMap["ranking"]).order ?? [];
    order.forEach((id, idx) => {
      if (!(id in score)) return;
      score[id] += n - idx;
      posSum[id] += idx + 1;
      posCount[id]++;
    });
  }
  const ranking = options
    .map((o, i) => ({
      optionId: o.id,
      score: score[o.id],
      averagePosition: posCount[o.id] ? round(posSum[o.id] / posCount[o.id]) : null,
      _i: i,
    }))
    .sort((a, b) => b.score - a.score || a._i - b._i)
    .map(({ _i, ...rest }) => rest);
  return { kind: "ranking", ranking, voters: uniqueVoters(responses) };
}

export function computeScale(cfg: SlideConfigMap["scale"], responses: ResultResponse[]): ScaleResults {
  const statements: ScaleResults["statements"] = {};
  for (const st of cfg.statements) {
    const distribution: Record<number, number> = {};
    for (let v = cfg.min; v <= cfg.max; v++) distribution[v] = 0;
    let sum = 0;
    let count = 0;
    for (const r of responses) {
      const val = (r.value as ResponseValueMap["scale"]).ratings?.[st.id];
      if (typeof val !== "number") continue;
      distribution[val] = (distribution[val] ?? 0) + 1;
      sum += val;
      count++;
    }
    statements[st.id] = { average: count ? round(sum / count) : null, count, distribution };
  }
  return { kind: "scale", statements, voters: uniqueVoters(responses) };
}

export function computePoints(options: { id: string }[], responses: ResultResponse[]): PointsResults {
  const totals: Record<string, number> = Object.fromEntries(options.map((o) => [o.id, 0]));
  for (const r of responses) {
    const pts = (r.value as ResponseValueMap["points_100"]).points ?? {};
    for (const id of Object.keys(totals)) totals[id] += pts[id] ?? 0;
  }
  const voters = uniqueVoters(responses);
  const averages = Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, voters ? round(v / voters) : 0]));
  return { kind: "points", totals, averages, voters };
}

export function computeGrid(cfg: SlideConfigMap["grid_2x2"], responses: ResultResponse[]): GridResults {
  const items: GridResults["items"] = {};
  for (const it of cfg.items) {
    const points: { x: number; y: number }[] = [];
    for (const r of responses) {
      const p = (r.value as ResponseValueMap["grid_2x2"]).ratings?.[it.id];
      if (p) points.push(p);
    }
    const count = points.length;
    items[it.id] = {
      x: count ? round(points.reduce((s, p) => s + p.x, 0) / count) : null,
      y: count ? round(points.reduce((s, p) => s + p.y, 0) / count) : null,
      count,
      points: points.slice(0, 500),
    };
  }
  return { kind: "grid", items, voters: uniqueVoters(responses) };
}

export function computeNumber(cfg: SlideConfigMap["number_guess"], responses: ResultResponse[]): NumberResults {
  const values = responses
    .map((r) => (r.value as ResponseValueMap["number_guess"]).value)
    .filter((v) => typeof v === "number")
    .sort((a, b) => a - b);
  const count = values.length;
  const binCount = 10;
  const span = cfg.max - cfg.min || 1;
  const width = span / binCount;
  const bins = Array.from({ length: binCount }, (_, i) => ({
    from: round(cfg.min + i * width),
    to: round(cfg.min + (i + 1) * width),
    count: 0,
  }));
  for (const v of values) {
    const idx = Math.min(binCount - 1, Math.max(0, Math.floor((v - cfg.min) / width)));
    bins[idx].count++;
  }
  const median = count
    ? count % 2
      ? values[(count - 1) / 2]
      : round((values[count / 2 - 1] + values[count / 2]) / 2)
    : null;
  return {
    kind: "number",
    count,
    mean: count ? round(values.reduce((s, v) => s + v, 0) / count) : null,
    median,
    min: count ? values[0] : null,
    max: count ? values[count - 1] : null,
    bins,
    correctAnswer: cfg.correctAnswer ?? null,
    voters: uniqueVoters(responses),
  };
}

export function computeQuizText(cfg: SlideConfigMap["quiz_text"], responses: ResultResponse[]): QuizTextResults {
  const groups = new Map<string, { text: string; count: number; correct: boolean }>();
  let correctCount = 0;
  for (const r of responses) {
    const text = String((r.value as ResponseValueMap["quiz_text"]).text ?? "").trim();
    const correct =
      r.isCorrect ?? matchesTextAnswer(text, cfg.correctAnswers, { caseSensitive: cfg.caseSensitive, allowTypos: cfg.allowTypos });
    if (correct) correctCount++;
    const key = normalizeWord(text);
    const g = groups.get(key) ?? { text, count: 0, correct };
    g.count++;
    groups.set(key, g);
  }
  return {
    kind: "quiz_text",
    answers: [...groups.values()].sort((a, b) => b.count - a.count),
    correctCount,
    voters: uniqueVoters(responses),
    correctAnswers: cfg.correctAnswers,
  };
}

export interface ComputeOptions {
  wordFilter?: string[];
  /** Nur freigegebene Antworten berücksichtigen (Standard: true) */
  approvedOnly?: boolean;
}

/** Berechnet die Ergebnisse einer Folie aus allen Antworten. */
export function computeResults(slide: Slide, all: ResultResponse[], opts: ComputeOptions = {}): SlideResults {
  const approvedOnly = opts.approvedOnly ?? true;
  const responses = all.filter((r) => r.status !== "REJECTED" && (!approvedOnly || r.status !== "PENDING"));
  switch (slide.type) {
    case "multiple_choice":
      return computeChoiceResults((slide.config as SlideConfigMap["multiple_choice"]).options, responses);
    case "quiz_choice": {
      const cfg = slide.config as SlideConfigMap["quiz_choice"];
      const res = computeChoiceResults(cfg.options, responses);
      return {
        ...res,
        correctOptionIds: cfg.correctOptionIds,
        correctCount: responses.filter((r) => r.isCorrect).length,
      };
    }
    case "word_cloud":
      return computeWordCloud(responses, opts.wordFilter);
    case "open_ended": {
      const list = all.filter((r) => r.status !== "REJECTED");
      return {
        kind: "open",
        items: list
          .filter((r) => !opts.wordFilter || !containsFilteredWord(String((r.value as { text: string }).text), opts.wordFilter))
          .map((r) => ({
            id: r.id,
            text: String((r.value as { text: string }).text),
            status: r.status ?? "APPROVED",
            createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : undefined,
            name: r.participantName ?? null,
          })),
        voters: uniqueVoters(list),
      };
    }
    case "scale":
      return computeScale(slide.config as SlideConfigMap["scale"], responses);
    case "ranking":
      return computeRanking((slide.config as SlideConfigMap["ranking"]).options, responses);
    case "points_100":
      return computePoints((slide.config as SlideConfigMap["points_100"]).options, responses);
    case "grid_2x2":
      return computeGrid(slide.config as SlideConfigMap["grid_2x2"], responses);
    case "number_guess":
      return computeNumber(slide.config as SlideConfigMap["number_guess"], responses);
    case "quiz_text":
      return computeQuizText(slide.config as SlideConfigMap["quiz_text"], responses);
    default:
      return { kind: "none", voters: 0 };
  }
}

/** Entfernt Lösungsinformationen aus Ergebnissen (solange das Quiz nicht aufgelöst ist). */
export function hideSolutions(results: SlideResults): SlideResults {
  if (results.kind === "choice") return { ...results, correctOptionIds: undefined, correctCount: undefined };
  if (results.kind === "quiz_text")
    return { ...results, correctAnswers: undefined, answers: [], correctCount: 0 };
  if (results.kind === "number") return { ...results, correctAnswer: null };
  return results;
}
