FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web-teknisi/package.json apps/web-teknisi/
RUN pnpm config set fetch-timeout 300000 && pnpm config set fetch-retries 5 && pnpm install --filter web-teknisi... --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web-teknisi/node_modules ./apps/web-teknisi/node_modules
COPY package.json pnpm-workspace.yaml turbo.json ./
COPY apps/web-teknisi ./apps/web-teknisi
WORKDIR /app/apps/web-teknisi
# Versi web memanggil API same-origin; nginx meneruskan /api ke container API.
ARG NEXT_PUBLIC_API_URL=/api
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_TELEMETRY_DISABLED=1
RUN pnpm exec next build

# Static export cukup disajikan nginx — tidak perlu runtime Node.
FROM nginx:1.27-alpine AS runtime
COPY apps/web-teknisi/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web-teknisi/out /usr/share/nginx/html
EXPOSE 3000
