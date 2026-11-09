import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  BUILTIN_THEMES,
  presentationCreateSchema,
  presentationSettingsSchema,
  presentationUpdateSchema,
  shareSchema,
  slideInputSchema,
  safeParseSlideConfig,
  themeConfigSchema,
  TEMPLATES,
  defaultSlideConfig,
  parseQuizImport,
  QuizImportError,
  type ThemeConfig,
} from "@polldeck/shared";
import { prisma } from "../lib/prisma.js";
import { badRequest, notFound, parse, sendFile } from "../lib/http.js";
import { requireUser } from "../lib/auth.js";
import { assertAccess } from "../lib/access.js";
import { slideCreateData, toSlide } from "../lib/slides.js";

export async function resolveTheme(p: { themeId: string | null; builtinTheme: string }): Promise<ThemeConfig> {
  if (p.themeId) {
    const t = await prisma.theme.findUnique({ where: { id: p.themeId } });
    if (t) {
      const parsed = themeConfigSchema.safeParse(t.config);
      if (parsed.success) return parsed.data;
    }
  }
  return (BUILTIN_THEMES.find((b) => b.id === p.builtinTheme) ?? BUILTIN_THEMES[0]).config;
}

const exportFormatVersion = 1;
const importSchema = z.object({
  format: z.literal("polldeck-presentation").optional(),
  version: z.number().optional(),
  title: z.string().min(1).max(200),
  settings: z.unknown().optional(),
  theme: themeConfigSchema.optional().nullable(),
  builtinTheme: z.string().max(64).optional(),
  slides: z.array(slideInputSchema).max(500),
});

