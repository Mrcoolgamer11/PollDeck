import type { FastifyInstance } from "fastify";
import { Issuer, generators, type Client } from "openid-client";
import {
  forgotSchema,
  loginSchema,
  profileSchema,
  registerSchema,
  resetSchema,
  type PublicConfig,
} from "@polldeck/shared";
import { prisma } from "../lib/prisma.js";
import { env } from "../env.js";
import { badRequest, conflict, forbidden, parse, unauthorized } from "../lib/http.js";
import {
  cookieOptions,
  createLoginSession,
  destroyLoginSession,
  hashPassword,
  randomToken,
  requireUser,
  sha256,
  sign,
  toPublicUser,
  verifyPassword,
} from "../lib/auth.js";
import { getSettings } from "../lib/settings.js";
import { sendMail } from "../lib/mail.js";
import { createDemoPresentation } from "../lib/demo.js";

const DUMMY_HASH = hashPassword(randomToken());
let oidcClient: Client | null = null;
async function getOidcClient(): Promise<Client> {
  if (oidcClient) return oidcClient;
  const issuer = await Issuer.discover(env.OIDC_ISSUER!);
  oidcClient = new issuer.Client({
    client_id: env.OIDC_CLIENT_ID!,
    client_secret: env.OIDC_CLIENT_SECRET,
    redirect_uris: [`${env.APP_URL}/api/auth/oidc/callback`],
    response_types: ["code"],
  });
  return oidcClient;
}

export async function publicConfig(): Promise<PublicConfig> {
  const s = await getSettings();
  const userCount = await prisma.user.count();
  return {
    appName: s.appName,
    appDomain: env.APP_DOMAIN,
    registrationMode: s.registrationMode,
    oidcEnabled: env.oidcEnabled,
    oidcLabel: env.OIDC_LABEL,
    defaultLocale: s.defaultLocale,
    logoUrl: s.logoUrl,
    maxUploadMb: s.maxUploadMb,
    needsSetup: userCount === 0,
    mailEnabled: env.mailEnabled,
    hasImprint: !!s.imprint.trim(),
    hasPrivacy: !!s.privacy.trim(),
  };
}

