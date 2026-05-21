import { useTranslation } from 'react-i18next'
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '@investment-plan/i18n'

type Variant = 'sidebar' | 'landing'

export default function LanguagePicker({ variant }: { variant: Variant }) {
  const { t, i18n } = useTranslation()
  const current = (SUPPORTED_LANGUAGES as readonly string[]).includes(
    i18n.resolvedLanguage ?? '',
  )
    ? (i18n.resolvedLanguage as SupportedLanguage)
    : 'en'

  const onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    void i18n.changeLanguage(e.target.value)
  }

  if (variant === 'sidebar') {
    return (
      <label className="block px-1 py-2 text-[10px] uppercase tracking-[0.18em] text-slate-400">
        <span className="block mb-1">{t('language.label')}</span>
        <select
          value={current}
          onChange={onChange}
          className="w-full bg-navy-800 border border-navy-700 text-slate-100 text-xs rounded px-2 py-1 normal-case tracking-normal focus:outline-none focus:border-gold-500"
        >
          {SUPPORTED_LANGUAGES.map((code) => (
            <option key={code} value={code} className="text-slate-900">
              {t(`language.${code}`)}
            </option>
          ))}
        </select>
      </label>
    )
  }

  return (
    <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
      <span className="uppercase tracking-[0.18em] text-[10px] text-slate-500 dark:text-slate-400">
        {t('language.label')}
      </span>
      <select
        value={current}
        onChange={onChange}
        className="text-xs px-2 py-1 border border-slate-300 rounded bg-white dark:bg-navy-900 dark:border-navy-700 dark:text-slate-100"
      >
        {SUPPORTED_LANGUAGES.map((code) => (
          <option key={code} value={code}>
            {t(`language.${code}`)}
          </option>
        ))}
      </select>
    </label>
  )
}
