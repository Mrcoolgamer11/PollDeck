import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Users } from "lucide-react";
import type { LobbyParticipant, ThemeConfig } from "@polldeck/shared";
import { themeStyle } from "../lib/theme";
import { QrCode } from "../components/QrCode";
import { cx } from "../components/ui";
import { formatCode, type JoinInfo } from "./SlideView";

/**
 * Lobby beim Start einer Sitzung: großer QR-Code und Beitrittscode, darunter die
 * beigetretenen Teilnehmer mit Emoji. Beim Start schrumpft der QR-Code animiert
 * nach oben in die Beitrittsleiste.
 */
export function LobbyView({ join, theme, participants }: { join: JoinInfo; theme: ThemeConfig; participants: LobbyParticipant[] }) {
  const { t } = useTranslation();
  const style = useMemo(() => themeStyle(theme), [theme]);
  const list = participants.slice(-60);
  return (
    <div className="pd-slide flex aspect-video w-full flex-col overflow-hidden" style={style}>
      <div className="flex min-h-0 flex-1 items-center gap-[4cqw] px-[5cqw] pt-[4cqh]">
        <div className="flex h-[62cqh] w-[62cqh] shrink-0 items-center justify-center rounded-[1.5cqw] bg-white p-[1.5cqh] shadow-2xl">
          <QrCode value={join.url} size="100%" label={t("present.qrLabel")} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="pd-text opacity-80">{t("lobby.joinAt")}</p>
          <p className="text-[clamp(1.4rem,4.5cqw,4.5rem)] font-bold leading-tight">{join.domain}</p>
          <p className="pd-text mt-[3cqh] opacity-80">{t("lobby.code")}</p>
          <p className="text-[clamp(2.5rem,10cqw,10rem)] font-extrabold leading-none tracking-[0.08em] tabular-nums" style={{ color: "var(--pd-accent)" }}>
            {formatCode(join.code)}
          </p>
        </div>
      </div>
      <div className="px-[5cqw] pb-[3cqh] pt-[2cqh]">
        <p className="pd-text mb-[1cqh] flex items-center gap-[0.8cqw] font-semibold">
          <Users className="h-[1.1em] w-[1.1em]" aria-hidden /> {t("lobby.joined", { count: participants.length })}
        </p>
        <ul className="flex max-h-[16cqh] flex-wrap gap-[0.8cqw] overflow-hidden" aria-live="polite">
          {list.map((p) => (
            <li key={p.id} className="pd-small flex animate-pop items-center gap-[0.4cqw] rounded-full px-[1cqw] py-[0.4cqh] font-semibold" style={{ background: "var(--pd-surface)" }}>
              <span className="text-[1.3em]" aria-hidden>
                {p.avatar ?? "🙂"}
              </span>
              {p.name || t("present.anonymousShort")}
            </li>
          ))}
          {!participants.length && <li className="pd-small opacity-60">{t("lobby.waiting")}</li>}
        </ul>
      </div>
    </div>
  );
}

/** Blendet die Lobby beim Start animiert aus (QR-Code wandert nach oben in die Leiste). */
export function LobbyOverlay(props: { active: boolean; join: JoinInfo; theme: ThemeConfig; participants: LobbyParticipant[] }) {
  const [visible, setVisible] = useState(props.active);
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    clearTimeout(timer.current);
    if (props.active) {
      setVisible(true);
      setLeaving(false);
    } else if (visible) {
      setLeaving(true);
      timer.current = setTimeout(() => setVisible(false), 900);
    }
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.active]);
  if (!visible) return null;
  return (
    <div
      className={cx("absolute inset-0 z-20 origin-top transition-all duration-[900ms] ease-in-out", leaving && "pointer-events-none")}
      style={leaving ? { transform: "translate(25%, -38%) scale(0.18)", opacity: 0 } : undefined}
    >
      <LobbyView join={props.join} theme={props.theme} participants={props.participants} />
    </div>
  );
}
