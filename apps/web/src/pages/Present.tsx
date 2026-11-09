import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Flag,
  Lock,
  Maximize,
  MonitorUp,
  Play,
  QrCode as QrIcon,
  RefreshCw,
  RotateCcw,
  Smile,
  Square,
  ThumbsUp,
  Timer,
  Trash2,
  Unlock,
  UserX,
  Users,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { areResultsVisible, isInteractive, isQuiz, isRevealed, type HostState, type Slide } from "@polldeck/shared";
import { post } from "../lib/api";
import { useHostSession } from "../lib/live";
import { useServerOffset } from "../lib/useServerClock";
import { useApp } from "../lib/app";
import { Button, IconButton, Input, Modal, Spinner, cx, useToast } from "../components/ui";
import { QrCode } from "../components/QrCode";
import { toggleFullscreen } from "../components/Fullscreen";
import { SlideView, formatCode } from "../slides/SlideView";
import { SLIDE_META } from "../slides/meta";

export function joinInfo(state: HostState, appDomain?: string) {
  const domain = appDomain || new URL(state.joinUrl).host;
  return { domain, code: state.code, url: state.joinUrl };
}

/** Tastatursteuerung: Pfeiltasten, Bild auf/ab (Presenter-Clicker), Leertaste. */
export function useSlideKeys(enabled: boolean, onPrev: () => void, onNext: () => void, extra?: (e: KeyboardEvent) => void) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (["ArrowRight", "PageDown", " ", "ArrowDown"].includes(e.key)) {
        e.preventDefault();
        onNext();
      } else if (["ArrowLeft", "PageUp", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        onPrev();
      } else extra?.(e);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, onPrev, onNext, extra]);
}