export async function authRoutes(app: FastifyInstance) {
  const loginLimit = { rateLimit: { max: env.RATE_LIMIT_LOGIN_PER_MIN, timeWindow: "1 minute" } };

  app.get("/config", async () => publicConfig());

  /** Impressum und Datenschutzerklärung (öffentlich). */
  app.get("/legal", async () => {
    const s = await getSettings();
    return { imprint: s.imprint, privacy: s.privacy, appName: s.appName };
  });

  app.get("/me", async (req) => ({ user: req.user ? toPublicUser(req.user) : null }));

  app.post("/register", { config: loginLimit }, async (req, reply) => {
    const body = parse(registerSchema, req.body);
    const settings = await getSettings();
    const userCount = await prisma.user.count();
    const isFirst = userCount === 0;
    let invite: { id: string; role: "ADMIN" | "PRESENTER"; email: string | null } | null = null;

    if (!isFirst) {
      if (settings.registrationMode === "closed" && !body.inviteToken) throw forbidden("registration_closed");
      if (settings.registrationMode === "invite" || body.inviteToken) {
        if (!body.inviteToken) throw forbidden("invite_required");
        const inv = await prisma.invite.findUnique({ where: { tokenHash: sha256(body.inviteToken) } });
        if (!inv || inv.usedAt || inv.expiresAt < new Date()) throw forbidden("invite_invalid");
        if (inv.email && inv.email !== body.email) throw forbidden("invite_email_mismatch");
        invite = inv;
      }
    }
    if (await prisma.user.findUnique({ where: { email: body.email } })) throw conflict("email_taken");

    const user = await prisma.$transaction(async (tx) => {
      // Der erste Benutzer wird automatisch Admin (Race-Condition-sicher erneut prüfen).
      const first = (await tx.user.count()) === 0;
      const u = await tx.user.create({
        data: {
          email: body.email,
          name: body.name,
          passwordHash: await hashPassword(body.password),
          role: first ? "ADMIN" : (invite?.role ?? "PRESENTER"),
        },
      });
      if (invite) await tx.invite.update({ where: { id: invite.id }, data: { usedAt: new Date() } });
      return u;
    });
    // Dem ersten Benutzer eine Demo-Präsentation mit allen Folientypen anlegen.
    if (user.role === "ADMIN" && isFirst) await createDemoPresentation(user.id).catch(() => undefined);
    await createLoginSession(req, reply, user);
    return { user: toPublicUser(user) };
  });

  app.get<{ Params: { token: string } }>("/invite/:token", async (req) => {
    const inv = await prisma.invite.findUnique({ where: { tokenHash: sha256(req.params.token) } });
    if (!inv || inv.usedAt || inv.expiresAt < new Date()) return { valid: false };
    return { valid: true, email: inv.email };
  });

  app.post("/login", { config: loginLimit }, async (req, reply) => {
    const body = parse(loginSchema, req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    // Immer verifizieren, um Timing-Unterschiede zu minimieren.
    const ok = user?.passwordHash
      ? await verifyPassword(user.passwordHash, body.password)
      : (await verifyPassword(await DUMMY_HASH, body.password), false);
    if (!user || !ok) throw unauthorized("invalid_credentials");
    if (user.disabled) throw forbidden("account_disabled");
    await createLoginSession(req, reply, user);
    return { user: toPublicUser(user) };
  });

  app.post("/logout", async (req, reply) => {
    await destroyLoginSession(req, reply);
    return { ok: true };
  });

  app.patch("/me", async (req) => {
    const user = requireUser(req);
    const body = parse(profileSchema, req.body);
    const data: { name?: string; locale?: string; passwordHash?: string } = {};
    if (body.name) data.name = body.name;
    if (body.locale) data.locale = body.locale;
    if (body.newPassword) {
      if (user.passwordHash && !(await verifyPassword(user.passwordHash, body.currentPassword ?? "")))
        throw badRequest("wrong_password");
      data.passwordHash = await hashPassword(body.newPassword);
    }
    const updated = await prisma.user.update({ where: { id: user.id }, data });
    return { user: toPublicUser(updated) };
  });

  app.post("/forgot", { config: loginLimit }, async (req) => {
    const { email } = parse(forgotSchema, req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    if (user && !user.disabled) {
      const token = randomToken();
      await prisma.passwordResetToken.create({
        data: { tokenHash: sha256(token), userId: user.id, expiresAt: new Date(Date.now() + 3600_000) },
      });
      const s = await getSettings();
      const link = `${env.APP_URL}/reset/${token}`;
      const de = (user.locale ?? s.defaultLocale) === "de";
      await sendMail(
        user.email,
        de ? `${s.appName}: Passwort zurücksetzen` : `${s.appName}: Reset your password`,
        de
          ? `Hallo ${user.name},\n\nüber folgenden Link kannst du ein neues Passwort setzen (1 Stunde gültig):\n${link}\n\nFalls du das nicht angefordert hast, ignoriere diese E-Mail.`
          : `Hi ${user.name},\n\nuse this link to set a new password (valid for 1 hour):\n${link}\n\nIf you did not request this, ignore this email.`,
      );
    }
    // Immer gleiche Antwort, damit keine E-Mail-Adressen ausgespäht werden können.
    return { ok: true };
  });

  app.post("/reset", { config: loginLimit }, async (req) => {
    const body = parse(resetSchema, req.body);
    const t = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(body.token) } });
    if (!t || t.usedAt || t.expiresAt < new Date()) throw badRequest("token_invalid");
    await prisma.$transaction([
      prisma.user.update({ where: { id: t.userId }, data: { passwordHash: await hashPassword(body.password) } }),
      prisma.passwordResetToken.update({ where: { id: t.id }, data: { usedAt: new Date() } }),
      prisma.authSession.deleteMany({ where: { userId: t.userId } }),
    ]);
    return { ok: true };
  });

  // ---------- OIDC (optional) ----------
  app.get("/oidc/login", async (_req, reply) => {
    if (!env.oidcEnabled) throw forbidden("oidc_disabled");
    const client = await getOidcClient();
    const state = generators.state();
    const verifier = generators.codeVerifier();
    const nonce = generators.nonce();
    const payload = `${state}.${verifier}.${nonce}`;
    reply.setCookie("pd_oidc", `${payload}.${sign(payload)}`, cookieOptions(600));
    const url = client.authorizationUrl({
      scope: env.OIDC_SCOPES,
      state,
      nonce,
      code_challenge: generators.codeChallenge(verifier),
      code_challenge_method: "S256",
    });
    return reply.redirect(url);
  });

  app.get("/oidc/callback", async (req, reply) => {
    if (!env.oidcEnabled) throw forbidden("oidc_disabled");
    const raw = req.cookies.pd_oidc ?? "";
    const parts = raw.split(".");
    if (parts.length !== 4 || sign(parts.slice(0, 3).join(".")) !== parts[3]) throw badRequest("oidc_state");
    const [state, verifier, nonce] = parts;
    reply.clearCookie("pd_oidc", { path: "/" });
    const client = await getOidcClient();
    const params = client.callbackParams(req.raw);
    const tokens = await client.callback(`${env.APP_URL}/api/auth/oidc/callback`, params, {
      state,
      nonce,
      code_verifier: verifier,
    });
    const claims = tokens.claims();
    let info: Record<string, unknown> = { ...claims };
    if (tokens.access_token) {
      try {
        info = { ...info, ...(await client.userinfo(tokens.access_token)) };
      } catch {
        /* userinfo optional */
      }
    }
    const sub = String(claims.sub);
    const email = String(info.email ?? "").toLowerCase();
    const name = String(info.name ?? info.preferred_username ?? email.split("@")[0] ?? "User");
    const groups = Array.isArray(info.groups) ? (info.groups as string[]) : [];
    const isAdminGroup = !!env.OIDC_ADMIN_GROUP && groups.includes(env.OIDC_ADMIN_GROUP);

    let user = await prisma.user.findUnique({ where: { oidcSub: sub } });
    if (!user && email) {
      user = await prisma.user.findUnique({ where: { email } });
      if (user) user = await prisma.user.update({ where: { id: user.id }, data: { oidcSub: sub } });
    }
    if (!user) {
      if (!env.OIDC_AUTO_CREATE || !email) return reply.redirect("/login?error=oidc_no_account");
      const first = (await prisma.user.count()) === 0;
      user = await prisma.user.create({
        data: { email, name, oidcSub: sub, role: first || isAdminGroup ? "ADMIN" : "PRESENTER" },
      });
    } else if (isAdminGroup && user.role !== "ADMIN") {
      user = await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
    }
    if (user.disabled) return reply.redirect("/login?error=account_disabled");
    await createLoginSession(req, reply, user);
    return reply.redirect("/dashboard");
  });
}
