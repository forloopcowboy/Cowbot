# Web + API migration

This repo is being extracted from a single Electron app into an Nx monorepo that holds:

| Project | Path | What it is |
|---|---|---|
| `desktop` | `desktop/` | The original Electron app — unchanged, still runnable. |
| `api` | `apps/api/` | NestJS service: Postgres + Kysely + Liquibase, SuperTokens auth, Python orchestration via SSE, Puppeteer-rendered PDFs, auto-generated OpenAPI docs at `/api/docs`. |
| `web` | `apps/web/` | Vite + React app — the desktop React UI, copied verbatim and rewired to talk to `api` over HTTP/SSE. |
| `shared` | `libs/shared/` | TypeScript types shared by `api` and `web` (mirrors the old `window.api` shape). |

## Running locally

```bash
# 1. One-time
npm install                       # hoists everything via npm workspaces
cp apps/api/.env.example apps/api/.env
# Generate a 32-byte AES-GCM key and paste it into apps/api/.env:
openssl rand -hex 32

# 2. Backing services (Postgres + SuperTokens core, both via docker compose)
npm run db:up                     # starts `postgres` and `supertokens` (shared Postgres)
npm run db:migrate                # one-shot Liquibase container — no host install needed

# 3. Dev servers
npm run serve:all                 # api on :3000, web on :4200
# or one at a time: npm run serve:api / npm run serve:web
```

OpenAPI docs: <http://localhost:3000/api/docs>.

## Notable design choices

- **Drop-in HTTP shim.** Every page copied from `desktop/src/` keeps calling `api().listProfiles()` etc.; `apps/web/src/api.ts` re-implements the old `window.api` surface against the REST API + SSE.
- **DB → temp CSV bridge for Python.** Python scripts continue to read `profile.yaml` + `holdings.csv` files. The API materializes them into a `mkdtemp()` workspace per job, runs the script there, and ingests `reports/*.md` back into Postgres. Python never touches the live DB. See `apps/api/src/python/python-runner.service.ts`.
- **SSE for log streaming.** `POST /api/v1/profiles/:name/scripts/:kind` returns a `jobId`; `GET /api/v1/jobs/:id/log` streams `log` events and emits a final `done` event with the exit code.
- **Encrypted API keys.** AES-256-GCM per-user, keyed off `API_KEY_ENCRYPTION_KEY` env var.
- **PDF.** Server-side Puppeteer with the same `report-template.css` the Electron app used.

## Coexistence with the desktop app

`desktop/` keeps its own `package.json` and is registered as an Nx project via `desktop/project.json`. Run `npx nx run desktop:dev` (or `cd desktop && npm run dev`) to launch it as before — no source changes were required.

Once the web/api stack is proven, the desktop folder can be deleted in a follow-up commit.
