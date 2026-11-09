import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CheckCircle2, ChevronLeft, ChevronRight, Clock, Loader2, Lock, Star, UserRound, WifiOff, XCircle } from "lucide-react";
import { EndScreen } from "../participant/EndScreen";
import {
  AVATARS,
  isClosed,
  isInteractive,
  isQuiz,
  isRevealed,
  type AudienceBroadcast,
  type MyResponse,
  type Slide,
  type SlideConfigMap,
  type SlideLiveState,
  type SlideResults,
  type ThemeConfig,
} from "@polldeck/shared";
import { get } from "../lib/api";
import { useAudienceSession } from "../lib/live";
import { getSavedAvatar, getSavedName, hasJoined, markJoined, saveAvatar, saveName } from "../lib/device";
import { LegalLinks } from "../components/LegalLinks";
import { useCountdown, useServerOffset } from "../lib/useServerClock";
import { FONT_STACKS } from "../lib/theme";
import { useApp } from "../lib/app";
import { LanguageSwitch } from "../components/LanguageSwitch";
import { Button, Spinner, cx } from "../components/ui";
import { INPUTS } from "../participant/inputs";
import { MobileResults } from "../participant/MobileResults";
import { ParticipantExtras } from "../participant/Extras";

function Shell({ theme, children, header }: { theme?: ThemeConfig; children: ReactNode; header?: ReactNode }) {
  const style = {
    "--pd-accent": theme?.accent ?? "#7c5cff",
    background: theme?.background ?? "#101425",
    color: theme?.text ?? "#fff",
    fontFamily: theme ? FONT_STACKS[theme.font] : undefined,
  } as CSSProperties;
  return (
    <div className="flex min-h-[100dvh] flex-col" style={style}>
      {header}
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 pb-28 pt-4">{children}</main>
    </div>
  );
}

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-2xl bg-white p-5 text-slate-900 shadow-lg", className)}>{children}</div>;
}

