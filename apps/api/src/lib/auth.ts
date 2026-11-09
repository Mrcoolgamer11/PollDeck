import crypto from "node:crypto";
import argon2 from "argon2";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { User } from "@prisma/client";
import type { PublicUser, Locale } from "@polldeck/shared";
import { prisma } from "./prisma.js";
import { env } from "../env.js";
import { forbidden, unauthorized } from "./http.js";

export const SESSION_COOKIE = "pd_session";
export const CSRF_COOKIE = "pd_csrf";
const SESSION_DAYS = 30;

export const hashPassword = (pw: string) => argon2.hash(pw, { type: argon2.argon2id });
export const verifyPassword = (hash: string, pw: string) => argon2.verify(hash, pw).catch(() => false);

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");
export const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

/** HMAC-signierter Wert (z. B. für CSRF-Token und OIDC-State). */
export const sign = (value: string) =>
  crypto.createHmac("sha256", env.SESSION_SECRET).update(value).digest("base64url");

export const cookieOptions = (maxAgeSec?: number) => ({
  path: "/",
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: "lax" as const,
  ...(maxAgeSec ? { maxAge: maxAgeSec } : {}),
});

export function toPublicUser(u: User): PublicUser {
  return { id: u.id, email: u.email, name: u.name, role: u.role, locale: (u.locale as Locale) ?? null };
}

export async function createLoginSession(req: FastifyRequest, reply: FastifyReply, user: User) {
  const token = randomToken();
  await prisma.authSession.create({
    data: {
      id: sha256(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + SESSION_DAYS * 86400_000),
      userAgent: req.headers["user-agent"]?.slice(0, 300),
      ip: req.ip,
    },
  });
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  reply.setCookie(SESSION_COOKIE, token, cookieOptions(SESSION_DAYS * 86400));
}

export async function destroyLoginSession(req: FastifyRequest, reply: FastifyReply) {
  const token = req.cookies[SESSION_COOKIE];
  if (token) await prisma.authSession.deleteMany({ where: { id: sha256(token) } });
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
}

/** Lädt den Benutzer anhand des Session-Tokens (auch für Socket.IO-Handshakes). */
export async function userFromToken(token: string | undefined): Promise<User | null> {
  if (!token) return null;
  const session = await prisma.authSession.findUnique({ where: { id: sha256(token) }, include: { user: true } });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await prisma.authSession.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  if (session.user.disabled) return null;
  return session.user;
}

declare module "fastify" {
  interface FastifyRequest {
    user: User | null;
  }
}

export function requireUser(req: FastifyRequest): User {
  if (!req.user) throw unauthorized();
  return req.user;
}

export function requireAdmin(req: FastifyRequest): User {
  const u = requireUser(req);
  if (u.role !== "ADMIN") throw forbidden();
  return u;
}