export async function presentationRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { q?: string; folderId?: string } }>("/presentations", async (req) => {
    const user = requireUser(req);
    const q = req.query.q?.trim();
    const where: Prisma.PresentationWhereInput = {
      OR: [{ ownerId: user.id }, { shares: { some: { userId: user.id } } }],
      ...(q ? { title: { contains: q, mode: "insensitive" } } : {}),
    };
    const list = await prisma.presentation.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        folderId: true,
        ownerId: true,
        updatedAt: true,
        createdAt: true,
        owner: { select: { name: true } },
        shares: { where: { userId: user.id }, select: { role: true } },
        _count: { select: { slides: true, sessions: true } },
        sessions: { where: { status: "ACTIVE" }, select: { id: true, code: true }, take: 1 },
      },
    });
    return {
      presentations: list.map((p) => ({
        id: p.id,
        title: p.title,
        folderId: p.ownerId === user.id ? p.folderId : null,
        updatedAt: p.updatedAt,
        createdAt: p.createdAt,
        owner: p.owner.name,
        access: p.ownerId === user.id ? "owner" : p.shares[0]?.role === "EDIT" ? "edit" : "view",
        slideCount: p._count.slides,
        sessionCount: p._count.sessions,
        activeSession: p.sessions[0] ?? null,
      })),
    };
  });

  app.post("/presentations", async (req) => {
    const user = requireUser(req);
    const body = parse(presentationCreateSchema, req.body);
    const template = body.templateId ? TEMPLATES.find((t) => t.id === body.templateId) : null;
    if (body.templateId && !template) throw badRequest("unknown_template");
    if (body.folderId) {
      const f = await prisma.folder.findFirst({ where: { id: body.folderId, ownerId: user.id } });
      if (!f) throw badRequest("unknown_folder");
    }
    const p = await prisma.presentation.create({
      data: {
        title: body.title,
        ownerId: user.id,
        folderId: body.folderId ?? null,
        settings: presentationSettingsSchema.parse({}),
      },
    });
    const slides = template
      ? template.slides
      : [{ type: "multiple_choice" as const, title: "", config: defaultSlideConfig("multiple_choice") as unknown }];
    await prisma.slide.createMany({
      data: slides.map((s, i) => {
        const cfg = safeParseSlideConfig(s.type, s.config);
        return slideCreateData(p.id, i, {
          ...s,
          config: cfg.success ? cfg.data : (s.config ?? {}),
        });
      }),
    });
    return { id: p.id };
  });

  app.get<{ Params: { id: string } }>("/presentations/:id", async (req) => {
    const user = requireUser(req);
    const access = await assertAccess(user, req.params.id, "view");
    const p = await prisma.presentation.findUnique({
      where: { id: req.params.id },
      include: {
        slides: { orderBy: { position: "asc" } },
        owner: { select: { name: true, email: true } },
        shares: { include: { user: { select: { id: true, name: true, email: true } } } },
        sessions: { where: { status: "ACTIVE" }, select: { id: true, code: true, mode: true } },
      },
    });
    if (!p) throw notFound();
    return {
      presentation: {
        id: p.id,
        title: p.title,
        folderId: p.folderId,
        themeId: p.themeId,
        builtinTheme: p.builtinTheme,
        theme: await resolveTheme(p),
        settings: presentationSettingsSchema.parse(p.settings ?? {}),
        owner: p.owner,
        access,
        updatedAt: p.updatedAt,
        shares:
          access === "owner"
            ? p.shares.map((s) => ({ id: s.id, role: s.role, user: s.user }))
            : [],
        activeSessions: p.sessions,
        slides: p.slides.map(toSlide),
      },
    };
  });

  app.patch<{ Params: { id: string } }>("/presentations/:id", async (req) => {
    const user = requireUser(req);
    const access = await assertAccess(user, req.params.id, "edit");
    const body = parse(presentationUpdateSchema, req.body);
    const p = await prisma.presentation.findUniqueOrThrow({ where: { id: req.params.id } });
    const data: Prisma.PresentationUncheckedUpdateInput = {};
    if (body.title) data.title = body.title;
    if (body.folderId !== undefined && access === "owner") {
      if (body.folderId) {
        const f = await prisma.folder.findFirst({ where: { id: body.folderId, ownerId: user.id } });
        if (!f) throw badRequest("unknown_folder");
      }
      data.folderId = body.folderId;
    }
    if (body.themeId !== undefined) {
      if (body.themeId === null || body.themeId.startsWith("builtin-")) {
        data.themeId = null;
        data.builtinTheme = body.themeId ?? "builtin-dark";
      } else {
        const t = await prisma.theme.findFirst({ where: { id: body.themeId, ownerId: { in: [user.id, p.ownerId] } } });
        if (!t) throw badRequest("unknown_theme");
        data.themeId = t.id;
      }
    }
    if (body.settings) {
      data.settings = presentationSettingsSchema.parse({ ...(p.settings as object), ...body.settings });
    }
    await prisma.presentation.update({ where: { id: p.id }, data });
    return { ok: true };
  });

  app.delete<{ Params: { id: string } }>("/presentations/:id", async (req) => {
    const user = requireUser(req);
    await assertAccess(user, req.params.id, "owner");
    await prisma.presentation.delete({ where: { id: req.params.id } });
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>("/presentations/:id/duplicate", async (req) => {
    const user = requireUser(req);
    await assertAccess(user, req.params.id, "view");
    const src = await prisma.presentation.findUniqueOrThrow({
      where: { id: req.params.id },
      include: { slides: { orderBy: { position: "asc" } } },
    });
    const copy = await prisma.presentation.create({
      data: {
        title: `${src.title} (Kopie)`.slice(0, 200),
        ownerId: user.id,
        folderId: src.ownerId === user.id ? src.folderId : null,
        themeId: src.ownerId === user.id ? src.themeId : null,
        builtinTheme: src.builtinTheme,
        settings: src.settings as Prisma.InputJsonValue,
      },
    });
    await prisma.slide.createMany({
      data: src.slides.map((s) => ({
        presentationId: copy.id,
        position: s.position,
        type: s.type,
        title: s.title,
        description: s.description,
        imageUrl: s.imageUrl,
        background: s.background as Prisma.InputJsonValue,
        config: s.config as Prisma.InputJsonValue,
        settings: s.settings as Prisma.InputJsonValue,
        notes: s.notes,
      })),
    });
    return { id: copy.id };
  });

  // ---------- Teilen ----------
  app.post<{ Params: { id: string } }>("/presentations/:id/shares", async (req) => {
    const user = requireUser(req);
    await assertAccess(user, req.params.id, "owner");
    const body = parse(shareSchema, req.body);
    const target = await prisma.user.findUnique({ where: { email: body.email } });
    if (!target) throw notFound("user_not_found");
    if (target.id === user.id) throw badRequest("cannot_share_with_self");
    await prisma.presentationShare.upsert({
      where: { presentationId_userId: { presentationId: req.params.id, userId: target.id } },
      create: { presentationId: req.params.id, userId: target.id, role: body.role },
      update: { role: body.role },
    });
    return { ok: true };
  });

  app.delete<{ Params: { id: string; shareId: string } }>("/presentations/:id/shares/:shareId", async (req) => {
    const user = requireUser(req);
    const share = await prisma.presentationShare.findUnique({ where: { id: req.params.shareId } });
    if (!share || share.presentationId !== req.params.id) throw notFound();
    // Eigentümer dürfen alle Freigaben entfernen, Empfänger ihre eigene.
    if (share.userId !== user.id) await assertAccess(user, req.params.id, "owner");
    await prisma.presentationShare.delete({ where: { id: share.id } });
    return { ok: true };
  });

  // ---------- Export / Import (JSON) ----------
  app.get<{ Params: { id: string } }>("/presentations/:id/export", async (req, reply) => {
    const user = requireUser(req);
    await assertAccess(user, req.params.id, "view");
    const p = await prisma.presentation.findUniqueOrThrow({
      where: { id: req.params.id },
      include: { slides: { orderBy: { position: "asc" } } },
    });
    const data = {
      format: "polldeck-presentation",
      version: exportFormatVersion,
      exportedAt: new Date().toISOString(),
      title: p.title,
      settings: p.settings,
      builtinTheme: p.builtinTheme,
      theme: p.themeId ? await resolveTheme(p) : null,
      slides: p.slides.map((s) => {
        const sl = toSlide(s);
        return {
          type: sl.type,
          title: sl.title,
          description: sl.description,
          imageUrl: sl.imageUrl,
          background: sl.background,
          settings: sl.settings,
          config: sl.config,
          notes: sl.notes,
        };
      }),
    };
    return sendFile(reply, `${p.title}.polldeck.json`, "application/json", JSON.stringify(data, null, 2));
  });

  app.post("/presentations/import", async (req) => {
    const user = requireUser(req);
    const body = parse(importSchema, req.body);
    let themeId: string | null = null;
    if (body.theme) {
      const t = await prisma.theme.create({
        data: { name: `${body.title} (Import)`.slice(0, 60), ownerId: user.id, config: body.theme },
      });
      themeId = t.id;
    }
    const p = await prisma.presentation.create({
      data: {
        title: body.title,
        ownerId: user.id,
        themeId,
        builtinTheme: body.builtinTheme?.startsWith("builtin-") ? body.builtinTheme : "builtin-dark",
        settings: presentationSettingsSchema.parse(body.settings ?? {}),
      },
    });
    await prisma.slide.createMany({
      data: body.slides.map((s, i) => {
        const cfg = safeParseSlideConfig(s.type, s.config);
        if (!cfg.success) throw badRequest("invalid_slide", { index: i });
        return slideCreateData(p.id, i, { ...s, config: cfg.data });
      }),
    });
    return { id: p.id };
  });

  /** Quizfragen aus CSV/JSON an eine Präsentation anhängen. */
  app.post<{ Params: { id: string } }>("/presentations/:id/import-quiz", async (req) => {
    const user = requireUser(req);
    await assertAccess(user, req.params.id, "edit");
    const body = parse(z.object({ content: z.string().min(1).max(2_000_000), format: z.enum(["csv", "json"]) }), req.body);
    let slides;
    try {
      slides = parseQuizImport(body.content, body.format);
    } catch (e) {
      if (e instanceof QuizImportError) throw badRequest(e.message, { line: e.line });
      throw e;
    }
    const max = await prisma.slide.aggregate({ where: { presentationId: req.params.id }, _max: { position: true } });
    const start = (max._max.position ?? -1) + 1;
    await prisma.slide.createMany({ data: slides.map((s, i) => slideCreateData(req.params.id, start + i, s)) });
    await prisma.presentation.update({ where: { id: req.params.id }, data: { updatedAt: new Date() } });
    return { imported: slides.length };
  });
}
