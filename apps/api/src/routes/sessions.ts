import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { presentationSettingsSchema, sessionStartSchema, isInteractive } from "@polldeck/shared";
import { prisma } from "../lib/prisma.js";
import { notFound, parse } from "../lib/http.js";
import { requireUser } from "../lib/auth.js";
import { assertAccess } from "../lib/access.js";
import { toSlide } from "../lib/slides.js";
import { defaultLiveState, generateCode, invalidate, loadRuntime } from "../live/runtime.js";
import { endSession } from "../live/server.js";
import { hostResults, leaderboard, questionsFor } from "../live/data.js";
import { onlineCount } from "../live/presence.js";

export async function sessionRoutes(app: FastifyInstance) {
  /** Öffentlich: Prüft einen Beitrittscode. */
  app.get<{ Params: { code: string } }>(
    "/join/:code",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req) => {
      if (!/^\d{6}$/.test(req.params.code)) throw notFound("session_not_found");
      const s = await prisma.liveSession.findFirst({
        where: { code: req.params.code, status: "ACTIVE" },
        select: { id: true, mode: true, presentation: { select: { title: true, settings: true } } },
      });
      if (!s) throw notFound("session_not_found");
      const settings = presentationSettingsSchema.parse(s.presentation.settings ?? {});
      return { title: s.presentation.title, mode: s.mode, requireNames: settings.requireNames };
    },
  );

  app.post<{ Params: { id: string } }>("/presentations/:id/sessions", async (req) => {
    const user = requireUser(req);
    await assertAccess(user, req.params.id, "edit");
    const body = parse(sessionStartSchema.extend({ restart: z.boolean().optional() }), req.body ?? {});
    const existing = await prisma.liveSession.findFirst({
      where: { presentationId: req.params.id, status: "ACTIVE" },
      orderBy: { startedAt: "desc" },
    });
    if (existing && !body.restart && existing.mode === body.mode) {
      return { id: existing.id, code: existing.code, resumed: true };
    }
    if (existing) {
      const active = await prisma.liveSession.findMany({ where: { presentationId: req.params.id, status: "ACTIVE" } });
      for (const s of active) {
        await prisma.liveSession.update({ where: { id: s.id }, data: { status: "ENDED", endedAt: new Date() } });
        invalidate(s.id);
        await endSession(s.id);
      }
    }
    const p = await prisma.presentation.findUniqueOrThrow({
      where: { id: req.params.id },
      include: { slides: { orderBy: { position: "asc" } } },
    });
    if (!p.slides.length) throw notFound("no_slides");
    const settings = presentationSettingsSchema.parse(p.settings ?? {});
    const session = await prisma.liveSession.create({
      data: {
        presentationId: p.id,
        code: await generateCode(),
        mode: body.mode,
        slides: p.slides.map(toSlide) as unknown as Prisma.InputJsonValue,
        state: defaultLiveState(settings) as unknown as Prisma.InputJsonValue,
      },
    });
    return { id: session.id, code: session.code, resumed: false };
  });

  app.get<{ Params: { id: string } }>("/presentations/:id/sessions", async (req) => {
    const user = requireUser(req);
    await assertAccess(user, req.params.id, "view");
    const list = await prisma.liveSession.findMany({
      where: { presentationId: req.params.id },
      orderBy: { startedAt: "desc" },
      select: {
        id: true,
        code: true,
        status: true,
        mode: true,
        startedAt: true,
        endedAt: true,
        _count: { select: { participants: true, responses: true } },
      },
    });
    return {
      sessions: list.map((s) => ({
        id: s.id,
        code: s.code,
        status: s.status,
        mode: s.mode,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        participants: s._count.participants,
        responses: s._count.responses,
      })),
    };
  });

  /** Archivierte/laufende Ergebnisse einer Sitzung. */
  app.get<{ Params: { id: string } }>("/sessions/:id", async (req) => {
    const user = requireUser(req);
    const s = await prisma.liveSession.findUnique({
      where: { id: req.params.id },
      select: { presentationId: true, status: true, startedAt: true, endedAt: true, code: true, mode: true },
    });
    if (!s) throw notFound();
    const access = await assertAccess(user, s.presentationId, "view");
    const rt = await loadRuntime(req.params.id, true);
    if (!rt) throw notFound();
    const results: Record<string, unknown> = {};
    const questions: Record<string, unknown> = {};
    for (const slide of rt.slides) {
      if (isInteractive(slide.type)) results[slide.id] = await hostResults(rt, slide);
      if (slide.type === "qa") questions[slide.id] = await questionsFor(rt, slide.id);
    }
    return {
      session: {
        id: rt.id,
        code: s.code,
        status: s.status,
        mode: s.mode,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        presentationId: s.presentationId,
        title: rt.title,
        theme: rt.theme,
        access,
        participants: await prisma.participant.count({ where: { sessionId: rt.id, kicked: false } }),
        online: s.status === "ACTIVE" ? await onlineCount(rt.id) : 0,
        slides: rt.slides,
        results,
        questions,
        leaderboard: await leaderboard(rt),
      },
    };
  });

  app.post<{ Params: { id: string } }>("/sessions/:id/end", async (req) => {
    const user = requireUser(req);
    const s = await prisma.liveSession.findUnique({ where: { id: req.params.id } });
    if (!s) throw notFound();
    await assertAccess(user, s.presentationId, "edit");
    if (s.status === "ACTIVE") {
      await prisma.liveSession.update({ where: { id: s.id }, data: { status: "ENDED", endedAt: new Date() } });
      invalidate(s.id);
      await endSession(s.id);
    }
    return { ok: true };
  });

  app.delete<{ Params: { id: string } }>("/sessions/:id", async (req) => {
    const user = requireUser(req);
    const s = await prisma.liveSession.findUnique({ where: { id: req.params.id } });
    if (!s) throw notFound();
    await assertAccess(user, s.presentationId, "edit");
    if (s.status === "ACTIVE") await endSession(s.id);
    await prisma.liveSession.delete({ where: { id: s.id } });
    invalidate(s.id);
    return { ok: true };
  });
}
