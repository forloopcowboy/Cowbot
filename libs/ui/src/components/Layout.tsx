import { useEffect, useState } from 'react'
import { Outlet, useLocation, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Sidebar from './Sidebar'

export default function Layout() {
  const { name } = useParams<{ name: string }>()
  const { t } = useTranslation()
  const location = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Auto-close the mobile drawer on navigation.
  useEffect(() => {
    setDrawerOpen(false)
  }, [location.pathname])

  // Lock body scroll while the drawer is open on mobile.
  useEffect(() => {
    if (!drawerOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [drawerOpen])

  const menuLabel = t('nav.menu', { defaultValue: 'Menu' })

  return (
    <div className="h-full flex flex-col">
      {/* Custom title bar — draggable. Left side matches sidebar navy (md+ only),
          right matches canvas. On mobile the navy block is hidden and a hamburger
          opens the drawer. */}
      <div className="titlebar flex shrink-0 h-9">
        <div className="hidden md:block w-60 bg-navy-900" />
        <div className="flex-1 flex items-center bg-canvas border-b border-slate-100 dark:bg-gold-500 dark:border-navy-800 h-10 md:h-auto">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label={menuLabel}
            className="md:hidden inline-flex items-center justify-center h-7 w-9 ml-1 rounded text-slate-700 hover:bg-slate-100/10 dark:text-slate-900 dark:hover:bg-navy-800/20 focus:outline-none focus:ring-2 focus:ring-gold-500"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
        </div>
      </div>
      <div className="flex-1 flex overflow-hidden relative">
        {/* Backdrop (mobile only, when drawer is open) */}
        {drawerOpen && (
          <button
            type="button"
            aria-label={t('nav.closeMenu', { defaultValue: 'Close menu' })}
            onClick={() => setDrawerOpen(false)}
            className="md:hidden fixed inset-0 z-30 bg-black/50 animate-fadeIn"
          />
        )}
        {/* Sidebar:
            - md+: relative, in-flow, always visible
            - <md: fixed drawer that slides in from the left */}
        <div
          className={[
            'fixed inset-y-0 left-0 z-40 transform transition-transform duration-200 ease-out',
            'md:static md:translate-x-0 md:transition-none',
            drawerOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
          ].join(' ')}
        >
          <Sidebar
            profileName={name ?? 'unknown'}
            onNavigate={() => setDrawerOpen(false)}
          />
        </div>
        <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden bg-canvas dark:bg-ink">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
