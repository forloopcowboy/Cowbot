# Profile-creation wizard + drop bundled default profile

## Context

Today the packaged desktop build ships `profiles/default` as a "seed" profile, copied into `app.userData/profiles/default` on first run by `ensureSeedProfile()` in `desktop/electron/main.ts`. That data is the developer's personal portfolio — it shouldn't go out in distributable builds. New users also need a guided way to author a valid `profile.yaml` (the schema is non-trivial: risk band, allocation targets summing to 100%, currency mix summing to 100%, accounts with caps, watchlist tickers, Belgian-tax block, drift tolerance, model choice).

**Outcome:**
1. Stop bundling `resources/seed/default` in distributable builds. Local `profiles/default` (dev data) remains untouched.
2. ProfilePicker offers two paths after clicking "Create": **New** (multi-step wizard, full route) and **Clone from existing** (current local-dev path).
3. The wizard produces a complete, validated `profile.yaml` informed by `prompts/monthly_report.md` (what the prompt expects) and `scripts/build_context.py` (what gets fetched/joined). Inputs are restrictive: dropdowns over text, validated chip lists for tickers, sum-to-100 enforcement, etc.
4. Wizard prefills `holdings.csv` with zero-quantity cash rows for each account the user adds, so Holdings opens with structure.

## Files to modify

| Path | Change |
| --- | --- |
| `desktop/package.json` | Remove `resources/seed` entry from `build.extraResources`. |
| `desktop/scripts/prepare-python.sh` | Remove the "Seeding default profile snapshot" block (lines 81–87) and the `Seed:` echo (line 98). |
| `desktop/electron/main.ts` | Delete `ensureSeedProfile()` and its call from `app.whenReady()`. The function-and-call are dead once the seed isn't shipped; nothing else references them. |
| `desktop/electron/preload.ts` | Add `createProfileFromWizard(name: string, profileYaml: string, holdingsCsv: string): Promise<void>` to the API surface. |
| `desktop/electron/main.ts` (IPC) | Add `ipcMain.handle('profiles:createFromWizard', …)` — same name validation + duplicate check as `profiles:create`, then writes the supplied YAML + CSV verbatim and creates `reports/`. Reuses existing `profileDir(name)` helper. |
| `desktop/src/api.ts` / type re-export | No code change (api.ts just re-exports from preload). New method picked up automatically via `Api` type. |
| `desktop/src/App.tsx` | Add a `/new` route rendering the new `ProfileWizard` page. |
| `desktop/src/pages/ProfilePicker.tsx` | Replace the current inline create form with: an empty-state CTA when there are zero profiles, and on "+ Create profile" surface a small chooser ("Start fresh" → navigate to `/new`; "Clone existing" → keep current inline form). Existing `handleCreate` remains for the clone path. |
| `desktop/src/pages/ProfileWizard.tsx` (new) | The multi-step wizard. Single source of truth for the generated YAML/CSV. |
| `desktop/src/lib/profileTemplate.ts` (new) | Pure functions: `buildProfileYaml(state) → string`, `buildHoldingsCsv(state) → string`, plus shared option lists (RISK_OPTIONS, COMMON_ETFS, COMMON_TAX_RESIDENCIES, ACCOUNT_PRESETS, …). Keeps the wizard component thin and unit-testable later. |

## Wizard structure

