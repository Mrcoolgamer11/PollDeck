import { useEffect, useRef, useState } from "react";

/** Gleicht die lokale Uhr mit der Serverzeit ab (für Countdowns). */
export function useServerOffset(serverTime: number | undefined) {
  const offset = useRef(0);
  if (serverTime) offset.current = serverTime - Date.now();
  return () => Date.now() + offset.current;
}

/** Sekunden bis zu einem Zeitpunkt, aktualisiert mehrmals pro Sekunde. */
export function useCountdown(endsAt: number | null | undefined, now: () => number) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!endsAt) {
      setLeft(null);
      return;
    }
    const tick = () => setLeft(Math.max(0, Math.ceil((endsAt - now()) / 1000)));
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endsAt]);
  return left;
}
