import { z } from "zod";

/** Alle unterstützten Folientypen. */
export const SLIDE_TYPES = [
  "multiple_choice",
  "word_cloud",
  "open_ended",
  "scale",
  "ranking",
  "points_100",
  "grid_2x2",
  "number_guess",
  "qa",
  "quiz_choice",
  "quiz_text",
  "content",
  "leaderboard",
] as const;
export type SlideType = (typeof SLIDE_TYPES)[number];
export const slideTypeSchema = z.enum(SLIDE_TYPES);

/** Folientypen, bei denen Teilnehmer antworten können. */
export const INTERACTIVE_TYPES: SlideType[] = [
  "multiple_choice",
  "word_cloud",
  "open_ended",
  "scale",
  "ranking",
  "points_100",
  "grid_2x2",
  "number_guess",
  "quiz_choice",
  "quiz_text",
];
export const QUIZ_TYPES: SlideType[] = ["quiz_choice", "quiz_text"];
export const MODERATABLE_TYPES: SlideType[] = ["open_ended", "qa"];

export const isInteractive = (t: SlideType) => INTERACTIVE_TYPES.includes(t);
export const isQuiz = (t: SlideType) => QUIZ_TYPES.includes(t);

const id = z.string().min(1).max(64);
const label = z.string().max(300);
const imageUrl = z.string().max(500).optional().nullable();

export const optionSchema = z.object({
  id,
  label,
  imageUrl,
});
export type Option = z.infer<typeof optionSchema>;

export const chartTypeSchema = z.enum(["bar", "pie", "donut", "dots"]);
export type ChartType = z.infer<typeof chartTypeSchema>;

export const multipleChoiceConfig = z.object({
  options: z.array(optionSchema).min(1).max(30),
  multiSelect: z.boolean().default(false),
  chartType: chartTypeSchema.default("bar"),
});
export const wordCloudConfig = z.object({
  maxEntries: z.number().int().min(1).max(3).default(3),
  maxLength: z.number().int().min(1).max(50).default(25),
});
export const openEndedConfig = z.object({
  display: z.enum(["wall", "ticker"]).default("wall"),
  maxLength: z.number().int().min(10).max(1000).default(250),
});
export const scaleConfig = z.object({
  statements: z.array(z.object({ id, label })).min(1).max(15),
  min: z.number().int().min(0).max(1).default(1),
  max: z.number().int().min(2).max(10).default(5),
  minLabel: z.string().max(60).default(""),
  maxLabel: z.string().max(60).default(""),
});
export const rankingConfig = z.object({
  options: z.array(optionSchema).min(2).max(15),
});
export const points100Config = z.object({
  options: z.array(optionSchema).min(2).max(15),
  total: z.number().int().min(10).max(1000).default(100),
});
export const grid2x2Config = z.object({
  items: z.array(z.object({ id, label })).min(1).max(10),
  xLabel: z.string().max(60).default(""),
  yLabel: z.string().max(60).default(""),
  min: z.number().int().default(0),
  max: z.number().int().default(10),
});
export const numberGuessConfig = z.object({
  min: z.number().default(0),
  max: z.number().default(100),
  correctAnswer: z.number().optional().nullable(),
  unit: z.string().max(20).default(""),
});
export const qaConfig = z.object({
  allowUpvotes: z.boolean().default(true),
  maxLength: z.number().int().min(10).max(500).default(250),
});
export const quizChoiceConfig = z.object({
  options: z.array(optionSchema).min(2).max(8),
  correctOptionIds: z.array(id).min(1),
  timeLimit: z.number().int().min(5).max(300).default(20),
  basePoints: z.number().int().min(100).max(5000).default(1000),
});
export const quizTextConfig = z.object({
  correctAnswers: z.array(z.string().min(1).max(100)).min(1).max(20),
  caseSensitive: z.boolean().default(false),
  allowTypos: z.boolean().default(true),
  timeLimit: z.number().int().min(5).max(300).default(30),
  basePoints: z.number().int().min(100).max(5000).default(1000),
});
export const contentConfig = z.object({
  layout: z.enum(["heading", "paragraph", "bullets", "quote", "image"]).default("heading"),
  heading: z.string().max(300).default(""),
  body: z.string().max(5000).default(""),
  bullets: z.array(z.string().max(300)).max(20).default([]),
  quote: z.string().max(1000).default(""),
  author: z.string().max(200).default(""),
});
export const leaderboardConfig = z.object({
  topN: z.number().int().min(3).max(20).default(10),
  final: z.boolean().default(false),
});

export const slideConfigSchemas = {
  multiple_choice: multipleChoiceConfig,
  word_cloud: wordCloudConfig,
  open_ended: openEndedConfig,
  scale: scaleConfig,
  ranking: rankingConfig,
  points_100: points100Config,
  grid_2x2: grid2x2Config,
  number_guess: numberGuessConfig,
  qa: qaConfig,
  quiz_choice: quizChoiceConfig,
  quiz_text: quizTextConfig,
  content: contentConfig,
  leaderboard: leaderboardConfig,
} as const;

export type SlideConfigMap = {
  [K in SlideType]: z.infer<(typeof slideConfigSchemas)[K]>;
};

