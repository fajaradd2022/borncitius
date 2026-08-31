FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web-teknisi/package.json apps/web-teknisi/
RUN pnpm install --filter web-teknisi... --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web-teknisi/node_modules ./apps/web-teknisi/node_modules
COPY package.json pnpm-workspace.yaml turbo.json ./
COPY apps/web-teknisi ./apps/web-teknisi
WORKDIR /app/apps/web-teknisi
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm exec next build

FROM base AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN apk add --no-cache tini

# Output standalone: hanya menyalin berkas yang benar-benar dibutuhkan runtime.
COPY --from=build /app/apps/web-teknisi/.next/standalone ./
COPY --from=build /app/apps/web-teknisi/.next/static ./apps/web-teknisi/.next/static
COPY --from=build /app/apps/web-teknisi/public ./apps/web-teknisi/public

USER node
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/web-teknisi/server.js"]
