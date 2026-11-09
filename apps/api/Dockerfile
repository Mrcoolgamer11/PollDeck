# syntax=docker/dockerfile:1
# ---------- Build ----------
FROM node:22-alpine AS build
RUN apk add --no-cache openssl \
 && npm install -g pnpm@10.28.0
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter "@polldeck/api..."
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @polldeck/shared build \
 && pnpm --filter @polldeck/api exec prisma generate \
 && pnpm --filter @polldeck/api build \
 && pnpm deploy --legacy --filter @polldeck/api --prod /out \
 && cd /out && npx prisma generate \
 && rm -rf /out/src /out/tsconfig.json

# ---------- Runtime ----------
FROM node:22-alpine AS runtime
RUN apk add --no-cache openssl tini su-exec wget
ENV NODE_ENV=production \
    PORT=3000 \
    UPLOAD_DIR=/data/uploads
WORKDIR /app
COPY --from=build --chown=node:node /out ./
COPY apps/api/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && mkdir -p /data/uploads && chown -R node:node /data
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
ENTRYPOINT ["/sbin/tini", "--", "docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
