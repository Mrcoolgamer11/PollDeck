import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, GripVertical, Minus, Plus } from "lucide-react";
import { DndContext, PointerSensor, TouchSensor, KeyboardSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { SlideConfigMap } from "@polldeck/shared";
import { cx } from "../../components/ui";
import { SubmitButton } from "./SubmitButton";
import type { InputProps } from "./types";

const inputCls =
  "block w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none focus:border-[color:var(--pd-accent)]";

export function ScaleInput({ slide, onSubmit, busy }: InputProps<{ ratings: Record<string, number | null> }>) {
  const { t } = useTranslation();
  const cfg = slide.config as SlideConfigMap["scale"];
  const [ratings, setRatings] = useState<Record<string, number | null>>({});
  const values = Array.from({ length: cfg.max - cfg.min + 1 }, (_, i) => cfg.min + i);
  const any = Object.values(ratings).some((v) => v !== null && v !== undefined);
  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (any) await onSubmit({ ratings });
      }}
    >
      {cfg.statements.map((st) => (
        <fieldset key={st.id}>
          <legend className="mb-2 font-medium">{st.label}</legend>
          <div className="flex gap-1" role="radiogroup" aria-label={st.label}>
            {values.map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={ratings[st.id] === v}
                onClick={() => setRatings((r) => ({ ...r, [st.id]: r[st.id] === v ? null : v }))}
                className={cx(
                  "h-11 min-w-0 flex-1 rounded-lg border-2 text-sm font-bold tabular-nums transition",
                  ratings[st.id] === v ? "border-[color:var(--pd-accent)] bg-[color:var(--pd-accent)] text-white" : "border-slate-200 bg-white text-slate-700",
                )}
              >
                {v}
              </button>
            ))}
          </div>
          {(cfg.minLabel || cfg.maxLabel) && (
            <div className="mt-1 flex justify-between text-xs text-slate-500">
              <span>{cfg.minLabel}</span>
              <span>{cfg.maxLabel}</span>
            </div>
          )}
        </fieldset>
      ))}
      <p className="text-xs text-slate-500">{t("participant.skipHint")}</p>
      <SubmitButton busy={busy} disabled={!any} />
    </form>
  );
}

function SortableRow({ id, label, index, count, onMove }: { id: string; label: string; index: number; count: number; onMove: (from: number, to: number) => void }) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cx("flex items-center gap-2 rounded-xl border-2 border-slate-200 bg-white p-2", isDragging && "z-10 shadow-lg")}
    >
      <button type="button" {...attributes} {...listeners} className="touch-none p-1 text-slate-400" aria-label={t("participant.dragToSort", { label })}>
        <GripVertical className="h-5 w-5" />
      </button>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold tabular-nums">{index + 1}</span>
      <span className="min-w-0 flex-1 break-words font-medium">{label}</span>
      <button type="button" className="rounded-lg p-2 disabled:opacity-30" disabled={index === 0} onClick={() => onMove(index, index - 1)} aria-label={t("editor.moveUp")}>
        <ArrowUp className="h-5 w-5" />
      </button>
      <button type="button" className="rounded-lg p-2 disabled:opacity-30" disabled={index === count - 1} onClick={() => onMove(index, index + 1)} aria-label={t("editor.moveDown")}>
        <ArrowDown className="h-5 w-5" />
      </button>
    </li>
  );
}

