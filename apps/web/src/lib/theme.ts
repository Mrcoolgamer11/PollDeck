import type { CSSProperties } from "react";
import type { ThemeConfig } from "@polldeck/shared";

export const FONT_STACKS: Record<ThemeConfig["font"], string> = {
  inter: '"Inter Variable", system-ui, sans-serif',
  rounded: '"Nunito Variable", "Inter Variable", system-ui, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',
};

/** CSS-Variablen für eine Folie mit Theme und optionalem Folienhintergrund. */
export function themeStyle(theme: ThemeConfig, bg?: { color?: string | null; imageUrl?: string | null }): CSSProperties {
  return {
    "--pd-bg": bg?.color || theme.background,
    "--pd-text": theme.text,
    "--pd-accent": theme.accent,
    "--pd-muted": theme.mode === "dark" ? "rgba(255,255,255,0.65)" : "rgba(0,0,0,0.6)",
    "--pd-surface": theme.mode === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)",
    "--pd-border": theme.mode === "dark" ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.12)",
    background: bg?.imageUrl
      ? `linear-gradient(rgba(0,0,0,${theme.mode === "dark" ? 0.55 : 0.25}), rgba(0,0,0,${theme.mode === "dark" ? 0.55 : 0.25})), center / cover no-repeat url("${bg.imageUrl}"), ${bg?.color || theme.background}`
      : bg?.color || theme.background,
    color: theme.text,
    fontFamily: FONT_STACKS[theme.font] ?? FONT_STACKS.inter,
  } as CSSProperties;
}

export const chartColor = (theme: ThemeConfig, i: number) => theme.chartColors[i % theme.chartColors.length];
