import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Maximize } from "lucide-react";
import { areResultsVisible } from "@polldeck/shared";
import { useHostSession } from "../lib/live";
import { useServerOffset } from "../lib/useServerClock";
import { useApp } from "../lib/app";
import { Spinner } from "../components/ui";
import { toggleFullscreen } from "../components/Fullscreen";
import { SlideView } from "../slides/SlideView";
import { useReactions } from "../slides/Reactions";
import { QrOverlay, joinInfo, useSlideKeys } from "./Present";

/** Beamer-Ansicht: zeigt die aktuelle Folie bildschirmfüllend, synchron per WebSocket. */
export function ScreenPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const { config } = useApp();
  const reactions = useReactions();
  const { state, error, emit, role, status } = useHostSession(id, "host", reactions.push);
  const now = useServerOffset(state?.serverTime);
  const [idle, setIdle] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const wake = () => {
      setIdle(false);
      clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => setIdle(true), 2500);
    };
    wake();
    window.addEventListener("mousemove", wake);
    return () => window.removeEventListener("mousemove", wake);
  }, []);

  const index = state?.live.currentIndex ?? 0;
  const count = state?.slides.length ?? 0;
  const canControl = role === "host";
  const go = useCallback((i: number) => canControl && i >= 0 && i < count && emit("presenter:goto", { index: i }), [canControl, count, emit]);
  const extra = useCallback((e: KeyboardEvent) => e.key === "f" && toggleFullscreen(), []);
  useSlideKeys(!!state && canControl, () => go(index - 1), () => go(index + 1), extra);

  if (error) return <div className="flex min-h-screen items-center justify-center bg-black p-6 text-center text-white">{t(`liveErrors.${error}`, { defaultValue: error })}</div>;
  if (!state) return <Spinner className="min-h-screen bg-black" />;
  const slide = state.slides[index];
  const st = slide ? state.live.slides[slide.id] ?? null : null;
  const join = joinInfo(state, config?.appDomain);

  return (
    <div className={`flex h-screen w-screen items-center justify-center overflow-hidden bg-black ${idle ? "cursor-none" : ""}`} onDoubleClick={() => toggleFullscreen()}>
      <h1 className="sr-only">{state.title}</h1>
      {/* 16:9 einpassen */}
      <div className="relative w-full max-w-[calc(100vh*16/9)]">
        {state.ended ? (
          <div className="pd-slide flex aspect-video w-full flex-col items-center justify-center bg-slate-900 text-white">
            <p className="pd-title font-bold">{t("present.thanks")}</p>
          </div>
        ) : slide ? (
          <SlideView
            slide={slide}
            theme={state.theme}
            results={state.results[slide.id]}
            showResults={areResultsVisible(slide, st)}
            slideState={st}
            questions={state.questions[slide.id]}
            leaderboard={state.leaderboard}
            responseCount={state.responseCounts[slide.id]}
            participantCount={state.settings.showParticipantCount ? state.participantCount : undefined}
            now={now}
            join={state.live.showJoinBanner ? join : null}
            overlay={state.live.reactionsEnabled ? reactions.overlay : null}
            autoLeaderboard={state.settings.autoLeaderboard}
          />
        ) : null}
        {state.live.qrFullscreen && !state.ended && <QrOverlay join={join} />}
      </div>
      {!idle && (
        <div className="fixed bottom-3 right-3 flex items-center gap-2 text-xs text-white/70">
          {status !== "connected" && <span className="rounded bg-amber-500/80 px-2 py-1 text-black">{t("present.reconnecting")}</span>}
          <button className="rounded-lg bg-white/10 p-2 hover:bg-white/20" onClick={() => toggleFullscreen()} aria-label={t("present.fullscreen")}>
            <Maximize className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}
