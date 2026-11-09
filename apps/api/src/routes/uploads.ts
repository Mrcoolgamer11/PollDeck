import type { FastifyInstance } from "fastify";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { env } from "../env.js";
import { badRequest, HttpError, notFound } from "../lib/http.js";
import { randomToken, requireUser } from "../lib/auth.js";
import { getSettings } from "../lib/settings.js";

const TYPES: Record<string, { ext: string; magic: (b: Buffer) => boolean }> = {
  "image/png": { ext: "png", magic: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  "image/jpeg": { ext: "jpg", magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/gif": { ext: "gif", magic: (b) => b.subarray(0, 4).toString("ascii") === "GIF8" },
  "image/webp": {
    ext: "webp",
    magic: (b) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP",
  },
};
const EXT_TYPES = Object.fromEntries(Object.entries(TYPES).map(([mime, t]) => [t.ext, mime]));

export async function uploadRoutes(app: FastifyInstance) {
  await fsp.mkdir(env.UPLOAD_DIR, { recursive: true });

  app.post("/uploads", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req) => {
    requireUser(req);
    const file = await req.file();
    if (!file) throw badRequest("no_file");
    const type = TYPES[file.mimetype];
    if (!type) throw badRequest("unsupported_type");
    const { maxUploadMb } = await getSettings();
    const limit = maxUploadMb * 1024 * 1024;
    const name = `${Date.now().toString(36)}-${randomToken(12)}.${type.ext}`;
    const target = path.join(env.UPLOAD_DIR, name);

    let size = 0;
    let head = Buffer.alloc(0);
    const guard = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        size += chunk.length;
        if (head.length < 16) head = Buffer.concat([head, chunk.subarray(0, 16)]);
        if (size > limit) return cb(new HttpError(413, "file_too_large"));
        cb(null, chunk);
      },
    });
    try {
      await pipeline(file.file, guard, fs.createWriteStream(target));
      if (file.file.truncated) throw new HttpError(413, "file_too_large");
      if (!type.magic(head)) throw badRequest("invalid_image");
    } catch (e) {
      await fsp.rm(target, { force: true });
      throw e;
    }
    return { url: `/api/uploads/${name}`, size };
  });

  app.get<{ Params: { file: string } }>("/uploads/:file", async (req, reply) => {
    const name = req.params.file;
    if (!/^[\w-]+\.(png|jpg|gif|webp)$/.test(name)) throw notFound();
    const p = path.join(env.UPLOAD_DIR, name);
    try {
      const stat = await fsp.stat(p);
      return reply
        .header("Content-Type", EXT_TYPES[name.split(".").pop()!])
        .header("Content-Length", stat.size)
        .header("Cache-Control", "public, max-age=31536000, immutable")
        .header("X-Content-Type-Options", "nosniff")
        .header("Cross-Origin-Resource-Policy", "same-origin")
        .send(fs.createReadStream(p));
    } catch {
      throw notFound();
    }
  });
}
