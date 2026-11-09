import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, CheckCircle2, Circle, Plus, Trash2 } from "lucide-react";
import { newId, type Slide, type SlideConfigMap } from "@polldeck/shared";
import { Button, Field, IconButton, Input, Select, Textarea, Toggle, cx } from "../components/ui";
import { ImagePicker } from "./ImagePicker";

type Item = { id: string; label: string; imageUrl?: string | null };

function ItemList({
  items,
  onChange,
  min,
  max,
  withImages,
  correct,
  onToggleCorrect,
  addLabel,
  placeholder,
}: {
  items: Item[];
  onChange: (items: Item[]) => void;
  min: number;
  max: number;
  withImages?: boolean;
  correct?: string[];
  onToggleCorrect?: (id: string) => void;
  addLabel: string;
  placeholder: (i: number) => string;
}) {
  const { t } = useTranslation();
  const move = (i: number, d: number) => {
    const next = [...items];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x);
    onChange(next);
  };
  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {items.map((it, i) => (
          <li key={it.id} className="flex items-center gap-1.5">
            {onToggleCorrect && (
              <IconButton
                label={correct?.includes(it.id) ? t("editor.markedCorrect") : t("editor.markCorrect")}
                onClick={() => onToggleCorrect(it.id)}
                className={cx(correct?.includes(it.id) ? "text-emerald-600" : "text-slate-400")}
                aria-pressed={correct?.includes(it.id)}
              >
                {correct?.includes(it.id) ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
              </IconButton>
            )}
            <Input
              aria-label={placeholder(i)}
              placeholder={placeholder(i)}
              value={it.label}
              maxLength={300}
              onChange={(e) => onChange(items.map((x) => (x.id === it.id ? { ...x, label: e.target.value } : x)))}
            />
            {withImages && (
              <ImagePicker compact value={it.imageUrl} label={t("editor.optionImage")} onChange={(url) => onChange(items.map((x) => (x.id === it.id ? { ...x, imageUrl: url } : x)))} />
            )}
            <IconButton label={t("editor.moveUp")} disabled={i === 0} onClick={() => move(i, -1)}>
              <ArrowUp className="h-4 w-4" />
            </IconButton>
            <IconButton label={t("editor.moveDown")} disabled={i === items.length - 1} onClick={() => move(i, 1)}>
              <ArrowDown className="h-4 w-4" />
            </IconButton>
            <IconButton label={t("common.delete")} disabled={items.length <= min} onClick={() => onChange(items.filter((x) => x.id !== it.id))}>
              <Trash2 className="h-4 w-4" />
            </IconButton>
          </li>
        ))}
      </ul>
      {items.length < max && (
        <Button size="sm" variant="secondary" onClick={() => onChange([...items, { id: newId(), label: "", imageUrl: null }])}>
          <Plus className="h-4 w-4" aria-hidden /> {addLabel}
        </Button>
      )}
    </div>
  );
}

const num = (v: string, fallback: number) => (v === "" || Number.isNaN(Number(v)) ? fallback : Number(v));

