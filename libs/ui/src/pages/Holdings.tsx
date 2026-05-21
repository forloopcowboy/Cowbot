import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import yaml from 'js-yaml'
import { useApi } from '../api-context'
import HoldingsTable, { type HoldingRow } from '../components/HoldingsTable'
import Spinner from '../components/Spinner'

type ProfileShape = {
  accounts?: { name?: string }[]
}

export default function Holdings() {
  const { name = '' } = useParams()
  const { t } = useTranslation()
  const api = useApi()
  const [rows, setRows] = useState<HoldingRow[]>([])
  const [accounts, setAccounts] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [appendedCount, setAppendedCount] = useState<number | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      api.readHoldings(name),
      api
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
      await api.writeHoldings(name, rows)
      setSavedAt(Date.now())
      setAppendedCount(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const onFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    setSavedAt(null)
    try {
      const text = await file.text()
      const parsed = (await api.parseHoldingsCsv(name, text)) as HoldingRow[]
      setRows((prev) => [...prev, ...parsed])
      setAppendedCount(parsed.length)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-7xl">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-gold-500 dark:text-gold-300">{t('holdings.eyebrow')}</div>
          <h1 className="font-serif text-2xl text-navy-900 dark:text-cream font-semibold">
            {t('holdings.positions', { count: rows.length })}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {appendedCount !== null && !uploading && (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {t('holdings.appended', { count: appendedCount })}
            </span>
          )}
          {savedAt && !saving && (
            <span className="text-xs text-slate-500 dark:text-slate-400">{t('holdings.saved')}</span>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={onFilePicked}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || saving || loading}
            className="btn-secondary flex-1 sm:flex-none"
          >
            {uploading ? <Spinner /> : null}
            {t('holdings.upload')}
          </button>
          <button
            onClick={save}
            disabled={saving || uploading}
            className="btn-primary flex-1 sm:flex-none"
          >
            {saving ? <Spinner /> : null}
            {t('common.save')}
          </button>
        </div>
      </div>
      {error && (
        <div className="mb-4 px-3 py-2 rounded border border-red-200 bg-red-50 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
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
