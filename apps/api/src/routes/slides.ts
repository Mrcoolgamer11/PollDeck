import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  backgroundSchema,
  defaultSlideConfig,
  safeParseSlideConfig,
  slideSettingsSchema,
  slideTypeSchema,
  slideUpdateSchema,
  type SlideType,
} from "@polldeck/shared";
import { prisma } from "../lib/prisma.js";
import { badRequest, notFound, parse } from "../lib/http.js";
import { requireUser } from "../lib/auth.js";
import { assertAccess } from "../lib/access.js";
import { slideCreateData, toSlide } from "../lib/slides.js";

async function touch(presentationId: string) {
  await prisma.presentation.update({ where: { id: presentationId }, data: { updatedAt: new Date() } });
}

async function loadSlide(id: string) {
  const s = await prisma.slide.findUnique({ where: { id } });
  if (!s) throw notFound();
  return s;
}

export async function slideRoutes(app: FastifyInstance) {
  app.post<{ Params: { id: string } }>("/presentations/:id/slides", async (req) => {
    const user = requireUser(req);
    await assertAccess(user, req.params.id, "edit");
    const body = parse(
      z.object({ type: slideTypeSchema, position: z.number().int().min(0).optional(), title: z.string().max(300).optional() }),
      req.body,
    );
    const count = await prisma.slide.count({ where: { presentationId: req.params.id } });
    if (count >= 500) throw badRequest("too_many_slides");
    const position = Math.min(body.position ?? count, count);
    const slide = await prisma.$transaction(async (tx) => {
      await tx.slide.updateMany({
        where: { presentationId: req.params.id, position: { gte: position } },
        data: { position: { increment: 1 } },
      });
      return tx.slide.create({
        data: slideCreateData(req.params.id, position, {
          type: body.type,
          title: body.title ?? "",
          config: defaultSlideConfig(body.type),
        }) as Prisma.SlideUncheckedCreateInput,
      });
    });
    await touch(req.params.id);
    return { slide: toSlide(slide) };
  });

  app.put<{ Params: { id: string } }>("/slides/:id", async (req) => {
    const user = requireUser(req);
    const existing = await loadSlide(req.params.id);
    await assertAccess(user, existing.presentationId, "edit");
    const body = parse(slideUpdateSchema, req.body);
    const type = (body.type ?? existing.type) as SlideType;
    const data: Prisma.SlideUpdateInput = {};
    if (body.type && body.type !== existing.type) {
      data.type = body.type;
      // Bei Typwechsel ggf. kompatible Optionen übernehmen.
      const old = existing.config as Record<string, unknown>;
      const fresh = defaultSlideConfig(body.type) as Record<string, unknown>;
      const merged = { ...fresh };
      if (Array.isArray(old.options) && "options" in fresh) merged.options = old.options;
      if (body.type === "quiz_choice" && Array.isArray(merged.options))
        merged.correctOptionIds = [(merged.options as { id: string }[])[0]?.id].filter(Boolean);
      const parsed = safeParseSlideConfig(body.type, body.config ?? merged);
      data.config = (parsed.success ? parsed.data : fresh) as Prisma.InputJsonValue;
    } else if (body.config !== undefined) {
      const parsed = safeParseSlideConfig(type, body.config);
      if (!parsed.success) throw badRequest("invalid_config", parsed.error.flatten());
      data.config = parsed.data as Prisma.InputJsonValue;
    }
    if (body.title !== undefined) data.title = body.title;
    if (body.description !== undefined) data.description = body.description;
    if (body.imageUrl !== undefined) data.imageUrl = body.imageUrl;
    if (body.notes !== undefined) data.notes = body.notes;
    if (body.background !== undefined) data.background = backgroundSchema.parse(body.background) as Prisma.InputJsonValue;
    if (body.settings !== undefined)
      data.settings = slideSettingsSchema.parse({ ...(existing.settings as object), ...body.settings }) as Prisma.InputJsonValue;
    const updated = await prisma.slide.update({ where: { id: existing.id }, data });
    await touch(existing.presentationId);
    return { slide: toSlide(updated) };
  });

  app.delete<{ Params: { id: string } }>("/slides/:id", async (req) => {
    const user = requireUser(req);
    const existing = await loadSlide(req.params.id);
    await assertAccess(user, existing.presentationId, "edit");
    await prisma.$transaction([
      prisma.slide.delete({ where: { id: existing.id } }),
      prisma.slide.updateMany({
        where: { presentationId: existing.presentationId, position: { gt: existing.position } },
        data: { position: { decrement: 1 } },
      }),
    ]);
    await touch(existing.presentationId);
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>("/slides/:id/duplicate", async (req) => {
    const user = requireUser(req);
    const s = await loadSlide(req.params.id);
    await assertAccess(user, s.presentationId, "edit");
    const copy = await prisma.$transaction(async (tx) => {
      await tx.slide.updateMany({
        where: { presentationId: s.presentationId, position: { gt: s.position } },
        data: { position: { increment: 1 } },
      });
      return tx.slide.create({
        data: {
          presentationId: s.presentationId,
          position: s.position + 1,
          type: s.type,
          title: s.title,
          description: s.description,
          imageUrl: s.imageUrl,
          background: s.background as Prisma.InputJsonValue,
          config: s.config as Prisma.InputJsonValue,
          settings: s.settings as Prisma.InputJsonValue,
          notes: s.notes,
        },
      });
    });
    await touch(s.presentationId);
    return { slide: toSlide(copy) };
  });

  app.put<{ Params: { id: string } }>("/presentations/:id/slides/order", async (req) => {
    const user = requireUser(req);
    await assertAccess(user, req.params.id, "edit");
    const { ids } = parse(z.object({ ids: z.array(z.string()).max(500) }), req.body);
    const slides = await prisma.slide.findMany({ where: { presentationId: req.params.id }, select: { id: true } });
    const known = new Set(slides.map((s) => s.id));
    if (ids.length !== known.size || !ids.every((i) => known.has(i))) throw badRequest("order_mismatch");
    await prisma.$transaction(ids.map((id, position) => prisma.slide.update({ where: { id }, data: { position } })));
    await touch(req.params.id);
    return { ok: true };
  });
}
