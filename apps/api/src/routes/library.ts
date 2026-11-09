import type { FastifyInstance } from "fastify";
import { BUILTIN_THEMES, folderSchema, TEMPLATES, themeConfigSchema, themeInputSchema } from "@polldeck/shared";
import { prisma } from "../lib/prisma.js";
import { notFound, parse } from "../lib/http.js";
import { requireUser } from "../lib/auth.js";

/** Ordner, Themes und Vorlagen. */
export async function libraryRoutes(app: FastifyInstance) {
  app.get("/folders", async (req) => {
    const user = requireUser(req);
    return {
      folders: await prisma.folder.findMany({
        where: { ownerId: user.id },
        orderBy: { name: "asc" },
        select: { id: true, name: true, _count: { select: { presentations: true } } },
      }),
    };
  });

  app.post("/folders", async (req) => {
    const user = requireUser(req);
    const { name } = parse(folderSchema, req.body);
    const f = await prisma.folder.create({ data: { name, ownerId: user.id } });
    return { folder: f };
  });

  app.patch<{ Params: { id: string } }>("/folders/:id", async (req) => {
    const user = requireUser(req);
    const { name } = parse(folderSchema, req.body);
    const r = await prisma.folder.updateMany({ where: { id: req.params.id, ownerId: user.id }, data: { name } });
    if (!r.count) throw notFound();
    return { ok: true };
  });

  app.delete<{ Params: { id: string } }>("/folders/:id", async (req) => {
    const user = requireUser(req);
    const r = await prisma.folder.deleteMany({ where: { id: req.params.id, ownerId: user.id } });
    if (!r.count) throw notFound();
    return { ok: true };
  });

  app.get("/themes", async (req) => {
    const user = requireUser(req);
    const own = await prisma.theme.findMany({ where: { ownerId: user.id }, orderBy: { createdAt: "asc" } });
    return {
      themes: [
        ...BUILTIN_THEMES.map((t) => ({ ...t, builtin: true })),
        ...own.map((t) => ({ id: t.id, name: t.name, config: themeConfigSchema.parse(t.config), builtin: false })),
      ],
    };
  });

  app.post("/themes", async (req) => {
    const user = requireUser(req);
    const body = parse(themeInputSchema, req.body);
    const t = await prisma.theme.create({ data: { name: body.name, config: body.config, ownerId: user.id } });
    return { id: t.id };
  });

  app.put<{ Params: { id: string } }>("/themes/:id", async (req) => {
    const user = requireUser(req);
    const body = parse(themeInputSchema, req.body);
    const r = await prisma.theme.updateMany({
      where: { id: req.params.id, ownerId: user.id },
      data: { name: body.name, config: body.config },
    });
    if (!r.count) throw notFound();
    return { ok: true };
  });

  app.delete<{ Params: { id: string } }>("/themes/:id", async (req) => {
    const user = requireUser(req);
    const r = await prisma.theme.deleteMany({ where: { id: req.params.id, ownerId: user.id } });
    if (!r.count) throw notFound();
    return { ok: true };
  });

  app.get("/templates", async (req) => {
    requireUser(req);
    return {
      templates: TEMPLATES.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        slideCount: t.slides.length,
        types: [...new Set(t.slides.map((s) => s.type))],
      })),
    };
  });
}
