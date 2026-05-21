import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useApi } from '../api-context'
import type { ReportEntry } from '@investment-plan/shared'
import Spinner from '../components/Spinner'
import { type LogLine } from '../components/ConsoleStream'
import LoadingProgress, { type Stage } from '../components/LoadingProgress'

export default function Reports() {
  const { name = '' } = useParams()
  const { t } = useTranslation()
  const api = useApi()
  const navigate = useNavigate()
  const [entries, setEntries] = useState<ReportEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [stage, setStage] = useState<Stage>('idle')
  const [logs, setLogs] = useState<LogLine[]>([])
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [customOpen, setCustomOpen] = useState(false)
  const [customText, setCustomText] = useState('')
  const [customRebuild, setCustomRebuild] = useState(false)
  const [hasCached, setHasCached] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    const list = await api.listReports(name)
    setEntries(list)
    setLoading(false)
  }, [api, name])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Probe cached-context status whenever the modal opens, so the toggle reflects
  // the current state on disk rather than the value at mount time.
  useEffect(() => {
    if (!customOpen) return
    api.hasContextCache(name).then((ok) => {
      setHasCached(ok)
      if (!ok) setCustomRebuild(true)
    })
  }, [customOpen, name, api])

  useEffect(() => {
    const unsub = api.onScriptLog((line) => setLogs((prev) => [...prev, line]))
    return unsub
  }, [api])

  const generate = async () => {
    setLogs([])
    setError(null)
    setWarning(null)
    setStage('context')
    let r = await api.runScript(name, 'context')
    if (r.code !== 0) {
      setStage('error')
      setError(t('reports.error.context'))
      return
    }
    setStage('report')
    r = await api.runScript(name, 'report')
    if (r.code !== 0) {
      setStage('error')
      setError(t('reports.error.report'))
      return
    }
    setStage('pdf')
    let pdfFailure: string | null = null
    try {
      const today = new Date()
      const ym = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
      await api.renderPdf(name, `${name}-${ym}.md`)
    } catch (e) {
      // The markdown report is already saved — surface the PDF failure as a
      // non-fatal warning so the user still sees the new row in the list.
      pdfFailure = (e as Error).message
    }
    setStage('done')
    if (pdfFailure) setWarning(`${t('reports.error.pdfRender')}: ${pdfFailure}`)
    await refresh()
  }

  const sanitizeCustom = (s: string) =>
    s.replace(/\{\{[^}]*\}\}/g, '').slice(0, 4000)

  const generateCustom = async () => {
    const cleaned = sanitizeCustom(customText).trim()
    if (!cleaned) return
    setLogs([])
    setError(null)
    setWarning(null)
    setStage(customRebuild ? 'context' : 'report')
    try {
      const r = await api.runCustomReport(name, cleaned, customRebuild)
      if (r.code !== 0) {
        setStage('error')
        setError(t('reports.error.custom'))
        return
      }
      setStage('done')
      setCustomOpen(false)
      setCustomText('')
      await refresh()
    } catch (e) {
      setStage('error')
      setError((e as Error).message)
    }
  }

  const open = (p: string) => api.openPath(p)
  const busy = stage !== 'idle' && stage !== 'done' && stage !== 'error'

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-gold-500 dark:text-gold-300">{t('reports.eyebrow')}</div>
          <h1 className="font-serif text-2xl text-navy-900 dark:text-cream font-semibold">
            {t('reports.titleCount', { count: entries.length, name })}
          </h1>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={generate}
            disabled={busy}
            className="btn-primary w-full sm:w-auto"
          >
            {busy ? <Spinner /> : null}
            {busy ? labelFor(stage, t) : t('reports.generate')}
          </button>
          <button
            onClick={() => setCustomOpen(true)}
            disabled={busy || customOpen}
            className="btn-secondary w-full sm:w-auto"
          >
            {t('reports.custom')}
          </button>
        </div>
      </div>

      {customOpen && (
        <div className="card p-4 sm:p-6 mb-6">
          <div className="text-[10px] uppercase tracking-[0.2em] text-gold-500 dark:text-gold-300">
            {t('reports.customTitle')}
          </div>
          <h2 className="font-serif text-lg text-navy-900 dark:text-cream font-semibold mb-1">
            {t('reports.customTitle')}
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">{t('reports.customSubtitle')}</p>
          <textarea
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder={t('reports.customPlaceholder')}
            rows={8}
            maxLength={4000}
            disabled={busy}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gold-500/40 dark:border-navy-700 dark:bg-navy-900 dark:text-slate-100"
          />
          <div className="mt-1 mb-3 text-xs text-slate-500 dark:text-slate-400 tabular-nums text-right">
            {t('reports.customCharCount', { count: customText.length })}
          </div>
          <label className="flex flex-wrap items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={customRebuild}
              disabled={!hasCached || busy}
              onChange={(e) => setCustomRebuild(e.target.checked)}
            />
            <span>{t('reports.customRebuild')}</span>
            {!hasCached && (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {t('reports.customRebuildForced')}
              </span>
            )}
          </label>
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2">
            <button
              onClick={() => {
                setCustomOpen(false)
                setCustomText('')
              }}
              disabled={busy}
              className="btn-ghost"
            >
              {t('reports.customCancel')}
            </button>
            <button
              onClick={generateCustom}
              disabled={busy || !sanitizeCustom(customText).trim()}
              className="btn-primary w-full sm:w-auto"
            >
              {busy ? <Spinner /> : null}
              {busy ? labelFor(stage, t) : t('reports.customGenerate')}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 px-3 py-2 rounded border border-red-200 bg-red-50 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      )}

      {warning && (
        <div className="mb-4 px-3 py-2 rounded border border-amber-200 bg-amber-50 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
          {warning}
        </div>
      )}

      {(busy || logs.length > 0) && (
        <div className="mb-6">
          <LoadingProgress lines={logs} stage={stage} active={busy} />
        </div>
      )}

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
            <Spinner />
          </div>
        ) : entries.length === 0 ? (
          <div
            className="p-8 sm:p-10 text-center text-sm text-slate-500 dark:text-slate-400"
            dangerouslySetInnerHTML={{ __html: t('reports.emptyBody') }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-navy-50 border-b border-slate-200 dark:bg-navy-800 dark:border-navy-700">
                <tr>
                  <th className="text-left px-4 py-2 text-xs uppercase tracking-wide text-navy-700 dark:text-gold-300">
                    {t('reports.col.period')}
                  </th>
                  <th className="text-left px-4 py-2 text-xs uppercase tracking-wide text-navy-700 dark:text-gold-300">
                    {t('reports.col.generated')}
                  </th>
                  <th className="text-right px-4 py-2 text-xs uppercase tracking-wide text-navy-700 dark:text-gold-300">
                    {t('reports.col.size')}
                  </th>
                  <th className="text-right px-4 py-2 text-xs uppercase tracking-wide text-navy-700 dark:text-gold-300">
                    {t('reports.col.files')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr
                    key={e.stem}
                    onClick={() => e.hasMd && navigate(`./${encodeURIComponent(e.stem)}`)}
                    className={[
                      'border-b border-slate-100 transition-colors dark:border-navy-800',
                      e.hasMd
                        ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-navy-800/60'
                        : 'opacity-60',
                    ].join(' ')}
                  >
                    <td className="px-4 py-3 font-serif text-navy-900 dark:text-cream">
                      <div className="flex items-center gap-2">
                        <span>{e.stem}</span>
                        {e.hasMd && (
                          <span className="text-[10px] uppercase tracking-wide text-gold-600 dark:text-gold-300 transition-transform">
                            {t('reports.open')}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300 tabular-nums">
                      {new Date(e.mtime).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">
                      {e.sizeKb.toFixed(1)} KB
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-flex items-center gap-1 text-xs">
                        {e.hasMd && (
                          <span className="px-1.5 py-0.5 rounded bg-navy-50 text-navy-700 dark:bg-navy-800 dark:text-gold-300">MD</span>
                        )}
                        {e.hasPdf && (
                          <button
                            className="group px-1.5 py-0.5 rounded bg-gold-500/10 hover:bg-gold-500/25 text-gold-600 dark:bg-gold-500/20 dark:text-gold-300 dark:hover:bg-gold-500/30"
                            onClick={(evt) => {
                              open(e.pdfPath!)
                              evt.stopPropagation()
                            }}
                          >
                            <span>PDF</span>
                            <span className="hidden group-hover:inline-flex">→</span>
                          </button>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function labelFor(s: Stage, t: (k: string) => string): string {
  switch (s) {
    case 'context':
      return t('reports.stage.context')
    case 'report':
      return t('reports.stage.report')
    case 'pdf':
      return t('reports.stage.pdf')
    default:
      return t('reports.stage.working')
  }
}
