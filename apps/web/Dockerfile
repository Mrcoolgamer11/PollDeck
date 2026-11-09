# syntax=docker/dockerfile:1
# ---------- Build ----------
FROM node:22-alpine AS build
RUN npm install -g pnpm@10.28.0
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter "@polldeck/web..."
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @polldeck/shared build && pnpm --filter @polldeck/web build

# ---------- Runtime ----------
FROM nginx:1.27-alpine
RUN apk add --no-cache wget
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
  CMD wget -qO- http://127.0.0.1/healthz >/dev/null || exit 1
