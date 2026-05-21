import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { marked } from 'marked'
import { useApi } from '../api-context'
import { escapeStrayTildes } from '../lib/markdown'
import type { ReportEntry } from '@investment-plan/shared'
import Spinner from '../components/Spinner'

export default function ReportView() {
  const { name = '', stem = '' } = useParams()
  const { t } = useTranslation()
  const api = useApi()
  const navigate = useNavigate()

  const [entry, setEntry] = useState<ReportEntry | null>(null)
  const [mdHtml, setMdHtml] = useState<string>('')
  const [mdLoading, setMdLoading] = useState(true)
  const [pdfRendering, setPdfRendering] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refreshEntry = useCallback(async () => {
    const list = await api.listReports(name)
    setEntry(list.find((e) => e.stem === stem) ?? null)
  }, [api, name, stem])

  useEffect(() => {
    refreshEntry()
  }, [refreshEntry])

  useEffect(() => {
    setMdLoading(true)
    api
      .readReportMd(name, stem)
      .then(async (text) => {
        const html = (await marked.parse(escapeStrayTildes(text), {
          breaks: false,
          gfm: true,
        })) as string
        // Wrap each rendered <table> in an overflow-x-auto container so wide
        // financial tables scroll horizontally on narrow viewports instead of
        // overflowing the card.
        const wrapped = html
          .replace(/<table>/g, '<div class="report-table-wrap"><table>')
          .replace(/<\/table>/g, '</table></div>')
        setMdHtml(wrapped)
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setMdLoading(false))
  }, [api, name, stem])

  const renderPdf = async () => {
    setError(null)
    setPdfRendering(true)
    try {
      await api.renderPdf(name, `${stem}.md`)
      await refreshEntry()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setPdfRendering(false)
    }
  }

  const openPdf = () => {
    if (entry?.pdfPath) api.openPath(entry.pdfPath)
  }

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-6 sm:py-8 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <button onClick={() => navigate('../reports')} className="btn-ghost self-start">
          {t('reports.backToReports')}
        </button>
        <div className="flex flex-wrap items-center gap-2">
          {entry?.hasPdf && entry.pdfPath ? (
            <>
              <button onClick={renderPdf} disabled={pdfRendering} className="btn-secondary">
                {pdfRendering ? <Spinner /> : null}
                {t('reports.rerenderPdf')}
              </button>
              <button onClick={openPdf} className="btn-primary">
                {t('reports.openPdf')}
              </button>
            </>
          ) : (
            <button onClick={renderPdf} disabled={pdfRendering} className="btn-primary">
              {pdfRendering ? <Spinner /> : null}
              {t('reports.generatePdf')}
            </button>
          )}
        </div>
      </div>

      <div className="text-[10px] uppercase tracking-[0.2em] text-gold-500 dark:text-gold-300">{t('reports.report')}</div>
      <h1 className="font-serif text-2xl text-navy-900 dark:text-cream font-semibold mb-4 break-words">{stem}</h1>

      {error && (
        <div className="mb-4 px-3 py-2 rounded border border-red-200 bg-red-50 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      )}

      <article className="card p-4 sm:p-6 lg:p-8">
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