function AvatarPicker({ value, onChange }: { value: string; onChange: (a: string) => void }) {
  const { t } = useTranslation();
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-slate-700">{t("participant.chooseAvatar")}</legend>
      <div className="grid grid-cols-8 gap-1.5" role="radiogroup" aria-label={t("participant.chooseAvatar")}>
        {AVATARS.map((a) => (
          <button
            key={a}
            type="button"
            role="radio"
            aria-checked={value === a}
            aria-label={a}
            onClick={() => onChange(a)}
            className={cx(
              "flex aspect-square items-center justify-center rounded-xl text-2xl transition",
              value === a ? "bg-[color:var(--pd-accent)] ring-2 ring-[color:var(--pd-accent)] ring-offset-2" : "bg-slate-100 hover:bg-slate-200",
            )}
          >
            <span aria-hidden>{a}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

const randomAvatar = () => AVATARS[Math.floor(Math.random() * AVATARS.length)];

/** Beitritt: Anzeigename und Emoji wählen (#3). */
function NameForm({
  initial,
  initialAvatar,
  onSubmit,
  required,
  error,
}: {
  initial: string;
  initialAvatar: string;
  onSubmit: (n: string, avatar: string) => void;
  required: boolean;
  error?: string;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial);
  const [avatar, setAvatar] = useState(initialAvatar);
  const submit = (n: string) => {
    saveName(n);
    saveAvatar(avatar);
    onSubmit(n, avatar);
  };
  return (
    <Card>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (required && !name.trim()) return;
          submit(name.trim());
        }}
      >
        <div className="flex items-center gap-3">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-4xl" aria-hidden>
            {avatar}
          </span>
          <div>
            <h1 className="text-xl font-bold">{t("participant.whatsYourName")}</h1>
            <p className="text-sm text-slate-600">{required ? t("participant.nameRequired") : t("participant.nameOptional")}</p>
          </div>
        </div>
        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
        <input
          className="block w-full rounded-xl border-2 border-slate-200 px-4 py-3 text-base outline-none focus:border-[color:var(--pd-accent)]"
          aria-label={t("participant.yourName")}
          placeholder={t("participant.yourName")}
          maxLength={40}
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <AvatarPicker value={avatar} onChange={setAvatar} />
        <Button type="submit" size="lg" className="w-full" disabled={required && !name.trim()} style={{ background: "var(--pd-accent)" }}>
          {t("participant.join")}
        </Button>
        <p className="text-xs leading-relaxed text-slate-500">
          {t("participant.privacyNotice")}{" "}
          <Link to="/datenschutz" target="_blank" className="underline">
            {t("legal.privacy")}
          </Link>
        </p>
        {!required && (
          <button type="button" className="w-full text-center text-sm text-slate-500 underline" onClick={() => submit("")}>
            {t("participant.stayAnonymous")}
          </button>
        )}
      </form>
    </Card>
  );
}

export function ParticipantPage() {
  const { code } = useParams();
  const { t } = useTranslation();
  const { config } = useApp();
  const [info, setInfo] = useState<{ title: string; requireNames: boolean } | null | "missing">(null);
  const [name, setName] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<string>(() => getSavedAvatar() || randomAvatar());
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!code || !/^\d{6}$/.test(code)) {
      setInfo("missing");
      return;
    }
    get<{ title: string; requireNames: boolean }>(`/api/join/${code}`)
      .then((r) => {
        setInfo(r);
        // Wer dieser Sitzung schon beigetreten ist (z. B. nach Neuladen), kommt direkt rein.
        // Alle anderen wählen zuerst Anzeigenamen und Emoji.
        const saved = getSavedName();
        if (code && hasJoined(code) && (!r.requireNames || saved)) setName(saved);
      })
      .catch(() => setInfo("missing"));
  }, [code]);

  const live = useAudienceSession(info && info !== "missing" ? code : undefined, name, avatar);

  if (info === "missing" || live.error === "session_not_found") {
    return (
      <Shell>
        <Card className="mt-10 text-center">
          <XCircle className="mx-auto mb-3 h-10 w-10 text-slate-400" aria-hidden />
          <h1 className="mb-2 text-xl font-bold">{t("participant.notFoundTitle")}</h1>
          <p className="mb-4 text-sm text-slate-600">{t("participant.notFound")}</p>
          <Link to="/" className="font-semibold text-brand-600 underline">
            {t("participant.enterOtherCode")}
          </Link>
        </Card>
      </Shell>
    );
  }
  if (!info) return <Spinner className="min-h-screen" />;
  if (name === null || editing || live.error === "name_required" || live.error === "name_filtered") {
    return (
      <Shell header={<TopBar title={info.title} appName={config?.appName} />}>
        <NameForm
          initial={name ?? getSavedName()}
          initialAvatar={avatar}
          required={info.requireNames || live.error === "name_required"}
          error={live.error === "name_filtered" ? t("liveErrors.name_filtered") : undefined}
          onSubmit={(n, a) => {
            if (code) markJoined(code);
            setAvatar(a);
            setName(n);
            setEditing(false);
          }}
        />
        <LegalLinks />
      </Shell>
    );
  }
  if (live.error === "kicked") {
    return (
      <Shell>
        <Card className="mt-10 text-center">
          <h1 className="mb-2 text-xl font-bold">{t("participant.kickedTitle")}</h1>
          <p className="text-sm text-slate-600">{t("participant.kicked")}</p>
        </Card>
      </Shell>
    );
  }
  if (!live.state) return <Spinner className="min-h-screen" />;
  return <LiveView live={live} onEditName={() => setEditing(true)} />;
}

function TopBar({ title, appName, status, right }: { title: string; appName?: string; status?: string; right?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <header className="sticky top-0 z-10 bg-black/20 backdrop-blur">
      <div className="mx-auto flex max-w-lg items-center gap-2 px-4 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs opacity-70">{appName ?? "PollDeck"}</p>
          <p className="truncate text-sm font-semibold">{title}</p>
        </div>
        {status && status !== "connected" && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5 text-xs font-semibold text-black" role="status">
            <WifiOff className="h-3.5 w-3.5" aria-hidden /> {t("participant.offline")}
          </span>
        )}
        {right}
        <LanguageSwitch compact />
      </div>
    </header>
  );
}

type Live = ReturnType<typeof useAudienceSession>;

