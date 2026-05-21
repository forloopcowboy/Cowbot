# syntax=docker/dockerfile:1.7

# ---------- build stage ----------
FROM node:22-bookworm-slim AS builder
WORKDIR /workspace

# Build deps for native modules (pg, etc.)
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Copy the whole monorepo. Nx workspace resolution + npm workspaces need the
# full tree (package.json + libs/* + tsconfig.base.json) to be present at install
# time, so partial copies don't really save anything here.
COPY . .

ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN npm ci

# Build the API. Type-only imports of @investment-plan/shared get erased, so the
# resulting dist/ is self-contained and only needs apps/api/node_modules at runtime.
RUN npm run build -w @investment-plan/api


# ---------- runtime stage ----------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    DEBIAN_FRONTEND=noninteractive \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PYTHON_BIN=uv \
    PYTHON_SCRIPTS_DIR=/app/scripts \
    UV_LINK_MODE=copy

# Chromium for Puppeteer + Python + curl for uv installer.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
        chromium \
        fonts-liberation fonts-noto-color-emoji \
        libnss3 libatk-bridge2.0-0 libdrm2 libxkbcommon0 libxcomposite1 \
        libxdamage1 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2 \
        python3 python3-pip python3-venv \
        ca-certificates curl tini \
 && rm -rf /var/lib/apt/lists/*

# uv (Astral) for running the report-generation scripts.
RUN curl -LsSf https://astral.sh/uv/install.sh | sh \
 && mv /root/.local/bin/uv /usr/local/bin/uv \
 && mv /root/.local/bin/uvx /usr/local/bin/uvx 2>/dev/null || true

# Bring over the built API, its prod-ish node_modules, the workspace root
# node_modules (in case nest's runtime needs anything hoisted), and the Python
# scripts that the API spawns at runtime.
COPY --from=builder /workspace/node_modules /app/node_modules
COPY --from=builder /workspace/apps/api/node_modules /app/apps/api/node_modules
COPY --from=builder /workspace/apps/api/dist /app/apps/api/dist
COPY --from=builder /workspace/apps/api/package.json /app/apps/api/package.json
COPY --from=builder /workspace/scripts /app/scripts
COPY --from=builder /workspace/prompts /app/prompts

# Warm the Python venv so the first report doesn't pay a long install.
RUN cd /app/scripts && uv sync --no-dev || uv sync || true

WORKDIR /app/apps/api
EXPOSE 3000

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main.js"]
