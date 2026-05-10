import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { api } from '../api'
import {
  ACCOUNT_PRESETS,
  ACCOUNT_USE_VOCAB,
  AccountCcy,
  AccountState,
  COMMON_ETFS,
  DEFAULT_DONTS,
  DEFAULT_FX_PAIRS,
  MODEL_OPTIONS,
  POOL_BANDS,
  RESIDENCIES,
  RISK_OPTIONS,
  Risk,
  TICKER_RE,
  WizardState,
  blankWizardState,
  buildHoldingsCsv,
  buildProfileYaml,
  defaultsForRisk,
  validateStep,
} from '../lib/profileTemplate'
import { formatModel } from './Settings'
import logoUrl from '../assets/logo.svg'

const STEP_KEYS = [
  'wizard.steps.1',
  'wizard.steps.2',
  'wizard.steps.3',
  'wizard.steps.4',
  'wizard.steps.5',
  'wizard.steps.6',
  'wizard.steps.7',
] as const

export default function ProfileWizard() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [state, setState] = useState<WizardState>(() => blankWizardState())
  const [step, setStep] = useState<number>(1)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const stepErrors = useMemo(() => validateStep(step, state), [step, state])
  const canAdvance = Object.keys(stepErrors).length === 0

  const set = <K extends keyof WizardState>(key: K, value: WizardState[K]) =>
    setState((prev) => ({ ...prev, [key]: value }))

  const onChooseRisk = (risk: Risk) => {
    const d = defaultsForRisk(risk)
    setState((prev) => ({
      ...prev,
      risk,
      growth_pct: d.growth,
      defensive_pct: d.defensive,
    }))
  }

  const onSubmit = async () => {
    setError(null)
    setSubmitting(true)
    try {
      const profileYaml = buildProfileYaml(state)
      const holdingsCsv = buildHoldingsCsv(state)
      await api().createProfileFromWizard(state.name.trim(), profileYaml, holdingsCsv)
      navigate(`/p/${state.name.trim()}/holdings`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-full bg-canvas flex flex-col">
      <div className="titlebar h-9 shrink-0" />
      <div className="max-w-4xl mx-auto px-8 pt-2 pb-16 w-full">
        <div className="flex items-center gap-3 mb-3">
          <img src={logoUrl} alt="" className="h-9 w-9" />
          <div className="text-[11px] uppercase tracking-[0.22em] text-gold-500">
            {t('wizard.eyebrow')}
          </div>
        </div>
        <h1 className="font-serif text-3xl font-semibold text-navy-900">
          {t('wizard.title')}
        </h1>
        <p className="mt-2 text-slate-600 text-sm">{t('wizard.subtitle')}</p>

        <Stepper step={step} t={t} />

        <div className="card mt-6 p-6">
          {step === 1 && <Step1 state={state} set={set} errors={stepErrors} t={t} />}
          {step === 2 && (
            <Step2
              state={state}
              set={set}
              onChooseRisk={onChooseRisk}
              errors={stepErrors}
              t={t}
            />
          )}
          {step === 3 && <Step3 state={state} set={set} errors={stepErrors} t={t} />}
          {step === 4 && <Step4 state={state} set={set} errors={stepErrors} t={t} />}
          {step === 5 && <Step5 state={state} set={set} errors={stepErrors} t={t} />}
          {step === 6 && <Step6 state={state} set={set} errors={stepErrors} t={t} />}
          {step === 7 && <Step7 state={state} set={set} t={t} />}
        </div>

        {error && (
          <div className="mt-3 px-3 py-2 rounded border border-red-200 bg-red-50 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-5 flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="btn-ghost"
            disabled={submitting}
          >
            {t('wizard.cancel')}
          </button>
          <div className="flex gap-2">
            {step > 1 && (
              <button
                onClick={() => setStep(step - 1)}
                className="btn-secondary"
                disabled={submitting}
              >
                {t('wizard.back')}
              </button>
            )}
            {step < 7 && (
              <button
                onClick={() => setStep(step + 1)}
                className="btn-primary"
                disabled={!canAdvance}
              >
                {t('wizard.next')}
              </button>
            )}
            {step === 7 && (
              <button onClick={onSubmit} className="btn-primary" disabled={submitting}>
                {submitting ? t('wizard.creating') : t('wizard.create')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Stepper
// ============================================================

function Stepper({ step, t }: { step: number; t: TFunction }) {
  return (
    <ol className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs">
      {STEP_KEYS.map((key, i) => {
        const n = i + 1
        const active = n === step
        const done = n < step
        return (
          <li
            key={key}
            className={`flex items-center gap-2 ${
              active
                ? 'text-navy-900 font-semibold'
                : done
                  ? 'text-gold-600'
                  : 'text-slate-400'
            }`}
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                active
                  ? 'bg-navy-800 text-white'
                  : done
                    ? 'bg-gold-500 text-white'
                    : 'bg-slate-200 text-slate-500'
              }`}
            >
              {n}
            </span>
            {t(key)}
          </li>
        )
      })}
    </ol>
  )
}

// ============================================================
// Steps
// ============================================================

type SetFn = <K extends keyof WizardState>(key: K, value: WizardState[K]) => void
type StepProps = {
  state: WizardState
  set: SetFn
  errors: Record<string, string>
  t: TFunction
}

function Step1({ state, set, errors, t }: StepProps) {
  const isBelgium = state.tax_residency.toLowerCase() === 'belgium'
  return (
    <div className="space-y-5">
      <SectionHeader title={t('wizard.step1.title')} hint={t('wizard.step1.hint')} />
      <Field
        label={t('wizard.step1.profileName')}
        error={errors.name}
        hint={t('wizard.step1.profileNameHint')}
      >
        <input
          autoFocus
          value={state.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder={t('wizard.step1.profileNamePlaceholder')}
          className="w-full"
        />
      </Field>
      <Field label={t('wizard.step1.taxResidency')}>
        <select
          value={state.tax_residency}
          onChange={(e) => set('tax_residency', e.target.value)}
          className="w-full"
        >
          {RESIDENCIES.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        {!isBelgium && (
          <p className="mt-1 text-xs text-amber-700">
            {t('wizard.step1.taxNonBelgiumNote')}
          </p>
        )}
      </Field>
      <Field
        label={t('wizard.step1.citizenship')}
        hint={t('wizard.step1.citizenshipHint')}
      >
        <ChipMultiSelect
          options={[...RESIDENCIES]}
          values={state.citizenship}
          onChange={(v) => set('citizenship', v)}
          allowFreeAdd
          t={t}
        />
      </Field>
      <Field
        label={t('wizard.step1.poolSizeBand')}
        hint={t('wizard.step1.poolSizeBandHint')}
      >
        <select
          value={state.pool_size_band}
          onChange={(e) => set('pool_size_band', e.target.value as WizardState['pool_size_band'])}
          className="w-full"
        >
          {POOL_BANDS.map((b) => (
            <option key={b} value={b}>
              {b.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </Field>
    </div>
  )
}

function Step2({
  state,
  set,
  onChooseRisk,
  errors,
  t,
}: StepProps & { onChooseRisk: (r: Risk) => void }) {
  return (
    <div className="space-y-5">
      <SectionHeader title={t('wizard.step2.title')} hint={t('wizard.step2.hint')} />
      <Field label={t('wizard.step2.riskProfile')} error={errors.risk}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {RISK_OPTIONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onChooseRisk(r)}
              className={`text-left rounded border px-3 py-2 ${
                state.risk === r
                  ? 'border-navy-800 bg-navy-50'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="font-semibold text-sm capitalize">{r}</div>
              <div className="text-xs text-slate-500">{t(`wizard.step2.riskDesc.${r}`)}</div>
            </button>
          ))}
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label={t('wizard.step2.horizonMin')} error={errors.horizon_min}>
          <input
            type="number"
            min={0}
            value={state.horizon_min}
            onChange={(e) => set('horizon_min', Number(e.target.value))}
          />
        </Field>
        <Field label={t('wizard.step2.horizonMax')} error={errors.horizon_max}>
          <input
            type="number"
            min={0}
            value={state.horizon_max}
            onChange={(e) => set('horizon_max', Number(e.target.value))}
          />
        </Field>
      </div>
    </div>
  )
}

function Step3({ state, set, errors, t }: StepProps) {
  return (
    <div className="space-y-5">
      <SectionHeader title={t('wizard.step3.title')} hint={t('wizard.step3.hint')} />
      <div className="grid grid-cols-2 gap-4">
        <Field label={t('wizard.step3.contributionMin')} error={errors.contribution_min}>
          <input
            type="number"
            min={0}
            value={state.contribution_min}
            onChange={(e) => set('contribution_min', Number(e.target.value))}
          />
        </Field>
        <Field label={t('wizard.step3.contributionMax')} error={errors.contribution_max}>
          <input
            type="number"
            min={0}
            value={state.contribution_max}
            onChange={(e) => set('contribution_max', Number(e.target.value))}
          />
        </Field>
        <Field label={t('wizard.step3.monthlyExpenses')} error={errors.monthly_expenses_eur}>
          <input
            type="number"
            min={0}
            value={state.monthly_expenses_eur}
            onChange={(e) => set('monthly_expenses_eur', Number(e.target.value))}
          />
        </Field>
        <Field
          label={t('wizard.step3.cashBufferMonths')}
          hint={t('wizard.step3.cashBufferHint')}
          error={errors.cash_buffer_months}
        >
          <select
            value={state.cash_buffer_months}
            onChange={(e) => set('cash_buffer_months', Number(e.target.value))}
            className="w-full"
          >
            {Array.from({ length: 24 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </div>
  )
}

function Step4({ state, set, errors, t }: StepProps) {
  const gbSum =
    state.growth_global_all_cap_pct +
    state.growth_sp500_tilt_pct +
    state.growth_individual_stocks_pct
  const dbSum = state.defensive_eur_bonds_or_cash_pct + state.defensive_tesouro_direto_pct
  const ccySum = state.ccy_eur_pct + state.ccy_brl_pct + state.ccy_usd_pct
  return (
    <div className="space-y-6">
      <SectionHeader title={t('wizard.step4.title')} hint={t('wizard.step4.hint')} />

      <SubGroup
        title={t('wizard.step4.growthVsDefensive')}
        sum={state.growth_pct + state.defensive_pct}
        error={errors.growth_pct}
        t={t}
      >
        <div className="flex gap-3">
          <Field label={t('wizard.step4.growthPct')}>
            <input
              type="number"
              min={0}
              max={100}
              value={state.growth_pct}
              onChange={(e) => set('growth_pct', Number(e.target.value))}
            />
          </Field>
          <Field label={t('wizard.step4.defensivePct')}>
            <input
              type="number"
              min={0}
              max={100}
              value={state.defensive_pct}
              onChange={(e) => set('defensive_pct', Number(e.target.value))}
            />
          </Field>
        </div>
      </SubGroup>

      <SubGroup
        title={t('wizard.step4.growthBreakdown')}
        sum={gbSum}
        error={errors.growth_breakdown}
        t={t}
      >
        <div className="flex flex-col gap-1">
          <Field label={t('wizard.step4.globalAllCap')}>
            <input
              type="number"
              min={0}
              max={100}
              value={state.growth_global_all_cap_pct}
              onChange={(e) =>
                set('growth_global_all_cap_pct', Number(e.target.value))
              }
            />
          </Field>
          <Field label={t('wizard.step4.sp500Tilt')}>
            <input
              type="number"
              min={0}
              max={100}
              value={state.growth_sp500_tilt_pct}
              onChange={(e) => set('growth_sp500_tilt_pct', Number(e.target.value))}
            />
          </Field>
          <Field label={t('wizard.step4.individualStocks')}>
            <input
              type="number"
              min={0}
              max={100}
              value={state.growth_individual_stocks_pct}
              onChange={(e) =>
                set('growth_individual_stocks_pct', Number(e.target.value))
              }
            />
          </Field>
        </div>
      </SubGroup>

      <SubGroup
        title={t('wizard.step4.defensiveBreakdown')}
        sum={dbSum}
        error={errors.defensive_breakdown}
        t={t}
      >
        <div className="flex flex-col gap-1">
          <Field label={t('wizard.step4.eurBondsCash')}>
            <input
              type="number"
              min={0}
              max={100}
              value={state.defensive_eur_bonds_or_cash_pct}
              onChange={(e) =>
                set('defensive_eur_bonds_or_cash_pct', Number(e.target.value))
              }
            />
          </Field>
          <Field label={t('wizard.step4.tesouroDireto')}>
            <input
              type="number"
              min={0}
              max={100}
              value={state.defensive_tesouro_direto_pct}
              onChange={(e) =>
                set('defensive_tesouro_direto_pct', Number(e.target.value))
              }
            />
          </Field>
        </div>
      </SubGroup>

      <SubGroup title={t('wizard.step4.currencyMix')} sum={ccySum} error={errors.currency_mix} t={t}>
        <div className="flex gap-3">
          <Field label={t('wizard.step4.eurPct')}>
            <input
              type="number"
              min={0}
              max={100}
              value={state.ccy_eur_pct}
              onChange={(e) => set('ccy_eur_pct', Number(e.target.value))}
            />
          </Field>
          <Field label={t('wizard.step4.brlPct')}>
            <input
              type="number"
              min={0}
              max={100}
              value={state.ccy_brl_pct}
              onChange={(e) => set('ccy_brl_pct', Number(e.target.value))}
            />
          </Field>
          <Field label={t('wizard.step4.usdPct')}>
            <input
              type="number"
              min={0}
              max={100}
              value={state.ccy_usd_pct}
              onChange={(e) => set('ccy_usd_pct', Number(e.target.value))}
            />
          </Field>
        </div>
      </SubGroup>

      <Field
        label={t('wizard.step4.driftTolerance')}
        hint={t('wizard.step4.driftToleranceHint')}
        error={errors.drift_tolerance_pct}
      >
        <input
          type="number"
          min={0}
          max={50}
          value={state.drift_tolerance_pct}
          onChange={(e) => set('drift_tolerance_pct', Number(e.target.value))}
        />
      </Field>
    </div>
  )
}

function Step5({ state, set, errors, t }: StepProps) {
  const update = (i: number, patch: Partial<AccountState>) => {
    const next = state.accounts.slice()
    next[i] = { ...next[i], ...patch }
    set('accounts', next)
  }
  const remove = (i: number) =>
    set(
      'accounts',
      state.accounts.filter((_, idx) => idx !== i),
    )
  const addCustom = () =>
    set('accounts', [
      ...state.accounts,
      {
        name: '',
        use: [],
        soft_cap: undefined,
        soft_cap_currency: 'EUR',
        protection: '',
        fx_note: '',
      },
    ])
  const addPreset = (id: string) => {
    const preset = ACCOUNT_PRESETS.find((p) => p.id === id)
    if (!preset) return
    set('accounts', [
      ...state.accounts,
      {
        name: preset.name,
        use: [...preset.use],
        soft_cap: preset.soft_cap,
        soft_cap_currency: preset.soft_cap_currency,
        protection: preset.protection,
        fx_note: preset.fx_note,
      },
    ])
  }

  const usedPresetNames = new Set(state.accounts.map((a) => a.name.toLowerCase()))

  return (
    <div className="space-y-4">
      <SectionHeader title={t('wizard.step5.title')} hint={t('wizard.step5.hint')} />
      {errors.accounts && (
        <div className="text-xs text-red-600">{errors.accounts}</div>
      )}

      <div className="space-y-3">
        {state.accounts.map((a, i) => (
          <div
            key={i}
            className="rounded border border-slate-200 bg-slate-50/40 p-3"
          >
            <div className="flex items-start gap-3">
              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label={t('wizard.step5.name')} error={errors[`account_${i}_name`]}>
                  <input
                    type="text"
                    value={a.name}
                    onChange={(e) => update(i, { name: e.target.value })}
                  />
                </Field>
                <Field label={t('wizard.step5.use')}>
                  <ChipMultiSelect
                    options={[...ACCOUNT_USE_VOCAB]}
                    values={a.use}
                    onChange={(v) =>
                      update(i, { use: v as AccountState['use'] })
                    }
                    t={t}
                  />
                </Field>
                <Field label={t('wizard.step5.softCap')}>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min={0}
                      value={a.soft_cap ?? ''}
                      onChange={(e) =>
                        update(i, {
                          soft_cap:
                            e.target.value === ''
                              ? undefined
                              : Number(e.target.value),
                        })
                      }
                      className="flex-1"
                    />
                    <select
                      value={a.soft_cap_currency}
                      onChange={(e) =>
                        update(i, {
                          soft_cap_currency: e.target.value as AccountCcy,
                        })
                      }
                    >
                      <option value="EUR">EUR</option>
                      <option value="BRL">BRL</option>
                    </select>
                  </div>
                </Field>
                <Field label={t('wizard.step5.protection')}>
                  <input
                    type="text"
                    value={a.protection ?? ''}
                    onChange={(e) => update(i, { protection: e.target.value })}
                  />
                </Field>
                <div className="md:col-span-2">
                  <Field label={t('wizard.step5.fxNote')}>
                    <input
                      type="text"
                      value={a.fx_note ?? ''}
                      onChange={(e) => update(i, { fx_note: e.target.value })}
                    />
                  </Field>
                </div>
              </div>
              <button
                type="button"
                onClick={() => remove(i)}
                className="text-slate-400 hover:text-red-600 px-2 py-1 text-lg leading-none"
                aria-label={t('common.removeAccount')}
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        {ACCOUNT_PRESETS.filter((p) => !usedPresetNames.has(p.name.toLowerCase())).map(
          (p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => addPreset(p.id)}
              className="btn-ghost"
            >
              + {p.name}
            </button>
          ),
        )}
        <button type="button" onClick={addCustom} className="btn-ghost">
          {t('wizard.step5.custom')}
        </button>
      </div>
    </div>
  )
}

function Step6({ state, set, errors, t }: StepProps) {
  return (
    <div className="space-y-5">
      <SectionHeader title={t('wizard.step6.title')} hint={t('wizard.step6.hint')} />
      {errors.watchlist && (
        <div className="text-xs text-red-600">{errors.watchlist}</div>
      )}

      <Field label={t('wizard.step6.etfWatchlist')}>
        <ChipMultiSelect
          options={COMMON_ETFS.map((e) => e.ticker)}
          values={state.watchlist_etfs}
          onChange={(v) => set('watchlist_etfs', v)}
          validator={(t) => TICKER_RE.test(t)}
          allowFreeAdd
          t={t}
        />
        <p className="mt-1 text-xs text-slate-500">
          {t('wizard.step6.suggested', { list: COMMON_ETFS.map((e) => e.ticker).join(', ') })}
        </p>
      </Field>

      <Field label={t('wizard.step6.fxPairs')}>
        <ChipMultiSelect
          options={[...DEFAULT_FX_PAIRS]}
          values={state.watchlist_fx}
          onChange={(v) => set('watchlist_fx', v)}
          validator={(t) => TICKER_RE.test(t)}
          allowFreeAdd
          t={t}
        />
      </Field>

      <Field
        label={t('wizard.step6.brazilMacro')}
        hint={t('wizard.step6.brazilMacroHint')}
      >
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={state.brazil_macro_selic}
              onChange={(e) => set('brazil_macro_selic', e.target.checked)}
              className="!w-auto"
            />
            {t('wizard.step6.selic')}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={state.brazil_macro_ipca}
              onChange={(e) => set('brazil_macro_ipca', e.target.checked)}
              className="!w-auto"
            />
            {t('wizard.step6.ipca')}
          </label>
        </div>
      </Field>
    </div>
  )
}

function Step7({ state, set, t }: { state: WizardState; set: SetFn; t: TFunction }) {
  const isBelgium = state.tax_residency.toLowerCase() === 'belgium'
  const yamlPreview = useMemo(() => buildProfileYaml(state), [state])
  const csvPreview = useMemo(() => buildHoldingsCsv(state), [state])
  return (
    <div className="space-y-5">
      <SectionHeader title={t('wizard.step7.title')} hint={t('wizard.step7.hint')} />

      <Field label={t('wizard.step7.donts')}>
        <ChipMultiSelect
          options={[...DEFAULT_DONTS]}
          values={state.donts}
          onChange={(v) => set('donts', v)}
          allowFreeAdd
          t={t}
        />
      </Field>

      {isBelgium && (
        <div className="rounded border border-slate-200 bg-slate-50/60 p-3 text-xs text-slate-700">
          <div className="font-semibold text-navy-900 mb-1">{t('wizard.step7.belgianBlockTitle')}</div>
          {t('wizard.step7.belgianBlockBody')}
        </div>
      )}

      <Field label={t('wizard.step7.anthropicModel')}>
        <select
          value={state.reporting_model}
          onChange={(e) => {
            set('reporting_model', e.target.value.toLowerCase().replace(/\s/g, '_') as WizardState['reporting_model'])
          }
          }
          className="w-full"
        >
          {MODEL_OPTIONS.map((m) => (
            <option key={m} value={m}>
              <span>{formatModel(m)}</span>
            </option>
          ))}
        </select>
      </Field>

      <details className="rounded border border-slate-200 p-3">
        <summary className="cursor-pointer text-xs font-semibold text-navy-900">
          {t('wizard.step7.previewYaml')}
        </summary>
        <pre className="mt-2 text-xs whitespace-pre-wrap font-mono">
          {yamlPreview}
        </pre>
      </details>

      <details className="rounded border border-slate-200 p-3">
        <summary className="cursor-pointer text-xs font-semibold text-navy-900">
          {t('wizard.step7.previewCsv')}
        </summary>
        <pre className="mt-2 text-xs whitespace-pre-wrap font-mono">
          {csvPreview}
        </pre>
      </details>
    </div>
  )
}

// ============================================================
// Reusable bits
// ============================================================

function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div>
      <h2 className="font-serif text-lg text-navy-900 font-semibold">{title}</h2>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

function SubGroup({
  title,
  sum,
  error,
  children,
  t,
}: {
  title: string
  sum: number
  error?: string
  children: React.ReactNode
  t: TFunction
}) {
  const ok = sum === 100
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          {title}
        </h3>
        <span
          className={`text-[11px] font-medium ${ok ? 'text-emerald-700' : 'text-amber-700'}`}
        >
          {t('wizard.sumOf', { sum })}
        </span>
      </div>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}

function ChipMultiSelect({
  options,
  values,
  onChange,
  validator,
  allowFreeAdd,
  t,
}: {
  options: string[]
  values: string[]
  onChange: (v: string[]) => void
  validator?: (s: string) => boolean
  allowFreeAdd?: boolean
  t: TFunction
}) {
  const [draft, setDraft] = useState('')
  const [draftErr, setDraftErr] = useState<string | null>(null)
  const toggle = (v: string) =>
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v])
  const remove = (v: string) => onChange(values.filter((x) => x !== v))
  const submitDraft = () => {
    const v = draft.trim()
    if (!v) return
    if (validator && !validator(v)) {
      setDraftErr(t('common.invalidFormat'))
      return
    }
    if (!values.includes(v)) onChange([...values, v])
    setDraft('')
    setDraftErr(null)
  }
  const suggested = options.filter((o) => !values.includes(o))
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 rounded bg-navy-50 border border-navy-100 px-2 py-0.5 text-xs text-navy-800"
          >
            {v}
            <button
              type="button"
              onClick={() => remove(v)}
              className="text-navy-500 hover:text-red-600"
              aria-label={t('common.removeChip', { value: v })}
            >
              ×
            </button>
          </span>
        ))}
        {values.length === 0 && (
          <span className="text-xs text-slate-400">{t('common.none')}</span>
        )}
      </div>
      {suggested.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {suggested.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => toggle(o)}
              className="rounded border border-dashed border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:border-navy-700 hover:text-navy-800"
            >
              + {o}
            </button>
          ))}
        </div>
      )}
      {allowFreeAdd && (
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              setDraftErr(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submitDraft()
              }
            }}
            placeholder={t('common.addCustom')}
            className="flex-1"
          />
          <button type="button" onClick={submitDraft} className="btn-secondary">
            {t('common.add')}
          </button>
        </div>
      )}
      {draftErr && <p className="mt-1 text-xs text-red-600">{draftErr}</p>}
    </div>
  )
}
