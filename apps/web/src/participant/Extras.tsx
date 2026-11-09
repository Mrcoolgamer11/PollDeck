import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Send, ThumbsUp } from "lucide-react";
import { REACTIONS, REACTION_EMOJI, type Reaction, type Slide, type SlideConfigMap } from "@polldeck/shared";
import type { useAudienceSession } from "../lib/live";
import { Button, cx } from "../components/ui";

type Live = ReturnType<typeof useAudienceSession>;

/** Reaktionsleiste am unteren Bildschirmrand. */
export function ParticipantExtras({ live, slide }: { live: Live; slide: Slide | null }) {
  const { t } = useTranslation();
  const [cooldown, setCooldown] = useState<Reaction | null>(null);
  const state = live.state;
  if (!state || state.mode === "SURVEY" || !state.settings.reactionsEnabled || !slide) return null;
  const send = async (r: Reaction) => {
    setCooldown(r);
    if ("vibrate" in navigator) navigator.vibrate?.(15);
    await live.emit("participant:react", { reaction: r });
    setTimeout(() => setCooldown(null), 400);
  };
  const labels: Record<Reaction, string> = {
    heart: t("participant.reactHeart"),
    thumbs: t("participant.reactThumbs"),
    question: t("participant.reactQuestion"),
    laugh: t("participant.reactLaugh"),
  };
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 bg-black/25 backdrop-blur" aria-label={t("participant.reactions")}>
      <div className="mx-auto flex max-w-lg justify-around px-4 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {REACTIONS.map((r) => (
          <button
            key={r}
            onClick={() => send(r)}
            className={cx("flex h-14 w-14 items-center justify-center rounded-full bg-white/15 text-3xl transition active:scale-90", cooldown === r && "scale-110 bg-white/30")}
            aria-label={labels[r]}
          >
            <span aria-hidden>{REACTION_EMOJI[r]}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

/** Q&A: Fragen stellen und upvoten. */
function Qa({ live, slide, closed }: { live: Live; slide: Slide; closed: boolean }) {
  const { t } = useTranslation();
  const cfg = slide.config as SlideConfigMap["qa"];
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState("");
  const questions = live.state?.questions ?? [];
  return (
    <div className="space-y-4">
      {!closed && (
        <form
          className="space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!text.trim()) return;
            setBusy(true);
            const r = await live.emit<{ id: string; status: string }>("qa:ask", { slideId: slide.id, text: text.trim() });
            setBusy(false);
            if (r.ok && r.data) {
              setText("");
              live.setMyQuestions((s) => new Set([...s, r.data!.id]));
              setInfo(r.data.status === "PENDING" ? t("participant.questionPending") : t("participant.questionSent"));
            } else if (!r.ok) setInfo(t(`liveErrors.${r.error}`, { defaultValue: r.error }));
          }}
        >
          <textarea
            className="block min-h-[90px] w-full rounded-xl border-2 border-slate-200 px-4 py-3 text-base outline-none focus:border-[color:var(--pd-accent)]"
            aria-label={t("participant.yourQuestion")}
            placeholder={t("participant.yourQuestion")}
            maxLength={cfg.maxLength}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <Button type="submit" className="w-full" size="lg" loading={busy} disabled={!text.trim()} style={{ background: "var(--pd-accent)" }}>
            <Send className="h-5 w-5" aria-hidden /> {t("participant.ask")}
          </Button>
          {info && (
            <p className="text-sm text-slate-600" role="status">
              {info}
            </p>
          )}
        </form>
      )}
      <ul className="space-y-2">
        {questions.map((q) => {
          const voted = live.myUpvotes.has(q.id);
          return (
            <li key={q.id} className={cx("flex items-start gap-3 rounded-xl bg-slate-50 p-3", q.answered && "opacity-50")}>
              <p className="min-w-0 flex-1 break-words text-sm">
                {q.text}
                {live.myQuestions.has(q.id) && <span className="ml-1 text-xs text-slate-500">({t("participant.mine")})</span>}
              </p>
              {cfg.allowUpvotes && (
                <button
                  className={cx(
                    "flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold",
                    voted ? "bg-[color:var(--pd-accent)] text-white" : "bg-white ring-1 ring-slate-200",
                  )}
                  aria-pressed={voted}
                  aria-label={t("participant.upvote", { count: q.upvotes })}
                  onClick={async () => {
                    const r = await live.emit<{ upvoted: boolean }>("qa:upvote", { questionId: q.id });
                    if (r.ok && r.data)
                      live.setMyUpvotes((s) => {
                        const n = new Set(s);
                        if (r.data!.upvoted) n.add(q.id);
                        else n.delete(q.id);
                        return n;
                      });
                  }}
                >
                  <ThumbsUp className="h-4 w-4" aria-hidden /> <span className="tabular-nums">{q.upvotes}</span>
                </button>
              )}
            </li>
          );
        })}
        {!questions.length && <li className="text-center text-sm text-slate-500">{t("participant.noQuestions")}</li>}
      </ul>
    </div>
  );
}

ParticipantExtras.Qa = Qa;
