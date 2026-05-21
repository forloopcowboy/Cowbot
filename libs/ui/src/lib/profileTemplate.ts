// Pure helpers + option lists for the profile-creation wizard.
// Builds profile.yaml + holdings.csv from a normalized WizardState.

import yaml from 'js-yaml'

export const RISK_OPTIONS = ['conservative', 'balanced', 'growth', 'aggressive'] as const
export type Risk = (typeof RISK_OPTIONS)[number]

export const MODEL_OPTIONS = [
  'claude-opus-4-7',
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
] as const
export type Model = (typeof MODEL_OPTIONS)[number]

export const POOL_BANDS = [
  'under_25k_eur',
  '25k_to_100k_eur',
  '100k_to_500k_eur',
  'over_500k_eur',
] as const
export type PoolBand = (typeof POOL_BANDS)[number]

export const RESIDENCIES = [
  'Belgium',
  'Portugal',
  'Spain',
  'France',
  'Germany',
  'Netherlands',
  'Luxembourg',
  'United Kingdom',
  'Brazil',
  'United States',
] as const

export const ACCOUNT_USE_VOCAB = [
  'savings_eur',
  'savings_usd',
  'savings_brl',
  'investment',
  'investment_brl',
  'checking_eur',
  'fx',
] as const
export type AccountUse = (typeof ACCOUNT_USE_VOCAB)[number]

export const COMMON_ETFS = [
  { ticker: 'VWCE.DE', note: 'Vanguard FTSE All-World UCITS Acc — global all-cap core' },
  { ticker: 'IWDA.AS', note: 'iShares Core MSCI World UCITS Acc — developed-only alternative' },
  { ticker: 'EIMI.AS', note: 'iShares Core MSCI EM IMI UCITS Acc — emerging markets' },
  { ticker: 'SXR8.DE', note: 'iShares Core S&P 500 UCITS Acc — S&P 500 tilt' },
] as const

export const DEFAULT_FX_PAIRS = ['EURBRL=X', 'EURUSD=X'] as const

export const DEFAULT_DONTS = [
  'no leveraged ETFs or products',
  'no derivatives or options',
  'no individual crypto purchases (iter 1)',
  'no penny stocks',
  'no short selling',
  'no concentration over 25% in any single non-ETF instrument',
] as const

// Yahoo Finance ticker shape — uppercase letters/digits, dot, dash, equals.
export const TICKER_RE = /^[A-Z0-9.\-=]+$/

export type AccountCcy = 'EUR' | 'BRL'

export interface AccountState {
  name: string
  use: AccountUse[]
  soft_cap?: number
  soft_cap_currency: AccountCcy
  protection?: string
  fx_note?: string
}

export interface WizardState {
  // Step 1
  name: string
  tax_residency: string
  citizenship: string[]
  pool_size_band: PoolBand
  // Step 2
  risk: Risk
  horizon_min: number
  horizon_max: number
  // Step 3
  contribution_min: number
  contribution_max: number
  monthly_expenses_eur: number
  cash_buffer_months: number
  // Step 4
  growth_pct: number
  defensive_pct: number
  growth_global_all_cap_pct: number
  growth_sp500_tilt_pct: number
  growth_individual_stocks_pct: number
  defensive_eur_bonds_or_cash_pct: number
  defensive_tesouro_direto_pct: number
  ccy_eur_pct: number
  ccy_brl_pct: number
  ccy_usd_pct: number
  drift_tolerance_pct: number
  // Step 5
  accounts: AccountState[]
  // Step 6
  watchlist_etfs: string[]
  watchlist_fx: string[]
  brazil_macro_selic: boolean
  brazil_macro_ipca: boolean
  // Step 7
  donts: string[]
  reporting_model: Model
}

export const ACCOUNT_PRESETS: Array<AccountState & { id: string; primary_ccy: AccountCcy }> = [
  {
    id: 'wise',
    name: 'Wise',
    use: ['savings_eur', 'savings_usd', 'fx'],
    soft_cap: 20000,
    soft_cap_currency: 'EUR',
    protection: 'e-money safeguarded (NOT deposit insurance) — verify',
    primary_ccy: 'EUR',
  },
  {
    id: 'revolut',
    name: 'Revolut',
    use: ['investment', 'savings_eur'],
    soft_cap: 100000,
    soft_cap_currency: 'EUR',
    protection:
      'depends on entity — Revolut Bank UAB (LT DGS €100k) vs Revolut Ltd (e-money safeguarded). VERIFY which one holds your account.',
    primary_ccy: 'EUR',
  },
  {
    id: 'nubank',
    name: 'Nubank',
    use: ['savings_brl', 'investment_brl'],
    soft_cap: 250000,
    soft_cap_currency: 'BRL',
    protection: 'FGC up to R$250k per institution',
    fx_note: 'EUR -> BRL via Wise; tiered fee depending on amount',
    primary_ccy: 'BRL',
  },
  {
    id: 'bnp',
    name: 'BNP',
    use: ['checking_eur', 'savings_eur'],
    soft_cap: 100000,
    soft_cap_currency: 'EUR',
    protection: 'Belgian deposit guarantee scheme up to €100k per bank',
    primary_ccy: 'EUR',
  },
]

