import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { marked } from 'marked'
import { api } from '../api'
import { escapeStrayTildes } from '../lib/markdown'
import type { ReportEntry } from '../../electron/preload'
import Spinner from '../components/Spinner'
import { type LogLine } from '../components/ConsoleStream'
import LoadingProgress, { type Stage } from '../components/LoadingProgress'

export default function Reports() {
  const { name = '' } = useParams()
  const { t } = useTranslation()
  const [entries, setEntries] = useState<ReportEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [stage, setStage] = useState<Stage>('idle')
  const [logs, setLogs] = useState<LogLine[]>([])
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<ReportEntry | null>(null)
  const [mdHtml, setMdHtml] = useState<string>('')
  const [mdLoading, setMdLoading] = useState(false)
  const [pdfRendering, setPdfRendering] = useState(false)
  const [customOpen, setCustomOpen] = useState(false)
  const [customText, setCustomText] = useState('')
  const [customRebuild, setCustomRebuild] = useState(false)
  const [hasCached, setHasCached] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    const list = await api().listReports(name)
    setEntries(list)
    // If we had something selected, refresh it from the new list (its hasPdf may have flipped).
    setSelected((prev) => (prev ? list.find((e) => e.stem === prev.stem) ?? null : null))
    setLoading(false)
  }, [name])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Probe cached-context status whenever the modal opens, so the toggle reflects
  // the current state on disk rather than the value at mount time.
  useEffect(() => {
    if (!customOpen) return
    api()
      .hasContextCache(name)
      .then((ok) => {
        setHasCached(ok)
        if (!ok) setCustomRebuild(true)
      })
  }, [customOpen, name])

  useEffect(() => {
    const unsub = api().onScriptLog((line) => setLogs((prev) => [...prev, line]))
    return unsub
  }, [])

  // Load markdown when a report is selected.
  useEffect(() => {
    if (!selected || !selected.hasMd) {
      setMdHtml('')
      return
    }
    setMdLoading(true)
    api()
      .readReportMd(name, selected.stem)
      .then(async (text) => {
        const html = await marked.parse(escapeStrayTildes(text), { breaks: false, gfm: true })
        setMdHtml(html as string)
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setMdLoading(false))
  }, [selected, name])

  const generate = async () => {
    setLogs([])
    setError(null)
    setStage('context')
    let r = await api().runScript(name, 'context')
    if (r.code !== 0) {
      setStage('error')
      setError(t('reports.error.context'))
      return
    }
    setStage('report')
    r = await api().runScript(name, 'report')
    if (r.code !== 0) {
      setStage('error')
      setError(t('reports.error.report'))
      return
    }
    setStage('pdf')
    try {
      const today = new Date()
      const ym = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
      await api().renderPdf(name, `${name}-${ym}.md`)
      setStage('done')
    } catch (e) {
      setStage('error')
      setError((e as Error).message)
      return
    }
    await refresh()
  }

  const sanitizeCustom = (s: string) =>
    s.replace(/\{\{[^}]*\}\}/g, '').slice(0, 4000)

  const generateCustom = async () => {
    const cleaned = sanitizeCustom(customText).trim()
    if (!cleaned) return
    setLogs([])
    setError(null)
    setStage(customRebuild ? 'context' : 'report')
    try {
      const r = await api().runCustomReport(name, cleaned, customRebuild)
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

  const renderPdfFor = async (stem: string) => {
    setError(null)
    setPdfRendering(true)
    try {
      await api().renderPdf(name, `${stem}.md`)
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setPdfRendering(false)
    }
  }

  const open = (p: string) => api().openPath(p)
  const busy = stage !== 'idle' && stage !== 'done' && stage !== 'error'

  // ============================================================
  // Inline viewer (when a report is selected)
  // ============================================================
  if (selected) {
    return (
      <div className="px-8 py-8 max-w-5xl">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setSelected(null)} className="btn-ghost">
            {t('reports.backToReports')}
          </button>
          <div className="flex items-center gap-2">
            {selected.hasPdf && selected.pdfPath ? (
              <>
                <button
                  onClick={() => renderPdfFor(selected.stem)}
                  disabled={pdfRendering}
                  className="btn-secondary"
                >
                  {pdfRendering ? <Spinner /> : null}
                  {t('reports.rerenderPdf')}
                </button>
                <button onClick={() => open(selected.pdfPath!)} className="btn-primary">
                  {t('reports.openPdf')}
                </button>
              </>
            ) : (
              <button
                onClick={() => renderPdfFor(selected.stem)}
                disabled={pdfRendering}
                className="btn-primary"
              >
                {pdfRendering ? <Spinner /> : null}
                {t('reports.generatePdf')}
              </button>
            )}
          </div>
        </div>

        <div className="text-[10px] uppercase tracking-[0.2em] text-gold-500">{t('reports.report')}</div>
        <h1 className="font-serif text-2xl text-navy-900 font-semibold mb-4">{selected.stem}</h1>

        {error && (
          <div className="mb-4 px-3 py-2 rounded border border-red-200 bg-red-50 text-sm text-red-700">
            {error}
          </div>
        )}

        <article className="card p-8">
          {mdLoading ? (
            <div className="flex justify-center py-20">
              <Spinner />
            </div>
          ) : (
            <div className="report-prose" dangerouslySetInnerHTML={{ __html: mdHtml }} />
          )}
        </article>
      </div>
    )
  }

  // ============================================================
  // List view
  // ============================================================
  return (
    <div className="px-8 py-8 max-w-6xl">
      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-gold-500">{t('reports.eyebrow')}</div>
          <h1 className="font-serif text-2xl text-navy-900 font-semibold">
            {t('reports.titleCount', { count: entries.length, name })}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={generate} disabled={busy} className="btn-primary">
            {busy ? <Spinner /> : null}
            {busy ? labelFor(stage, t) : t('reports.generate')}
          </button>
          <button
            onClick={() => setCustomOpen(true)}
            disabled={busy || customOpen}
            className="btn-secondary"
          >
            {t('reports.custom')}
          </button>
        </div>
      </div>

      {customOpen && (
        <div className="card p-6 mb-6">
          <div className="text-[10px] uppercase tracking-[0.2em] text-gold-500">
            {t('reports.customTitle')}
          </div>
          <h2 className="font-serif text-lg text-navy-900 font-semibold mb-1">
            {t('reports.customTitle')}
          </h2>
          <p className="text-sm text-slate-600 mb-3">{t('reports.customSubtitle')}</p>
          <textarea
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder={t('reports.customPlaceholder')}
            rows={8}
            maxLength={4000}
            disabled={busy}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gold-500/40"
          />
          <div className="mt-1 mb-3 text-xs text-slate-500 tabular-nums text-right">
            {t('reports.customCharCount', { count: customText.length })}
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={customRebuild}
              disabled={!hasCached || busy}
              onChange={(e) => setCustomRebuild(e.target.checked)}
            />
            <span>{t('reports.customRebuild')}</span>
            {!hasCached && (
              <span className="text-xs text-slate-500">
                {t('reports.customRebuildForced')}
              </span>
            )}
          </label>
          <div className="mt-4 flex items-center justify-end gap-2">
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
              className="btn-primary"
            >
              {busy ? <Spinner /> : null}
              {busy ? labelFor(stage, t) : t('reports.customGenerate')}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 px-3 py-2 rounded border border-red-200 bg-red-50 text-sm text-red-700">
          {error}
        </div>
      )}

      {(busy || logs.length > 0) && (
        <div className="mb-6">
          <LoadingProgress lines={logs} stage={stage} active={busy} />
        </div>
      )}

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-6 text-center text-sm text-slate-500">
            <Spinner />
          </div>
        ) : entries.length === 0 ? (
          <div
            className="p-10 text-center text-sm text-slate-500"
            dangerouslySetInnerHTML={{ __html: t('reports.emptyBody') }}
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-navy-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-2 text-xs uppercase tracking-wide text-navy-700">
                  {t('reports.col.period')}
                </th>
                <th className="text-left px-4 py-2 text-xs uppercase tracking-wide text-navy-700">
                  {t('reports.col.generated')}
                </th>
                <th className="text-right px-4 py-2 text-xs uppercase tracking-wide text-navy-700">
                  {t('reports.col.size')}
                </th>
                <th className="text-right px-4 py-2 text-xs uppercase tracking-wide text-navy-700">
                  {t('reports.col.files')}
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr
                  key={e.stem}
                  onClick={() => e.hasMd && setSelected(e)}
                  className={[
                    'border-b border-slate-100 transition-colors',
                    e.hasMd ? 'cursor-pointer hover:bg-slate-50' : 'opacity-60',
                  ].join(' ')}
                >
                  <td className="px-4 py-3 font-serif text-navy-900">
                    <div className="flex items-center gap-2">
                      <span>{e.stem}</span>
                      {e.hasMd && (
                        <span className="text-[10px] uppercase tracking-wide text-gold-600 transition-transform">
                          {t('reports.open')}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600 tabular-nums">
                    {new Date(e.mtime).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                    {e.sizeKb.toFixed(1)} KB
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="inline-flex items-center gap-1 text-xs">
                      {e.hasMd && (
                        <span className="px-1.5 py-0.5 rounded bg-navy-50 text-navy-700">MD</span>
                      )}
                      {e.hasPdf && (
                          <button className="group px-1.5 py-0.5 rounded bg-gold-500/10 hover:bg-gold-500/25 text-gold-600" onClick={(evt) => {
                            open(e.pdfPath!);
                            evt.stopPropagation();
                          }}>
                            <span >
                              PDF
                            </span>
                            <span className="hidden group-hover:inline-flex">
                              →
                            </span>
                          </button>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