export function RankingInput({ slide, onSubmit, busy }: InputProps<{ order: string[] }>) {
  const { t } = useTranslation();
  const cfg = slide.config as SlideConfigMap["ranking"];
  const [order, setOrder] = useState(() => cfg.options.map((o) => o.id));
  const labels = useMemo(() => Object.fromEntries(cfg.options.map((o) => [o.id, o.label])), [cfg.options]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const move = (from: number, to: number) => setOrder((o) => arrayMove(o, from, to));
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    move(order.indexOf(String(e.active.id)), order.indexOf(String(e.over.id)));
  };
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        await onSubmit({ order });
      }}
    >
      <p className="text-sm text-slate-500">{t("participant.rankingHint")}</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <ol className="space-y-2">
            {order.map((id, i) => (
              <SortableRow key={id} id={id} label={labels[id]} index={i} count={order.length} onMove={move} />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      <SubmitButton busy={busy} />
    </form>
  );
}

export function PointsInput({ slide, onSubmit, busy }: InputProps<{ points: Record<string, number> }>) {
  const { t } = useTranslation();
  const cfg = slide.config as SlideConfigMap["points_100"];
  const [points, setPoints] = useState<Record<string, number>>({});
  const used = Object.values(points).reduce((s, v) => s + v, 0);
  const left = cfg.total - used;
  const step = cfg.total >= 100 ? 10 : 1;
  const set = (id: string, v: number) => {
    const other = used - (points[id] ?? 0);
    setPoints((p) => ({ ...p, [id]: Math.max(0, Math.min(cfg.total - other, Math.round(v))) }));
  };
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (used > 0) await onSubmit({ points });
      }}
    >
      <p className={cx("rounded-lg px-3 py-2 text-center text-sm font-semibold", left === 0 ? "bg-emerald-50 text-emerald-800" : "bg-slate-100")} aria-live="polite">
        {t("participant.pointsLeft", { count: left, total: cfg.total })}
      </p>
      <ul className="space-y-2">
        {cfg.options.map((o) => (
          <li key={o.id} className="flex items-center gap-2 rounded-xl border-2 border-slate-200 bg-white p-2">
            <span className="min-w-0 flex-1 break-words pl-1 font-medium">{o.label}</span>
            <button type="button" className="rounded-lg bg-slate-100 p-2 disabled:opacity-30" disabled={!points[o.id]} onClick={() => set(o.id, (points[o.id] ?? 0) - step)} aria-label={t("participant.minusPoints", { label: o.label })}>
              <Minus className="h-5 w-5" />
            </button>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={cfg.total}
              className="w-16 rounded-lg border-2 border-slate-200 px-1 py-2 text-center text-base font-bold tabular-nums outline-none focus:border-[color:var(--pd-accent)]"
              aria-label={t("participant.pointsFor", { label: o.label })}
              value={points[o.id] ?? 0}
              onChange={(e) => set(o.id, Number(e.target.value) || 0)}
            />
            <button type="button" className="rounded-lg bg-slate-100 p-2 disabled:opacity-30" disabled={left <= 0} onClick={() => set(o.id, (points[o.id] ?? 0) + step)} aria-label={t("participant.plusPointsFor", { label: o.label })}>
              <Plus className="h-5 w-5" />
            </button>
          </li>
        ))}
      </ul>
      <SubmitButton busy={busy} disabled={used === 0} />
    </form>
  );
}

export function GridInput({ slide, onSubmit, busy }: InputProps<{ ratings: Record<string, { x: number; y: number }> }>) {
  const { t } = useTranslation();
  const cfg = slide.config as SlideConfigMap["grid_2x2"];
  const mid = Math.round((cfg.min + cfg.max) / 2);
  const [ratings, setRatings] = useState<Record<string, { x: number; y: number }>>(() =>
    Object.fromEntries(cfg.items.map((i) => [i.id, { x: mid, y: mid }])),
  );
  const slider = (id: string, axis: "x" | "y", label: string) => (
    <label className="block">
      <span className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="font-bold tabular-nums">{ratings[id][axis]}</span>
      </span>
      <input
        type="range"
        min={cfg.min}
        max={cfg.max}
        step={1}
        value={ratings[id][axis]}
        onChange={(e) => setRatings((r) => ({ ...r, [id]: { ...r[id], [axis]: Number(e.target.value) } }))}
        className="mt-1 w-full accent-[color:var(--pd-accent)]"
      />
    </label>
  );
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        await onSubmit({ ratings });
      }}
    >
      {cfg.items.map((it) => (
        <fieldset key={it.id} className="space-y-2 rounded-xl border-2 border-slate-200 p-3">
          <legend className="px-1 font-semibold">{it.label}</legend>
          {slider(it.id, "x", cfg.xLabel || t("editor.xLabel"))}
          {slider(it.id, "y", cfg.yLabel || t("editor.yLabel"))}
        </fieldset>
      ))}
      <SubmitButton busy={busy} />
    </form>
  );
}

export function NumberInput({ slide, onSubmit, busy }: InputProps<{ value: number }>) {
  const { t } = useTranslation();
  const cfg = slide.config as SlideConfigMap["number_guess"];
  const [value, setValue] = useState("");
  const n = Number(value.replace(",", "."));
  const valid = value.trim() !== "" && Number.isFinite(n) && n >= cfg.min && n <= cfg.max;
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (valid) await onSubmit({ value: n });
      }}
    >
      <div className="flex items-center gap-2">
        <input
          type="text"
          inputMode="decimal"
          className={cx(inputCls, "text-center text-2xl font-bold tabular-nums")}
          aria-label={t("participant.yourGuess")}
          placeholder={t("participant.yourGuess")}
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^0-9.,-]/g, ""))}
        />
        {cfg.unit && <span className="text-lg font-semibold">{cfg.unit}</span>}
      </div>
      <p className="text-center text-xs text-slate-500">{t("participant.range", { min: cfg.min, max: cfg.max })}</p>
      <SubmitButton busy={busy} disabled={!valid} />
    </form>
  );
}

export function QuizTextInput({ onSubmit, busy }: InputProps<{ text: string }>) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (text.trim()) await onSubmit({ text: text.trim() });
      }}
    >
      <input
        className={cx(inputCls, "text-lg")}
        aria-label={t("participant.yourAnswer")}
        placeholder={t("participant.yourAnswer")}
        maxLength={100}
        autoFocus
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <SubmitButton busy={busy} disabled={!text.trim()} />
    </form>
  );
}