export function PresentPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const { config } = useApp();
  const { state, status, error, emit } = useHostSession(id, "host");
  const now = useServerOffset(state?.serverTime);
  const [tab, setTab] = useState<"notes" | "moderation" | "qa" | "participants">("notes");
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [timerSecs, setTimerSecs] = useState(30);
  const [, force] = useState(0);

  // Für Countdown-abhängige Anzeigen regelmäßig neu rendern.
  useEffect(() => {
    const h = setInterval(() => force((x) => x + 1), 1000);
    return () => clearInterval(h);
  }, []);

  const act = useCallback(
    async (event: string, payload?: unknown) => {
      const r = await emit(event, payload);
      if (!r.ok) toast(t(`liveErrors.${r.error}`, { defaultValue: t("errors.generic", { code: r.error }) }), "error");
      return r;
    },
    [emit, toast, t],
  );

  const index = state?.live.currentIndex ?? 0;
  const count = state?.slides.length ?? 0;
  const goto = useCallback((i: number) => state && i >= 0 && i < count && act("presenter:goto", { index: i }), [state, count, act]);
  const prev = useCallback(() => goto(index - 1), [goto, index]);
  const next = useCallback(() => goto(index + 1), [goto, index]);
  const slide: Slide | null = state?.slides[index] ?? null;
  const st = slide ? state?.live.slides[slide.id] ?? null : null;

  const extraKeys = useCallback(
    (e: KeyboardEvent) => {
      if (!slide) return;
      if (e.key === "r") act("presenter:toggleResults", { slideId: slide.id });
      if (e.key === "l") act("presenter:lock", { slideId: slide.id });
      if (e.key === "f") toggleFullscreen();
    },
    [slide, act],
  );
  useSlideKeys(!!state && !state.ended, prev, next, extraKeys);

  useEffect(() => {
    if (slide?.settings.timerSeconds) setTimerSecs(slide.settings.timerSeconds);
  }, [slide?.id, slide?.settings.timerSeconds]);

  const pendingCount = useMemo(() => {
    if (!state) return 0;
    let n = 0;
    for (const r of Object.values(state.results)) if (r.kind === "open") n += r.items.filter((i) => i.status === "PENDING").length;
    for (const qs of Object.values(state.questions)) n += qs.filter((q) => q.status === "PENDING").length;
    return n;
  }, [state]);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-lg font-semibold">{t(`liveErrors.${error}`, { defaultValue: error })}</p>
        <Link to="/dashboard" className="text-brand-600 underline">
          {t("nav.dashboard")}
        </Link>
      </div>
    );
  }
  if (!state || !slide) return <Spinner className="min-h-screen" />;

  const join = joinInfo(state, config?.appDomain);
  const resultsVisible = areResultsVisible(slide, st);
  const quiz = isQuiz(slide.type);
  const survey = state.mode === "SURVEY";
  const revealed = isRevealed(st, now());
  const timerRunning = !!st?.timerEndsAt && st.timerEndsAt > now();

  return (
    <div className="flex h-screen flex-col bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
        <Link to={`/edit/${state.presentationId}`} className="inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" aria-label={t("present.backToEditor")}>
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate font-semibold">{state.title}</h1>
          <p className="text-xs text-slate-500">
            {survey ? t("present.surveyMode") : t("present.presenterMode")} · {join.domain} · <span className="font-semibold tabular-nums">{formatCode(state.code)}</span>
          </p>
        </div>
        <span
          className={cx("ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", status === "connected" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200" : "bg-amber-100 text-amber-800")}
          role="status"
        >
          {status === "connected" ? <Wifi className="h-3.5 w-3.5" aria-hidden /> : <WifiOff className="h-3.5 w-3.5" aria-hidden />}
          {status === "connected" ? t("present.connected") : t("present.reconnecting")}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold dark:bg-slate-800" title={t("present.participants")}>
          <Users className="h-3.5 w-3.5" aria-hidden /> <span className="tabular-nums">{state.participantCount}</span>
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <IconButton label={t("present.toggleBanner")} active={state.live.showJoinBanner} onClick={() => act("presenter:settings", { showJoinBanner: !state.live.showJoinBanner })}>
            <Flag className="h-5 w-5" />
          </IconButton>
          <IconButton label={t("present.toggleQr")} active={state.live.qrFullscreen} onClick={() => act("presenter:settings", { qrFullscreen: !state.live.qrFullscreen })}>
            <QrIcon className="h-5 w-5" />
          </IconButton>
          <IconButton label={t("present.toggleReactions")} active={state.live.reactionsEnabled} onClick={() => act("presenter:settings", { reactionsEnabled: !state.live.reactionsEnabled })}>
            <Smile className="h-5 w-5" />
          </IconButton>
          <IconButton label={t("present.fullscreen")} onClick={() => toggleFullscreen()}>
            <Maximize className="h-5 w-5" />
          </IconButton>
          <Button variant="secondary" size="sm" onClick={() => window.open(`/screen/${state.sessionId}`, `polldeck-screen-${state.sessionId}`, "popup,width=1280,height=720")}>
            <MonitorUp className="h-4 w-4" aria-hidden /> {t("present.openScreen")}
          </Button>
          <Button variant="danger" size="sm" onClick={() => setConfirmEnd(true)} disabled={state.ended}>
            <Square className="h-4 w-4" aria-hidden /> {t("present.end")}
          </Button>
        </div>
      </header>

      {state.ended && (
        <div className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">
          {t("present.endedBanner")}{" "}
          <Link className="font-semibold underline" to={`/sessions/${state.sessionId}`}>
            {t("present.viewResults")}
          </Link>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_380px]">
        <section className="flex min-h-0 flex-col overflow-auto p-3">
          {survey && <p className="mb-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800 dark:bg-brand-900/30 dark:text-brand-200">{t("present.surveyHint")}</p>}
          <div className="relative mx-auto w-full max-w-5xl overflow-hidden rounded-xl shadow-xl ring-1 ring-black/10">
            <SlideView
              slide={slide}
              theme={state.theme}
              results={state.results[slide.id]}
              showResults={resultsVisible}
              slideState={st}
              questions={state.questions[slide.id]}
              leaderboard={state.leaderboard}
              responseCount={state.responseCounts[slide.id]}
              participantCount={state.settings.showParticipantCount ? state.participantCount : undefined}
              now={now}
              join={state.live.showJoinBanner ? join : null}
              autoLeaderboard={state.settings.autoLeaderboard}
            />
            {state.live.qrFullscreen && <QrOverlay join={join} onClose={() => act("presenter:settings", { qrFullscreen: false })} />}
          </div>

          {/* Steuerung */}
          <div className="mx-auto mt-3 flex w-full max-w-5xl flex-wrap items-center gap-2 rounded-xl bg-white p-2 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
            <IconButton label={t("present.prev")} onClick={prev} disabled={index === 0}>
              <ChevronLeft className="h-6 w-6" />
            </IconButton>
            <span className="text-sm font-semibold tabular-nums">
              {index + 1} / {count}
            </span>
            <IconButton label={t("present.next")} onClick={next} disabled={index >= count - 1}>
              <ChevronRight className="h-6 w-6" />
            </IconButton>
            <span className="mx-1 h-6 w-px bg-slate-200 dark:bg-slate-700" aria-hidden />
            {(isInteractive(slide.type) || slide.type === "qa") && (
              <>
                <Button size="sm" variant="secondary" onClick={() => act("presenter:toggleResults", { slideId: slide.id })} aria-pressed={resultsVisible}>
                  {resultsVisible ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                  {resultsVisible ? t("present.hideResults") : t("present.showResults")}
                </Button>
                {!survey && (
                  <Button size="sm" variant="secondary" onClick={() => act("presenter:lock", { slideId: slide.id })} aria-pressed={!!st?.locked}>
                    {st?.locked ? <Unlock className="h-4 w-4" aria-hidden /> : <Lock className="h-4 w-4" aria-hidden />}
                    {st?.locked ? t("present.unlock") : t("present.lock")}
                  </Button>
                )}
              </>
            )}
            {!survey && quiz && !st?.quizStartedAt && (
              <Button size="sm" onClick={() => act("presenter:startQuiz", { slideId: slide.id })}>
                <Play className="h-4 w-4" aria-hidden /> {t("present.startQuiz")}
              </Button>
            )}
            {!survey && quiz && st?.quizStartedAt && !revealed && (
              <Button size="sm" onClick={() => act("presenter:reveal", { slideId: slide.id })}>
                <Check className="h-4 w-4" aria-hidden /> {t("present.reveal")}
              </Button>
            )}
            {slide.type === "number_guess" && (slide.config as { correctAnswer?: number | null }).correctAnswer != null && !st?.revealed && (
              <Button size="sm" variant="secondary" onClick={() => act("presenter:reveal", { slideId: slide.id })}>
                <Check className="h-4 w-4" aria-hidden /> {t("present.showSolution")}
              </Button>
            )}
            {!survey && !quiz && (isInteractive(slide.type) || slide.type === "qa") && (
              <div className="flex items-center gap-1">
                {timerRunning ? (
                  <Button size="sm" variant="secondary" onClick={() => act("presenter:startTimer", { slideId: slide.id, seconds: null })}>
                    <X className="h-4 w-4" aria-hidden /> {t("present.stopTimer")}
                  </Button>
                ) : (
                  <>
                    <Input
                      type="number"
                      min={3}
                      max={3600}
                      aria-label={t("present.timerSeconds")}
                      className="!w-20 py-1"
                      value={timerSecs}
                      onChange={(e) => setTimerSecs(Math.max(3, Math.min(3600, Number(e.target.value) || 30)))}
                    />
                    <Button size="sm" variant="secondary" onClick={() => act("presenter:startTimer", { slideId: slide.id, seconds: timerSecs })}>
                      <Timer className="h-4 w-4" aria-hidden /> {t("present.startTimer")}
                    </Button>
                  </>
                )}
              </div>
            )}
            {(isInteractive(slide.type) || slide.type === "qa") && (
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setConfirmReset(true)}>
                <RotateCcw className="h-4 w-4" aria-hidden /> {t("present.reset")}
              </Button>
            )}
          </div>

          {/* Folienleiste */}
          <nav className="mx-auto mt-3 w-full max-w-5xl overflow-x-auto pb-2" aria-label={t("editor.slides")}>
            <ol className="flex gap-2">
              {state.slides.map((s, i) => {
                const Icon = SLIDE_META[s.type].icon;
                return (
                  <li key={s.id}>
                    <button
                      onClick={() => goto(i)}
                      aria-current={i === index ? "step" : undefined}
                      className={cx(
                        "flex w-40 items-center gap-2 rounded-lg p-2 text-left text-xs ring-1 transition",
                        i === index ? "bg-brand-600 text-white ring-brand-600" : "bg-white ring-slate-200 hover:ring-brand-300 dark:bg-slate-900 dark:ring-slate-700",
                      )}
                    >
                      <span className="font-semibold tabular-nums">{i + 1}</span>
                      <Icon className="h-4 w-4 shrink-0" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{s.title || t(`slideTypes.${s.type}.name`)}</span>
                      {state.responseCounts[s.id] !== undefined && <span className="rounded-full bg-black/10 px-1.5 tabular-nums">{state.responseCounts[s.id]}</span>}
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>
        </section>

        <aside className="flex min-h-0 flex-col border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:border-l lg:border-t-0">
          <div role="tablist" className="flex border-b border-slate-200 dark:border-slate-800">
            {(
              [
                ["notes", t("present.tabNotes")],
                ["moderation", t("present.tabModeration")],
                ["qa", t("present.tabQa")],
                ["participants", t("present.tabParticipants")],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={cx("relative flex-1 border-b-2 px-2 py-2.5 text-xs font-medium sm:text-sm", tab === k ? "border-brand-600 text-brand-700 dark:text-brand-300" : "border-transparent text-slate-500")}
              >
                {label}
                {k === "moderation" && pendingCount > 0 && (
                  <span className="ml-1 rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">{pendingCount}</span>
                )}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-4">
            {tab === "notes" && (
              <div>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("present.notesFor", { n: index + 1 })}</h2>
                {slide.notes ? <p className="whitespace-pre-line text-sm leading-relaxed">{slide.notes}</p> : <p className="text-sm text-slate-500">{t("present.noNotes")}</p>}
                {state.slides[index + 1] && (
                  <div className="mt-6">
                    <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("present.nextSlide")}</h2>
                    <div className="overflow-hidden rounded-lg ring-1 ring-slate-200 dark:ring-slate-700">
                      <SlideView slide={state.slides[index + 1]} theme={state.theme} preview />
                    </div>
                  </div>
                )}
                <p className="mt-6 text-xs text-slate-500">{t("present.keyboardHint")}</p>
              </div>
            )}
            {tab === "moderation" && <ModerationPanel state={state} act={act} />}
            {tab === "qa" && <QaPanel state={state} act={act} currentSlideId={slide.id} />}
            {tab === "participants" && <ParticipantsPanel emit={emit} act={act} />}
          </div>
        </aside>
      </div>

      <Modal
        open={confirmEnd}
        onClose={() => setConfirmEnd(false)}
        title={t("present.endTitle")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmEnd(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                await post(`/api/sessions/${state.sessionId}/end`);
                navigate(`/sessions/${state.sessionId}`);
              }}
            >
              {t("present.end")}
            </Button>
          </>
        }
      >
        <p>{t("present.endConfirm")}</p>
      </Modal>
      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title={t("present.reset")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmReset(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                await act("presenter:reset", { slideId: slide.id });
                setConfirmReset(false);
              }}
            >
              {t("present.reset")}
            </Button>
          </>
        }
      >
        <p>{t("present.resetConfirm")}</p>
      </Modal>
    </div>
  );
}

export function QrOverlay({ join, onClose }: { join: { domain: string; code: string; url: string }; onClose?: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="pd-slide absolute inset-0 z-20 flex flex-col items-center justify-center gap-[2cqh] bg-white text-slate-900">
      <p className="pd-text font-semibold">
        {t("present.joinAt")} <strong>{join.domain}</strong>
      </p>
      <div className="h-[55cqh] w-[55cqh]">
        <QrCode value={join.url} size={1000} label={t("present.qrLabel")} />
      </div>
      <p className="pd-title font-extrabold tabular-nums tracking-widest">{formatCode(join.code)}</p>
      {onClose && (
        <button className="absolute right-3 top-3 rounded-full p-2 hover:bg-slate-100" onClick={onClose} aria-label={t("common.close")}>
          <X className="h-6 w-6" />
        </button>
      )}
    </div>
  );
}

type Act = (event: string, payload?: unknown) => Promise<{ ok: boolean }>;

function ModerationPanel({ state, act }: { state: HostState; act: Act }) {
  const { t } = useTranslation();
  const items: { kind: "response" | "question"; id: string; text: string; slideNo: number; status: string }[] = [];
  state.slides.forEach((s, i) => {
    const r = state.results[s.id];
    if (r?.kind === "open") r.items.forEach((it) => items.push({ kind: "response", id: it.id, text: it.text, slideNo: i + 1, status: it.status }));
    (state.questions[s.id] ?? []).forEach((q) => items.push({ kind: "question", id: q.id, text: q.text, slideNo: i + 1, status: q.status }));
  });
  const pending = items.filter((i) => i.status === "PENDING");
  const approved = items.filter((i) => i.status === "APPROVED");
  const row = (it: (typeof items)[number], isPending: boolean) => (
    <li key={it.id} className="flex items-start gap-2 py-2 text-sm">
      <span className="mt-0.5 rounded bg-slate-100 px-1.5 text-[10px] font-semibold tabular-nums dark:bg-slate-800">#{it.slideNo}</span>
      <span className="min-w-0 flex-1 break-words">{it.text}</span>
      {isPending && (
        <IconButton label={t("present.approve")} onClick={() => act("presenter:moderate", { kind: it.kind, id: it.id, status: "APPROVED" })}>
          <Check className="h-4 w-4 text-emerald-600" />
        </IconButton>
      )}
      <IconButton
        label={isPending ? t("present.reject") : t("common.delete")}
        onClick={() =>
          isPending || it.kind === "question"
            ? act("presenter:moderate", { kind: it.kind, id: it.id, status: "REJECTED" })
            : act("presenter:deleteResponse", { id: it.id })
        }
      >
        <Trash2 className="h-4 w-4 text-red-600" />
      </IconButton>
    </li>
  );
  return (
    <div className="space-y-5">
      <section>
        <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("present.pending", { count: pending.length })}</h2>
        {pending.length ? <ul className="divide-y divide-slate-100 dark:divide-slate-800">{pending.map((i) => row(i, true))}</ul> : <p className="text-sm text-slate-500">{t("present.nothingPending")}</p>}
      </section>
      <section>
        <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("present.visible")}</h2>
        {approved.length ? <ul className="divide-y divide-slate-100 dark:divide-slate-800">{approved.map((i) => row(i, false))}</ul> : <p className="text-sm text-slate-500">{t("present.noVisible")}</p>}
      </section>
      <p className="text-xs text-slate-500">{t("present.moderationHint")}</p>
    </div>
  );
}

function QaPanel({ state, act, currentSlideId }: { state: HostState; act: Act; currentSlideId: string }) {
  const { t } = useTranslation();
  const qaSlides = state.slides.filter((s) => s.type === "qa");
  if (!qaSlides.length) return <p className="text-sm text-slate-500">{t("present.noQaSlide")}</p>;
  return (
    <div className="space-y-5">
      {qaSlides.map((s) => (
        <section key={s.id}>
          <h2 className={cx("mb-1 text-sm font-semibold", s.id === currentSlideId && "text-brand-600")}>{s.title || t("slideTypes.qa.name")}</h2>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {(state.questions[s.id] ?? []).map((q) => (
              <li key={q.id} className={cx("flex items-start gap-2 py-2 text-sm", q.answered && "opacity-50")}>
                <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold tabular-nums">
                  <ThumbsUp className="h-3.5 w-3.5" aria-hidden /> {q.upvotes}
                </span>
                <span className="min-w-0 flex-1 break-words">
                  {q.text}
                  {q.status === "PENDING" && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-800">{t("present.pendingBadge")}</span>}
                </span>
                {q.status === "PENDING" ? (
                  <IconButton label={t("present.approve")} onClick={() => act("presenter:moderate", { kind: "question", id: q.id, status: "APPROVED" })}>
                    <Check className="h-4 w-4 text-emerald-600" />
                  </IconButton>
                ) : (
                  <IconButton label={q.answered ? t("present.markUnanswered") : t("present.markAnswered")} active={q.answered} onClick={() => act("qa:answered", { questionId: q.id, answered: !q.answered })}>
                    <Check className="h-4 w-4" />
                  </IconButton>
                )}
                <IconButton label={t("common.delete")} onClick={() => act("presenter:deleteQuestion", { id: q.id })}>
                  <Trash2 className="h-4 w-4 text-red-600" />
                </IconButton>
              </li>
            ))}
            {!(state.questions[s.id] ?? []).length && <li className="py-2 text-sm text-slate-500">{t("present.noQuestions")}</li>}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ParticipantsPanel({ emit, act }: { emit: <T>(e: string, p?: unknown) => Promise<{ ok: true; data: T } | { ok: false; error: string }>; act: Act }) {
  const { t } = useTranslation();
  const [list, setList] = useState<{ id: string; name: string | null; responses: number; online: boolean }[] | null>(null);
  const [kick, setKick] = useState<{ id: string; name: string | null } | null>(null);
  const load = useCallback(async () => {
    const r = await emit<typeof list>("host:participants");
    if (r.ok) setList(r.data);
  }, [emit]);
  useEffect(() => {
    load();
    const h = setInterval(load, 5000);
    return () => clearInterval(h);
  }, [load]);
  if (!list) return <Spinner />;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("present.participantList", { count: list.length })}</h2>
        <IconButton label={t("common.refresh")} onClick={load}>
          <RefreshCw className="h-4 w-4" />
        </IconButton>
      </div>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {list.map((p, i) => (
          <li key={p.id} className="flex items-center gap-2 py-2 text-sm">
            <span className={cx("h-2 w-2 rounded-full", p.online ? "bg-emerald-500" : "bg-slate-300")} aria-label={p.online ? t("present.online") : t("present.offline")} />
            <span className="min-w-0 flex-1 truncate">{p.name || t("present.anonymous", { n: i + 1 })}</span>
            <span className="text-xs text-slate-500 tabular-nums">{t("present.responsesShort", { count: p.responses })}</span>
            <IconButton label={t("present.kick")} onClick={() => setKick(p)}>
              <UserX className="h-4 w-4 text-red-600" />
            </IconButton>
          </li>
        ))}
        {!list.length && <li className="py-2 text-sm text-slate-500">{t("present.noParticipants")}</li>}
      </ul>
      <Modal
        open={!!kick}
        onClose={() => setKick(null)}
        title={t("present.kick")}
        footer={
          <Button
            variant="danger"
            onClick={async () => {
              if (kick) await act("presenter:kick", { participantId: kick.id });
              setKick(null);
              load();
            }}
          >
            {t("present.kick")}
          </Button>
        }
      >
        <p>{t("present.kickConfirm", { name: kick?.name || t("present.anonymousShort") })}</p>
      </Modal>
    </div>
  );
}
