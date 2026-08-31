FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web-admin/package.json apps/web-admin/
RUN pnpm install --filter web-admin... --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web-admin/node_modules ./apps/web-admin/node_modules
COPY package.json pnpm-workspace.yaml turbo.json ./
COPY apps/web-admin ./apps/web-admin
WORKDIR /app/apps/web-admin
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm exec next build

FROM base AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN apk add --no-cache tini

# Output standalone: hanya menyalin berkas yang benar-benar dibutuhkan runtime.
COPY --from=build /app/apps/web-admin/.next/standalone ./
COPY --from=build /app/apps/web-admin/.next/static ./apps/web-admin/.next/static
COPY --from=build /app/apps/web-admin/public ./apps/web-admin/public

USER node
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/web-admin/server.js"]
