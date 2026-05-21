import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { AdviceListPage } from '@investment-plan/shared'
import { useApi } from '../api-context'

export interface AdviceListProps {
  /** When set, restricts to advices recorded against this profile. */
  profileName?: string
  /** Path to put in `?from=` on each row link so the detail page's back button works. */
  fromPath: string
  pageSize?: number
}

const DEFAULT_PAGE_SIZE = 10

export default function AdviceList({
  profileName,
  fromPath,
  pageSize = DEFAULT_PAGE_SIZE,
}: AdviceListProps) {
  const api = useApi()
  const { t, i18n } = useTranslation()
  const [page, setPage] = useState<AdviceListPage | null>(null)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setOffset(0)
  }, [profileName])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    if (!api.listAdvices) {
      setLoading(false)
      setPage({ items: [], total: 0, limit: pageSize, offset: 0 })
      return () => {
        cancelled = true
      }
    }
    api
      .listAdvices({ limit: pageSize, offset, profileName })
      .then((data) => {
        if (!cancelled) setPage(data)
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [api, offset, pageSize, profileName])

  const total = page?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.floor(offset / pageSize) + 1
  const items = page?.items ?? []
  const fromQs = `?from=${encodeURIComponent(fromPath)}`
  const dateFmt = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  return (
    <section className="bg-canvas dark:bg-ink">
      <div className="mx-auto max-w-[960px] px-6 sm:px-8 py-10">
        <h2 className="font-serif text-xl sm:text-2xl text-navy-900 dark:text-cream font-semibold">
          {t('advice.list.title')}
        </h2>

        {loading && !page && (
          <div className="mt-6 text-sm text-slate-500 dark:text-slate-400">
            {t('common.loading')}
          </div>
        )}

        {error && (
          <div className="mt-6 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <div className="mt-6 text-sm text-slate-600 dark:text-slate-300">
            {t('advice.list.empty')}
          </div>
        )}

        {items.length > 0 && (
          <ul className="mt-6 divide-y divide-slate-200 dark:divide-navy-800 border-t border-b border-slate-200 dark:border-navy-800">
            {items.map((it) => (
              <li key={it.id}>
                <Link
                  to={`/advice/${encodeURIComponent(it.id)}${fromQs}`}
                  className="flex items-baseline gap-4 py-3 group"
                >
                  <span className="font-ticker text-[10px] tracking-[0.18em] uppercase text-slate-500 dark:text-slate-400 w-32 shrink-0">
                    {dateFmt.format(new Date(it.createdAt))}
                  </span>
                  <span className="flex-1 min-w-0 text-[14.5px] text-navy-900 dark:text-cream truncate group-hover:text-gold-600 dark:group-hover:text-gold-300">
                    {it.userPrompt}
                  </span>
                  {it.profileName && !profileName && (
                    <span className="font-ticker text-[10px] tracking-[0.18em] uppercase text-gold-600 dark:text-gold-400 shrink-0">
                      {it.profileName}
                    </span>
                  )}
                  <span className="font-ticker text-[10px] tracking-[0.18em] uppercase text-gold-600 dark:text-gold-300 shrink-0">
                    {t('advice.list.viewLink')}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {totalPages > 1 && (
          <div className="mt-5 flex items-center justify-between font-ticker text-[11px] tracking-[0.18em] uppercase text-slate-600 dark:text-slate-300">
            <button
              type="button"
              onClick={() => setOffset((o) => Math.max(0, o - pageSize))}
              disabled={offset === 0 || loading}
              className="px-3 py-1.5 border border-slate-300 dark:border-navy-700 hover:border-gold-500 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t('advice.list.previous')}
            </button>
            <span>
              {t('advice.list.pageOf', { page: currentPage, total: totalPages })}
            </span>
            <button
              type="button"
              onClick={() =>
                setOffset((o) =>
                  o + pageSize < total ? o + pageSize : o,
                )
              }
              disabled={offset + pageSize >= total || loading}
              className="px-3 py-1.5 border border-slate-300 dark:border-navy-700 hover:border-gold-500 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t('advice.list.next')}
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
