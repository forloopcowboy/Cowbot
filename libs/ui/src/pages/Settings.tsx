import { capitalize } from 'lodash'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import yaml from 'js-yaml'
import { useApi } from '../api-context'
import Spinner from '../components/Spinner'
import TickerSearcher from '../components/TickerSearcher'

type Account = {
  name?: string
  use?: string[]
  soft_cap_eur?: number
  soft_cap_brl?: number
  protection?: string
  fx_note?: string
}

type ProfileDoc = {
  profile?: {
    risk?: string
    horizon_years?: [number, number]
    monthly_contribution_eur?: [number, number]
    monthly_expenses_eur?: number
    cash_buffer_months?: number
  }
  allocation_targets?: {
    growth_pct?: number
    defensive_pct?: number
    drift_tolerance_pct?: number
    currency_mix?: { eur_pct?: number; brl_pct?: number; usd_pct?: number }
  }
  accounts?: Account[]
  watchlist?: {
    etfs?: string[]
    fx?: string[]
    brazil_macro?: string[]
  }
  reporting?: { model?: string }
}

const RISK_OPTIONS = ['conservative', 'balanced', 'growth', 'aggressive']
const MODEL_OPTIONS = ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001']

export function formatModel(m: string) {
  const [model, variant, versionMajor, VersionMinor] = m.split(/[-_]/);
    return `${capitalize(model)} ${capitalize(variant)} ${versionMajor}.${VersionMinor}`
}

