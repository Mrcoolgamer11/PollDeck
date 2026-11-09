import type { FastifyReply } from "fastify";
import type { ZodSchema } from "zod";

export class HttpError extends Error {
  constructor(public statusCode: number, public code: string, public details?: unknown) {
    super(code);
  }
}

export const badRequest = (code = "bad_request", details?: unknown) => new HttpError(400, code, details);
export const unauthorized = (code = "unauthorized") => new HttpError(401, code);
export const forbidden = (code = "forbidden") => new HttpError(403, code);
export const notFound = (code = "not_found") => new HttpError(404, code);
export const conflict = (code = "conflict") => new HttpError(409, code);

/** Validiert Eingaben mit Zod und wirft bei Fehlern einen 400er. */
export function parse<T>(schema: ZodSchema<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) throw badRequest("validation_error", r.error.flatten());
  return r.data;
}

export function sendFile(reply: FastifyReply, filename: string, contentType: string, body: Buffer | string) {
  const safe = filename.replace(/[^\w.\- ]+/g, "_");
  return reply
    .header("Content-Type", contentType)
    .header("Content-Disposition", `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(filename)}`)
    .send(body);
}
