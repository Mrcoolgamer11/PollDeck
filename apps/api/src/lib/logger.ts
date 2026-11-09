import pino from "pino";
import { env } from "../env.js";

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: ["req.headers.cookie", "req.headers.authorization", "password", "*.password"],
});
