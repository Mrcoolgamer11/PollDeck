import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Check, Plus, X } from "lucide-react";
import type { SlideConfigMap } from "@polldeck/shared";
import { cx } from "../../components/ui";
import { SubmitButton } from "./SubmitButton";
import type { InputProps } from "./types";

/** Multiple Choice (und Quiz-Auswahl). */
export function ChoiceInput({ slide, onSubmit, busy, letters }: InputProps<{ optionIds: string[] }> & { letters?: boolean }) {
  const { t } = useTranslation();
  const cfg = slide.config as SlideConfigMap["multiple_choice"] & { correctOptionIds?: string[] };
  const multi = slide.type === "multiple_choice" ? cfg.multiSelect : false;
  const [sel, setSel] = useState<string[]>([]);
  const toggle = (id: string) => setSel((s) => (multi ? (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]) : [id]));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (sel.length) await onSubmit({ optionIds: sel });
  };
  // Quiz mit Einfachauswahl: sofort absenden (wie bei Quiz-Apps üblich).
  const instant = slide.type === "quiz_choice";
  return (
    <form onSubmit={submit} className="space-y-3">
      <fieldset className="space-y-2">
        <legend className="sr-only">{slide.title}</legend>
        {multi && <p className="text-sm opacity-70">{t("participant.multiHint")}</p>}
        {cfg.options.map((o, i) => {
          const active = sel.includes(o.id);
          return (
            <label
              key={o.id}
              className={cx(
                "flex min-h-[56px] cursor-pointer items-center gap-3 rounded-xl border-2 px-4 py-3 text-left text-base font-medium transition",
                active ? "border-[color:var(--pd-accent)] bg-[color:var(--pd-accent)] text-white" : "border-slate-200 bg-white text-slate-900 hover:border-slate-300",
              )}
            >
              <input
                type={multi ? "checkbox" : "radio"}
                name={`opt-${slide.id}`}
                className="sr-only"
                checked={active}
                disabled={busy}
                onChange={async () => {
                  toggle(o.id);
                  if (instant && !busy) await onSubmit({ optionIds: [o.id] });
                }}
              />
              {letters ? (
                <span className={cx("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold", active ? "bg-white/25" : "bg-slate-100")}>
                  {"ABCDEFGH"[i]}
                </span>
              ) : (
                <span className={cx("flex h-6 w-6 shrink-0 items-center justify-center border-2", multi ? "rounded-md" : "rounded-full", active ? "border-white bg-white/20" : "border-slate-300")}>
                  {active && <Check className="h-4 w-4" aria-hidden />}
                </span>
              )}
              {o.imageUrl && <img src={o.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />}
              <span className="min-w-0 flex-1 break-words">{o.label}</span>
            </label>
          );
        })}
      </fieldset>
      {!instant && <SubmitButton busy={busy} disabled={!sel.length} />}
    </form>
  );
}

export function WordCloudInput({ slide, onSubmit, busy }: InputProps<{ words: string[] }>) {
  const { t } = useTranslation();
  const cfg = slide.config as SlideConfigMap["word_cloud"];
  const [words, setWords] = useState<string[]>([""]);
  const filled = words.map((w) => w.trim()).filter(Boolean);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (filled.length && (await onSubmit({ words: filled }))) setWords([""]);
      }}
    >
      {words.map((w, i) => (
        <div key={i} className="flex gap-2">
          <input
            className="block w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none focus:border-[color:var(--pd-accent)]"
            aria-label={t("participant.wordN", { n: i + 1 })}
            placeholder={t("participant.wordPlaceholder")}
            maxLength={cfg.maxLength}
            autoFocus={i === 0}
            value={w}
            onChange={(e) => setWords(words.map((x, j) => (j === i ? e.target.value : x)))}
          />
          {words.length > 1 && (
            <button type="button" className="rounded-xl px-3 text-slate-500" aria-label={t("common.remove")} onClick={() => setWords(words.filter((_, j) => j !== i))}>
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      ))}
      {words.length < cfg.maxEntries && (
        <button type="button" className="inline-flex items-center gap-1 text-sm font-medium opacity-80" onClick={() => setWords([...words, ""])}>
          <Plus className="h-4 w-4" aria-hidden /> {t("participant.addWord")}
        </button>
      )}
      <p className="text-xs opacity-60">{t("participant.wordHint", { count: cfg.maxEntries })}</p>
      <SubmitButton busy={busy} disabled={!filled.length} />
    </form>
  );
}

export function OpenInput({ slide, onSubmit, busy }: InputProps<{ text: string }>) {
  const { t } = useTranslation();
  const cfg = slide.config as SlideConfigMap["open_ended"];
  const [text, setText] = useState("");
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (text.trim() && (await onSubmit({ text: text.trim() }))) setText("");
      }}
    >
      <textarea
        className="block min-h-[120px] w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none focus:border-[color:var(--pd-accent)]"
        aria-label={t("participant.yourAnswer")}
        placeholder={t("participant.yourAnswer")}
        maxLength={cfg.maxLength}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <p className="text-right text-xs opacity-60 tabular-nums">
        {text.length} / {cfg.maxLength}
      </p>
      <SubmitButton busy={busy} disabled={!text.trim()} />
    </form>
  );
}
