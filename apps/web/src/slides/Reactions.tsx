import { useCallback, useState } from "react";
import { REACTION_EMOJI, type Reaction } from "@polldeck/shared";

interface Floating {
  id: string;
  emoji: string;
  left: number;
  size: number;
}

/** Fliegende Emojis auf dem Beamer. */
export function useReactions(max = 40) {
  const [items, setItems] = useState<Floating[]>([]);
  const push = useCallback(
    (r: { reaction: Reaction; id: string }) => {
      const item = { id: r.id, emoji: REACTION_EMOJI[r.reaction], left: 5 + Math.random() * 85, size: 2.5 + Math.random() * 2 };
      setItems((list) => [...list.slice(-max + 1), item]);
      setTimeout(() => setItems((list) => list.filter((x) => x.id !== item.id)), 3300);
    },
    [max],
  );
  const overlay = (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {items.map((i) => (
        <span key={i.id} className="absolute bottom-0 animate-floatUp" style={{ left: `${i.left}%`, fontSize: `${i.size}cqw` }}>
          {i.emoji}
        </span>
      ))}
    </div>
  );
  return { overlay, push };
}