export function ConfigEditor({ slide, onChange }: { slide: Slide; onChange: (config: Slide["config"]) => void }) {
  const { t } = useTranslation();
  const opt = (i: number) => t("editor.optionN", { n: i + 1 });

  switch (slide.type) {
    case "multiple_choice": {
      const c = slide.config as SlideConfigMap["multiple_choice"];
      return (
        <div className="space-y-4">
          <Field label={t("editor.options")}>
            {() => <ItemList items={c.options} min={1} max={30} withImages addLabel={t("editor.addOption")} placeholder={opt} onChange={(options) => onChange({ ...c, options })} />}
          </Field>
          <Toggle checked={c.multiSelect} onChange={(multiSelect) => onChange({ ...c, multiSelect })} label={t("editor.multiSelect")} />
          <Field label={t("editor.chartType")}>
            {(id) => (
              <Select id={id} value={c.chartType} onChange={(e) => onChange({ ...c, chartType: e.target.value as typeof c.chartType })}>
                <option value="bar">{t("editor.chart.bar")}</option>
                <option value="pie">{t("editor.chart.pie")}</option>
                <option value="donut">{t("editor.chart.donut")}</option>
                <option value="dots">{t("editor.chart.dots")}</option>
              </Select>
            )}
          </Field>
        </div>
      );
    }
    case "word_cloud": {
      const c = slide.config as SlideConfigMap["word_cloud"];
      return (
        <div className="space-y-4">
          <Field label={t("editor.maxEntries")}>
            {(id) => (
              <Select id={id} value={c.maxEntries} onChange={(e) => onChange({ ...c, maxEntries: Number(e.target.value) })}>
                {[1, 2, 3].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("editor.maxWordLength")}>
            {(id) => <Input id={id} type="number" min={1} max={50} value={c.maxLength} onChange={(e) => onChange({ ...c, maxLength: num(e.target.value, 25) })} />}
          </Field>
        </div>
      );
    }
    case "open_ended": {
      const c = slide.config as SlideConfigMap["open_ended"];
      return (
        <div className="space-y-4">
          <Field label={t("editor.display")}>
            {(id) => (
              <Select id={id} value={c.display} onChange={(e) => onChange({ ...c, display: e.target.value as typeof c.display })}>
                <option value="wall">{t("editor.displayWall")}</option>
                <option value="ticker">{t("editor.displayTicker")}</option>
              </Select>
            )}
          </Field>
          <Field label={t("editor.maxLength")}>
            {(id) => <Input id={id} type="number" min={10} max={1000} value={c.maxLength} onChange={(e) => onChange({ ...c, maxLength: num(e.target.value, 250) })} />}
          </Field>
        </div>
      );
    }
    case "scale": {
      const c = slide.config as SlideConfigMap["scale"];
      return (
        <div className="space-y-4">
          <Field label={t("editor.statements")}>
            {() => (
              <ItemList
                items={c.statements}
                min={1}
                max={15}
                addLabel={t("editor.addStatement")}
                placeholder={(i) => t("editor.statementN", { n: i + 1 })}
                onChange={(items) => onChange({ ...c, statements: items.map(({ id, label }) => ({ id, label })) })}
              />
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("editor.scaleMin")}>
              {(id) => (
                <Select id={id} value={c.min} onChange={(e) => onChange({ ...c, min: Number(e.target.value) })}>
                  <option value={0}>0</option>
                  <option value={1}>1</option>
                </Select>
              )}
            </Field>
            <Field label={t("editor.scaleMax")}>
              {(id) => (
                <Select id={id} value={c.max} onChange={(e) => onChange({ ...c, max: Number(e.target.value) })}>
                  {[3, 4, 5, 6, 7, 10].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t("editor.minLabel")}>{(id) => <Input id={id} value={c.minLabel} maxLength={60} onChange={(e) => onChange({ ...c, minLabel: e.target.value })} />}</Field>
            <Field label={t("editor.maxLabel")}>{(id) => <Input id={id} value={c.maxLabel} maxLength={60} onChange={(e) => onChange({ ...c, maxLabel: e.target.value })} />}</Field>
          </div>
        </div>
      );
    }
    case "ranking": {
      const c = slide.config as SlideConfigMap["ranking"];
      return (
        <Field label={t("editor.options")}>
          {() => <ItemList items={c.options} min={2} max={15} addLabel={t("editor.addOption")} placeholder={opt} onChange={(options) => onChange({ ...c, options })} />}
        </Field>
      );
    }
    case "points_100": {
      const c = slide.config as SlideConfigMap["points_100"];
      return (
        <div className="space-y-4">
          <Field label={t("editor.options")}>
            {() => <ItemList items={c.options} min={2} max={15} addLabel={t("editor.addOption")} placeholder={opt} onChange={(options) => onChange({ ...c, options })} />}
          </Field>
          <Field label={t("editor.totalPoints")}>
            {(id) => <Input id={id} type="number" min={10} max={1000} value={c.total} onChange={(e) => onChange({ ...c, total: num(e.target.value, 100) })} />}
          </Field>
        </div>
      );
    }
    case "grid_2x2": {
      const c = slide.config as SlideConfigMap["grid_2x2"];
      return (
        <div className="space-y-4">
          <Field label={t("editor.gridItems")}>
            {() => (
              <ItemList
                items={c.items}
                min={1}
                max={10}
                addLabel={t("editor.addItem")}
                placeholder={(i) => t("editor.itemN", { n: i + 1 })}
                onChange={(items) => onChange({ ...c, items: items.map(({ id, label }) => ({ id, label })) })}
              />
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("editor.xLabel")}>{(id) => <Input id={id} value={c.xLabel} maxLength={60} onChange={(e) => onChange({ ...c, xLabel: e.target.value })} />}</Field>
            <Field label={t("editor.yLabel")}>{(id) => <Input id={id} value={c.yLabel} maxLength={60} onChange={(e) => onChange({ ...c, yLabel: e.target.value })} />}</Field>
            <Field label={t("editor.rangeMin")}>{(id) => <Input id={id} type="number" value={c.min} onChange={(e) => onChange({ ...c, min: num(e.target.value, 0) })} />}</Field>
            <Field label={t("editor.rangeMax")}>{(id) => <Input id={id} type="number" value={c.max} onChange={(e) => onChange({ ...c, max: num(e.target.value, 10) })} />}</Field>
          </div>
        </div>
      );
    }
    case "number_guess": {
      const c = slide.config as SlideConfigMap["number_guess"];
      return (
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("editor.rangeMin")}>{(id) => <Input id={id} type="number" value={c.min} onChange={(e) => onChange({ ...c, min: num(e.target.value, 0) })} />}</Field>
          <Field label={t("editor.rangeMax")}>{(id) => <Input id={id} type="number" value={c.max} onChange={(e) => onChange({ ...c, max: num(e.target.value, 100) })} />}</Field>
          <Field label={t("editor.correctNumber")} hint={t("editor.optional")}>
            {(id) => (
              <Input
                id={id}
                type="number"
                value={c.correctAnswer ?? ""}
                onChange={(e) => onChange({ ...c, correctAnswer: e.target.value === "" ? null : Number(e.target.value) })}
              />
            )}
          </Field>
          <Field label={t("editor.unit")}>{(id) => <Input id={id} value={c.unit} maxLength={20} onChange={(e) => onChange({ ...c, unit: e.target.value })} />}</Field>
        </div>
      );
    }
    case "qa": {
      const c = slide.config as SlideConfigMap["qa"];
      return (
        <div className="space-y-4">
          <Toggle checked={c.allowUpvotes} onChange={(allowUpvotes) => onChange({ ...c, allowUpvotes })} label={t("editor.allowUpvotes")} />
          <Field label={t("editor.maxLength")}>
            {(id) => <Input id={id} type="number" min={10} max={500} value={c.maxLength} onChange={(e) => onChange({ ...c, maxLength: num(e.target.value, 250) })} />}
          </Field>
        </div>
      );
    }
    case "quiz_choice": {
      const c = slide.config as SlideConfigMap["quiz_choice"];
      return (
        <div className="space-y-4">
          <Field label={t("editor.answers")} hint={t("editor.markCorrectHint")}>
            {() => (
              <ItemList
                items={c.options}
                min={2}
                max={8}
                withImages
                correct={c.correctOptionIds}
                onToggleCorrect={(id) => {
                  const has = c.correctOptionIds.includes(id);
                  const next = has ? c.correctOptionIds.filter((x) => x !== id) : [...c.correctOptionIds, id];
                  if (next.length) onChange({ ...c, correctOptionIds: next });
                }}
                addLabel={t("editor.addAnswer")}
                placeholder={(i) => t("editor.answerN", { n: i + 1 })}
                onChange={(options) => {
                  const ids = new Set(options.map((o) => o.id));
                  const correctOptionIds = c.correctOptionIds.filter((x) => ids.has(x));
                  onChange({ ...c, options, correctOptionIds: correctOptionIds.length ? correctOptionIds : [options[0].id] });
                }}
              />
            )}
          </Field>
          <QuizTiming c={c} onChange={(p) => onChange({ ...c, ...p })} />
        </div>
      );
    }
    case "quiz_text": {
      const c = slide.config as SlideConfigMap["quiz_text"];
      return (
        <div className="space-y-4">
          <Field label={t("editor.correctAnswers")} hint={t("editor.correctAnswersHint")}>
            {(id) => (
              <Textarea
                id={id}
                rows={3}
                value={c.correctAnswers.join("\n")}
                onChange={(e) => {
                  const list = e.target.value.split("\n").map((s) => s.slice(0, 100));
                  onChange({ ...c, correctAnswers: list.some((s) => s.trim()) ? list : [""] });
                }}
              />
            )}
          </Field>
          <Toggle checked={c.allowTypos} onChange={(allowTypos) => onChange({ ...c, allowTypos })} label={t("editor.allowTypos")} description={t("editor.allowTyposHint")} />
          <Toggle checked={c.caseSensitive} onChange={(caseSensitive) => onChange({ ...c, caseSensitive })} label={t("editor.caseSensitive")} />
          <QuizTiming c={c} onChange={(p) => onChange({ ...c, ...p })} />
        </div>
      );
    }
    case "content": {
      const c = slide.config as SlideConfigMap["content"];
      return (
        <div className="space-y-4">
          <Field label={t("editor.layout")}>
            {(id) => (
              <Select id={id} value={c.layout} onChange={(e) => onChange({ ...c, layout: e.target.value as typeof c.layout })}>
                <option value="heading">{t("editor.layoutHeading")}</option>
                <option value="paragraph">{t("editor.layoutParagraph")}</option>
                <option value="bullets">{t("editor.layoutBullets")}</option>
                <option value="quote">{t("editor.layoutQuote")}</option>
                <option value="image">{t("editor.layoutImage")}</option>
              </Select>
            )}
          </Field>
          {c.layout === "heading" && (
            <Field label={t("editor.heading")}>{(id) => <Input id={id} value={c.heading} maxLength={300} onChange={(e) => onChange({ ...c, heading: e.target.value })} />}</Field>
          )}
          {(c.layout === "heading" || c.layout === "paragraph" || c.layout === "image") && (
            <Field label={c.layout === "image" ? t("editor.caption") : t("editor.body")}>
              {(id) => <Textarea id={id} rows={4} value={c.body} maxLength={5000} onChange={(e) => onChange({ ...c, body: e.target.value })} />}
            </Field>
          )}
          {c.layout === "bullets" && (
            <Field label={t("editor.bullets")} hint={t("editor.bulletsHint")}>
              {(id) => (
                <Textarea id={id} rows={6} value={c.bullets.join("\n")} onChange={(e) => onChange({ ...c, bullets: e.target.value.split("\n").slice(0, 20) })} />
              )}
            </Field>
          )}
          {c.layout === "quote" && (
            <>
              <Field label={t("editor.quote")}>{(id) => <Textarea id={id} rows={3} value={c.quote} maxLength={1000} onChange={(e) => onChange({ ...c, quote: e.target.value })} />}</Field>
              <Field label={t("editor.author")}>{(id) => <Input id={id} value={c.author} maxLength={200} onChange={(e) => onChange({ ...c, author: e.target.value })} />}</Field>
            </>
          )}
          {c.layout === "image" && <p className="text-xs text-slate-500">{t("editor.imageLayoutHint")}</p>}
        </div>
      );
    }
    case "leaderboard": {
      const c = slide.config as SlideConfigMap["leaderboard"];
      return (
        <div className="space-y-4">
          <Field label={t("editor.topN")}>
            {(id) => <Input id={id} type="number" min={3} max={20} value={c.topN} onChange={(e) => onChange({ ...c, topN: num(e.target.value, 10) })} />}
          </Field>
          <Toggle checked={c.final} onChange={(final) => onChange({ ...c, final })} label={t("editor.finalLeaderboard")} />
        </div>
      );
    }
  }
}

function QuizTiming({ c, onChange }: { c: { timeLimit: number; basePoints: number }; onChange: (p: { timeLimit?: number; basePoints?: number }) => void }) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label={t("editor.timeLimit")}>
        {(id) => <Input id={id} type="number" min={5} max={300} value={c.timeLimit} onChange={(e) => onChange({ timeLimit: Math.min(300, Math.max(5, num(e.target.value, 20))) })} />}
      </Field>
      <Field label={t("editor.basePoints")}>
        {(id) => <Input id={id} type="number" min={100} max={5000} step={100} value={c.basePoints} onChange={(e) => onChange({ basePoints: Math.min(5000, Math.max(100, num(e.target.value, 1000))) })} />}
      </Field>
    </div>
  );
}
