import type { FastifyInstance } from "fastify";
import fs from "node:fs/promises";
import path from "node:path";
import {
  adminCreateUserSchema,
  adminUpdateUserSchema,
  instanceSettingsSchema,
  inviteCreateSchema,
  DEFAULT_WORD_FILTER,
} from "@polldeck/shared";
import { prisma } from "../lib/prisma.js";
import { badRequest, conflict, notFound, parse } from "../lib/http.js";
import { hashPassword, randomToken, requireAdmin, sha256 } from "../lib/auth.js";
import { getSettings, updateSettings } from "../lib/settings.js";
import { sendMail } from "../lib/mail.js";
import { env } from "../env.js";
import { onlineCount } from "../live/presence.js";

async function dirSize(dir: string): Promise<number> {
  let total = 0;
  try {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) total += await dirSize(p);
      else total += (await fs.stat(p)).size;
    }
  } catch {
    /* Verzeichnis existiert noch nicht */
  }
  return total;
}

export async function adminRoutes(app: FastifyInstance) {
  app.addHook("preHandler", async (req) => {
    requireAdmin(req);
  });

  app.get("/users", async () => {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        disabled: true,
        createdAt: true,
        lastLoginAt: true,
        oidcSub: true,
        _count: { select: { presentations: true } },
      },
    });
    return {
      users: users.map(({ oidcSub, _count, ...u }) => ({ ...u, sso: !!oidcSub, presentations: _count.presentations })),
    };
  });

  app.post("/users", async (req) => {
    const body = parse(adminCreateUserSchema, req.body);
    if (await prisma.user.findUnique({ where: { email: body.email } })) throw conflict("email_taken");
    const user = await prisma.user.create({
      data: { email: body.email, name: body.name, role: body.role, passwordHash: await hashPassword(body.password) },
    });
    return { id: user.id };
  });

  app.patch<{ Params: { id: string } }>("/users/:id", async (req) => {
    const me = requireAdmin(req);
    const body = parse(adminUpdateUserSchema, req.body);
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) throw notFound();
    if (target.id === me.id && (body.disabled || body.role === "PRESENTER")) throw badRequest("cannot_demote_self");
    if (target.role === "ADMIN" && (body.role === "PRESENTER" || body.disabled)) {
      const admins = await prisma.user.count({ where: { role: "ADMIN", disabled: false } });
      if (admins <= 1) throw badRequest("last_admin");
    }
    await prisma.user.update({
      where: { id: target.id },
      data: {
        name: body.name,
        role: body.role,
        disabled: body.disabled,
        ...(body.password ? { passwordHash: await hashPassword(body.password) } : {}),
      },
    });
    if (body.disabled || body.password) await prisma.authSession.deleteMany({ where: { userId: target.id } });
    return { ok: true };
  });

  app.delete<{ Params: { id: string } }>("/users/:id", async (req) => {
    const me = requireAdmin(req);
    if (req.params.id === me.id) throw badRequest("cannot_delete_self");
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) throw notFound();
    if (target.role === "ADMIN" && (await prisma.user.count({ where: { role: "ADMIN" } })) <= 1)
      throw badRequest("last_admin");
    await prisma.user.delete({ where: { id: target.id } });
    return { ok: true };
  });

  app.get("/settings", async () => ({ settings: await getSettings(), defaultWordFilter: DEFAULT_WORD_FILTER }));

  app.put("/settings", async (req) => {
    const body = parse(instanceSettingsSchema.partial(), req.body);
    return { settings: await updateSettings(body) };
  });

  app.get("/invites", async () => ({
    invites: await prisma.invite.findMany({
      where: { usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
    }),
  }));

  app.post("/invites", async (req) => {
    const me = requireAdmin(req);
    const body = parse(inviteCreateSchema, req.body);
    const token = randomToken(24);
    await prisma.invite.create({
      data: {
        tokenHash: sha256(token),
        email: body.email ?? null,
        role: body.role,
        createdById: me.id,
        expiresAt: new Date(Date.now() + 7 * 86400_000),
      },
    });
    const link = `${env.APP_URL}/register?invite=${token}`;
    let mailed = false;
    if (body.sendMail && body.email) {
      const s = await getSettings();
      mailed = await sendMail(
        body.email,
        `Einladung zu ${s.appName}`,
        `Hallo,\n\n${me.name} hat dich zu ${s.appName} eingeladen.\nHier kannst du dein Konto anlegen (7 Tage gültig):\n${link}\n`,
      );
    }
    return { link, mailed };
  });

  app.delete<{ Params: { id: string } }>("/invites/:id", async (req) => {
    await prisma.invite.deleteMany({ where: { id: req.params.id } });
    return { ok: true };
  });

  app.get("/stats", async () => {
    const [users, presentations, sessionsTotal, responses, active] = await Promise.all([
      prisma.user.count(),
      prisma.presentation.count(),
      prisma.liveSession.count(),
      prisma.response.count(),
      prisma.liveSession.findMany({
        where: { status: "ACTIVE" },
        select: {
          id: true,
          code: true,
          mode: true,
          startedAt: true,
          presentation: { select: { title: true, owner: { select: { name: true } } } },
          _count: { select: { participants: true, responses: true } },
        },
        orderBy: { startedAt: "desc" },
      }),
    ]);
    const dbSize = await prisma
      .$queryRaw<{ size: bigint }[]>`SELECT pg_database_size(current_database()) AS size`
      .then((r) => Number(r[0]?.size ?? 0))
      .catch(() => 0);
    const uploadsSize = await dirSize(env.UPLOAD_DIR);
    const activeSessions = await Promise.all(
      active.map(async (s) => ({
        id: s.id,
        code: s.code,
        mode: s.mode,
        startedAt: s.startedAt,
        title: s.presentation.title,
        owner: s.presentation.owner.name,
        participants: s._count.participants,
        responses: s._count.responses,
        online: await onlineCount(s.id),
      })),
    );
    return {
      users,
      presentations,
      sessionsTotal,
      responses,
      activeSessions,
      storage: { database: dbSize, uploads: uploadsSize },
    };
  });
}