export default function Settings() {
  const { name = '' } = useParams()
  const { t } = useTranslation()
  const api = useApi()
  const [raw, setRaw] = useState('')
  const [doc, setDoc] = useState<ProfileDoc>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [advanced, setAdvanced] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hasApiKey, setHasApiKey] = useState(false)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [apiKeyBusy, setApiKeyBusy] = useState(false)

  useEffect(() => {
    setLoading(true)
    api
      .readProfileYaml(name)
      .then((text) => {
        setRaw(text)
        setDoc((yaml.load(text) as ProfileDoc) ?? {})
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [name])

  useEffect(() => {
    api.hasApiKey().then(setHasApiKey).catch(() => setHasApiKey(false))
  }, [api])

  const saveApiKey = async () => {
    const key = apiKeyInput.trim()
    if (!key) return
    setApiKeyBusy(true)
    setError(null)
    try {
      await api.setApiKey(key)
      setHasApiKey(true)
      setApiKeyInput('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setApiKeyBusy(false)
    }
  }

  const clearApiKey = async () => {
    setApiKeyBusy(true)
    setError(null)
    try {
      await api.clearApiKey()
      setHasApiKey(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setApiKeyBusy(false)
    }
  }

  // When doc changes via the form, re-serialize.
  const persistFromDoc = (next: ProfileDoc) => {
    setDoc(next)
    const text = yaml.dump(next, { lineWidth: 100, noRefs: true })
    setRaw(text)
  }

  const setProfileField = <K extends keyof NonNullable<ProfileDoc['profile']>>(
    key: K,
    value: NonNullable<ProfileDoc['profile']>[K],
  ) => persistFromDoc({ ...doc, profile: { ...(doc.profile ?? {}), [key]: value } })

  const setAlloc = <K extends keyof NonNullable<ProfileDoc['allocation_targets']>>(
    key: K,
    value: NonNullable<ProfileDoc['allocation_targets']>[K],
  ) =>
    persistFromDoc({
      ...doc,
      allocation_targets: { ...(doc.allocation_targets ?? {}), [key]: value },
    })

  const setCcy = (k: 'eur_pct' | 'brl_pct' | 'usd_pct', v: number) =>
    persistFromDoc({
      ...doc,
      allocation_targets: {
        ...(doc.allocation_targets ?? {}),
        currency_mix: { ...(doc.allocation_targets?.currency_mix ?? {}), [k]: v },
      },
    })

  const setReportingModel = (m: string) =>
    persistFromDoc({ ...doc, reporting: { ...(doc.reporting ?? {}), model: m } })

  const setWatchlist = (key: 'etfs' | 'fx', value: string[]) =>
    persistFromDoc({
      ...doc,
      watchlist: { ...(doc.watchlist ?? {}), [key]: value },
    })

  const setAccounts = (next: Account[]) => persistFromDoc({ ...doc, accounts: next })

  const updateAccount = (i: number, patch: Partial<Account>) => {
    const list = doc.accounts ?? []
    const next = list.slice()
    next[i] = { ...next[i], ...patch }
    setAccounts(next)
  }

  const removeAccount = (i: number) =>
    setAccounts((doc.accounts ?? []).filter((_, idx) => idx !== i))

  const addAccount = () =>
    setAccounts([...(doc.accounts ?? []), { name: '', use: [] }])

  const handleRawChange = (text: string) => {
    setRaw(text)
    try {
      setDoc((yaml.load(text) as ProfileDoc) ?? {})
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      // Validate YAML before save.
      yaml.load(raw)
      await api.writeProfileYaml(name, raw)
      setSavedAt(Date.now())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const ccy = doc.allocation_targets?.currency_mix ?? {}
  const ccyTotal = useMemo(
    () => (ccy.eur_pct ?? 0) + (ccy.brl_pct ?? 0) + (ccy.usd_pct ?? 0),
    [ccy.eur_pct, ccy.brl_pct, ccy.usd_pct],
  )

  const eyebrow = t('settings.eyebrow')
  if (loading) return <PageShell title={eyebrow}><Spinner /></PageShell>

  const accountsCount = (doc.accounts ?? []).length

  return (
    <PageShell
      title={eyebrow}
      subtitle={t('settings.subtitle', { name })}
      actions={
        <>
          {savedAt && !saving && (
            <span className="text-xs text-slate-500 dark:text-slate-400">{timeAgo(savedAt, t)}</span>
          )}
          <button onClick={save} disabled={saving} className="btn-primary w-full sm:w-auto">
            {saving ? <Spinner /> : null}
            {t('common.save')}
          </button>
        </>
      }
    >
      {error && (
        <div className="mb-4 px-3 py-2 rounded border border-red-200 bg-red-50 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title={t('settings.section.riskHorizon')}>
          <Field label={t('settings.field.riskProfile')}>
            <select
              value={doc.profile?.risk ?? ''}
              onChange={(e) => setProfileField('risk', e.target.value)}
              className="w-full"
            >
              <option value="">—</option>
              {RISK_OPTIONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={t('settings.field.horizonMin')}>
              <input
                type="number"
                min={0}
                value={doc.profile?.horizon_years?.[0] ?? ''}
                onChange={(e) =>
                  setProfileField('horizon_years', [
                    Number(e.target.value),
                    doc.profile?.horizon_years?.[1] ?? Number(e.target.value),
                  ])
                }
              />
            </Field>
            <Field label={t('settings.field.horizonMax')}>
              <input
                type="number"
                min={0}
                value={doc.profile?.horizon_years?.[1] ?? ''}
                onChange={(e) =>
                  setProfileField('horizon_years', [
                    doc.profile?.horizon_years?.[0] ?? Number(e.target.value),
                    Number(e.target.value),
                  ])
                }
              />
            </Field>
          </div>
        </Section>

        <Section title={t('settings.section.cashflow')}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={t('settings.field.contribMin')}>
              <input
                type="number"
                min={0}
                value={doc.profile?.monthly_contribution_eur?.[0] ?? ''}
                onChange={(e) =>
                  setProfileField('monthly_contribution_eur', [
                    Number(e.target.value),
                    doc.profile?.monthly_contribution_eur?.[1] ?? Number(e.target.value),
                  ])
                }
              />
            </Field>
            <Field label={t('settings.field.contribMax')}>
              <input
                type="number"
                min={0}
                value={doc.profile?.monthly_contribution_eur?.[1] ?? ''}
                onChange={(e) =>
                  setProfileField('monthly_contribution_eur', [
                    doc.profile?.monthly_contribution_eur?.[0] ?? Number(e.target.value),
                    Number(e.target.value),
                  ])
                }
              />
            </Field>
            <Field label={t('settings.field.monthlyExpenses')}>
              <input
                type="number"
                min={0}
                value={doc.profile?.monthly_expenses_eur ?? ''}
                onChange={(e) =>
                  setProfileField('monthly_expenses_eur', Number(e.target.value))
                }
              />
            </Field>
            <Field label={t('settings.field.cashBufferMonths')}>
              <input
                type="number"
                min={0}
                value={doc.profile?.cash_buffer_months ?? ''}
                onChange={(e) =>
                  setProfileField('cash_buffer_months', Number(e.target.value))
                }
              />
            </Field>
          </div>
        </Section>

        <Section title={t('settings.section.allocation')}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label={t('settings.field.growthPct')}>
              <input
                type="number"
                min={0}
                max={100}
                value={doc.allocation_targets?.growth_pct ?? ''}
                onChange={(e) => setAlloc('growth_pct', Number(e.target.value))}
              />
            </Field>
            <Field label={t('settings.field.defensivePct')}>
              <input
                type="number"
                min={0}
                max={100}
                value={doc.allocation_targets?.defensive_pct ?? ''}
                onChange={(e) => setAlloc('defensive_pct', Number(e.target.value))}
              />
            </Field>
            <Field label={t('settings.field.driftTol')}>
              <input
                type="number"
                min={0}
                max={50}
                value={doc.allocation_targets?.drift_tolerance_pct ?? ''}
                onChange={(e) => setAlloc('drift_tolerance_pct', Number(e.target.value))}
              />
            </Field>
          </div>
        </Section>

        <Section title={t('settings.section.currencyMix')} badge={`${ccyTotal}%`}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label={t('settings.field.eurPct')}>
              <input
                type="number"
                min={0}
                max={100}
                value={ccy.eur_pct ?? ''}
                onChange={(e) => setCcy('eur_pct', Number(e.target.value))}
              />
            </Field>
            <Field label={t('settings.field.brlPct')}>
              <input
                type="number"
                min={0}
                max={100}
                value={ccy.brl_pct ?? ''}
                onChange={(e) => setCcy('brl_pct', Number(e.target.value))}
              />
            </Field>
            <Field label={t('settings.field.usdPct')}>
              <input
                type="number"
                min={0}
                max={100}
                value={ccy.usd_pct ?? ''}
                onChange={(e) => setCcy('usd_pct', Number(e.target.value))}
              />
            </Field>
          </div>
          {ccyTotal !== 100 && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
              {t('settings.ccyMismatch', { total: ccyTotal })}
            </p>
          )}
        </Section>

        <div className="lg:col-span-2">
          <Section title={t('settings.section.watchlist')}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div>
                <h4 className="label mb-2">{t('settings.watchlist.etfs')}</h4>
                <TickerSearcher
                  kind="etf"
                  values={doc.watchlist?.etfs ?? []}
                  onChange={(v) => setWatchlist('etfs', v)}
                />
              </div>
              <div>
                <h4 className="label mb-2">{t('settings.watchlist.fx')}</h4>
                <TickerSearcher
                  kind="fx"
                  values={doc.watchlist?.fx ?? []}
                  onChange={(v) => setWatchlist('fx', v)}
                />
              </div>
            </div>
          </Section>
        </div>

        <div className="lg:col-span-2">
          <Section
            title={t('settings.section.accounts')}
            badge={t('settings.accountsCount', { count: accountsCount })}
          >
            {accountsCount === 0 && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('settings.accountsEmpty')}
              </p>
            )}
            <div className="space-y-3">
              {(doc.accounts ?? []).map((acct, i) => (
                <div
                  key={i}
                  className="rounded border border-slate-200 bg-slate-50/40 p-3 dark:border-navy-700 dark:bg-navy-800/40"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                      <Field label={t('settings.field.name')}>
                        <input
                          type="text"
                          value={acct.name ?? ''}
                          onChange={(e) => updateAccount(i, { name: e.target.value })}
                        />
                      </Field>
                      <Field label={t('settings.field.useCsv')}>
                        <input
                          type="text"
                          value={(acct.use ?? []).join(', ')}
                          onChange={(e) =>
                            updateAccount(i, {
                              use: e.target.value
                                .split(',')
                                .map((s) => s.trim())
                                .filter(Boolean),
                            })
                          }
                        />
                      </Field>
                      <Field label={t('settings.field.softCapEur')}>
                        <input
                          type="number"
                          min={0}
                          value={acct.soft_cap_eur ?? ''}
                          onChange={(e) =>
                            updateAccount(i, {
                              soft_cap_eur:
                                e.target.value === '' ? undefined : Number(e.target.value),
                            })
                          }
                        />
                      </Field>
                      <Field label={t('settings.field.softCapBrl')}>
                        <input
                          type="number"
                          min={0}
                          value={acct.soft_cap_brl ?? ''}
                          onChange={(e) =>
                            updateAccount(i, {
                              soft_cap_brl:
                                e.target.value === '' ? undefined : Number(e.target.value),
                            })
                          }
                        />
                      </Field>
                      <div className="md:col-span-2">
                        <Field label={t('settings.field.protection')}>
                          <input
                            type="text"
                            className="w-full"
                            value={acct.protection ?? ''}
                            onChange={(e) => updateAccount(i, { protection: e.target.value })}
                          />
                        </Field>
                      </div>
                      <div className="md:col-span-2">
                        <Field label={t('settings.field.fxNote')}>
                          <input
                            type="text"
                            className="w-full"
                            value={acct.fx_note ?? ''}
                            onChange={(e) => updateAccount(i, { fx_note: e.target.value })}
                          />
                        </Field>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAccount(i)}
                      className="text-slate-400 hover:text-red-600 dark:text-slate-500 dark:hover:text-red-400 px-2 py-1 text-lg leading-none"
                      aria-label={t('common.removeAccount')}
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3">
              <button type="button" onClick={addAccount} className="btn-ghost">
                {t('settings.addAccount')}
              </button>
            </div>
          </Section>
        </div>

        <Section title={t('settings.section.reporting')}>
          <Field label={t('settings.field.anthropicModel')}>
            <select
              value={doc.reporting?.model ?? ''}
              onChange={(e) => setReportingModel(e.target.value)}
              className="w-full"
            >
              <option value="">—</option>
              {MODEL_OPTIONS.map((m) => (
                <option key={m} value={m}>{formatModel(m)}</option>
              ))}
            </select>
          </Field>
          <Field label={t('settings.field.anthropicApiKey')}>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <input
                type="password"
                autoComplete="off"
                placeholder={
                  hasApiKey
                    ? t('settings.apiKey.placeholderSet')
                    : t('settings.apiKey.placeholderEmpty')
                }
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                className="flex-1 font-mono text-xs"
                disabled={apiKeyBusy}
              />
              <button
                type="button"
                onClick={saveApiKey}
                disabled={apiKeyBusy || !apiKeyInput.trim()}
                className="btn-primary"
              >
                {hasApiKey ? t('settings.apiKey.replace') : t('settings.apiKey.save')}
              </button>
              {hasApiKey && (
                <button
                  type="button"
                  onClick={clearApiKey}
                  disabled={apiKeyBusy}
                  className="btn-ghost"
                >
                  {t('settings.apiKey.clear')}
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {hasApiKey ? t('settings.apiKey.statusSet') : t('settings.apiKey.statusMissing')}
            </p>
          </Field>
        </Section>
      </div>

      <div className="mt-6">
        <button
          onClick={() => setAdvanced((v) => !v)}
          className="btn-ghost"
        >
          {advanced ? t('settings.advancedYamlHide') : t('settings.advancedYamlShow')}
        </button>
        {advanced && (
          <div className="mt-2">
            <textarea
              value={raw}
              onChange={(e) => handleRawChange(e.target.value)}
              spellCheck={false}
              className="w-full font-mono text-xs min-h-[24rem] md:min-h-[36rem] leading-relaxed"
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {t('settings.advancedYamlHint')}
            </p>
          </div>
        )}
      </div>
    </PageShell>
  )
}

// ----- helpers -----
function PageShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-gold-500 dark:text-gold-300">{title}</div>
          {subtitle && <h1 className="font-serif text-2xl text-navy-900 dark:text-cream font-semibold break-words">{subtitle}</h1>}
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">{actions}</div>
      </div>
      {children}
    </div>
  )
}

function Section({
  title,
  badge,
  children,
}: {
  title: string
  badge?: string
  children: React.ReactNode
}) {
  return (
    <section className="card p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-serif text-base text-navy-900 dark:text-cream font-semibold">{title}</h3>
        {badge && (
          <span className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{badge}</span>
        )}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  )
}

function timeAgo(ts: number, t: (k: string, opts?: Record<string, unknown>) => string): string {
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 60) return t('settings.savedAgoSeconds', { n: s })
  const m = Math.round(s / 60)
  if (m < 60) return t('settings.savedAgoMinutes', { n: m })
  return t('settings.savedAt', { when: new Date(ts).toLocaleString() })
}