export const slideSettingsSchema = z.object({
  /** Ergebnisse erst nach Freigabe durch den Präsentator anzeigen */
  hideResultsUntilReveal: z.boolean().default(false),
  /** Teilnehmer dürfen mehrfach antworten */
  allowMultipleSubmissions: z.boolean().default(false),
  /** Maximal angenommene Antworten pro Teilnehmer (bei Mehrfachabstimmung) */
  responseLimit: z.number().int().min(1).max(100).nullable().default(null),
  /** Optionaler Countdown in Sekunden (für Nicht-Quiz-Folien) */
  timerSeconds: z.number().int().min(5).max(3600).nullable().default(null),
  /** Antworten vor Anzeige moderieren (offene Fragen, Q&A) */
  moderation: z.boolean().default(false),
  /** Ergebnisse auch auf den Teilnehmergeräten anzeigen */
  showResultsToAudience: z.boolean().default(true),
  /** Bei Ablauf des Countdowns automatisch auflösen (Ergebnisse/Lösung einblenden) */
  revealOnTimerEnd: z.boolean().default(true),
});
export type SlideSettings = z.infer<typeof slideSettingsSchema>;

export const backgroundSchema = z
  .object({
    color: z.string().max(30).optional().nullable(),
    imageUrl,
  })
  .default({});
export type SlideBackground = z.infer<typeof backgroundSchema>;

export const slideBaseSchema = z.object({
  title: z.string().max(300).default(""),
  description: z.string().max(2000).optional().nullable(),
  imageUrl,
  background: backgroundSchema,
  settings: slideSettingsSchema.default({}),
  notes: z.string().max(10000).optional().nullable(),
});

/** Vollständige Folie (wie im Editor / in der Sitzung verwendet). */
export interface Slide<T extends SlideType = SlideType> {
  id: string;
  type: T;
  position: number;
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  background: SlideBackground;
  settings: SlideSettings;
  config: SlideConfigMap[T];
  notes?: string | null;
}

/** Validiert und normalisiert die typabhängige Konfiguration. */
export function parseSlideConfig<T extends SlideType>(type: T, config: unknown): SlideConfigMap[T] {
  return slideConfigSchemas[type].parse(config ?? {}) as SlideConfigMap[T];
}

export function safeParseSlideConfig(type: SlideType, config: unknown) {
  return slideConfigSchemas[type].safeParse(config ?? {});
}

export const slideInputSchema = slideBaseSchema.extend({
  type: slideTypeSchema,
  config: z.unknown(),
});
export type SlideInput = z.infer<typeof slideInputSchema>;

export const slideUpdateSchema = slideBaseSchema.partial().extend({
  config: z.unknown().optional(),
  type: slideTypeSchema.optional(),
});

let counter = 0;
export function newId(prefix = "o"): string {
  counter = (counter + 1) % 1_000_000;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Standardkonfiguration für einen neuen Folientyp. */
export function defaultSlideConfig(type: SlideType): SlideConfigMap[SlideType] {
  const opt = (n: number, prefix = "Option") =>
    Array.from({ length: n }, (_, i) => ({ id: newId(), label: `${prefix} ${i + 1}`, imageUrl: null }));
  switch (type) {
    case "multiple_choice":
      return { options: opt(3), multiSelect: false, chartType: "bar" };
    case "word_cloud":
      return { maxEntries: 3, maxLength: 25 };
    case "open_ended":
      return { display: "wall", maxLength: 250 };
    case "scale":
      return {
        statements: [{ id: newId(), label: "Aussage 1" }],
        min: 1,
        max: 5,
        minLabel: "",
        maxLabel: "",
      };
    case "ranking":
      return { options: opt(3) };
    case "points_100":
      return { options: opt(3), total: 100 };
    case "grid_2x2":
      return { items: [{ id: newId(), label: "Punkt 1" }], xLabel: "Aufwand", yLabel: "Nutzen", min: 0, max: 10 };
    case "number_guess":
      return { min: 0, max: 100, correctAnswer: null, unit: "" };
    case "qa":
      return { allowUpvotes: true, maxLength: 250 };
    case "quiz_choice": {
      const options = opt(4, "Antwort");
      return { options, correctOptionIds: [options[0].id], timeLimit: 20, basePoints: 1000 };
    }
    case "quiz_text":
      return { correctAnswers: ["Antwort"], caseSensitive: false, allowTypos: true, timeLimit: 30, basePoints: 1000 };
    case "content":
      return { layout: "heading", heading: "", body: "", bullets: [], quote: "", author: "" };
    case "leaderboard":
      return { topN: 10, final: false };
  }
}

/**
 * Entfernt Lösungen aus der Konfiguration, damit Teilnehmer sie nicht im
 * Netzwerkverkehr sehen können.
 */
export function sanitizeSlideForAudience(slide: Slide, reveal = false): Slide {
  const s: Slide = { ...slide, notes: null, config: { ...(slide.config as object) } as Slide["config"] };
  if (!reveal) {
    if (s.type === "quiz_choice") (s.config as SlideConfigMap["quiz_choice"]).correctOptionIds = [];
    if (s.type === "quiz_text") (s.config as SlideConfigMap["quiz_text"]).correctAnswers = [];
    if (s.type === "number_guess") (s.config as SlideConfigMap["number_guess"]).correctAnswer = null;
  }
  return s;
}
