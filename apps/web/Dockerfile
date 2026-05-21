# syntax=docker/dockerfile:1.7

# ---------- build stage ----------
FROM node:22-bookworm-slim AS builder
WORKDIR /workspace

# These come from docker-compose build args and get baked into the bundle.
ARG VITE_API_ORIGIN=""
ARG VITE_AUTH_ORIGIN=""
ARG VITE_DOWNLOAD_URL_MAC=""
ENV VITE_API_ORIGIN=$VITE_API_ORIGIN \
    VITE_AUTH_ORIGIN=$VITE_AUTH_ORIGIN \
    VITE_DOWNLOAD_URL_MAC=$VITE_DOWNLOAD_URL_MAC

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY . .

ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN npm ci

RUN npm run build -w @investment-plan/web


# ---------- runtime stage ----------
FROM nginx:1.27-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /workspace/apps/web/dist /usr/share/nginx/html
EXPOSE 80
