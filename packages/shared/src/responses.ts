import { z } from "zod";
import type { Slide, SlideConfigMap, SlideType } from "./slides.js";

export const responseValueSchemas = {
  multiple_choice: z.object({ optionIds: z.array(z.string().max(64)).min(1).max(30) }),
  word_cloud: z.object({ words: z.array(z.string().max(100)).min(1).max(3) }),
  open_ended: z.object({ text: z.string().min(1).max(1000) }),
  scale: z.object({ ratings: z.record(z.string().max(64), z.number().int().nullable()) }),
  ranking: z.object({ order: z.array(z.string().max(64)).min(1).max(15) }),
  points_100: z.object({ points: z.record(z.string().max(64), z.number().int().min(0)) }),
  grid_2x2: z.object({
    ratings: z.record(z.string().max(64), z.object({ x: z.number(), y: z.number() })),
  }),
  number_guess: z.object({ value: z.number().finite() }),
  quiz_choice: z.object({ optionIds: z.array(z.string().max(64)).min(1).max(8) }),
  quiz_text: z.object({ text: z.string().min(1).max(100) }),
} as const;

export type ResponseType = keyof typeof responseValueSchemas;
export type ResponseValueMap = { [K in ResponseType]: z.infer<(typeof responseValueSchemas)[K]> };
export type ResponseValue = ResponseValueMap[ResponseType];

export class ResponseValidationError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

/**
 * Prüft eine Teilnehmer-Antwort gegen die Folienkonfiguration und liefert den
 * bereinigten Wert. Wirft {@link ResponseValidationError} bei ungültigen Daten.
 */
export function validateResponse(slide: Slide, raw: unknown): ResponseValue {
  const type = slide.type as SlideType;
  if (!(type in responseValueSchemas)) throw new ResponseValidationError("not_interactive");
  const parsed = responseValueSchemas[type as ResponseType].safeParse(raw);
  if (!parsed.success) throw new ResponseValidationError("invalid_value");
  const value = parsed.data;

  switch (type) {
    case "multiple_choice":
    case "quiz_choice": {
      const cfg = slide.config as SlideConfigMap["multiple_choice"] | SlideConfigMap["quiz_choice"];
      const v = value as ResponseValueMap["multiple_choice"];
      const ids = new Set(cfg.options.map((o) => o.id));
      const chosen = [...new Set(v.optionIds)];
      if (!chosen.every((i) => ids.has(i))) throw new ResponseValidationError("unknown_option");
      const multi =
        type === "multiple_choice"
          ? (cfg as SlideConfigMap["multiple_choice"]).multiSelect
          : (cfg as SlideConfigMap["quiz_choice"]).correctOptionIds.length > 1;
      if (!multi && chosen.length !== 1) throw new ResponseValidationError("single_choice_only");
      return { optionIds: chosen };
    }
    case "word_cloud": {
      const cfg = slide.config as SlideConfigMap["word_cloud"];
      const words = (value as ResponseValueMap["word_cloud"]).words
        .map((w) => w.trim().replace(/\s+/g, " "))
        .filter(Boolean)
        .slice(0, cfg.maxEntries);
      if (!words.length) throw new ResponseValidationError("empty");
      if (words.some((w) => w.length > cfg.maxLength)) throw new ResponseValidationError("too_long");
      return { words };
    }
    case "open_ended": {
      const cfg = slide.config as SlideConfigMap["open_ended"];
      const text = (value as ResponseValueMap["open_ended"]).text.trim();
      if (!text) throw new ResponseValidationError("empty");
      if (text.length > cfg.maxLength) throw new ResponseValidationError("too_long");
      return { text };
    }
    case "scale": {
      const cfg = slide.config as SlideConfigMap["scale"];
      const ratings: Record<string, number | null> = {};
      const raw = (value as ResponseValueMap["scale"]).ratings;
      for (const st of cfg.statements) {
        const r = raw[st.id];
        if (r === undefined || r === null) {
          ratings[st.id] = null;
          continue;
        }
        if (r < cfg.min || r > cfg.max) throw new ResponseValidationError("out_of_range");
        ratings[st.id] = r;
      }
      if (Object.values(ratings).every((r) => r === null)) throw new ResponseValidationError("empty");
      return { ratings };
    }
    case "ranking": {
      const cfg = slide.config as SlideConfigMap["ranking"];
      const order = (value as ResponseValueMap["ranking"]).order;
      const ids = new Set(cfg.options.map((o) => o.id));
      if (new Set(order).size !== order.length || !order.every((i) => ids.has(i)))
        throw new ResponseValidationError("invalid_order");
      return { order };
    }
    case "points_100": {
      const cfg = slide.config as SlideConfigMap["points_100"];
      const raw = (value as ResponseValueMap["points_100"]).points;
      const points: Record<string, number> = {};
      let sum = 0;
      for (const o of cfg.options) {
        const p = Math.max(0, Math.floor(raw[o.id] ?? 0));
        points[o.id] = p;
        sum += p;
      }
      if (sum > cfg.total) throw new ResponseValidationError("too_many_points");
      if (sum === 0) throw new ResponseValidationError("empty");
      return { points };
    }
    case "grid_2x2": {
      const cfg = slide.config as SlideConfigMap["grid_2x2"];
      const raw = (value as ResponseValueMap["grid_2x2"]).ratings;
      const ratings: Record<string, { x: number; y: number }> = {};
      for (const it of cfg.items) {
        const r = raw[it.id];
        if (!r) continue;
        if (r.x < cfg.min || r.x > cfg.max || r.y < cfg.min || r.y > cfg.max)
          throw new ResponseValidationError("out_of_range");
        ratings[it.id] = { x: r.x, y: r.y };
      }
      if (!Object.keys(ratings).length) throw new ResponseValidationError("empty");
      return { ratings };
    }
    case "number_guess": {
      const cfg = slide.config as SlideConfigMap["number_guess"];
      const v = (value as ResponseValueMap["number_guess"]).value;
      if (v < cfg.min || v > cfg.max) throw new ResponseValidationError("out_of_range");
      return { value: v };
    }
    case "quiz_text": {
      const text = (value as ResponseValueMap["quiz_text"]).text.trim();
      if (!text) throw new ResponseValidationError("empty");
      return { text };
    }
    default:
      throw new ResponseValidationError("not_interactive");
  }
}

/** Text, der für den Wortfilter / die Moderation geprüft wird. */
export function responseText(type: SlideType, value: unknown): string | null {
  const v = value as Record<string, unknown>;
  if (type === "open_ended" || type === "quiz_text") return String(v.text ?? "");
  if (type === "word_cloud") return ((v.words as string[]) ?? []).join(" ");
  return null;
}