A 7-step linear stepper at `/new`. Each step has a "back / next" footer; "next" is disabled until the step validates. Final step has "Create profile" which calls `api().createProfileFromWizard(...)` then navigates to `/p/<name>/holdings` (so the user lands where they'll do the next chunk of data entry).

Use `RISK_OPTIONS` and `MODEL_OPTIONS` constants exactly as they exist in `desktop/src/pages/Settings.tsx:35-36` — same list, same ordering, so wizard output is consistent with what Settings later edits.

### Step 1 — Identity
- **Profile name**: text input, validated against the same regex used server-side (`^[a-z0-9][a-z0-9_-]{0,30}$`, see `main.ts:161`). Show inline regex hint.
- **Tax residency**: searchable dropdown of common residencies (Belgium, Portugal, Spain, France, Germany, Netherlands, Luxembourg, UK, Brazil, US, Other). Defaults to Belgium. Help text: "Belgium unlocks the prebuilt Belgian-tax constraints (Reynders threshold, accumulating IE/LU ETF preference, TOB minimization). Other residencies fall back to a generic prompt — Claude will look up your tax rules per `prompts/monthly_report.md` line 16."
- **Citizenship**: multi-select chips from same list (free-add allowed via "Other"). Drives nothing automated; surfaced to the prompt for context.
- **Pool size band**: dropdown — `under_25k_eur`, `25k_to_100k_eur`, `100k_to_500k_eur`, `over_500k_eur`. Help text: "Used by Claude to right-size trade recommendations and TOB sensitivity."

### Step 2 — Risk & horizon
- **Risk profile**: dropdown — RISK_OPTIONS. Each option has a one-line description (conservative = capital preservation; balanced = 60/40-ish; growth = 80/20-ish; aggressive = 95/5-ish).
- **Horizon (years)**: two number inputs (min, max), min ≥ 0, max ≥ min. Validation enforces the relation.
- Help text references the report's "Risks and things to watch" section so users understand why this matters.

### Step 3 — Cashflow
- **Monthly contribution range (€)**: two number inputs (min, max). Help text: "Section 4 of the monthly report deploys the *midpoint* of this range — pick a band you can sustain."
- **Monthly expenses (€)**: number input (≥ 0).
- **Cash-buffer months**: integer dropdown 1–24 (default 3). Help text: "buffer = expenses × months. The report flags any cash shortfall."

### Step 4 — Allocation targets
- **Growth %** + **Defensive %**: two number inputs with live "must sum to 100" badge; "Next" disabled while ≠ 100. Pre-fill 80/20 based on chosen risk:
  - conservative → 20/80, balanced → 60/40, growth → 80/20, aggressive → 95/5.
- **Growth breakdown** (3 fields, sum=100): global_all_cap_pct, sp500_tilt_pct, individual_stocks_pct. Default 50/30/20.
- **Defensive breakdown** (2 fields, sum=100): eur_bonds_or_cash_pct, tesouro_direto_pct. Default 60/40 (or 100/0 if no Brazil exposure — see Step 5).
- **Currency mix**: EUR/BRL/USD percentages, sum-to-100 badge. Defaults 60/25/15.
- **Drift tolerance %**: number input 0–50, default 5. Help text quotes prompt section 2: "only instruments outside drift tolerance are candidates for rebalance trades this month."

### Step 5 — Accounts
A list builder. Start with 4 preset templates the user can toggle on/off and edit; they can also add custom ones.

Presets (from `profileTemplate.ts`, mirroring `profiles/default/profile.yaml:36-52`):

| Preset | Default `use` | Soft cap | Protection note |
| --- | --- | --- | --- |
| Wise | savings_eur, savings_usd, fx | €20,000 | "e-money safeguarded (NOT deposit insurance) — verify" |
| Revolut | investment, savings_eur | €100,000 | "depends on entity — Revolut Bank UAB (LT DGS €100k) vs Revolut Ltd (e-money safeguarded). VERIFY which one holds your account." |
| Nubank | savings_brl, investment_brl | R$250,000 | "FGC up to R$250k per institution" + fx_note "EUR -> BRL via Wise; tiered fee depending on amount" |
| BNP | checking_eur, savings_eur | €100,000 | "Belgian deposit guarantee scheme up to €100k per bank" |

For each row: name (text), use (multi-select from a fixed vocabulary: `savings_eur`, `savings_usd`, `savings_brl`, `investment`, `investment_brl`, `checking_eur`, `fx`), soft cap (number) + currency (EUR/BRL toggle controls which YAML key is used: `soft_cap_eur` vs `soft_cap_brl`), protection (text), fx_note (optional text). At least one account required to advance.

### Step 6 — Watchlist & macro
- **ETF watchlist**: chip input. Pre-suggested chips (toggle on/off) for the four ETFs from `profiles/default/profile.yaml:73-76` — VWCE.DE, IWDA.AS, EIMI.AS, SXR8.DE. User can add custom chips; each chip validated against `^[A-Z0-9.\-=]+$` (Yahoo Finance ticker shape — same patterns the script feeds into `yfinance` per `scripts/fetch_quotes.py`). Invalid input shows a red border + tooltip.
- **FX pairs**: chip input pre-loaded with EURBRL=X, EURUSD=X. Same validator.
- **Brazil macro**: two checkboxes — SELIC, IPCA. Both default on if `brl_pct > 0` in Step 4 *or* tax residency is Brazil; otherwise default off.

### Step 7 — Constraints, reporting & review
- **Don'ts (constraints_donts)**: multi-select with the six items from `profiles/default/profile.yaml:62-68` pre-checked, plus a free-add field for custom constraints. Help text: "Hard constraints in the prompt — the report will refuse to recommend any of these."
- **Belgian tax block**: rendered only if Step 1 tax_residency == Belgium. Read-only summary of the four toggles plus the standard `tob_note`. (Per the user's choice, omit the block entirely for non-BE residency — the prompt already handles that case.)
- **Reporting model**: dropdown from `MODEL_OPTIONS` in `Settings.tsx:36` (`claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`). Default `claude-opus-4-7`.
- **Review**: collapsible panel showing the generated YAML (pretty-printed via `js-yaml`) + the prefilled `holdings.csv` rows, so the user can sanity-check before clicking "Create profile".

## YAML & CSV generation

`desktop/src/lib/profileTemplate.ts` exposes:

```ts
buildProfileYaml(state: WizardState): string  // js-yaml dump, sort_keys=false-equivalent
buildHoldingsCsv(state: WizardState): string  // header + one zero-qty cash row per account
```

YAML shape matches `profiles/default/profile.yaml` exactly (keys/order) so the existing `Settings.tsx` form binds cleanly post-creation. The `belgian_tax_rules_basic` key is omitted entirely when tax_residency ≠ Belgium.

CSV prefill: for each account in `state.accounts`, emit one row:
```
<account.name>,Cash <CCY>,,,0,1.00,<CCY>,cash,Auto-created by wizard
```
where CCY is the account's primary currency (Wise → EUR, Nubank → BRL, etc., derivable from the `use` array; default EUR if ambiguous).

## Removing the bundled seed

1. `desktop/package.json`: drop the `{ "from": "resources/seed", "to": "seed" }` entry from `build.extraResources` (lines 67–70).
2. `desktop/scripts/prepare-python.sh`: drop the `==> Seeding default profile snapshot for first-run` block (lines 81–87) and the `Seed:` line in the final echo (line 98).
3. `desktop/electron/main.ts`: delete `ensureSeedProfile()` (lines 39–45) and its invocation from `app.whenReady()` (line 136).
4. Local `profiles/default` is **not** touched — it lives outside the desktop directory and isn't referenced by any of the above changes once the seed-copy step is removed from `prepare-python.sh`.

A packaged build that starts with no profiles will land in ProfilePicker with zero entries; the empty-state CTA routes straight into `/new`.

## Verification

1. `cd desktop && npm run dev` — confirm dev mode still picks up `../profiles/default` (no behavior change in dev).
2. With the dev app open:
   - From ProfilePicker, click "+ Create profile" → "Start fresh" → walk through all 7 steps. Confirm validators block "Next" on bad input (sums ≠ 100, ticker regex, missing account).
   - On "Create profile", confirm `profiles/<new-name>/profile.yaml` exists and round-trips through `Settings.tsx` without errors (open the new profile → Settings should render every field; toggle Advanced YAML to spot-check).
   - Confirm `holdings.csv` has one zero-qty cash row per account.
   - Run "Build context" and "Generate report" against the new profile to confirm `scripts/build_context.py` parses the YAML cleanly.
3. Clone path: from ProfilePicker, click "+ Create profile" → "Clone existing" → confirm the original inline form still works.
4. Packaging dry run: `cd desktop && npm run prep:python` and inspect `desktop/resources/` — confirm there is no `seed/` directory. `npm run dist:mac` (if Apple toolchain available) and confirm the produced `.app` does not contain `Contents/Resources/seed/`. On first launch with a clean `~/Library/Application Support/Cowboy Investor/`, ProfilePicker should show the empty-state CTA.
