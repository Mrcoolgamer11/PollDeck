import { z } from "zod";

const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? def : ["1", "true", "yes", "on"].includes(v.toLowerCase())));

const schema = z.object({
  NODE_ENV: z.string().default("production"),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default("0.0.0.0"),
  APP_NAME: z.string().default("PollDeck"),
  APP_DOMAIN: z.string().default("poll.nebendahl.eu"),
  APP_URL: z.string().optional(),
  SESSION_SECRET: z.string().min(16, "SESSION_SECRET muss mindestens 16 Zeichen lang sein"),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default("redis://redis:6379"),
  UPLOAD_DIR: z.string().default("/data/uploads"),
  MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(100).default(10),
  REGISTRATION_MODE: z.enum(["open", "invite", "closed"]).default("open"),
  DEFAULT_LOCALE: z.enum(["de", "en"]).default("de"),
  COOKIE_SECURE: bool(true),
  TRUST_PROXY: z.string().default("true"),
  LOG_LEVEL: z.string().default("info"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: bool(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  OIDC_ENABLED: bool(false),
  OIDC_ISSUER: z.string().optional(),
  OIDC_CLIENT_ID: z.string().optional(),
  OIDC_CLIENT_SECRET: z.string().optional(),
  OIDC_LABEL: z.string().default("SSO"),
  OIDC_SCOPES: z.string().default("openid email profile"),
  OIDC_AUTO_CREATE: bool(true),
  OIDC_ADMIN_GROUP: z.string().optional(),
  RATE_LIMIT_LOGIN_PER_MIN: z.coerce.number().default(10),
  RATE_LIMIT_VOTES_PER_10S: z.coerce.number().default(20),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("Ungültige Konfiguration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const e = parsed.data;
export const env = {
  ...e,
  APP_URL: (e.APP_URL || `https://${e.APP_DOMAIN}`).replace(/\/$/, ""),
  isProd: e.NODE_ENV === "production",
  mailEnabled: !!e.SMTP_HOST,
  oidcEnabled: e.OIDC_ENABLED && !!e.OIDC_ISSUER && !!e.OIDC_CLIENT_ID,
  trustProxy:
    e.TRUST_PROXY === "true" ? true : e.TRUST_PROXY === "false" ? false : /^\d+$/.test(e.TRUST_PROXY) ? Number(e.TRUST_PROXY) : e.TRUST_PROXY,
};
export type Env = typeof env;
