import { NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import logoUrl from '../assets/logo.svg'
import LanguagePicker from './LanguagePicker'

const NAV: { to: string; key: 'nav.settings' | 'nav.holdings' | 'nav.reports' }[] = [
  { to: 'settings', key: 'nav.settings' },
  { to: 'holdings', key: 'nav.holdings' },
  { to: 'reports', key: 'nav.reports' },
]

export default function Sidebar({ profileName }: { profileName: string }) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  return (
    <aside className="w-60 shrink-0 bg-navy-900 text-slate-100 flex flex-col">
      <div className="px-5 pt-5 pb-6">
        <div className="flex items-center gap-2.5">
          <img src={logoUrl} alt="" className="h-8 w-8 shrink-0" />
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.2em] text-gold-400">
              {t('app.name')}
            </div>
            <div className="mt-0.5 font-serif text-lg font-semibold text-white truncate">
              {profileName}
            </div>
          </div>
        </div>
      </div>
      <nav className="flex-1 px-2">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              [
                'block px-4 py-2.5 rounded-md text-sm font-medium relative transition-colors',
                isActive
                  ? 'bg-navy-800 text-white'
                  : 'text-slate-300 hover:bg-navy-800/60 hover:text-white',
              ].join(' ')
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 bg-gold-500 rounded-r" />
                )}
                {t(item.key)}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="p-3 border-t border-navy-800 space-y-1">
        <LanguagePicker variant="sidebar" />
        <button
          onClick={() => navigate('/')}
          className="w-full text-left px-4 py-2 text-xs text-slate-400 hover:text-white"
        >
          {t('nav.switchProfile')}
        </button>
      </div>
    </aside>
  )
}