function LiveView({ live, onEditName }: { live: Live; onEditName: () => void }) {
  const { t } = useTranslation();
  const { config } = useApp();
  const state = live.state as AudienceBroadcast;
  const now = useServerOffset(state.serverTime);
  const [surveyIndex, setSurveyIndex] = useState(0);
  const survey = state.mode === "SURVEY";
  const slides = state.slides ?? [];
  const slide = survey ? slides[surveyIndex] ?? null : state.slide;
  const slideState = survey ? (slide ? state.slideStates?.[slide.id] ?? null : null) : state.slideState;
  const me = live.participant;
  // Punkte anzeigen, sobald gespielt wird (#7).
  const showScore = !!live.myScore && (live.myScore.score > 0 || (slide && (isQuiz(slide.type) || slide.type === "leaderboard")));

  if (state.ended) {
    return (
      <Shell theme={state.theme} header={<TopBar title={state.title} appName={config?.appName} />}>
        <EndScreen live={live} />
      </Shell>
    );
  }

  return (
    <Shell
      theme={state.theme}
      header={
        <TopBar
          title={state.title}
          appName={config?.appName}
          status={live.status}
          right={
            <>
              {showScore && live.myScore && (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-[color:var(--pd-accent)] px-2.5 py-1 text-xs font-bold tabular-nums text-white"
                  role="status"
                  aria-label={t("participant.scoreAria", { score: live.myScore.score, rank: live.myScore.rank ?? "–" })}
                >
                  <Star className="h-3.5 w-3.5" aria-hidden /> {live.myScore.score.toLocaleString()}
                  {live.myScore.rank && <span className="opacity-80">· #{live.myScore.rank}</span>}
                </span>
              )}
              {me && (
                <button
                  className="inline-flex max-w-[9rem] items-center gap-1 rounded-full bg-white/10 px-2 py-1 text-xs font-medium hover:bg-white/20"
                  onClick={onEditName}
                  aria-label={t("participant.changeName")}
                  title={t("participant.changeName")}
                >
                  <span aria-hidden>{me.avatar ?? <UserRound className="h-3.5 w-3.5" />}</span>
                  <span className="truncate">{me.name || t("present.anonymousShort")}</span>
                </button>
              )}
            </>
          }
        />
      }
    >
      {live.queued.length > 0 && (
        <p className="mb-3 rounded-xl bg-amber-400 px-3 py-2 text-sm font-medium text-black" role="status">
          {t("participant.queued", { count: live.queued.length })}
        </p>
      )}
      {survey && slides.length > 0 && (
        <div className="mb-3 flex items-center justify-between text-sm">
          <button className="inline-flex items-center gap-1 rounded-lg px-2 py-1 disabled:opacity-30" disabled={surveyIndex === 0} onClick={() => setSurveyIndex((i) => i - 1)}>
            <ChevronLeft className="h-5 w-5" aria-hidden /> {t("participant.back")}
          </button>
          <span className="tabular-nums opacity-80">
            {surveyIndex + 1} / {slides.length}
          </span>
          <button className="inline-flex items-center gap-1 rounded-lg px-2 py-1 disabled:opacity-30" disabled={surveyIndex >= slides.length - 1} onClick={() => setSurveyIndex((i) => i + 1)}>
            {t("participant.next")} <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
        </div>
      )}
      {state.lobby ? (
        <Card className="mt-6 text-center">
          <div className="mx-auto mb-3 flex h-24 w-24 animate-pop items-center justify-center rounded-3xl bg-slate-100 text-6xl" aria-hidden>
            {me?.avatar ?? "🙂"}
          </div>
          <h1 className="text-2xl font-bold">{t("participant.youreIn")}</h1>
          <p className="mt-1 text-lg font-semibold">{me?.name || t("present.anonymousShort")}</p>
          <p className="mt-4 flex items-center justify-center gap-2 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {t("participant.waitingForStart")}
          </p>
          <Button variant="secondary" className="mt-4" onClick={onEditName}>
            {t("participant.changeName")}
          </Button>
        </Card>
      ) : slide ? (
        <SlidePanel
          key={`${slide.id}-${slideState?.generation ?? 0}`}
          slide={slide}
          slideState={slideState}
          live={live}
          now={now}
          survey={survey}
          onNext={survey && surveyIndex < slides.length - 1 ? () => setSurveyIndex((i) => i + 1) : undefined}
        />
      ) : (
        <Card className="mt-10 text-center">
          <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-slate-400" aria-hidden />
          <p>{t("participant.waitingForPresenter")}</p>
        </Card>
      )}
      <ParticipantExtras live={live} slide={slide} />
    </Shell>
  );
}

function StartsIn({ at, now }: { at: number; now: () => number }) {
  const left = useCountdown(at, now);
  if (!left) return null;
  return (
    <p className="mt-3 text-5xl font-extrabold tabular-nums" style={{ color: "var(--pd-accent)" }} aria-live="assertive">
      {left}
    </p>
  );
}

function CountdownChip({ endsAt, now }: { endsAt: number; now: () => number }) {
  const { t } = useTranslation();
  const left = useCountdown(endsAt, now);
  if (left === null) return null;
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-bold tabular-nums text-white", left <= 5 ? "bg-red-500" : "bg-black/30")} role="timer" aria-label={t("present.secondsLeft", { count: left })}>
      <Clock className="h-4 w-4" aria-hidden /> {left}
    </span>
  );
}

