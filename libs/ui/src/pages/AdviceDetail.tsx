import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { marked } from 'marked'
import type { Advice } from '@investment-plan/shared'
import { useApi } from '../api-context'

export default function AdviceDetail() {
  const { id = '' } = useParams()
  const [search] = useSearchParams()
  const { t, i18n } = useTranslation()
  const api = useApi()
  const [advice, setAdvice] = useState<Advice | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const backTo = search.get('from') ?? '/'

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    setNotFound(false)
    setError(null)
    if (!api.getAdvice) {
      setNotFound(true)
      setLoading(false)
      return () => {
        cancelled = true
      }
    }
    api
      .getAdvice(id)
      .then((row) => {
        if (!cancelled) setAdvice(row)
      })
      .catch((e) => {
        if (cancelled) return
        const msg = (e as Error).message ?? ''
        if (/404|not found/i.test(msg)) {
          setNotFound(true)
        } else {
          setError(msg)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [api, id])

  const answerHtml = useMemo(() => {
    if (!advice?.responseText) return ''
    return marked.parse(advice.responseText, {
      breaks: true,
      gfm: true,
      async: false,
    }) as string
  }, [advice?.responseText])

  const dateFmt = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'en', {
    dateStyle: 'long',
    timeStyle: 'short',
  })

  return (
    <div className="min-h-full bg-canvas dark:bg-ink">
      <div className="titlebar h-9 shrink-0" />
      <div className="mx-auto max-w-[860px] px-6 sm:px-8 pt-6 pb-16">
        <Link
          to={backTo}
          className="font-ticker text-[11px] tracking-[0.22em] uppercase text-slate-600 dark:text-slate-300 hover:text-gold-600 dark:hover:text-gold-300"
        >
          {t('advice.detail.back')}
        </Link>

        {loading && (
          <div className="mt-10 text-sm text-slate-500 dark:text-slate-400">
            {t('common.loading')}
          </div>
        )}

        {error && !loading && (
          <div className="mt-10 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {notFound && !loading && (
          <div className="mt-10 text-sm text-slate-600 dark:text-slate-300">
            {t('advice.detail.notFound')}
          </div>
        )}

        {advice && !loading && (
          <article className="mt-8">
            <div className="font-ticker text-[10px] tracking-[0.22em] uppercase text-gold-600 dark:text-gold-400">
              {t('advice.detail.question')}
              {advice.profileName && (
                <span className="ml-3 text-slate-500 dark:text-slate-400">
                  · {advice.profileName}
                </span>
              )}
              <span className="ml-3 text-slate-500 dark:text-slate-400">
                · {dateFmt.format(new Date(advice.createdAt))}
              </span>
            </div>
            <blockquote className="mt-3 border-l-2 border-gold-500 pl-4 font-serif text-[20px] leading-snug text-navy-900 dark:text-cream">
              {advice.userPrompt}
            </blockquote>

            <div className="mt-8 font-ticker text-[10px] tracking-[0.22em] uppercase text-gold-600 dark:text-gold-400">
              {t('advice.detail.answer')}
            </div>
            <div
              className="report-prose mt-3 text-[15.5px] leading-[1.6] text-navy-900 dark:text-cream"
              dangerouslySetInnerHTML={{ __html: answerHtml }}
            />
          </article>
        )}
      </div>
    </div>
  )
}
