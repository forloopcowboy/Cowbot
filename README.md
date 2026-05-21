# Investment plan — personal advisor loop

A monthly markdown report that tells you what to move where, given your accounts, constraints, and goals. Built around a templated Claude prompt fed by Python helpers that pull market data and read your current holdings.

This is **not a trading system**. Recommendations are executed manually in whichever brokerages or banks you actually use.

> The bundled sample profile (`apps/profiles/default/`) is a fictional illustrative profile so the app has something to render on first run. Replace it with your own via the in-app wizard or by editing `profile.yaml` + `holdings.csv` directly.

## Example profile shape

The sample profile shipped in `apps/profiles/default/profile.yaml` looks roughly like:

| | |
|---|---|
| Tax residency | (your country) |
| Pool size | a chosen size band |
| Risk | conservative / balanced / growth / aggressive |
| Horizon | a number of years |
| Monthly contribution | a range |
| Cash buffer | N months of expenses kept liquid |
| Currency mix (invested) | configurable percentages |
| Equity tilt | e.g. global all-cap core + index tilt |
| Asset classes | broad-market ETFs, individual stocks, bonds / fixed income, local sovereign bonds |

Full schema lives in [`apps/profiles/default/profile.yaml`](./apps/profiles/default/profile.yaml).

The profile schema also lets you list any accounts you use, each tagged with what they're for and any soft caps you want to respect (deposit-guarantee limits, e-money safeguarding thresholds, etc.). The sample profile illustrates the shape — substitute your own institutions.

## Layout

This is an Nx monorepo. The three runnable surfaces share `libs/` for code and `prompts/` + `scripts/` for the Python prompt pipeline.

```
investment-plan/
├── apps/
│   ├── api/                  # NestJS REST API + SuperTokens + Postgres (Kysely + Liquibase)
│   ├── web/                  # Vite + React SPA — the web frontend served behind nginx
│   ├── desktop/              # Electron + React app; bundles its own Python runtime
│   └── profiles/             # sample profile shipped with the repo (gitignored after first edit)
│       └── default/
│           ├── profile.yaml  # investment policy
│           ├── holdings.csv  # current positions
│           └── reports/      # generated markdown + PDF reports
├── libs/
│   ├── shared/               # TypeScript types shared by api/web/desktop
│   ├── ui/                   # React components & pages reused by web and desktop
│   └── i18n/                 # locale bundles (en, fr, nl, pt)
├── prompts/
│   └── monthly_report.md     # Claude prompt template
├── scripts/                  # uv-managed Python (CLI flow + report generation)
│   ├── pyproject.toml
│   ├── build_context.py
│   ├── fetch_quotes.py / fetch_brazil.py / fetch_fx.py
│   ├── generate_report.py
│   └── to_pdf.py             # CLI-only PDF (WeasyPrint via Homebrew)
├── deploy/                   # production docker-compose + Caddyfile (see DEPLOYMENT.md)
└── docker-compose.yml        # local Postgres + SuperTokens for the web/api stack
```

## How to run

Three flavors, in increasing order of plumbing:

1. **CLI only** — Python scripts read a YAML + CSV, call Claude, emit a markdown report. No database, no UI, no web stack.
2. **Desktop app** — Electron shell around the same React UI. Bundles its own Python runtime so end users don't need `uv` or Homebrew.
3. **Web stack** — `api` + `web` containers behind Caddy, backed by Postgres + SuperTokens, deployable to a VM (see [DEPLOYMENT.md](./DEPLOYMENT.md)). Run locally via `docker compose`.

### 1. CLI — just the prompt + Python scripts

The minimum viable loop: edit `profile.yaml` + `holdings.csv`, run two scripts, read the markdown.

```bash
# One-time: drop your API key into .env at the repo root
cp .env.example .env
$EDITOR .env   # set ANTHROPIC_API_KEY=sk-ant-...

# Install Python deps (uses uv; see https://astral.sh/uv)
cd scripts
uv sync

# Edit your profile + holdings
$EDITOR ../apps/profiles/default/profile.yaml
$EDITOR ../apps/profiles/default/holdings.csv

# Build the cached context block (quotes, FX, etc.)
uv run python build_context.py --profile default

# Generate this month's report
uv run python generate_report.py --profile default
# → apps/profiles/default/reports/default-YYYY-MM.md

# Optional: render the latest report to a styled PDF (WeasyPrint)
brew install pango cairo gdk-pixbuf libffi
uv run python to_pdf.py --profile default
# → apps/profiles/default/reports/default-YYYY-MM.pdf
```

`generate_report.py` auto-loads `.env` from the repo root and from `scripts/` (the latter wins). You can also `export ANTHROPIC_API_KEY=...` in your shell instead.

Read the generated report, decide what to act on, execute trades manually.

### 2. Desktop app — Electron + React, self-contained

Drives the same Python scripts under the hood but wraps them in a UI for editing profiles, holdings, settings, and viewing rendered reports.

```bash
# Install workspace dependencies (from the repo root)
npm install

# Run the Electron app in dev mode (uses your local uv for Python)
npx nx run desktop:dev
# or: cd apps/desktop && npm run dev
```

Build a self-contained `.dmg` / `.exe` / `AppImage`:

```bash
cd apps/desktop
npm run dist            # macOS/Linux/Windows for the current host
npm run dist:mac        # macOS only
```

`scripts/prepare-python.sh` (invoked by `dist`) downloads [`python-build-standalone`](https://github.com/astral-sh/python-build-standalone), pip-installs the runtime deps, and copies `scripts/` + `prompts/` into `apps/desktop/resources/`. `electron-builder` then bundles all of it into the app. **WeasyPrint and its native libs are not bundled** — the desktop app renders PDFs natively via Chromium's `printToPDF`. End users do not need `uv`, Python, or Homebrew.

Output lands in `apps/desktop/release/`.

### 3. Web stack — local docker-compose

The web/api stack adds a Postgres-backed multi-user surface with SuperTokens auth, server-side PDF rendering (Puppeteer), and SSE log streaming for long-running Python jobs.

```bash
# One-time: API env file (just needs an encryption key for stored API keys)
cp apps/api/.env.example apps/api/.env
$EDITOR apps/api/.env
# Set API_KEY_ENCRYPTION_KEY to the output of:
openssl rand -hex 32

# Backing services: Postgres + SuperTokens core (both via docker compose)
npm run db:up           # docker compose up -d postgres supertokens
npm run db:migrate      # one-shot Liquibase container — no host Java needed

# Dev servers
npm run serve:all       # api on :3000, web on :4200
# or one at a time:
npm run serve:api
npm run serve:web
```

- Web app: <http://localhost:4200>
- API: <http://localhost:3000/api/v1>
- OpenAPI docs: <http://localhost:3000/api/docs>

Tear the backing services down with `npm run db:down`. The Postgres data lives in a named docker volume (`pgdata`) and survives restarts; remove it explicitly with `docker volume rm investment-plan_pgdata` if you want a clean slate.

For deploying to a VM (Caddy + Let's Encrypt + the same compose stack in `deploy/`), see [DEPLOYMENT.md](./DEPLOYMENT.md). For the original Electron-only → web/api split, see [MIGRATION.md](./MIGRATION.md).

## License

[MIT](./LICENSE).
