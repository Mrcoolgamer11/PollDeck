/**
 * Punkte nach Geschwindigkeit: Wer sofort richtig antwortet, erhält die vollen
 * Basispunkte; wer erst am Ende des Countdowns antwortet, noch die Hälfte.
 * Falsche oder zu späte Antworten erhalten 0 Punkte.
 */
export function computeQuizPoints(params: {
  correct: boolean;
  elapsedMs: number;
  timeLimitMs: number;
  basePoints?: number;
}): number {
  const base = params.basePoints ?? 1000;
  if (!params.correct) return 0;
  if (params.timeLimitMs <= 0) return base;
  if (params.elapsedMs > params.timeLimitMs + 1500) return 0; // Netzwerk-Toleranz 1,5 s
  const ratio = Math.min(1, Math.max(0, params.elapsedMs / params.timeLimitMs));
  return Math.round(base * (1 - ratio / 2));
}

export interface LeaderboardEntry {
  participantId: string;
  name: string;
  score: number;
  correct: number;
  rank: number;
}

/** Summiert Punkte pro Teilnehmer und vergibt Ränge (gleiche Punkte = gleicher Rang). */
export function computeLeaderboard(
  responses: { participantId: string; points?: number; isCorrect?: boolean | null }[],
  names: Record<string, string | null | undefined>,
): LeaderboardEntry[] {
  const map = new Map<string, { score: number; correct: number }>();
  for (const r of responses) {
    const e = map.get(r.participantId) ?? { score: 0, correct: 0 };
    e.score += r.points ?? 0;
    if (r.isCorrect) e.correct++;
    map.set(r.participantId, e);
  }
  const sorted = [...map.entries()]
    .map(([participantId, e]) => ({
      participantId,
      name: names[participantId] || "",
      score: e.score,
      correct: e.correct,
      rank: 0,
    }))
    .sort((a, b) => b.score - a.score || b.correct - a.correct || a.name.localeCompare(b.name));
  let lastScore = -1;
  let lastRank = 0;
  sorted.forEach((e, i) => {
    if (e.score !== lastScore) {
      lastRank = i + 1;
      lastScore = e.score;
    }
    e.rank = lastRank;
  });
  return sorted;
}
