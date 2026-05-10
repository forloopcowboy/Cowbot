import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import yaml from 'js-yaml'
import { api } from '../api'
import HoldingsTable, { type HoldingRow } from '../components/HoldingsTable'
import Spinner from '../components/Spinner'

type ProfileShape = {
  accounts?: { name?: string }[]
}

export default function Holdings() {
  const { name = '' } = useParams()
  const { t } = useTranslation()
  const [rows, setRows] = useState<HoldingRow[]>([])
  const [accounts, setAccounts] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      api().readHoldings(name),
      api()
        .readProfileYaml(name)
        .then((text) => {
          const doc = (yaml.load(text) as ProfileShape) ?? {}
          return (doc.accounts ?? [])
            .map((a) => a?.name?.trim())
            .filter((n): n is string => !!n)
        })
        .catch(() => [] as string[]),
    ])
      .then(([data, accts]) => {
        setRows(data as HoldingRow[])
        setAccounts(accts)
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [name])

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await api().writeHoldings(name, rows)
      setSavedAt(Date.now())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="px-8 py-8 max-w-7xl">
      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-gold-500">{t('holdings.eyebrow')}</div>
          <h1 className="font-serif text-2xl text-navy-900 font-semibold">
            {t('holdings.positions', { count: rows.length })}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {savedAt && !saving && <span className="text-xs text-slate-500">{t('holdings.saved')}</span>}
          <button onClick={save} disabled={saving} className="btn-primary">
            {saving ? <Spinner /> : null}
            {t('common.save')}
          </button>
        </div>
      </div>
      {error && (
        <div className="mb-4 px-3 py-2 rounded border border-red-200 bg-red-50 text-sm text-red-700">
          {error}
        </div>
      )}
      {loading ? (
        <Spinner />
      ) : (
        <HoldingsTable rows={rows} onChange={setRows} accountSuggestions={accounts} />
      )}
    </div>
  )
}
