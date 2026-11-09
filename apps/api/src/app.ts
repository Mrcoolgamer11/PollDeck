import Fastify, { type FastifyError } from "fastify";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import crypto from "node:crypto";
import { ZodError } from "zod";
import { env } from "./env.js";
import { logger } from "./lib/logger.js";
import { redis } from "./lib/redis.js";
import { HttpError } from "./lib/http.js";
import { CSRF_COOKIE, SESSION_COOKIE, randomToken, sign, userFromToken } from "./lib/auth.js";
import { authRoutes } from "./routes/auth.js";
import { adminRoutes } from "./routes/admin.js";
import { presentationRoutes } from "./routes/presentations.js";
import { slideRoutes } from "./routes/slides.js";
import { libraryRoutes } from "./routes/library.js";
import { uploadRoutes } from "./routes/uploads.js";
import { sessionRoutes } from "./routes/sessions.js";
import { exportRoutes } from "./routes/exports.js";
import { prisma } from "./lib/prisma.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function newCsrfToken() {
  const raw = randomToken(18);
  return `${raw}.${sign(raw)}`;
}
function validCsrf(token: string | undefined) {
  if (!token) return false;
  const [raw, sig] = token.split(".");
  if (!raw || !sig) return false;
  const expected = sign(raw);
  return expected.length === sig.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}

export async function buildApp() {
  const app = Fastify({
    loggerInstance: logger,
    trustProxy: env.trustProxy,
    bodyLimit: 5 * 1024 * 1024,
    disableRequestLogging: false,
  });

  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        imgSrc: ["'self'", "data:"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: "same-origin" },
  });
  await app.register(rateLimit, {
    global: false,
    redis,
    nameSpace: "pd-rl:",
    keyGenerator: (req) => req.ip,
  });
  await app.register(multipart, { limits: { fileSize: 100 * 1024 * 1024, files: 1 } });

  app.decorateRequest("user", null);

  // Benutzer aus Session-Cookie laden, CSRF-Cookie setzen und prüfen.
  app.addHook("onRequest", async (req, reply) => {
    req.user = await userFromToken(req.cookies[SESSION_COOKIE]);

    let csrf = req.cookies[CSRF_COOKIE];
    if (!validCsrf(csrf)) {
      csrf = newCsrfToken();
      reply.setCookie(CSRF_COOKIE, csrf, { path: "/", httpOnly: false, secure: env.COOKIE_SECURE, sameSite: "lax" });
      req.cookies[CSRF_COOKIE] = csrf;
    }
    if (!SAFE_METHODS.has(req.method) && !req.url.startsWith("/api/auth/oidc/callback")) {
      const header = req.headers["x-csrf-token"];
      if (typeof header !== "string" || header !== csrf) {
        return reply.code(403).send({ error: "csrf_invalid" });
      }
    }
  });

  app.setErrorHandler((err: FastifyError | HttpError | ZodError, req, reply) => {
    if (err instanceof HttpError) {
      return reply.code(err.statusCode).send({ error: err.code, details: err.details });
    }
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: "validation_error", details: err.flatten() });
    }
    const fe = err as FastifyError;
    if (fe.statusCode === 429) return reply.code(429).send({ error: "rate_limited" });
    if (fe.statusCode && fe.statusCode < 500) {
      return reply.code(fe.statusCode).send({ error: fe.code?.toLowerCase() ?? "bad_request", message: fe.message });
    }
    req.log.error({ err }, "Unbehandelter Fehler");
    return reply.code(500).send({ error: "internal_error" });
  });

  app.get("/api/health", { logLevel: "warn" }, async (_req, reply) => {
    const checks = { db: false, redis: false };
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.db = true;
    } catch {
      /* noop */
    }
    try {
      checks.redis = (await redis.ping()) === "PONG";
    } catch {
      /* noop */
    }
    const ok = checks.db && checks.redis;
    return reply.code(ok ? 200 : 503).send({ status: ok ? "ok" : "degraded", ...checks, time: new Date().toISOString() });
  });

  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(adminRoutes, { prefix: "/api/admin" });
  await app.register(presentationRoutes, { prefix: "/api" });
  await app.register(slideRoutes, { prefix: "/api" });
  await app.register(libraryRoutes, { prefix: "/api" });
  await app.register(uploadRoutes, { prefix: "/api" });
  await app.register(sessionRoutes, { prefix: "/api" });
  await app.register(exportRoutes, { prefix: "/api" });

  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: "not_found" }));
  return app;
}
