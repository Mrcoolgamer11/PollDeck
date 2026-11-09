import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cx } from "../components/ui";

export interface Datum {
  id: string;
  label: string;
  value: number;
  color: string;
  imageUrl?: string | null;
  correct?: boolean;
  dim?: boolean;
}

const pct = (v: number, total: number) => (total > 0 ? Math.round((v / total) * 100) : 0);

/** Vertikale Balken (Standard-Darstellung für Multiple Choice). */
export function BarChart({ data, total, showPercent = true }: { data: Datum[]; total: number; showPercent?: boolean }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex h-full w-full items-end justify-center gap-[2cqw] px-[2cqw]" role="list">
      {data.map((d) => (
        <div
          key={d.id}
          role="listitem"
          aria-label={`${d.label}: ${d.value}${showPercent ? ` (${pct(d.value, total)} %)` : ""}`}
          className={cx("flex h-full min-w-0 flex-1 flex-col items-center justify-end transition-opacity", d.dim && "opacity-35")}
          style={{ maxWidth: "18cqw" }}
        >
          <div className="pd-text mb-[0.6cqh] font-bold tabular-nums">
            {showPercent ? `${pct(d.value, total)} %` : d.value}
          </div>
          <div className="relative flex w-full flex-1 items-end">
            <div
              className="w-full rounded-t-[0.6cqw] transition-[height] duration-700 ease-out"
              style={{ height: `${Math.max(1.5, (d.value / max) * 100)}%`, background: d.color }}
            />
          </div>
          <div className="pd-small mt-[1cqh] flex w-full flex-col items-center gap-[0.5cqh] text-center">
            {d.imageUrl && <img src={d.imageUrl} alt="" className="h-[9cqh] w-[9cqh] rounded object-cover" />}
            <span className="line-clamp-2 break-words font-medium leading-tight">
              {d.correct && <Check className="mr-1 inline h-[1em] w-[1em] text-emerald-400" aria-label="✓" />}
              {d.label}
            </span>
            {showPercent && <span className="opacity-70 tabular-nums">{d.value}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Horizontale Balken (z. B. für Ranking, Punkte, Auflösung). */
export function HBarChart({
  data,
  total,
  valueLabel,
  prefix,
}: {
  data: Datum[];
  total?: number;
  valueLabel?: (d: Datum) => ReactNode;
  prefix?: (d: Datum, i: number) => ReactNode;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="flex w-full flex-col justify-center gap-[1.4cqh]">
      {data.map((d, i) => (
        <li key={d.id} className={cx("flex items-center gap-[1.2cqw] transition-opacity", d.dim && "opacity-35")}>
          {prefix && <span className="pd-text w-[3cqw] shrink-0 text-right font-bold tabular-nums">{prefix(d, i)}</span>}
          <div className="w-[28%] min-w-0 shrink-0">
            <div className="pd-text truncate font-medium">
              {d.correct && <Check className="mr-1 inline h-[1em] w-[1em] text-emerald-400" aria-label="✓" />}
              {d.label}
            </div>
          </div>
          <div className="relative h-[4.5cqh] flex-1 overflow-hidden rounded-[0.5cqw]" style={{ background: "var(--pd-surface)" }}>
            <div
              className="h-full rounded-[0.5cqw] transition-[width] duration-700 ease-out"
              style={{ width: `${(d.value / max) * 100}%`, background: d.color }}
            />
          </div>
          <span className="pd-text w-[9cqw] shrink-0 text-right font-semibold tabular-nums">
            {valueLabel ? valueLabel(d) : total !== undefined ? `${pct(d.value, total)} %` : d.value}
          </span>
        </li>
      ))}
    </ul>
  );
}

function arcPath(cx0: number, cy0: number, r: number, start: number, end: number, inner = 0) {
  const large = end - start > Math.PI ? 1 : 0;
  const p = (a: number, rr: number) => [cx0 + rr * Math.cos(a), cy0 + rr * Math.sin(a)];
  const [x1, y1] = p(start, r);
  const [x2, y2] = p(end, r);
  if (!inner) return `M ${cx0} ${cy0} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
  const [x3, y3] = p(end, inner);
  const [x4, y4] = p(start, inner);
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${inner} ${inner} 0 ${large} 0 ${x4} ${y4} Z`;
}

/** Torten-/Donut-Diagramm. */
export function PieChart({ data, total, donut }: { data: Datum[]; total: number; donut?: boolean }) {
  let angle = -Math.PI / 2;
  const sum = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="flex h-full w-full items-center justify-center gap-[4cqw]">
      <svg viewBox="0 0 200 200" className="h-[90%] max-h-full" role="img" aria-label={data.map((d) => `${d.label}: ${d.value}`).join(", ")}>
        {sum === 0 ? (
          <circle cx="100" cy="100" r="90" fill="none" stroke="var(--pd-border)" strokeWidth={donut ? 36 : 2} />
        ) : (
          data.map((d) => {
            const a = (d.value / sum) * Math.PI * 2;
            const path =
              d.value === sum
                ? null
                : arcPath(100, 100, 90, angle, angle + a, donut ? 54 : 0);
            angle += a;
            if (!d.value) return null;
            return path ? (
              <path key={d.id} d={path} fill={d.color} stroke="var(--pd-bg)" strokeWidth="1.5" className="transition-all duration-700" />
            ) : (
              <circle key={d.id} cx="100" cy="100" r={donut ? 72 : 90} fill={donut ? "none" : d.color} stroke={donut ? d.color : "none"} strokeWidth={donut ? 36 : 0} />
            );
          })
        )}
        {donut && (
          <text x="100" y="108" textAnchor="middle" fontSize="26" fontWeight="700" fill="currentColor">
            {total}
          </text>
        )}
      </svg>
      <ul className="flex flex-col gap-[1.2cqh]">
        {data.map((d) => (
          <li key={d.id} className={cx("pd-text flex items-center gap-[1cqw]", d.dim && "opacity-40")}>
            <span className="inline-block h-[2.4cqh] w-[2.4cqh] shrink-0 rounded-full" style={{ background: d.color }} aria-hidden />
            <span className="font-medium">{d.label}</span>
            <span className="tabular-nums opacity-70">
              {d.value} · {pct(d.value, sum)} %
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Punktdiagramm: jede Stimme ein Punkt. */
export function DotsChart({ data }: { data: Datum[] }) {
  return (
    <ul className="flex w-full flex-col justify-center gap-[1.6cqh]">
      {data.map((d) => (
        <li key={d.id} className="flex items-center gap-[1.5cqw]">
          <span className="pd-text w-[24%] shrink-0 truncate font-medium">{d.label}</span>
          <div className="flex flex-1 flex-wrap gap-[0.4cqw]" aria-label={`${d.label}: ${d.value}`}>
            {Array.from({ length: Math.min(d.value, 150) }, (_, i) => (
              <span key={i} className="inline-block h-[2.2cqh] w-[2.2cqh] animate-pop rounded-full" style={{ background: d.color }} />
            ))}
            {d.value > 150 && <span className="pd-small">+{d.value - 150}</span>}
          </div>
          <span className="pd-text w-[5cqw] text-right font-semibold tabular-nums">{d.value}</span>
        </li>
      ))}
    </ul>
  );
}

/** Ein horizontal gestapelter Balken (100 Punkte). */
export function StackedBar({ data }: { data: Datum[] }) {
  const sum = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="w-full">
      <div className="flex h-[10cqh] w-full overflow-hidden rounded-[1cqw]" style={{ background: "var(--pd-surface)" }} role="img" aria-label={data.map((d) => `${d.label}: ${d.value}`).join(", ")}>
        {data.map((d) =>
          d.value > 0 ? (
            <div
              key={d.id}
              className="pd-small flex h-full items-center justify-center overflow-hidden font-bold text-white transition-[width] duration-700"
              style={{ width: `${(d.value / Math.max(1, sum)) * 100}%`, background: d.color }}
            >
              {pct(d.value, sum) >= 6 && `${pct(d.value, sum)} %`}
            </div>
          ) : null,
        )}
      </div>
    </div>
  );
}

/** Streudiagramm für die 2×2-Rasterfrage. */
export function ScatterChart({
  items,
  min,
  max,
  xLabel,
  yLabel,
}: {
  items: { id: string; label: string; x: number | null; y: number | null; color: string; points?: { x: number; y: number }[] }[];
  min: number;
  max: number;
  xLabel: string;
  yLabel: string;
}) {
  const span = max - min || 1;
  const pos = (v: number) => ((v - min) / span) * 100;
  return (
    <div className="relative mx-auto aspect-square h-full max-w-full">
      <div className="absolute inset-[6%] rounded-[1cqw] border" style={{ borderColor: "var(--pd-border)", background: "var(--pd-surface)" }}>
        <div className="absolute left-1/2 top-0 h-full border-l border-dashed" style={{ borderColor: "var(--pd-border)" }} />
        <div className="absolute left-0 top-1/2 w-full border-t border-dashed" style={{ borderColor: "var(--pd-border)" }} />
        {items.map((it) =>
          (it.points ?? []).map((p, i) => (
            <span
              key={`${it.id}-${i}`}
              className="absolute h-[1cqh] w-[1cqh] -translate-x-1/2 translate-y-1/2 rounded-full opacity-30"
              style={{ left: `${pos(p.x)}%`, bottom: `${pos(p.y)}%`, background: it.color }}
            />
          )),
        )}
        {items.map((it) =>
          it.x === null || it.y === null ? null : (
            <div
              key={it.id}
              className="absolute flex -translate-x-1/2 translate-y-1/2 flex-col items-center transition-all duration-700"
              style={{ left: `${pos(it.x)}%`, bottom: `${pos(it.y)}%` }}
            >
              <span className="h-[3cqh] w-[3cqh] rounded-full ring-2 ring-white/70" style={{ background: it.color }} />
              <span className="pd-small mt-[0.3cqh] whitespace-nowrap rounded px-[0.4cqw] font-semibold" style={{ background: "var(--pd-bg)" }}>
                {it.label}
              </span>
            </div>
          ),
        )}
      </div>
      <span className="pd-small absolute bottom-0 left-1/2 -translate-x-1/2 font-semibold opacity-80">{xLabel} →</span>
      <span className="pd-small absolute left-0 top-1/2 origin-center -translate-y-1/2 -rotate-90 whitespace-nowrap font-semibold opacity-80" style={{ transform: "translate(-35%, -50%) rotate(-90deg)" }}>
        {yLabel} →
      </span>
    </div>
  );
}

/** Histogramm (Zahl schätzen) mit Markierungen. */
export function Histogram({
  bins,
  color,
  markers,
  min,
  max,
}: {
  bins: { from: number; to: number; count: number }[];
  color: string;
  markers: { value: number; label: string; color: string }[];
  min: number;
  max: number;
}) {
  const top = Math.max(1, ...bins.map((b) => b.count));
  const span = max - min || 1;
  return (
    <div className="relative flex h-full w-full flex-col">
      <div className="relative flex flex-1 items-end gap-[0.4cqw]">
        {bins.map((b, i) => (
          <div key={i} className="flex h-full flex-1 flex-col justify-end" aria-label={`${b.from}–${b.to}: ${b.count}`}>
            <span className="pd-small mb-[0.3cqh] text-center tabular-nums opacity-80">{b.count || ""}</span>
            <div className="rounded-t-[0.4cqw] transition-[height] duration-700" style={{ height: `${(b.count / top) * 85}%`, background: color, minHeight: 2 }} />
          </div>
        ))}
        {markers.map((m, i) => (
          <div key={m.label} className="pointer-events-none absolute bottom-0 top-0 border-l-[0.3cqw]" style={{ left: `${((m.value - min) / span) * 100}%`, borderColor: m.color }}>
            <span
              className="pd-small absolute left-[0.5cqw] whitespace-nowrap rounded px-[0.4cqw] font-bold"
              style={{ background: m.color, color: "#fff", top: `${i * 4.5}cqh` }}
            >
              {m.label}
            </span>
          </div>
        ))}
      </div>
      <div className="pd-small mt-[0.8cqh] flex justify-between tabular-nums opacity-70">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