const RISK_DEFAULTS: Record<Risk, { growth: number; defensive: number }> = {
  conservative: { growth: 20, defensive: 80 },
  balanced: { growth: 60, defensive: 40 },
  growth: { growth: 80, defensive: 20 },
  aggressive: { growth: 95, defensive: 5 },
}

export function defaultsForRisk(risk: Risk) {
  return RISK_DEFAULTS[risk]
}

export function blankWizardState(): WizardState {
  return {
    name: '',
    tax_residency: 'Belgium',
    citizenship: [],
    pool_size_band: 'under_25k_eur',
    risk: 'growth',
    horizon_min: 3,
    horizon_max: 10,
    contribution_min: 500,
    contribution_max: 2000,
    monthly_expenses_eur: 1000,
    cash_buffer_months: 3,
    growth_pct: 80,
    defensive_pct: 20,
    growth_global_all_cap_pct: 50,
    growth_sp500_tilt_pct: 30,
    growth_individual_stocks_pct: 20,
    defensive_eur_bonds_or_cash_pct: 60,
    defensive_tesouro_direto_pct: 40,
    ccy_eur_pct: 60,
    ccy_brl_pct: 25,
    ccy_usd_pct: 15,
    drift_tolerance_pct: 5,
    accounts: ACCOUNT_PRESETS.map((p) => ({
      name: p.name,
      use: [...p.use],
      soft_cap: p.soft_cap,
      soft_cap_currency: p.soft_cap_currency,
      protection: p.protection,
      fx_note: p.fx_note,
    })),
    watchlist_etfs: COMMON_ETFS.map((e) => e.ticker),
    watchlist_fx: [...DEFAULT_FX_PAIRS],
    brazil_macro_selic: true,
    brazil_macro_ipca: true,
    donts: [...DEFAULT_DONTS],
    reporting_model: 'claude-opus-4-7',
  }
}

// ---------------- validators ----------------

export const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,30}$/i

export interface StepErrors {
  [field: string]: string
}

export function validateStep(step: number, s: WizardState): StepErrors {
  const e: StepErrors = {}
  if (step === 1) {
    if (!NAME_RE.test(s.name))
      e.name = 'Letters/digits/-/_, 1–31 chars, must start with letter or digit.'
    if (!s.tax_residency) e.tax_residency = 'Pick a tax residency.'
  }
  if (step === 2) {
    if (!RISK_OPTIONS.includes(s.risk)) e.risk = 'Pick a risk profile.'
    if (s.horizon_min < 0) e.horizon_min = 'Must be ≥ 0.'
    if (s.horizon_max < s.horizon_min) e.horizon_max = 'Max must be ≥ min.'
  }
  if (step === 3) {
    if (s.contribution_min < 0) e.contribution_min = 'Must be ≥ 0.'
    if (s.contribution_max < s.contribution_min) e.contribution_max = 'Max must be ≥ min.'
    if (s.monthly_expenses_eur < 0) e.monthly_expenses_eur = 'Must be ≥ 0.'
    if (s.cash_buffer_months < 0) e.cash_buffer_months = 'Must be ≥ 0.'
  }
  if (step === 4) {
    if (s.growth_pct + s.defensive_pct !== 100)
      e.growth_pct = 'Growth + defensive must sum to 100.'
    const gb =
      s.growth_global_all_cap_pct + s.growth_sp500_tilt_pct + s.growth_individual_stocks_pct
    if (gb !== 100) e.growth_breakdown = 'Growth breakdown must sum to 100.'
    const db = s.defensive_eur_bonds_or_cash_pct + s.defensive_tesouro_direto_pct
    if (db !== 100) e.defensive_breakdown = 'Defensive breakdown must sum to 100.'
    const cm = s.ccy_eur_pct + s.ccy_brl_pct + s.ccy_usd_pct
    if (cm !== 100) e.currency_mix = 'Currency mix must sum to 100.'
    if (s.drift_tolerance_pct < 0 || s.drift_tolerance_pct > 50)
      e.drift_tolerance_pct = '0–50.'
  }
  if (step === 5) {
    if (s.accounts.length < 1) e.accounts = 'Add at least one account.'
    s.accounts.forEach((a, i) => {
      if (!a.name.trim()) e[`account_${i}_name`] = 'Name required.'
    })
  }
  if (step === 6) {
    for (const t of [...s.watchlist_etfs, ...s.watchlist_fx]) {
      if (!TICKER_RE.test(t)) {
        e.watchlist = `Invalid ticker: ${t}. Allowed: A-Z 0-9 . - =`
        break
      }
    }
  }
  return e
}

