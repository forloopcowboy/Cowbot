import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type Theme = 'light' | 'dark' | 'system'
export type EffectiveTheme = 'light' | 'dark'

type ThemeContextValue = {
  theme: Theme
  effective: EffectiveTheme
  setTheme: (next: Theme) => void
}

const STORAGE_KEY = 'theme'

const ThemeContext = createContext<ThemeContextValue | null>(null)

function readStored(): Theme {
  if (typeof window === 'undefined') return 'system'
  const v = window.localStorage.getItem(STORAGE_KEY)
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'system'
}

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function applyClass(effective: EffectiveTheme) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (effective === 'dark') root.classList.add('dark')
  else root.classList.remove('dark')
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => readStored())
  const [systemDark, setSystemDark] = useState<boolean>(() => systemPrefersDark())

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const effective: EffectiveTheme =
    theme === 'system' ? (systemDark ? 'dark' : 'light') : theme

  useEffect(() => {
    applyClass(effective)
  }, [effective])

  const setTheme = (next: Theme) => {
    setThemeState(next)
    try {
      if (next === 'system') window.localStorage.removeItem(STORAGE_KEY)
      else window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // localStorage may be unavailable in some embedded contexts; ignore.
    }
  }

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, effective, setTheme }),
    [theme, effective],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}
