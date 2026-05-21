import { useTranslation } from 'react-i18next'
import { useTheme, type Theme } from '../theme-context'

const ORDER: Theme[] = ['light', 'dark', 'system']

export default function ThemeToggle({
  variant = 'sidebar',
}: {
  variant?: 'sidebar' | 'landing'
}) {
  const { theme, setTheme } = useTheme()
  const { t } = useTranslation()
  const next = () => setTheme(ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length])

  const label =
    theme === 'light'
      ? t('theme.light', { defaultValue: 'Light' })
      : theme === 'dark'
        ? t('theme.dark', { defaultValue: 'Dark' })
        : t('theme.system', { defaultValue: 'System' })
  const a11y = t('theme.toggle', { defaultValue: 'Toggle theme' })

  if (variant === 'sidebar') {
    return (
      <button
        type="button"
        onClick={next}
        aria-label={a11y}
        title={a11y}
        className="w-full flex items-center justify-between px-4 py-2 text-xs text-slate-400 hover:text-white rounded transition-colors"
      >
        <span className="uppercase tracking-[0.18em] text-[10px]">
          {t('theme.label', { defaultValue: 'Theme' })}
        </span>
        <span className="flex items-center gap-1.5 normal-case text-slate-200">
          <Icon theme={theme} />
          {label}
        </span>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={next}
      aria-label={a11y}
      title={a11y}
      className="inline-flex items-center gap-1.5 rounded border border-slate-300 dark:border-navy-700 bg-white dark:bg-navy-900 px-2 py-1 text-xs text-slate-700 dark:text-slate-200 hover:border-navy-700 dark:hover:border-gold-500 transition-colors"
    >
      <Icon theme={theme} />
      <span>{label}</span>
    </button>
  )
}

function Icon({ theme }: { theme: Theme }) {
  const cls = 'h-3.5 w-3.5'
  if (theme === 'light') {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    )
  }
  if (theme === 'dark') {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M20 14.5A8 8 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="5" width="18" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 20h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
