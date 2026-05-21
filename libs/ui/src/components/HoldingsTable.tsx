import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

export type HoldingRow = Record<string, string>

const COLUMNS: { key: keyof HoldingRow; labelKey: string; w?: string; type?: 'text' | 'number' }[] = [
  { key: 'account', labelKey: 'holdings.table.account', w: 'w-24' },
  { key: 'instrument', labelKey: 'holdings.table.instrument', w: 'min-w-[12rem]' },
  { key: 'ticker', labelKey: 'holdings.table.ticker', w: 'w-28' },
  { key: 'isin', labelKey: 'holdings.table.isin', w: 'w-32' },
  { key: 'quantity', labelKey: 'holdings.table.qty', w: 'w-32', type: 'number' },
  { key: 'avg_cost', labelKey: 'holdings.table.avgCost', w: 'w-28', type: 'number' },
  { key: 'currency', labelKey: 'holdings.table.cur', w: 'w-16' },
  { key: 'asset_class', labelKey: 'holdings.table.class', w: 'w-24' },
  { key: 'notes', labelKey: 'holdings.table.notes', w: 'min-w-[10rem]' },
]

export default function HoldingsTable({
  rows,
  onChange,
  accountSuggestions,
}: {
  rows: HoldingRow[]
  onChange: (rows: HoldingRow[]) => void
  accountSuggestions?: string[]
}) {
  const { t } = useTranslation()
  const accountListId = 'holdings-account-options'
  const update = (i: number, key: string, val: string) => {
    const next = rows.slice()
    next[i] = { ...next[i], [key]: val }
    onChange(next)
  }
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i))
  const add = () =>
    onChange([
      ...rows,
      Object.fromEntries(COLUMNS.map((c) => [c.key as string, ''])) as HoldingRow,
    ])
  const cols = useMemo(() => COLUMNS, [])
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-navy-50 border-b border-slate-200 dark:bg-navy-800 dark:border-navy-700">
              {cols.map((c) => (
                <th
                  key={c.key as string}
                  className={`text-left px-2.5 py-2 text-xs font-medium uppercase tracking-wide text-navy-700 dark:text-gold-300 ${c.w ?? ''}`}
                >
                  {t(c.labelKey)}
                </th>
              ))}
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={i}
                className="border-b border-slate-100 hover:bg-slate-50 dark:border-navy-800 dark:hover:bg-navy-800/60"
              >
                {cols.map((c) => (
                  <td key={c.key as string} className="px-1.5 py-1">
                    <input
                      type={c.type === 'number' ? 'number' : 'text'}
                      step={c.type === 'number' ? 'any' : undefined}
                      list={c.key === 'account' ? accountListId : undefined}
                      value={row[c.key as string] ?? ''}
                      onChange={(e) => update(i, c.key as string, e.target.value)}
                      className="w-full !border-transparent hover:!border-slate-200 focus:!border-navy-700 dark:hover:!border-navy-700 dark:focus:!border-gold-500 !py-1 !px-1.5 dark:bg-transparent"
                    />
                  </td>
                ))}
                <td className="px-1 py-1">
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    className="text-slate-400 hover:text-red-600 dark:text-slate-500 dark:hover:text-red-400 px-1.5 py-1 text-sm"
                    aria-label={t('common.removeRow')}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={cols.length + 1} className="text-center text-sm text-slate-500 dark:text-slate-400 py-6">
                  {t('holdings.table.empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="px-3 py-2 border-t border-slate-200 bg-slate-50 dark:border-navy-700 dark:bg-navy-800/60">
        <button type="button" onClick={add} className="btn-ghost">
          {t('holdings.table.addRow')}
        </button>
      </div>
      {accountSuggestions && accountSuggestions.length > 0 && (
        <datalist id={accountListId}>
          {accountSuggestions.map((a) => (
            <option key={a} value={a} />
          ))}
        </datalist>
      )}
    </div>
  )
}
