import type { Prisma, Slide as DbSlide } from "@prisma/client";
import {
  backgroundSchema,
  safeParseSlideConfig,
  slideSettingsSchema,
  defaultSlideConfig,
  type Slide,
  type SlideType,
  SLIDE_TYPES,
} from "@polldeck/shared";

/** Wandelt eine DB-Folie in die geteilte Darstellung um (mit Standardwerten). */
export function toSlide(s: DbSlide): Slide {
  const type = (SLIDE_TYPES as readonly string[]).includes(s.type) ? (s.type as SlideType) : "content";
  const cfg = safeParseSlideConfig(type, s.config);
  return {
    id: s.id,
    type,
    position: s.position,
    title: s.title,
    description: s.description,
    imageUrl: s.imageUrl,
    background: backgroundSchema.parse(s.background ?? {}),
    settings: slideSettingsSchema.parse(s.settings ?? {}),
    config: cfg.success ? cfg.data : defaultSlideConfig(type),
    notes: s.notes,
  } as Slide;
}

export function slideCreateData(
  presentationId: string,
  position: number,
  s: { type: SlideType; title?: string; description?: string | null; imageUrl?: string | null; config: unknown; settings?: unknown; background?: unknown; notes?: string | null },
): Prisma.SlideCreateManyInput {
  return {
    presentationId,
    position,
    type: s.type,
    title: s.title ?? "",
    description: s.description ?? null,
    imageUrl: s.imageUrl ?? null,
    config: (s.config ?? {}) as Prisma.InputJsonValue,
    settings: slideSettingsSchema.parse(s.settings ?? {}) as Prisma.InputJsonValue,
    background: backgroundSchema.parse(s.background ?? {}) as Prisma.InputJsonValue,
    notes: s.notes ?? null,
  };
}
