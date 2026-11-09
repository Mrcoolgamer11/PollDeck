import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Clock, EyeOff, MessageCircleQuestion, ThumbsUp, Trophy, Users } from "lucide-react";
import {
  isInteractive,
  isRevealed,
  type LeaderboardEntry,
  type QaQuestion,
  type Slide,
  type SlideConfigMap,
  type SlideLiveState,
  type SlideResults,
  type ThemeConfig,
} from "@polldeck/shared";
import { chartColor, themeStyle } from "../lib/theme";
import { useCountdown } from "../lib/useServerClock";
import { QrCode } from "../components/QrCode";
import { cx } from "../components/ui";
import { BarChart, DotsChart, HBarChart, Histogram, PieChart, ScatterChart, StackedBar, type Datum } from "./charts";
import { WordCloud } from "./WordCloud";

export interface JoinInfo {
  domain: string;
  code: string;
  url: string;
}

export interface SlideViewProps {
  slide: Slide;
  theme: ThemeConfig;
  results?: SlideResults | null;
  showResults?: boolean;
  slideState?: SlideLiveState | null;
  questions?: QaQuestion[];
  leaderboard?: LeaderboardEntry[];
  responseCount?: number;
  participantCount?: number;
  now?: () => number;
  join?: JoinInfo | null;
  /** Editor-Vorschau (ohne Live-Daten) */
  preview?: boolean;
  /** Kompakte Darstellung (z. B. Folienliste) */
  className?: string;
  overlay?: ReactNode;
  autoLeaderboard?: boolean;
  /** Archivansicht (abgeschlossene Sitzung) */
  archived?: boolean;
}

const LETTERS = "ABCDEFGH";

