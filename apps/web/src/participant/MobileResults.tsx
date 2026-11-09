import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import type { Slide, SlideConfigMap, SlideResults, ThemeConfig } from "@polldeck/shared";
import { chartColor } from "../lib/theme";
import { WordCloud } from "../slides/WordCloud";

function Bar({ label, value, max, color, suffix, correct }: { label: string; value: number; max: number; color: string; suffix: string; correct?: boolean }) {
  return (
    <li>
      <div className="mb-1 flex justify-between gap-2 text-sm">
        <span className="min-w-0 break-words font-medium">
          {correct && <Check className="mr-1 inline h-4 w-4 text-emerald-500" aria-label="✓" />}
          {label}
        </span>
        <span className="shrink-0 tabular-nums opacity-80">{suffix}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-black/10">
        <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${max ? (value / max) * 100 : 0}%`, background: color }} />
      </div>
    </li>
  );
}

/** Kompakte, mobile Ergebnisdarstellung für Teilnehmer. */
export function MobileResults({ slide, results, theme }: { slide: Slide; results: SlideResults; theme: ThemeConfig }) {
  const { t } = useTranslation();
  const optLabel = (id: string) => (slide.config as { options?: { id: string; label: string }[] }).options?.find((o) => o.id === id)?.label ?? id;
  switch (results.kind) {
    case "choice": {
      const total = Object.values(results.counts).reduce((s, v) => s + v, 0);
      const max = Math.max(1, ...Object.values(results.counts));
      return (
        <ul className="space-y-3">
          {Object.entries(results.counts).map(([id, v], i) => (
            <Bar key={id} label={optLabel(id)} value={v} max={max} color={chartColor(theme, i)} suffix={`${total ? Math.round((v / total) * 100) : 0} %`} correct={results.correctOptionIds?.includes(id)} />
          ))}
        </ul>
      );
    }
    case "words":
      return (
        <div className="h-48 rounded-xl" style={{ background: theme.background }}>
          <WordCloud words={results.words} colors={theme.chartColors} emptyText={t("present.waiting")} />
        </div>
      );
    case "open":
      return (
        <ul className="space-y-2">
          {results.items.slice(-20).reverse().map((i) => (
            <li key={i.id} className="rounded-lg bg-black/5 px-3 py-2 text-sm">
              {i.text}
            </li>
          ))}
        </ul>
      );
    case "scale": {
      const cfg = slide.config as SlideConfigMap["scale"];
      return (
        <ul className="space-y-3">
          {cfg.statements.map((s, i) => (
            <Bar
              key={s.id}
              label={s.label}
              value={(results.statements[s.id]?.average ?? cfg.min) - cfg.min}
              max={cfg.max - cfg.min}
              color={chartColor(theme, i)}
              suffix={results.statements[s.id]?.average !== null ? `Ø ${results.statements[s.id]?.average}` : "–"}
            />
          ))}
        </ul>
      );
    }
    case "ranking": {
      const max = Math.max(1, ...results.ranking.map((r) => r.score));
      return (
        <ol className="space-y-3">
          {results.ranking.map((r, i) => (
            <Bar key={r.optionId} label={`${i + 1}. ${optLabel(r.optionId)}`} value={r.score} max={max} color={chartColor(theme, i)} suffix={String(r.score)} />
          ))}
        </ol>
      );
    }
    case "points": {
      const max = Math.max(1, ...Object.values(results.totals));
      return (
        <ul className="space-y-3">
          {Object.entries(results.totals).map(([id, v], i) => (
            <Bar key={id} label={optLabel(id)} value={v} max={max} color={chartColor(theme, i)} suffix={`Ø ${results.averages[id]}`} />
          ))}
        </ul>
      );
    }
    case "grid": {
      const cfg = slide.config as SlideConfigMap["grid_2x2"];
      return (
        <ul className="space-y-1 text-sm">
          {cfg.items.map((it) => (
            <li key={it.id} className="flex justify-between gap-2">
              <span className="font-medium">{it.label}</span>
              <span className="tabular-nums opacity-80">
                {results.items[it.id]?.count ? `${cfg.xLabel || "x"} Ø ${results.items[it.id].x} · ${cfg.yLabel || "y"} Ø ${results.items[it.id].y}` : "–"}
              </span>
            </li>
          ))}
        </ul>
      );
    }
    case "number":
      return (
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="opacity-70">{t("participant.mean")}</dt>
          <dd className="text-right font-semibold tabular-nums">{results.mean ?? "–"}</dd>
          <dt className="opacity-70">{t("participant.median")}</dt>
          <dd className="text-right font-semibold tabular-nums">{results.median ?? "–"}</dd>
          {results.correctAnswer !== null && results.correctAnswer !== undefined && (
            <>
              <dt className="opacity-70">{t("participant.correctAnswer")}</dt>
              <dd className="text-right font-semibold tabular-nums text-emerald-600">{results.correctAnswer}</dd>
            </>
          )}
        </dl>
      );
    case "quiz_text":
      return (
        <p className="text-sm">
          {t("participant.solution")}: <strong>{(results.correctAnswers ?? []).join(" / ")}</strong> · {t("present.correctCount", { count: results.correctCount, total: results.voters })}
        </p>
      );
    default:
      return null;
  }
}
