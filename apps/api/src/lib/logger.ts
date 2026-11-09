import pino from "pino";
import { anonymizeIp } from "@polldeck/shared";
import { env } from "../env.js";

/**
 * Strukturierte Logs ohne Cookies/Passwörter; IP-Adressen werden gekürzt
 * gespeichert (Datenminimierung, Art. 5 Abs. 1 lit. c DSGVO).
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  redact: ["req.headers.cookie", "req.headers.authorization", "password", "*.password"],
  serializers: {
    req(req: { method?: string; url?: string; ip?: string; socket?: { remoteAddress?: string } }) {
      return {
        method: req.method,
        url: req.url,
        ip: anonymizeIp(req.ip ?? req.socket?.remoteAddress),
      };
    },
  },
});
