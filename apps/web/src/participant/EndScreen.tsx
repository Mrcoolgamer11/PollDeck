import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Download, Home, Printer, Trash2, XCircle } from "lucide-react";
import type { useAudienceSession } from "../lib/live";
import { Button, Modal, cx } from "../components/ui";
import { LegalLinks } from "../components/LegalLinks";

type Live = ReturnType<typeof useAudienceSession>;

interface Summary {
  title: string;
  date: string;
  name: string | null;
  avatar: string | null;
  score: { score: number; rank: number | null };
  items: { no: number; title: string; type: string; answers: string[]; isCorrect: boolean | null; points: number }[];
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Ende der Sitzung (#4): Zur Startseite oder eigene Ergebnisse speichern. */
export function EndScreen({ live }: { live: Live }) {
  const { t, i18n } = useTranslation();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [forgetOpen, setForgetOpen] = useState(false);
  const [forgotten, setForgotten] = useState(false);

  useEffect(() => {
    live.emit<Summary>("audience:summary").then((r) => r.ok && r.data && setSummary(r.data));
  }, [live]);

  const save = () => {
    if (!summary) return;
    const date = new Date(summary.date).toLocaleString(i18n.language);
    const rows = summary.items
      .map(
        (i) =>
          `<tr><td>${i.no}</td><td>${esc(i.title || t(`slideTypes.${i.type}.name`))}</td><td>${esc(i.answers.join(" | "))}</td><td>${
            i.isCorrect === null ? "" : i.isCorrect ? "✓" : "✗"
          }</td><td>${i.points || ""}</td></tr>`,
      )
      .join("");
    const html = `<!doctype html><html lang="${i18n.language}"><head><meta charset="utf-8"><title>${esc(summary.title)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:760px;margin:2rem auto;padding:0 1rem;color:#111}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #ddd;padding:.5rem;text-align:left;vertical-align:top}th{background:#f4f2ff}</style></head><body>
<h1>${esc(summary.title)}</h1><p>${esc(date)} · ${summary.avatar ?? ""} ${esc(summary.name || t("present.anonymousShort"))}</p>
${summary.score.score ? `<p><strong>${esc(t("participant.yourScore", { score: summary.score.score }))}${summary.score.rank ? ` · ${esc(t("participant.rank", { rank: summary.score.rank }))}` : ""}</strong></p>` : ""}
<table><thead><tr><th>#</th><th>${esc(t("participant.summaryQuestion"))}</th><th>${esc(t("participant.summaryAnswer"))}</th><th></th><th>${esc(t("participant.summaryPoints"))}</th></tr></thead><tbody>${rows}</tbody></table>
</body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${summary.title.replace(/[^\p{L}\p{N} _-]+/gu, "_")} - ${t("participant.myResults")}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="mt-6 space-y-4">
      <div className="rounded-2xl bg-white p-5 text-center text-slate-900 shadow-lg">
        <div className="mx-auto mb-2 text-5xl" aria-hidden>
          {live.participant?.avatar ?? "🎉"}
        </div>
        <h1 className="mb-1 text-xl font-bold">{t("participant.endedTitle")}</h1>
        <p className="text-sm text-slate-600">{t("participant.ended")}</p>
        {live.myScore && live.myScore.score > 0 && (
          <p className="mt-3 text-lg font-bold">
            {t("participant.yourScore", { score: live.myScore.score })}
            {live.myScore.rank && ` · ${t("participant.rank", { rank: live.myScore.rank })}`}
          </p>
        )}
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <Link to="/" className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 font-medium ring-1 ring-slate-300 hover:bg-slate-50">
            <Home className="h-5 w-5" aria-hidden /> {t("participant.toHome")}
          </Link>
          <Button size="lg" onClick={save} disabled={!summary || !summary.items.length} style={{ background: "var(--pd-accent)" }}>
            <Download className="h-5 w-5" aria-hidden /> {t("participant.saveResults")}
          </Button>
        </div>
      </div>

      {summary && summary.items.length > 0 && (
        <section className="rounded-2xl bg-white p-5 text-slate-900 shadow-lg print:shadow-none" aria-labelledby="my-results">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="my-results" className="font-bold">
              {t("participant.myResults")}
            </h2>
            <button className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 print:hidden" onClick={() => window.print()}>
              <Printer className="h-4 w-4" aria-hidden /> {t("participant.print")}
            </button>
          </div>
          <ol className="divide-y divide-slate-100">
            {summary.items.map((i) => (
              <li key={i.no} className="flex items-start gap-3 py-2 text-sm">
                <span className="w-6 shrink-0 font-semibold tabular-nums text-slate-400">{i.no}.</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{i.title || t(`slideTypes.${i.type}.name`)}</p>
                  <p className="break-words text-slate-600">{i.answers.join(" · ")}</p>
                </div>
                {i.isCorrect !== null && (
                  <span className={cx("flex shrink-0 items-center gap-1 font-semibold", i.isCorrect ? "text-emerald-600" : "text-red-600")}>
                    {i.isCorrect ? <CheckCircle2 className="h-4 w-4" aria-label={t("participant.correct")} /> : <XCircle className="h-4 w-4" aria-label={t("participant.wrong")} />}
                    {i.points > 0 && <span className="tabular-nums">+{i.points}</span>}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
      {summary && summary.items.length > 0 && !forgotten && (
        <div className="text-center">
          <button className="inline-flex items-center gap-1 text-sm underline opacity-80 hover:opacity-100" onClick={() => setForgetOpen(true)}>
            <Trash2 className="h-4 w-4" aria-hidden /> {t("participant.forgetMe")}
          </button>
        </div>
      )}
      {forgotten && (
        <p className="rounded-xl bg-emerald-50 p-3 text-center text-sm text-emerald-800" role="status">
          {t("participant.forgotten")}
        </p>
      )}
      <Modal
        open={forgetOpen}
        onClose={() => setForgetOpen(false)}
        title={t("participant.forgetMe")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setForgetOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                const r = await live.emit("audience:forget");
                setForgetOpen(false);
                if (r.ok) {
                  setForgotten(true);
                  setSummary((s) => (s ? { ...s, items: [], score: { score: 0, rank: null } } : s));
                }
              }}
            >
              {t("common.delete")}
            </Button>
          </>
        }
      >
        <p className="text-sm">{t("participant.forgetHint")}</p>
      </Modal>
      <LegalLinks />
    </div>
  );
}
