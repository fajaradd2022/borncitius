# Multi-stage: dependency, build, lalu runtime ramping.
FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/
RUN pnpm install --filter api... --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY package.json pnpm-workspace.yaml turbo.json ./
COPY apps/api ./apps/api
WORKDIR /app/apps/api
RUN pnpm exec prisma generate && pnpm exec nest build

FROM base AS runtime
ENV NODE_ENV=production
# rclone dibutuhkan worker untuk mirror ke Google Drive (PRD 8.2).
RUN apk add --no-cache rclone tini

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/api/package.json ./apps/api/

WORKDIR /app/apps/api
# Berjalan sebagai user non-root bawaan image node.
RUN mkdir -p /data/storage && chown -R node:node /data
USER node

EXPOSE 4000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/src/main.js"]
