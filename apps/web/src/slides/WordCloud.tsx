import { useMemo } from "react";

interface Placed {
  text: string;
  count: number;
  x: number;
  y: number;
  size: number;
  color: string;
  rotate: boolean;
}

const W = 1000;
const H = 560;

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Deterministisches Spiral-Layout: gleiche Wörter bleiben an ihrem Platz, neue kommen hinzu. */
function layout(words: { text: string; count: number }[], colors: string[]): Placed[] {
  const list = words.slice(0, 80);
  if (!list.length) return [];
  const max = list[0].count;
  const min = list[list.length - 1].count;
  const placed: (Placed & { w: number; h: number })[] = [];
  const minSize = list.length > 40 ? 18 : 24;
  const maxSize = list.length > 40 ? 80 : 110;
  for (const w of list) {
    const t = max === min ? 1 : (w.count - min) / (max - min);
    const size = Math.round(minSize + Math.sqrt(t) * (maxSize - minSize));
    const h0 = hash(w.text);
    const rotate = list.length > 6 && h0 % 5 === 0 && w.text.length < 12;
    const tw = Math.max(size * 0.62 * [...w.text].length, size);
    const th = size * 1.05;
    const bw = rotate ? th : tw;
    const bh = rotate ? tw : th;
    let found = false;
    const start = (h0 % 360) * (Math.PI / 180);
    for (let i = 0; i < 2200 && !found; i++) {
      const a = start + i * 0.35;
      const r = 3.2 * Math.sqrt(i) * (i / 40 + 1);
      const x = W / 2 + r * Math.cos(a) * 1.6;
      const y = H / 2 + r * Math.sin(a);
      const box = { l: x - bw / 2, r: x + bw / 2, t: y - bh / 2, b: y + bh / 2 };
      if (box.l < 0 || box.r > W || box.t < 0 || box.b > H) continue;
      const hit = placed.some(
        (p) => !(box.r + 4 < p.x - p.w / 2 || box.l - 4 > p.x + p.w / 2 || box.b + 2 < p.y - p.h / 2 || box.t - 2 > p.y + p.h / 2),
      );
      if (!hit) {
        placed.push({ text: w.text, count: w.count, x, y, size, rotate, w: bw, h: bh, color: colors[h0 % colors.length] });
        found = true;
      }
    }
  }
  return placed;
}

export function WordCloud({ words, colors, emptyText }: { words: { text: string; count: number }[]; colors: string[]; emptyText: string }) {
  const placed = useMemo(() => layout(words, colors), [words, colors]);
  if (!words.length) {
    return <div className="pd-text flex h-full items-center justify-center opacity-60">{emptyText}</div>;
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" role="img" aria-label={words.map((w) => `${w.text} (${w.count})`).join(", ")}>
      {placed.map((p) => (
        <text
          key={p.text}
          x={0}
          y={0}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={p.size}
          fontWeight={700}
          fill={p.color}
          style={{
            transform: `translate(${p.x}px, ${p.y}px) rotate(${p.rotate ? -90 : 0}deg)`,
            transition: "transform 0.7s ease, font-size 0.7s ease",
          }}
        >
          <title>{`${p.text}: ${p.count}`}</title>
          {p.text}
        </text>
      ))}
    </svg>
  );
}
