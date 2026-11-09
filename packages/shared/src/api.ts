import { z } from "zod";

export const LOCALES = ["de", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const localeSchema = z.enum(LOCALES);

export const REGISTRATION_MODES = ["open", "invite", "closed"] as const;
export type RegistrationMode = (typeof REGISTRATION_MODES)[number];

export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const passwordSchema = z.string().min(8, "password_too_short").max(200);

export const registerSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(1).max(100),
  password: passwordSchema,
  inviteToken: z.string().max(200).optional(),
});
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});
export const forgotSchema = z.object({ email: emailSchema });
export const resetSchema = z.object({ token: z.string().min(10).max(200), password: passwordSchema });
export const profileSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  locale: localeSchema.optional(),
  currentPassword: z.string().max(200).optional(),
  newPassword: passwordSchema.optional(),
});

export type Role = "PRESENTER" | "ADMIN";
export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  locale: Locale | null;
}

export interface PublicConfig {
  appName: string;
  appDomain: string;
  registrationMode: RegistrationMode;
  oidcEnabled: boolean;
  oidcLabel: string;
  defaultLocale: Locale;
  logoUrl: string | null;
  maxUploadMb: number;
  needsSetup: boolean;
  mailEnabled: boolean;
  hasImprint: boolean;
  hasPrivacy: boolean;
}

export const instanceSettingsSchema = z.object({
  appName: z.string().trim().min(1).max(60),
  logoUrl: z.string().max(500).nullable(),
  defaultLocale: localeSchema,
  registrationMode: z.enum(REGISTRATION_MODES),
  wordFilter: z.array(z.string().trim().min(1).max(60)).max(2000),
  useDefaultWordFilter: z.boolean(),
  maxUploadMb: z.number().int().min(1).max(100),
  /** Impressum (Freitext, wird auf /impressum angezeigt) */
  imprint: z.string().max(20000).default(""),
  /** Datenschutzerklärung (Freitext, wird auf /datenschutz angezeigt) */
  privacy: z.string().max(50000).default(""),
  /** Sitzungsergebnisse (Antworten, Teilnehmer) nach so vielen Tagen automatisch löschen; 0 = nie */
  retentionDays: z.number().int().min(0).max(3650).default(365),
});
export type InstanceSettings = z.infer<typeof instanceSettingsSchema>;

export const adminCreateUserSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(1).max(100),
  password: passwordSchema,
  role: z.enum(["PRESENTER", "ADMIN"]).default("PRESENTER"),
});
export const adminUpdateUserSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  role: z.enum(["PRESENTER", "ADMIN"]).optional(),
  disabled: z.boolean().optional(),
  password: passwordSchema.optional(),
});
export const inviteCreateSchema = z.object({
  email: emailSchema.optional(),
  role: z.enum(["PRESENTER", "ADMIN"]).default("PRESENTER"),
  sendMail: z.boolean().default(false),
});

/** Darstellung (Theme) einer Präsentation. */
export const themeConfigSchema = z.object({
  mode: z.enum(["dark", "light"]).default("dark"),
  background: z.string().max(30).default("#101425"),
  text: z.string().max(30).default("#ffffff"),
  accent: z.string().max(30).default("#7c5cff"),
  chartColors: z.array(z.string().max(30)).min(1).max(12).default([
    "#7c5cff", "#22c3a6", "#ffb020", "#ff5d73", "#3fa7ff", "#a2d729", "#ff8a3d", "#c86bfa",
  ]),
  font: z.enum(["inter", "serif", "mono", "rounded"]).default("inter"),
  logoUrl: z.string().max(500).nullable().default(null),
});
export type ThemeConfig = z.infer<typeof themeConfigSchema>;

export const themeInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  config: themeConfigSchema,
});

export const BUILTIN_THEMES: { id: string; name: string; config: ThemeConfig }[] = [
  {
    id: "builtin-dark",
    name: "Nacht",
    config: themeConfigSchema.parse({}),
  },
  {
    id: "builtin-light",
    name: "Tag",
    config: themeConfigSchema.parse({
      mode: "light",
      background: "#f7f7fb",
      text: "#141428",
      accent: "#5b3df5",
      chartColors: ["#5b3df5", "#0f9d84", "#e08a00", "#e0364f", "#1d7fd6", "#6a9a10", "#d8641c", "#9b3fd1"],
    }),
  },
  {
    id: "builtin-school",
    name: "Tafel",
    config: themeConfigSchema.parse({
      mode: "dark",
      background: "#1f3b2d",
      text: "#f4f1e8",
      accent: "#ffd166",
      chartColors: ["#ffd166", "#ef8354", "#9ad1d4", "#f4f1e8", "#c3e88d", "#f78c6c", "#82aaff", "#c792ea"],
      font: "rounded",
    }),
  },
];

export const presentationSettingsSchema = z.object({
  showJoinBanner: z.boolean().default(true),
  reactionsEnabled: z.boolean().default(true),
  showParticipantCount: z.boolean().default(true),
  requireNames: z.boolean().default(false),
  /** Quiz: Leaderboard automatisch nach jeder Quizfrage anzeigen */
  autoLeaderboard: z.boolean().default(false),
  /** Quiz-Auto-Modus: Quizfragen starten automatisch, sobald sie angezeigt werden */
  autoStartQuiz: z.boolean().default(false),
  /** Lobby mit großem QR-Code und Teilnehmerliste beim Start der Sitzung */
  lobby: z.boolean().default(true),
});
export type PresentationSettings = z.infer<typeof presentationSettingsSchema>;

export const presentationCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  folderId: z.string().max(64).nullable().optional(),
  templateId: z.string().max(64).optional(),
});
export const presentationUpdateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  folderId: z.string().max(64).nullable().optional(),
  themeId: z.string().max(64).nullable().optional(),
  settings: presentationSettingsSchema.partial().optional(),
});
export const folderSchema = z.object({ name: z.string().trim().min(1).max(100) });
export const shareSchema = z.object({ email: emailSchema, role: z.enum(["VIEW", "EDIT"]) });
export const sessionStartSchema = z.object({ mode: z.enum(["PRESENTER", "SURVEY"]).default("PRESENTER") });

export const joinSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
  deviceId: z.string().min(8).max(64),
  name: z.string().trim().max(40).optional(),
});

/** Auswahl an Emoji-Avataren für Teilnehmer (Lobby/Leaderboard). */
export const AVATARS = [
  "🦊", "🐼", "🐸", "🐯", "🦁", "🐨", "🐵", "🐧", "🦄", "🐙", "🐢", "🦖",
  "🐝", "🦋", "🐬", "🦉", "🐱", "🐶", "🐰", "🐻", "🚀", "⚽", "🎸", "🍕",
  "🌈", "⭐", "🔥", "🍀", "🎮", "🧠", "👾", "🤖",
] as const;
export const isAvatar = (v: unknown): v is string => typeof v === "string" && (AVATARS as readonly string[]).includes(v);

export const REACTIONS = ["heart", "thumbs", "question", "laugh"] as const;
export type Reaction = (typeof REACTIONS)[number];
export const REACTION_EMOJI: Record<Reaction, string> = {
  heart: "❤️",
  thumbs: "👍",
  question: "❓",
  laugh: "😂",
};