// ---------------- builders ----------------

function pickAccountCcy(a: AccountState): AccountCcy {
  // Pick a sensible default cash currency for the prefilled holdings row.
  if (a.soft_cap_currency === 'BRL') return 'BRL'
  if (a.use.some((u) => u.endsWith('_brl'))) return 'BRL'
  return 'EUR'
}

export function buildHoldingsCsv(s: WizardState): string {
  const header = 'account,instrument,ticker,isin,quantity,avg_cost,currency,asset_class,notes'
  const rows = s.accounts.map((a) => {
    const ccy = pickAccountCcy(a)
    return [
      a.name,
      `Cash ${ccy}`,
      '',
      '',
      '0',
      '1.00',
      ccy,
      'cash',
      'Auto-created by wizard',
    ].join(',')
  })
  return [header, ...rows].join('\n') + '\n'
}

export function buildProfileYaml(s: WizardState): string {
  const isBelgium = s.tax_residency.trim().toLowerCase() === 'belgium'

  const accountsOut = s.accounts.map((a) => {
    const out: Record<string, unknown> = { name: a.name }
    if (a.use.length) out.use = a.use
    if (a.soft_cap !== undefined) {
      const key = a.soft_cap_currency === 'BRL' ? 'soft_cap_brl' : 'soft_cap_eur'
      out[key] = a.soft_cap
    }
    if (a.protection) out.protection = a.protection
    if (a.fx_note) out.fx_note = a.fx_note
    return out
  })

  const brazilMacro: string[] = []
  if (s.brazil_macro_selic) brazilMacro.push('SELIC')
  if (s.brazil_macro_ipca) brazilMacro.push('IPCA')

  const doc: Record<string, unknown> = {
    profile: {
      tax_residency: s.tax_residency,
      citizenship: s.citizenship,
      pool_size_band: s.pool_size_band,
      risk: s.risk,
      horizon_years: [s.horizon_min, s.horizon_max],
      monthly_contribution_eur: [s.contribution_min, s.contribution_max],
      monthly_expenses_eur: s.monthly_expenses_eur,
      cash_buffer_months: s.cash_buffer_months,
    },
    allocation_targets: {
      growth_pct: s.growth_pct,
      defensive_pct: s.defensive_pct,
      growth_breakdown: {
        global_all_cap_pct: s.growth_global_all_cap_pct,
        sp500_tilt_pct: s.growth_sp500_tilt_pct,
        individual_stocks_pct: s.growth_individual_stocks_pct,
      },
      defensive_breakdown: {
        eur_bonds_or_cash_pct: s.defensive_eur_bonds_or_cash_pct,
        tesouro_direto_pct: s.defensive_tesouro_direto_pct,
      },
      currency_mix: {
        eur_pct: s.ccy_eur_pct,
        brl_pct: s.ccy_brl_pct,
        usd_pct: s.ccy_usd_pct,
      },
      drift_tolerance_pct: s.drift_tolerance_pct,
    },
    accounts: accountsOut,
  }

  if (isBelgium) {
    doc.belgian_tax_rules_basic = {
      prefer_accumulating_etfs: true,
      preferred_domiciles: ['IE', 'LU'],
      avoid_bond_etfs_with_interest_bearing_over_pct: 10,
      prefer_passive_broad_index: true,
      tob_note:
        'Transaction tax applies on each ETF buy/sell — prefer fewer, larger trades.',
      full_optimization_status: 'HIGH_PRIORITY_TODO_iter3',
    }
  }

  doc.constraints_donts = s.donts
  doc.watchlist = {
    etfs: s.watchlist_etfs,
    fx: s.watchlist_fx,
    brazil_macro: brazilMacro,
  }
  doc.reporting = {
    output_dir: '../reports',
    filename_pattern: '{year}-{month:02d}.md',
    model: s.reporting_model,
    fallback_model: 'claude-sonnet-4-6',
  }

  return yaml.dump(doc, { lineWidth: 100, noRefs: true, sortKeys: false })
}