function SlidePanel({
  slide,
  slideState,
  live,
  now,
  survey,
  onNext,
}: {
  slide: Slide;
  slideState: SlideLiveState | null;
  live: Live;
  now: () => number;
  survey: boolean;
  onNext?: () => void;
}) {
  const { t } = useTranslation();
  const state = live.state as AudienceBroadcast;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [surveyResults, setSurveyResults] = useState<SlideResults | null>(null);
  const [surveyStart, setSurveyStart] = useState<number | null>(null);
  const [, tick] = useState(0);
  const mine = useMemo(() => live.myResponses.filter((r) => r.slideId === slide.id), [live.myResponses, slide.id]);
  const interactive = isInteractive(slide.type);
  const quiz = isQuiz(slide.type);
  const multi = slide.settings.allowMultipleSubmissions && !quiz;
  const limit = slide.settings.responseLimit ?? 100;
  const answered = mine.length > 0 && (!multi || mine.length >= limit);
  const closed = !survey && isClosed(slideState, now());
  const revealed = survey ? answered : isRevealed(slideState, now());

  // Automatisch gestartete Quizfrage (#6): zum Startzeitpunkt neu rendern.
  useEffect(() => {
    const at = slideState?.quizStartedAt;
    if (!at) return;
    const ms = at - now() + 50;
    if (ms <= 0) return;
    const h = setTimeout(() => tick((x) => x + 1), ms);
    return () => clearTimeout(h);
  }, [slideState?.quizStartedAt, now]);

  // Countdown-Ende zuverlässig neu rendern.
  useEffect(() => {
    if (!slideState?.timerEndsAt) return;
    const ms = slideState.timerEndsAt - now() + 1700;
    if (ms <= 0) return;
    const h = setTimeout(() => tick((x) => x + 1), ms);
    return () => clearTimeout(h);
  }, [slideState?.timerEndsAt, now]);

  // Survey-Modus: Quiz-Startzeit pro Teilnehmer und Ergebnisse nachladen.
  useEffect(() => {
    if (!survey) return;
    if (quiz) {
      live.emit<{ startedAt: number; serverTime: number }>("survey:open", { slideId: slide.id }).then((r) => {
        if (r.ok && r.data) setSurveyStart(r.data.startedAt - r.data.serverTime + Date.now());
      });
    }
  }, [survey, quiz, slide.id, live]);
  useEffect(() => {
    if (!survey || !answered || !interactive) return;
    live.emit<SlideResults | null>("audience:results", { slideId: slide.id }).then((r) => r.ok && setSurveyResults(r.data ?? null));
  }, [survey, answered, interactive, slide.id, live, mine.length]);

  const submit = async (value: unknown) => {
    setBusy(true);
    setError("");
    const r = await live.respond(slide.id, value);
    setBusy(false);
    if (!r.ok) {
      if (r.error === "queued") return true;
      setError(t(`liveErrors.${r.error}`, { defaultValue: t("errors.generic", { code: r.error }) }));
      return false;
    }
    return true;
  };

  const Input = INPUTS[slide.type];
  const results = survey ? surveyResults : state.results;
  const endsAt = survey && quiz && surveyStart ? surveyStart + (slide.config as SlideConfigMap["quiz_choice"]).timeLimit * 1000 : slideState?.timerEndsAt;

  let body: ReactNode;
  if (slide.type === "content") {
    const c = slide.config as SlideConfigMap["content"];
    body = (
      <div className="space-y-3">
        {c.heading && <p className="text-2xl font-bold">{c.heading}</p>}
        {c.body && <p className="whitespace-pre-line">{c.body}</p>}
        {c.layout === "bullets" && (
          <ul className="list-disc space-y-1 pl-5">
            {c.bullets.filter(Boolean).map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        )}
        {c.layout === "quote" && (
          <blockquote className="border-l-4 border-slate-300 pl-3 italic">
            “{c.quote}” {c.author && <footer className="mt-1 text-sm not-italic opacity-70">— {c.author}</footer>}
          </blockquote>
        )}
        {!c.heading && !c.body && c.layout !== "bullets" && c.layout !== "quote" && <p className="text-slate-500">{t("participant.lookAtScreen")}</p>}
      </div>
    );
  } else if (slide.type === "leaderboard") {
    body = <LeaderboardMobile entries={state.leaderboard ?? []} me={live.participant?.id} score={live.myScore} />;
  } else if (slide.type === "qa") {
    body = <ParticipantExtras.Qa live={live} slide={slide} closed={closed} />;
  } else if (interactive && Input) {
    if (quiz && !survey && (!slideState?.quizStartedAt || slideState.quizStartedAt > now())) {
      body = (
        <div className="py-6 text-center">
          <p className="text-lg font-semibold">{t("participant.quizSoon")}</p>
          {slideState?.quizStartedAt && <StartsIn at={slideState.quizStartedAt} now={now} />}
        </div>
      );
    } else if (answered || (quiz && revealed)) {
      body = <Answered slide={slide} mine={mine} revealed={revealed} results={results} theme={state.theme} quiz={quiz} />;
    } else if (closed) {
      body = (
        <p className="flex items-center justify-center gap-2 py-6 text-center font-semibold">
          <Lock className="h-5 w-5" aria-hidden /> {t("participant.closed")}
        </p>
      );
    } else {
      body = (
        <>
          {mine.length > 0 && multi && <p className="mb-3 text-sm text-emerald-700">{t("participant.sentCount", { count: mine.length, limit })}</p>}
          <Input slide={slide} onSubmit={submit as never} busy={busy} {...({ letters: quiz } as object)} />
        </>
      );
    }
  } else {
    body = <p className="text-slate-500">{t("participant.lookAtScreen")}</p>;
  }

  return (
    <Card className="animate-pop">
      <div className="mb-4 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="break-words text-xl font-bold leading-snug">{slide.title}</h1>
          {slide.description && <p className="mt-1 text-sm text-slate-600">{slide.description}</p>}
        </div>
        {endsAt && !answered && (!slideState?.quizStartedAt || slideState.quizStartedAt <= now()) && <CountdownChip endsAt={endsAt} now={survey ? Date.now : now} />}
      </div>
      {slide.imageUrl && <img src={slide.imageUrl} alt="" className="mb-4 max-h-56 w-full rounded-xl object-contain" />}
      {error && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      {body}
      {onNext && (answered || !interactive) && (
        <Button className="mt-4 w-full" variant="secondary" onClick={onNext}>
          {t("participant.next")} <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      )}
    </Card>
  );
}

function Answered({
  slide,
  mine,
  revealed,
  results,
  theme,
  quiz,
}: {
  slide: Slide;
  mine: MyResponse[];
  revealed: boolean;
  results: SlideResults | null;
  theme: ThemeConfig;
  quiz: boolean;
}) {
  const { t } = useTranslation();
  const last = mine[mine.length - 1];
  const pending = mine.some((m) => m.status === "PENDING");
  return (
    <div className="space-y-4" aria-live="polite">
      {quiz && revealed && last ? (
        last.isCorrect ? (
          <div className="rounded-xl bg-emerald-500 p-4 text-center text-white">
            <CheckCircle2 className="mx-auto mb-1 h-8 w-8" aria-hidden />
            <p className="text-lg font-bold">{t("participant.correct")}</p>
            {last.points !== undefined && <p className="text-sm">{t("participant.plusPoints", { count: last.points })}</p>}
          </div>
        ) : last.isCorrect === false ? (
          <div className="rounded-xl bg-red-500 p-4 text-center text-white">
            <XCircle className="mx-auto mb-1 h-8 w-8" aria-hidden />
            <p className="text-lg font-bold">{t("participant.wrong")}</p>
          </div>
        ) : (
          <p className="text-center font-semibold">{t("participant.thanks")}</p>
        )
      ) : quiz && revealed && !last ? (
        <p className="text-center font-semibold">{t("participant.tooLate")}</p>
      ) : (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-emerald-800">
          <CheckCircle2 className="h-6 w-6 shrink-0" aria-hidden />
          <p className="font-semibold">{pending ? t("participant.thanksPending") : quiz ? t("participant.waitForReveal") : t("participant.thanks")}</p>
        </div>
      )}
      {results && <MobileResults slide={slide} results={results} theme={theme} />}
      {!results && !quiz && <p className="text-center text-sm text-slate-500">{t("participant.lookAtScreen")}</p>}
    </div>
  );
}

function LeaderboardMobile({ entries, me, score }: { entries: { participantId: string; name: string; avatar?: string | null; score: number; rank: number }[]; me?: string; score: { score: number; rank: number | null } | null }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      {score && (
        <p className="rounded-xl bg-slate-100 p-3 text-center">
          {t("participant.yourScore", { score: score.score })}
          {score.rank && <strong> · {t("participant.rank", { rank: score.rank })}</strong>}
        </p>
      )}
      <ol className="space-y-1">
        {entries.map((e) => (
          <li key={e.participantId} className={cx("flex justify-between rounded-lg px-3 py-2 text-sm", e.participantId === me ? "bg-[color:var(--pd-accent)] font-bold text-white" : "bg-slate-50")}>
            <span>
              {e.rank}. {e.avatar ? `${e.avatar} ` : ""}
              {e.name || t("present.anonymousShort")}
            </span>
            <span className="tabular-nums">{e.score}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
