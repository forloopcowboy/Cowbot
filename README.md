# Investment plan — personal advisor loop

A monthly markdown report that tells me what to move where, given my accounts, constraints, and goals. Built around a templated Claude prompt fed by Python helpers that pull market data and read my current holdings.

This is **not a trading system**. Recommendations are executed manually in Revolut / Wise / Nubank.

## Profile (defaults)

| | |
|---|---|
| Tax residency | Belgium (PT citizen, BR national) |
| Pool size | < €25k |
| Risk | Growth (80% growth / 20% defensive) |
| Horizon | 3–10 years |
| Monthly contribution | €500–€2,000 |
| Cash buffer | 3 months expenses (kept liquid, not invested) |
| Currency mix (invested) | ~80% EUR / ~20% BRL |
| Equity tilt | Global all-cap core + S&P 500 tilt |
| Asset classes | broad-market ETFs, individual stocks, bonds / fixed income / Tesouro Direto |

Full policy lives in [`profiles/default/profile.yaml`](./profiles/default/profile.yaml).

## Accounts

| Account | Use | User-stated cap | Real protection (verify) |
|---|---|---|---|
| Wise | EUR/multi-currency savings | "insured to 20k" | Wise is e-money — funds are *safeguarded* (segregated), **not** FSCS/DGS-insured. Treat 20k as a soft cap. |
| Revolut | EUR investment + savings | "insured to 100k" | Depends on entity: Revolut Bank UAB (LT) → Lithuanian DGS €100k. Revolut Ltd e-money → safeguarded only. |
| Nubank (BR) | BRL savings + investment | n/a | Brazilian FGC up to R$250k per institution. EUR→BRL via Wise has tiered fees. |

## Layout

```
investment-plan/
├── README.md
├── profiles/
│   └── default/                  # one folder per profile
│       ├── profile.yaml          # investment policy
│       ├── holdings.csv          # current positions
│       ├── .context.{json,md}    # cached context (built by scripts)
│       └── reports/
│           ├── default-YYYY-MM.md
│           └── default-YYYY-MM.pdf
├── prompts/
│   └── monthly_report.md         # Claude prompt template
├── scripts/                      # uv-managed Python (CLI flow)
│   ├── pyproject.toml
│   ├── fetch_quotes.py
│   ├── fetch_brazil.py
│   ├── fetch_fx.py
│   ├── build_context.py
│   ├── generate_report.py
│   └── to_pdf.py                 # CLI-only PDF (WeasyPrint via Homebrew)
└── desktop/                      # Electron + React + Tailwind app
    ├── electron/                 # main + preload + report CSS
    ├── src/                      # React UI
    └── scripts/prepare-python.sh # bundles Python into the .dmg
```

## How to run

Two paths: a **CLI** (terminal-driven, uses your local Python via `uv`) and a **Desktop app** (self-contained Electron app, no external Python needed once installed).

### CLI

```bash
# 1. One-time: drop your API key into .env (repo root or scripts/)
cp .env.example .env
$EDITOR .env  # set ANTHROPIC_API_KEY=sk-ant-...

# 2. Install deps
cd scripts
uv sync

# 3. Build the context block (writes profiles/<name>/.context.{json,md})
uv run python build_context.py --profile default

# 4. Generate this month's report
uv run python generate_report.py --profile default
# → profiles/default/reports/default-YYYY-MM.md

# 5. Optional: render the latest report to a styled PDF (WeasyPrint)
brew install pango cairo gdk-pixbuf libffi
uv run python to_pdf.py --profile default
# → profiles/default/reports/default-YYYY-MM.pdf
```

`generate_report.py` auto-loads `.env` from repo root and from `scripts/` (the latter wins). You can still `export ANTHROPIC_API_KEY=...` in your shell instead.

### Desktop app

```bash
cd desktop
npm install
npm run dev          # launches Electron with hot-reload, uses your local uv
```

Build a self-contained `.dmg`/`.exe`/`AppImage`:

```bash
cd desktop
npm run dist         # runs prepare-python.sh + electron-builder
```

`prepare-python.sh` downloads [`python-build-standalone`](https://github.com/astral-sh/python-build-standalone), pip-installs the runtime deps (anthropic, yfinance, pandas, requests, pyyaml, rich, markdown, python-dotenv), and copies the scripts + prompts + a starter profile snapshot into `desktop/resources/`. `electron-builder` then bundles all of it into the app. **WeasyPrint and its native libs are not bundled** — the desktop app generates PDFs natively via Chromium's `printToPDF`. End users do not need uv, Python, or Homebrew.

Output: `desktop/release/Investment Plan-0.1.0-arm64.dmg` (and per-platform variants).

Read the generated report, decide what to act on, execute trades manually.

## Iteration roadmap

**Iteration 1:** CLI loop — manual holdings, public market data, on-demand local report. ✓

**Iteration 2:** Multi-profile + desktop app — Electron shell, structured settings/holdings editor, in-app PDF rendering, packaged `.dmg`. ✓

**Iteration 3 (next):**
- Account-API integrations: Revolut (read-only positions), Wise (balances). Nubank likely manual/CSV (no public API).
- `launchd` plist for monthly auto-run on macOS.
- Tauri port (smaller bundle, native menus) — keeps the same React renderer.

**Iteration 4:**
- Email delivery via Gmail MCP.
- Full Belgian tax optimization pass: TOB transaction-tax classes per fund, Reynders thresholds, exit-tax accumulating-fund rules.
- Backtest advisor recommendations against a passive-baseline portfolio.

## Belgian tax — basic rules baked in (iter 1)

These are encoded in `profile.yaml` so Claude respects them when recommending:

- Prefer **accumulating** ETFs (no DBI/dividend tax leakage); IE or LU domicile.
- Avoid bond ETFs with **>10% interest-bearing assets** unless deliberately accepting Reynders tax.
- Prefer passive broad-index funds (cleaner "non-speculative" stance for stock CGT exemption).
- TOB transaction tax applies on each ETF buy/sell — favor fewer, larger trades.

Full optimization is a high-priority TODO for iteration 3.
