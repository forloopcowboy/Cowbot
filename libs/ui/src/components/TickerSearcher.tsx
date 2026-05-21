import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useApi } from '../api-context'
import type { TickerSearchResult, TickerQuote } from '@investment-plan/shared'
import { TICKER_RE } from '../lib/profileTemplate'
import Sparkline from './Sparkline'
import Spinner from './Spinner'

type LoadState<T> = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ok'; data: T }

type Props = {
  kind: 'etf' | 'fx'
  values: string[]
  onChange: (next: string[]) => void
  suggested?: readonly string[] | string[]
  label?: string
}

export default function TickerSearcher({ kind, values, onChange, suggested = [], label }: Props) {
  const { t } = useTranslation()
  const api = useApi()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<TickerSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [quotes, setQuotes] = useState<Record<string, LoadState<TickerQuote>>>({})
  const [candles, setCandles] = useState<Record<string, LoadState<number[]>>>({})
  const [draft, setDraft] = useState('')
  const [draftErr, setDraftErr] = useState<string | null>(null)

  const searchToken = useRef(0)

  // Debounced search
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      setSearching(false)
      setSearchError(null)
      return
    }
    const token = ++searchToken.current
    setSearching(true)
    setSearchError(null)
    const handle = setTimeout(() => {
      api
        .searchTickers(q)
        .then((rs) => {
          if (token !== searchToken.current) return
          setResults(rs.slice(0, 8))
          setSearching(false)
        })
        .catch((e) => {
          if (token !== searchToken.current) return
          setSearchError((e as Error).message)
          setResults([])
          setSearching(false)
        })
    }, 250)
    return () => clearTimeout(handle)
  }, [query])

  // Fetch quote+candles for symbols that need them
  const allSymbols = useMemo(() => {
    const set = new Set<string>(values)
    for (const r of results) set.add(r.symbol)
    return [...set]
  }, [values, results])

  useEffect(() => {
    for (const sym of allSymbols) {
      if (!quotes[sym]) {
        setQuotes((q) => ({ ...q, [sym]: { status: 'loading' } }))
        api
          .getQuote(sym)
          .then((data) =>
            setQuotes((q) => ({ ...q, [sym]: { status: 'ok', data } })),
          )
          .catch((e) =>
            setQuotes((q) => ({
              ...q,
              [sym]: { status: 'error', message: (e as Error).message },
            })),
          )
      }
      if (!candles[sym]) {
        setCandles((c) => ({ ...c, [sym]: { status: 'loading' } }))
        api
          .getCandles(sym)
          .then((data) =>
            setCandles((c) => ({
              ...c,
              [sym]: { status: 'ok', data: data.points.map((p) => p.c) },
            })),
          )
          .catch((e) =>
            setCandles((c) => ({
              ...c,
              [sym]: { status: 'error', message: (e as Error).message },
            })),
          )
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allSymbols.join(',')])

  const add = (sym: string) => {
    if (!values.includes(sym)) onChange([...values, sym])
  }
  const remove = (sym: string) => onChange(values.filter((v) => v !== sym))

  const submitDraft = () => {
    const v = draft.trim().toUpperCase()
    if (!v) return
    if (!TICKER_RE.test(v)) {
      setDraftErr(t('common.invalidFormat'))
      return
    }
    if (!values.includes(v)) onChange([...values, v])
    setDraft('')
    setDraftErr(null)
  }

  const placeholder =
    kind === 'fx'
      ? t('tickerSearcher.searchPlaceholder.fx')
      : t('tickerSearcher.searchPlaceholder.etf')

  const unaddedSuggested = (suggested as string[]).filter((s) => !values.includes(s))

  return (
    <div className="space-y-3">
      {label && <label className="label">{label}</label>}

      {/* Search input */}
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="w-full"
          autoComplete="off"
          spellCheck={false}
        />
        {searching && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500">
            <Spinner />
          </span>
        )}
      </div>

      {searchError && (
        <p className="text-xs text-red-600 dark:text-red-400">
          {t('tickerSearcher.searchError', { error: searchError })}
        </p>
      )}

      {/* Results */}
      {results.length > 0 && (
        <ul className="rounded border border-slate-200 bg-white divide-y divide-slate-100 dark:border-navy-700 dark:bg-navy-900 dark:divide-navy-800">
          {results.map((r) => (
            <Row
              key={r.symbol}
              symbol={r.symbol}
              name={r.shortname || r.longname || r.symbol}
              meta={[r.exchange, r.type].filter(Boolean).join(' · ')}
              quote={quotes[r.symbol]}
              candle={candles[r.symbol]}
              trailing={
                values.includes(r.symbol) ? (
                  <span className="text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-300 px-2">
                    {t('tickerSearcher.added')}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => add(r.symbol)}
                    className="btn-ghost text-xs"
                    aria-label={t('tickerSearcher.add')}
                  >
                    + {t('tickerSearcher.add')}
                  </button>
                )
              }
            />
          ))}
        </ul>
      )}
      {query.trim().length >= 2 && !searching && results.length === 0 && !searchError && (
        <p className="text-xs text-slate-500 dark:text-slate-400">{t('tickerSearcher.noResults')}</p>
      )}

      {/* Selected */}
      {values.length > 0 ? (
        <ul className="rounded border border-navy-100 bg-navy-50/30 divide-y divide-navy-100/60 dark:border-navy-700 dark:bg-navy-800/40 dark:divide-navy-700/60">
          {values.map((sym) => (
            <Row
              key={sym}
              symbol={sym}
              name={
                quotes[sym]?.status === 'ok'
                  ? quotes[sym].data.currency
                    ? `${quotes[sym].data.currency}`
                    : ''
                  : ''
              }
              quote={quotes[sym]}
              candle={candles[sym]}
              selected
              trailing={
                <button
                  type="button"
                  onClick={() => remove(sym)}
                  className="text-slate-400 hover:text-red-600 dark:text-slate-500 dark:hover:text-red-400 px-2 py-1 text-lg leading-none"
                  aria-label={t('tickerSearcher.remove')}
                >
                  ×
                </button>
              }
            />
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-400 dark:text-slate-500">{t('common.none')}</p>
      )}

      {/* Suggested */}
      {unaddedSuggested.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
            {t('tickerSearcher.suggested')}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {unaddedSuggested.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => add(s)}
                className="rounded border border-dashed border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:border-navy-700 hover:text-navy-800 dark:border-navy-700 dark:text-slate-300 dark:hover:border-gold-500 dark:hover:text-cream"
              >
                + {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Free-add */}
      <div className="flex gap-2">
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
          className="flex-1 font-mono text-xs"
          autoComplete="off"
          spellCheck={false}
        />
        <button type="button" onClick={submitDraft} className="btn-secondary">
          {t('common.add')}
        </button>
      </div>
      {draftErr && <p className="text-xs text-red-600 dark:text-red-400">{draftErr}</p>}
    </div>
  )
}

function Row({
  symbol,
  name,
  meta,
  quote,
  candle,
  selected,
  trailing,
}: {
  symbol: string
  name?: string
  meta?: string
  quote?: LoadState<TickerQuote>
  candle?: LoadState<number[]>
  selected?: boolean
  trailing?: React.ReactNode
}) {
  const price = quote?.status === 'ok' ? quote.data.price : null
  const changePct = quote?.status === 'ok' ? quote.data.changePct : null
  const currency = quote?.status === 'ok' ? quote.data.currency : ''
  const points = candle?.status === 'ok' ? candle.data : []
  return (
    <li
      className={`flex items-center gap-3 px-3 py-2 ${
        selected ? '' : 'hover:bg-slate-50/60 dark:hover:bg-navy-800/60'
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-xs font-semibold text-navy-900 dark:text-cream">{symbol}</span>
          {name && (
            <span className="truncate text-xs text-slate-600 dark:text-slate-400">{name}</span>
          )}
        </div>
        {meta && (
          <div className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">{meta}</div>
        )}
      </div>

      <div className="text-right tabular-nums shrink-0">
        {quote?.status === 'loading' && (
          <span className="text-slate-300 dark:text-slate-500"><Spinner /></span>
        )}
        {quote?.status === 'ok' && price !== null && (
          <>
            <div className="text-xs font-semibold text-navy-900 dark:text-cream">
              {formatPrice(price)}
              {currency && <span className="ml-1 text-[10px] text-slate-400 dark:text-slate-500">{currency}</span>}
            </div>
            {changePct !== null && (
              <div
                className={`text-[11px] font-medium ${
                  changePct >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'
                }`}
              >
                {changePct >= 0 ? '+' : ''}
                {changePct.toFixed(2)}%
              </div>
            )}
          </>
        )}
        {quote?.status === 'error' && (
          <span className="text-[10px] text-slate-400 dark:text-slate-500">—</span>
        )}
      </div>

      <div className="shrink-0">
        {candle?.status === 'loading' ? (
          <span className="inline-block w-[120px] h-[28px]" />
        ) : (
          <Sparkline points={points} />
        )}
      </div>

      <div className="shrink-0">{trailing}</div>
    </li>
  )
}

function formatPrice(n: number): string {
  if (!Number.isFinite(n)) return '—'
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
  if (Math.abs(n) >= 1) return n.toFixed(2)
  return n.toFixed(4)
}
