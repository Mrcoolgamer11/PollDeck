import { DEMO_PRESENTATION, presentationSettingsSchema, safeParseSlideConfig } from "@polldeck/shared";
import { prisma } from "./prisma.js";
import { slideCreateData } from "./slides.js";

/** Legt die Demo-Präsentation (jeder Folientyp einmal) für einen Benutzer an. */
export async function createDemoPresentation(ownerId: string): Promise<string> {
  const p = await prisma.presentation.create({
    data: { title: DEMO_PRESENTATION.title, ownerId, settings: presentationSettingsSchema.parse({}) },
  });
  await prisma.slide.createMany({
    data: DEMO_PRESENTATION.slides.map((s, i) => {
      const cfg = safeParseSlideConfig(s.type, s.config);
      if (!cfg.success) throw new Error(`Ungültige Demo-Folie ${i}: ${s.type}`);
      return slideCreateData(p.id, i, { ...s, config: cfg.data });
    }),
  });
  return p.id;
}
