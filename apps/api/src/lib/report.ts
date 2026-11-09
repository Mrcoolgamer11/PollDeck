import type { Slide, SlideConfigMap, SlideResults, LeaderboardEntry, QaQuestion } from "@polldeck/shared";

export const TYPE_LABELS: Record<string, string> = {
  multiple_choice: "Multiple Choice",
  word_cloud: "Wortwolke",
  open_ended: "Offene Frage",
  scale: "Skala",
  ranking: "Ranking",
  points_100: "100 Punkte",
  grid_2x2: "Rasterfrage (2×2)",
  number_guess: "Zahl schätzen",
  qa: "Q&A",
  quiz_choice: "Quiz – Auswahl",
  quiz_text: "Quiz – Texteingabe",
  content: "Inhaltsfolie",
  leaderboard: "Leaderboard",
};

function optionLabel(slide: Slide, id: string): string {
  const cfg = slide.config as { options?: { id: string; label: string }[] };
  return cfg.options?.find((o) => o.id === id)?.label ?? id;
}

/** Lesbare Darstellung einer einzelnen Antwort. */
export function formatAnswer(slide: Slide, value: unknown): string {
  const v = value as Record<string, unknown>;
  switch (slide.type) {
    case "multiple_choice":
    case "quiz_choice":
      return ((v.optionIds as string[]) ?? []).map((id) => optionLabel(slide, id)).join(", ");
    case "word_cloud":
      return ((v.words as string[]) ?? []).join(", ");
    case "open_ended":
    case "quiz_text":
      return String(v.text ?? "");
    case "scale": {
      const cfg = slide.config as SlideConfigMap["scale"];
      const r = (v.ratings as Record<string, number | null>) ?? {};
      return cfg.statements.map((s) => `${s.label}: ${r[s.id] ?? "–"}`).join("; ");
    }
    case "ranking":
      return ((v.order as string[]) ?? []).map((id, i) => `${i + 1}. ${optionLabel(slide, id)}`).join("; ");
    case "points_100": {
      const p = (v.points as Record<string, number>) ?? {};
      return Object.entries(p)
        .filter(([, n]) => n > 0)
        .map(([id, n]) => `${optionLabel(slide, id)}: ${n}`)
        .join("; ");
    }
    case "grid_2x2": {
      const cfg = slide.config as SlideConfigMap["grid_2x2"];
      const r = (v.ratings as Record<string, { x: number; y: number }>) ?? {};
      return cfg.items
        .filter((i) => r[i.id])
        .map((i) => `${i.label}: ${cfg.xLabel || "x"}=${r[i.id].x}, ${cfg.yLabel || "y"}=${r[i.id].y}`)
        .join("; ");
    }
    case "number_guess":
      return String(v.value ?? "");
    default:
      return JSON.stringify(value);
  }
}

/** Zusammengefasste Ergebnisse als Tabellenzeilen [Bezeichnung, Wert]. */
export function summaryRows(
  slide: Slide,
  results: SlideResults | undefined,
  extra: { questions?: QaQuestion[]; leaderboard?: LeaderboardEntry[] } = {},
): [string, string | number][] {
  if (slide.type === "qa") {
    return (extra.questions ?? []).map((q) => [q.text, `${q.upvotes} ▲${q.answered ? " (beantwortet)" : ""}`]);
  }
  if (slide.type === "leaderboard") {
    return (extra.leaderboard ?? []).slice(0, 50).map((e) => [`${e.rank}. ${e.name || "Anonym"}`, e.score]);
  }
  if (!results) return [];
  switch (results.kind) {
    case "choice": {
      const correct = new Set(results.correctOptionIds ?? []);
      return Object.entries(results.counts).map(([id, n]) => [
        `${optionLabel(slide, id)}${correct.has(id) ? " ✓" : ""}`,
        n,
      ]);
    }
    case "words":
      return results.words.slice(0, 50).map((w) => [w.text, w.count]);
    case "open":
      return results.items.filter((i) => i.status === "APPROVED").map((i) => [i.text, i.name ?? ""]);
    case "scale": {
      const cfg = slide.config as SlideConfigMap["scale"];
      return cfg.statements.map((s) => [
        s.label,
        results.statements[s.id]?.average !== null && results.statements[s.id]
          ? `Ø ${results.statements[s.id].average} (n=${results.statements[s.id].count})`
          : "–",
      ]);
    }
    case "ranking":
      return results.ranking.map((r, i) => [`${i + 1}. ${optionLabel(slide, r.optionId)}`, r.score]);
    case "points":
      return Object.entries(results.totals).map(([id, n]) => [optionLabel(slide, id), `${n} (Ø ${results.averages[id]})`]);
    case "grid": {
      const cfg = slide.config as SlideConfigMap["grid_2x2"];
      return cfg.items.map((i) => {
        const r = results.items[i.id];
        return [i.label, r && r.count ? `${cfg.xLabel || "x"} Ø ${r.x}, ${cfg.yLabel || "y"} Ø ${r.y} (n=${r.count})` : "–"];
      });
    }
    case "number":
      return [
        ["Antworten", results.count],
        ["Mittelwert", results.mean ?? "–"],
        ["Median", results.median ?? "–"],
        ["Minimum", results.min ?? "–"],
        ["Maximum", results.max ?? "–"],
        ...(results.correctAnswer !== null && results.correctAnswer !== undefined
          ? ([["Richtige Antwort", results.correctAnswer]] as [string, number][])
          : []),
      ];
    case "quiz_text":
      return [
        ["Richtige Antworten", results.correctCount],
        ...results.answers.slice(0, 30).map((a) => [`${a.text}${a.correct ? " ✓" : ""}`, a.count] as [string, number]),
      ];
    default:
      return [];
  }
}