export function formatCode(code: string) {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

export function JoinBanner({ join, theme }: { join: JoinInfo; theme: ThemeConfig }) {
  const { t } = useTranslation();
  return (
    <div className="pd-small flex items-center justify-center gap-[1.2cqw] px-[2cqw] py-[1cqh]" style={{ background: "var(--pd-surface)" }}>
      <span>
        {t("present.joinAt")} <strong>{join.domain}</strong> {t("present.withCode")}{" "}
        <strong className="tabular-nums tracking-wider">{formatCode(join.code)}</strong>
      </span>
      <div className="rounded bg-white p-[0.2cqw]">
        <QrCode value={join.url} size={36} dark="#000" light="#fff" label={t("present.qrLabel")} />
      </div>
      <span className="sr-only">{theme.mode}</span>
    </div>
  );
}

function Countdown({ endsAt, now, big }: { endsAt: number; now: () => number; big?: boolean }) {
  const { t } = useTranslation();
  const left = useCountdown(endsAt, now);
  if (left === null) return null;
  return (
    <div
      className={cx(
        "flex items-center gap-[0.6cqw] rounded-full font-bold tabular-nums",
        big ? "pd-title px-[2cqw] py-[0.5cqh]" : "pd-text px-[1.2cqw] py-[0.4cqh]",
        left <= 5 && left > 0 && "animate-pulse",
      )}
      style={{ background: left === 0 ? "rgba(239,68,68,0.85)" : "var(--pd-accent)", color: "#fff" }}
      role="timer"
      aria-label={t("present.secondsLeft", { count: left })}
    >
      <Clock className="h-[1em] w-[1em]" aria-hidden />
      {left}
    </div>
  );
}

function Waiting({ text }: { text: string }) {
  return <div className="pd-text flex h-full items-center justify-center text-center opacity-60">{text}</div>;
}

function optionData(slide: Slide, theme: ThemeConfig, counts: Record<string, number> | undefined, correct?: string[]): Datum[] {
  const cfg = slide.config as { options: { id: string; label: string; imageUrl?: string | null }[] };
  return cfg.options.map((o, i) => ({
    id: o.id,
    label: o.label,
    imageUrl: o.imageUrl,
    value: counts?.[o.id] ?? 0,
    color: chartColor(theme, i),
    correct: correct?.includes(o.id),
    dim: correct ? !correct.includes(o.id) : false,
  }));
}

function ChoiceBody({ slide, theme, results, chart }: { slide: Slide; theme: ThemeConfig; results: SlideResults | null | undefined; chart: string }) {
  const counts = results?.kind === "choice" ? results.counts : undefined;
  const correct = results?.kind === "choice" ? results.correctOptionIds : undefined;
  const data = optionData(slide, theme, counts, correct);
  const total = data.reduce((s, d) => s + d.value, 0);
  if (chart === "pie" || chart === "donut") return <PieChart data={data} total={results?.voters ?? 0} donut={chart === "donut"} />;
  if (chart === "dots") return <DotsChart data={data} />;
  if (data.length > 6) return <HBarChart data={data} total={total} />;
  return <BarChart data={data} total={total} />;
}

function QuizTiles({ slide, theme }: { slide: Slide; theme: ThemeConfig }) {
  const cfg = slide.config as SlideConfigMap["quiz_choice"];
  return (
    <div className="grid h-full w-full grid-cols-2 gap-[1.5cqw] p-[1cqw]">
      {cfg.options.map((o, i) => (
        <div
          key={o.id}
          className="pd-text flex items-center gap-[1.2cqw] rounded-[1cqw] px-[2cqw] font-semibold text-white"
          style={{ background: chartColor(theme, i) }}
        >
          <span className="flex h-[6cqh] w-[6cqh] shrink-0 items-center justify-center rounded-full bg-black/20 font-bold">{LETTERS[i]}</span>
          {o.imageUrl && <img src={o.imageUrl} alt="" className="h-[8cqh] w-[8cqh] rounded object-cover" />}
          <span className="line-clamp-2">{o.label}</span>
        </div>
      ))}
    </div>
  );
}

export function LeaderboardBody({ entries, topN, emptyText }: { entries: LeaderboardEntry[]; topN: number; emptyText: string }) {
  const { t } = useTranslation();
  if (!entries.length) return <Waiting text={emptyText} />;
  const top = entries.slice(0, topN);
  const podium = [top[1], top[0], top[2]];
  const heights = ["62%", "85%", "45%"];
  const medals = ["🥈", "🥇", "🥉"];
  return (
    <div className="flex h-full w-full gap-[3cqw]">
      <div className="flex h-full flex-[1.2] items-end justify-center gap-[1.5cqw]">
        {podium.map((e, i) =>
          e ? (
            <div key={e.participantId} className="flex h-full w-[22%] flex-col items-center justify-end">
              <div className="pd-text mb-[0.5cqh] text-center font-bold leading-tight">
                <div className="text-[1.6em]" aria-hidden>
                  {medals[i]}
                </div>
                <div className="line-clamp-1">{e.name}</div>
                <div className="pd-small tabular-nums opacity-80">{t("present.points", { count: e.score })}</div>
              </div>
              <div
                className="w-full origin-bottom animate-rise rounded-t-[0.8cqw]"
                style={{ height: heights[i], background: "var(--pd-accent)", opacity: i === 1 ? 1 : 0.75, animationDelay: `${[0.4, 0.8, 0][i]}s` }}
              >
                <div className="pd-title pt-[1cqh] text-center font-extrabold text-white/90">{e.rank}</div>
              </div>
            </div>
          ) : (
            <div key={i} className="w-[22%]" />
          ),
        )}
      </div>
      {top.length > 3 && (
        <ol className="flex flex-1 flex-col justify-center gap-[0.8cqh]">
          {top.slice(3).map((e) => (
            <li key={e.participantId} className="pd-text flex items-center gap-[1cqw] rounded-[0.6cqw] px-[1cqw] py-[0.5cqh]" style={{ background: "var(--pd-surface)" }}>
              <span className="w-[3cqw] font-bold tabular-nums">{e.rank}.</span>
              <span className="flex-1 truncate">{e.name}</span>
              <span className="font-semibold tabular-nums">{e.score}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function ContentBody({ slide }: { slide: Slide<"content"> }) {
  const c = slide.config;
  switch (c.layout) {
    case "bullets":
      return (
        <ul className="pd-text mx-auto flex h-full max-w-[85%] list-disc flex-col justify-center gap-[1.5cqh] pl-[3cqw]">
          {c.bullets.filter(Boolean).map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      );
    case "quote":
      return (
        <figure className="mx-auto flex h-full max-w-[80%] flex-col justify-center">
          <blockquote className="pd-title font-serif italic leading-snug">“{c.quote}”</blockquote>
          {c.author && <figcaption className="pd-text mt-[2cqh] opacity-75">— {c.author}</figcaption>}
        </figure>
      );
    case "paragraph":
      return <p className="pd-text mx-auto flex h-full max-w-[85%] items-center whitespace-pre-line leading-relaxed">{c.body}</p>;
    case "image":
      return slide.imageUrl ? (
        <div className="flex h-full flex-col items-center justify-center">
          <img src={slide.imageUrl} alt={c.body || slide.title} className="max-h-full max-w-full rounded-[1cqw] object-contain" />
          {c.body && <p className="pd-small mt-[1cqh] opacity-75">{c.body}</p>}
        </div>
      ) : (
        <Waiting text="" />
      );
    default:
      return (
        <div className="flex h-full flex-col items-center justify-center text-center">
          {c.heading && <h2 className="text-[clamp(1.8rem,7cqw,6rem)] font-extrabold leading-tight">{c.heading}</h2>}
          {c.body && <p className="pd-text mt-[2cqh] max-w-[80%] whitespace-pre-line opacity-85">{c.body}</p>}
        </div>
      );
  }
}

export function SlideView({
  slide,
  theme,
  results,
  showResults = true,
  slideState,
  questions,
  leaderboard,
  responseCount,
  participantCount,
  now = Date.now,
  join,
  preview,
  className,
  overlay,
  autoLeaderboard,
  archived,
}: SlideViewProps) {
  const { t } = useTranslation();
  const style = useMemo(() => themeStyle(theme, slide.background), [theme, slide.background]);
  const revealed = preview || isRevealed(slideState ?? null, now());
  const isQuiz = slide.type === "quiz_choice" || slide.type === "quiz_text";
  const quizStarted = preview || !!slideState?.quizStartedAt;
  const showCount = isInteractive(slide.type) || slide.type === "qa";
  const imageSide = slide.imageUrl && slide.type !== "content";
  const waiting = archived ? t("present.noResponses") : t("present.waiting");

  let body: ReactNode = null;
  switch (slide.type) {
    case "multiple_choice": {
      const cfg = slide.config as SlideConfigMap["multiple_choice"];
      body = showResults ? (
        <ChoiceBody slide={slide} theme={theme} results={results} chart={cfg.chartType} />
      ) : (
        <ChoiceBody slide={slide} theme={theme} results={null} chart={cfg.chartType} />
      );
      break;
    }
    case "quiz_choice":
      if (preview || !quizStarted || !revealed) body = <QuizTiles slide={slide} theme={theme} />;
      else
        body = (
          <div className="flex h-full w-full flex-col">
            <div className="min-h-0 flex-1">
              <ChoiceBody slide={slide} theme={theme} results={results} chart="bar" />
            </div>
            {autoLeaderboard && leaderboard && leaderboard.length > 0 && (
              <div className="pd-small mt-[1cqh] flex justify-center gap-[2cqw] opacity-90">
                <Trophy className="h-[1.2em] w-[1.2em]" aria-hidden />
                {leaderboard.slice(0, 3).map((e) => (
                  <span key={e.participantId}>
                    {e.rank}. {e.name} ({e.score})
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      break;
    case "quiz_text": {
      const r = results?.kind === "quiz_text" ? results : null;
      body =
        revealed && !preview && r ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-[2cqh]">
            <div className="pd-title flex items-center gap-[1cqw] font-bold text-emerald-400">
              <CheckCircle2 className="h-[1em] w-[1em]" aria-hidden /> {(r.correctAnswers ?? []).join(" / ")}
            </div>
            <div className="pd-text opacity-80">{t("present.correctCount", { count: r.correctCount, total: r.voters })}</div>
            <div className="flex max-w-[90%] flex-wrap justify-center gap-[0.8cqw]">
              {r.answers.slice(0, 12).map((a) => (
                <span
                  key={a.text}
                  className="pd-small rounded-full px-[1.2cqw] py-[0.4cqh] font-medium"
                  style={{ background: a.correct ? "rgba(16,185,129,0.85)" : "var(--pd-surface)", color: a.correct ? "#fff" : undefined }}
                >
                  {a.text} · {a.count}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="pd-title flex h-full items-center justify-center font-bold opacity-80">
            {preview ? t("present.typeAnswer") : quizStarted ? t("present.answersCount", { count: responseCount ?? 0 }) : t("present.getReady")}
          </div>
        );
      break;
    }
    case "word_cloud":
      body = showResults ? (
        <WordCloud words={results?.kind === "words" ? results.words : []} colors={theme.chartColors} emptyText={preview ? t("present.wordCloudPreview") : waiting} />
      ) : null;
      break;
    case "open_ended": {
      const cfg = slide.config as SlideConfigMap["open_ended"];
      const items = results?.kind === "open" ? results.items.filter((i) => i.status === "APPROVED") : [];
      if (!showResults) break;
      if (!items.length) {
        body = <Waiting text={preview ? t("present.openPreview") : waiting} />;
      } else if (cfg.display === "ticker") {
        body = (
          <div className="flex h-full items-center overflow-hidden">
            <div className="pd-title flex animate-[ticker_30s_linear_infinite] gap-[4cqw] whitespace-nowrap font-semibold" style={{ animationDuration: `${Math.max(15, items.length * 6)}s` }}>
              {items.slice(-30).map((i) => (
                <span key={i.id}>{i.text}</span>
              ))}
            </div>
          </div>
        );
      } else {
        body = (
          <div className="h-full columns-2 gap-[1.2cqw] overflow-hidden md:columns-3 xl:columns-4">
            {items
              .slice(-40)
              .reverse()
              .map((i, idx) => (
                <div
                  key={i.id}
                  className="pd-text mb-[1.2cqw] animate-pop break-inside-avoid rounded-[0.8cqw] p-[1.2cqw]"
                  style={{ background: chartColor(theme, idx), color: "#fff" }}
                >
                  {i.text}
                  {i.name && <div className="pd-small mt-[0.6cqh] opacity-80">— {i.name}</div>}
                </div>
              ))}
          </div>
        );
      }
      break;
    }
    case "scale": {
      const cfg = slide.config as SlideConfigMap["scale"];
      const r = results?.kind === "scale" ? results : null;
      body = (
        <ul className="flex h-full w-full flex-col justify-center gap-[3cqh]">
          {cfg.statements.map((st, i) => {
            const s = r?.statements[st.id];
            const avg = showResults ? s?.average ?? null : null;
            const p = avg === null ? null : ((avg - cfg.min) / (cfg.max - cfg.min)) * 100;
            const maxDist = Math.max(1, ...Object.values(s?.distribution ?? {}));
            return (
              <li key={st.id}>
                <div className="pd-text mb-[0.8cqh] flex justify-between font-medium">
                  <span>{st.label}</span>
                  <span className="tabular-nums">{avg !== null ? `Ø ${avg.toLocaleString()}` : ""}</span>
                </div>
                <div className="relative h-[5cqh]">
                  <div className="absolute inset-x-0 top-1/2 h-[0.8cqh] -translate-y-1/2 rounded-full" style={{ background: "var(--pd-surface)" }} />
                  {showResults &&
                    Object.entries(s?.distribution ?? {}).map(([v, c]) => {
                      const x = ((Number(v) - cfg.min) / (cfg.max - cfg.min)) * 100;
                      return (
                        <span
                          key={v}
                          className="absolute bottom-1/2 w-[1.2cqw] -translate-x-1/2 rounded-t-sm opacity-50 transition-[height] duration-700"
                          style={{ left: `${x}%`, height: `${(c / maxDist) * 100}%`, background: chartColor(theme, i) }}
                        />
                      );
                    })}
                  {p !== null && (
                    <span
                      className="absolute top-1/2 h-[4cqh] w-[4cqh] -translate-x-1/2 -translate-y-1/2 rounded-full ring-[0.4cqh] ring-white/80 transition-[left] duration-700"
                      style={{ left: `${p}%`, background: chartColor(theme, i) }}
                    />
                  )}
                </div>
                <div className="pd-small mt-[0.4cqh] flex justify-between opacity-70">
                  <span>
                    {cfg.min} {cfg.minLabel}
                  </span>
                  <span>
                    {cfg.maxLabel} {cfg.max}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      );
      break;
    }
    case "ranking": {
      const cfg = slide.config as SlideConfigMap["ranking"];
      const r = results?.kind === "ranking" && showResults ? results : null;
      const order = r ? r.ranking : cfg.options.map((o) => ({ optionId: o.id, score: 0, averagePosition: null }));
      const data = order.map((x) => {
        const idx = cfg.options.findIndex((o) => o.id === x.optionId);
        return { id: x.optionId, label: cfg.options[idx]?.label ?? "", value: x.score, color: chartColor(theme, idx) };
      });
      body = <HBarChart data={data} prefix={(_, i) => `${i + 1}.`} valueLabel={(d) => (r ? `${d.value}` : "")} />;
      break;
    }
    case "points_100": {
      const cfg = slide.config as SlideConfigMap["points_100"];
      const r = results?.kind === "points" && showResults ? results : null;
      const data = cfg.options.map((o, i) => ({ id: o.id, label: o.label, value: r?.totals[o.id] ?? 0, color: chartColor(theme, i) }));
      body = (
        <div className="flex h-full w-full flex-col justify-center gap-[4cqh]">
          <StackedBar data={data} />
          <ul className="grid grid-cols-2 gap-[1.5cqh] md:grid-cols-3">
            {data.map((d) => (
              <li key={d.id} className="pd-text flex items-center gap-[0.8cqw]">
                <span className="h-[2.4cqh] w-[2.4cqh] shrink-0 rounded" style={{ background: d.color }} aria-hidden />
                <span className="truncate font-medium">{d.label}</span>
                <span className="ml-auto tabular-nums opacity-80">{r ? `Ø ${r.averages[d.id]}` : ""}</span>
              </li>
            ))}
          </ul>
        </div>
      );
      break;
    }
    case "grid_2x2": {
      const cfg = slide.config as SlideConfigMap["grid_2x2"];
      const r = results?.kind === "grid" && showResults ? results : null;
      body = (
        <ScatterChart
          min={cfg.min}
          max={cfg.max}
          xLabel={cfg.xLabel}
          yLabel={cfg.yLabel}
          items={cfg.items.map((it, i) => ({
            id: it.id,
            label: it.label,
            x: r?.items[it.id]?.x ?? (preview ? cfg.min + ((cfg.max - cfg.min) * (i + 1)) / (cfg.items.length + 1) : null),
            y: r?.items[it.id]?.y ?? (preview ? cfg.max - ((cfg.max - cfg.min) * (i + 1)) / (cfg.items.length + 1) : null),
            points: r?.items[it.id]?.points,
            color: chartColor(theme, i),
          }))}
        />
      );
      break;
    }
    case "number_guess": {
      const cfg = slide.config as SlideConfigMap["number_guess"];
      const r = results?.kind === "number" && showResults ? results : null;
      const markers = [];
      if (r?.mean !== null && r?.mean !== undefined) markers.push({ value: r.mean, label: `Ø ${r.mean}`, color: theme.accent });
      const correct = r?.correctAnswer ?? (preview ? cfg.correctAnswer : null);
      if (correct !== null && correct !== undefined && (revealed || preview))
        markers.push({ value: correct, label: `✓ ${correct}${cfg.unit ? ` ${cfg.unit}` : ""}`, color: "#10b981" });
      body = (
        <Histogram
          bins={r?.bins ?? Array.from({ length: 10 }, (_, i) => ({ from: i, to: i + 1, count: 0 }))}
          color={chartColor(theme, 0)}
          markers={markers}
          min={cfg.min}
          max={cfg.max}
        />
      );
      break;
    }
    case "qa": {
      const list = (questions ?? []).filter((q) => q.status === "APPROVED");
      body = !list.length ? (
        <Waiting text={preview ? t("present.qaPreview") : t("present.qaWaiting")} />
      ) : (
        <ul className="flex h-full flex-col gap-[1.2cqh] overflow-hidden">
          {list.slice(0, 7).map((q, i) => (
            <li
              key={q.id}
              className={cx("pd-text flex items-start gap-[1.2cqw] rounded-[0.8cqw] p-[1.2cqw] transition", q.answered && "opacity-40")}
              style={{ background: i === 0 && !q.answered ? "var(--pd-accent)" : "var(--pd-surface)", color: i === 0 && !q.answered ? "#fff" : undefined }}
            >
              <span className="flex shrink-0 items-center gap-[0.4cqw] font-bold tabular-nums">
                <ThumbsUp className="h-[1em] w-[1em]" aria-hidden /> {q.upvotes}
              </span>
              <span className="flex-1">{q.text}</span>
              {q.answered && <CheckCircle2 className="h-[1em] w-[1em] shrink-0" aria-label={t("present.answered")} />}
            </li>
          ))}
        </ul>
      );
      break;
    }
    case "content":
      body = <ContentBody slide={slide as Slide<"content">} />;
      break;
    case "leaderboard": {
      const cfg = slide.config as SlideConfigMap["leaderboard"];
      body = (
        <LeaderboardBody
          entries={preview ? previewLeaderboard : (leaderboard ?? [])}
          topN={cfg.topN}
          emptyText={t("present.leaderboardEmpty")}
        />
      );
      break;
    }
  }

  const hiddenNotice = !showResults && isInteractive(slide.type) && slide.type !== "multiple_choice" && !isQuiz;

  return (
    <div className={cx("pd-slide relative flex aspect-video w-full select-none flex-col overflow-hidden", className)} style={style}>
      {join && <JoinBanner join={join} theme={theme} />}
      <div className="flex min-h-0 flex-1 flex-col px-[4cqw] pb-[3cqh] pt-[3.5cqh]">
        {slide.type !== "content" || slide.config && (slide.config as SlideConfigMap["content"]).layout !== "heading" ? (
          <header className="mb-[2.5cqh] flex items-start gap-[2cqw]">
            <div className="min-w-0 flex-1">
              {(slide.title || slide.type !== "content") && (
                <h1 className="pd-title font-bold">
                  {slide.title ||
                    (slide.type === "leaderboard" ? t("present.leaderboard") : <span className="opacity-40">{t("editor.untitledSlide")}</span>)}
                </h1>
              )}
              {slide.description && <p className="pd-text mt-[1cqh] opacity-75">{slide.description}</p>}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-[1cqh]">
              {slideState?.timerEndsAt && <Countdown endsAt={slideState.timerEndsAt} now={now} big={isQuiz} />}
              {showCount && !preview && (
                <div className="pd-small flex items-center gap-[1.5cqw] opacity-80">
                  {participantCount !== undefined && (
                    <span className="flex items-center gap-[0.4cqw]" title={t("present.participants")}>
                      <Users className="h-[1.1em] w-[1.1em]" aria-hidden /> <span className="tabular-nums">{participantCount}</span>
                    </span>
                  )}
                  <span className="flex items-center gap-[0.4cqw]" title={t("present.responses")}>
                    <MessageCircleQuestion className="h-[1.1em] w-[1.1em]" aria-hidden /> <span className="tabular-nums">{responseCount ?? 0}</span>
                  </span>
                </div>
              )}
            </div>
          </header>
        ) : (
          slideState?.timerEndsAt && (
            <div className="absolute right-[3cqw] top-[3cqh]">
              <Countdown endsAt={slideState.timerEndsAt} now={now} />
            </div>
          )
        )}
        <div className="flex min-h-0 flex-1 gap-[3cqw]">
          <div className="relative min-h-0 min-w-0 flex-1">
            {hiddenNotice ? (
              <div className="pd-text flex h-full flex-col items-center justify-center gap-[1cqh] opacity-70">
                <EyeOff className="h-[2em] w-[2em]" aria-hidden />
                {t("present.resultsHidden")}
              </div>
            ) : (
              body
            )}
          </div>
          {imageSide && (
            <div className="flex w-[32%] shrink-0 items-center justify-center">
              <img src={slide.imageUrl!} alt="" className="max-h-full max-w-full rounded-[1cqw] object-contain shadow-lg" />
            </div>
          )}
        </div>
      </div>
      {theme.logoUrl && (
        <img src={theme.logoUrl} alt="" className="pointer-events-none absolute bottom-[2cqh] right-[2cqw] h-[7cqh] max-w-[14cqw] object-contain opacity-90" />
      )}
      {overlay}
    </div>
  );
}

const previewLeaderboard: LeaderboardEntry[] = [
  { participantId: "1", name: "Anna", score: 2850, correct: 3, rank: 1 },
  { participantId: "2", name: "Ben", score: 2400, correct: 3, rank: 2 },
  { participantId: "3", name: "Cem", score: 1980, correct: 2, rank: 3 },
  { participantId: "4", name: "Dana", score: 1500, correct: 2, rank: 4 },
  { participantId: "5", name: "Emil", score: 900, correct: 1, rank: 5 },
];
