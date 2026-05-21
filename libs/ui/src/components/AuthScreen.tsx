import { useState, type FormEvent } from 'react'
import logoUrl from '../assets/logo.svg'

export type AuthMode = 'signin' | 'signup'

export type AuthScreenProps = {
  mode: AuthMode
  onModeChange: (mode: AuthMode) => void
  onSubmit: (email: string, password: string) => void | Promise<void>
  loading?: boolean
  error?: string | null
}

export default function AuthScreen({
  mode,
  onModeChange,
  onSubmit,
  loading = false,
  error = null,
}: AuthScreenProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const isSignup = mode === 'signup'

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (loading) return
    void onSubmit(email.trim(), password)
  }

  return (
    <div className="relative min-h-screen w-full bg-night font-grotesk text-cream antialiased overflow-hidden">
      <div className="absolute inset-0 bg-starfield opacity-60 pointer-events-none" />

      <header className="relative">
        <div className="mx-auto max-w-[1240px] px-4 sm:px-6 lg:px-8 py-5 flex items-center gap-3">
          <a href="/" className="flex items-center gap-2.5 group min-w-0">
            <img src={logoUrl} alt="" className="h-7 w-7 shrink-0" />
            <span
              className="font-display text-[20px] leading-none text-cream tracking-tight truncate"
              style={{ fontVariationSettings: '"opsz" 36, "wght" 540' }}
            >
              Cowboy <span className="text-gold-500">Investor</span>
            </span>
          </a>
          <a
            href="/"
            className="ml-auto shrink-0 font-ticker text-[11px] tracking-[0.22em] uppercase text-cream/65 hover:text-cream transition-colors"
          >
            <span className="sm:hidden" aria-hidden="true">←</span>
            <span className="hidden sm:inline">← Back to home</span>
            <span className="sr-only sm:hidden">Back to home</span>
          </a>
        </div>
      </header>

      <main className="grid grid-cols-12 gap-x-4 gap-y-10 items-center relative mx-auto max-w-[1240px] px-4 sm:px-6 lg:px-8 pt-6 pb-20 sm:pt-10">
          {/* LEFT — pitch */}
          <div className="col-span-12 lg:col-span-6 hidden lg:block">
            <div
              className="font-ticker text-[11px] tracking-[0.28em] uppercase text-gold-400 animate-rise"
              style={{ animationDelay: '0ms' }}
            >
              {isSignup ? 'Open the gate' : 'Welcome back, partner'}
            </div>
            <h1
              className="mt-5 font-display text-cream leading-[0.98] tracking-[-0.025em]"
              style={{
                fontSize: 'clamp(40px, 5.6vw, 76px)',
                fontVariationSettings: '"opsz" 144, "wght" 380, "SOFT" 30',
              }}
            >
              <span className="block animate-rise" style={{ animationDelay: '60ms' }}>
                {isSignup ? 'Saddle up.' : 'Welcome'}
              </span>
              <span className="block animate-rise" style={{ animationDelay: '160ms' }}>
                <em
                  className="italic font-normal text-cream/85"
                  style={{ fontVariationSettings: '"opsz" 144, "wght" 380, "SOFT" 100' }}
                >
                  {isSignup ? 'It’s on the' : 'back to the'}
                </em>
              </span>
              <span className="block relative animate-rise" style={{ animationDelay: '260ms' }}>
                <span className="text-gold-500">{isSignup ? 'house.' : 'range.'}</span>
                <span
                  className="absolute -bottom-2 left-0 h-[6px] w-[36%] bg-gold-500/80 origin-left animate-slash"
                  style={{ animationDelay: '700ms' }}
                />
              </span>
            </h1>
            <p
              className="mt-10 max-w-[440px] text-[16px] leading-[1.55] text-cream/75 animate-rise"
              style={{ animationDelay: '380ms' }}
            >
              {isSignup
                ? 'Bring a portfolio, a hypothesis, or a wild idea. The first thousand scenarios are on us.'
                : 'Pick up where you left off. Your scenarios, your reporting currency, your reins.'}
            </p>
            <ul
              className="mt-8 space-y-2.5 text-[13.5px] text-cream/80 animate-rise"
              style={{ animationDelay: '480ms' }}
            >
              <Tick>No card, no broker linkage</Tick>
              <Tick>Local-first — your holdings stay yours</Tick>
              <Tick>Cancel by closing the tab</Tick>
            </ul>
          </div>

          {/* RIGHT — auth card */}
          <div
            className="col-span-12 lg:col-span-6 lg:col-start-7 animate-rise"
            style={{ animationDelay: '160ms' }}
          >
            <div className="relative mx-auto w-full max-w-[480px]">
              <div className="absolute -inset-6 bg-gold-500/10 blur-3xl pointer-events-none" />

              <div className="relative bg-navy-800/80 backdrop-blur-sm border border-cream/15 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)]">
                {/* terminal header */}
                <div className="px-4 sm:px-5 py-3 hairline-cream flex items-center gap-2 sm:gap-3 min-w-0">
                  <span className="h-2.5 w-2.5 rounded-full bg-bear/80 shrink-0" />
                  <span className="h-2.5 w-2.5 rounded-full bg-gold-500/80 shrink-0" />
                  <span className="h-2.5 w-2.5 rounded-full bg-bull/80 shrink-0" />
                  <span className="ml-2 sm:ml-3 font-ticker text-[10px] tracking-[0.18em] sm:tracking-[0.22em] uppercase text-cream/75 truncate">
                    {isSignup ? 'session · new rider' : 'session · sign in'}
                  </span>
                  <span className="ml-auto hidden sm:inline font-ticker text-[10px] tracking-[0.18em] uppercase text-gold-400 num shrink-0">
                    secure · tls
                  </span>
                </div>

                <div className="px-6 pt-6 pb-6 sm:px-8 sm:pt-8 sm:pb-8">
                  <div className="font-ticker text-[10px] tracking-[0.22em] uppercase text-gold-400">
                    {isSignup ? 'Create account' : 'Sign in'}
                  </div>
                  <h2
                    className="mt-2 font-display text-cream leading-tight tracking-[-0.015em]"
                    style={{
                      fontSize: 'clamp(28px, 3.4vw, 36px)',
                      fontVariationSettings: '"opsz" 48, "wght" 440',
                    }}
                  >
                    {isSignup ? (
                      <>
                        Take the{' '}
                        <em
                          className="italic text-gold-500"
                          style={{ fontVariationSettings: '"opsz" 48, "wght" 440, "SOFT" 100' }}
                        >
                          reins.
                        </em>
                      </>
                    ) : (
                      <>
                        Glad you’re{' '}
                        <em
                          className="italic text-gold-500"
                          style={{ fontVariationSettings: '"opsz" 48, "wght" 440, "SOFT" 100' }}
                        >
                          back.
                        </em>
                      </>
                    )}
                  </h2>

                  <form onSubmit={handleSubmit} className="mt-7 space-y-5" noValidate>
                    <Field
                      id="email"
                      label="Email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={setEmail}
                      placeholder="rider@cowboy.investor"
                      disabled={loading}
                    />
                    <Field
                      id="password"
                      label="Password"
                      type="password"
                      autoComplete={isSignup ? 'new-password' : 'current-password'}
                      value={password}
                      onChange={setPassword}
                      placeholder={isSignup ? 'At least 8 characters' : '••••••••'}
                      disabled={loading}
                    />

                    {error ? (
                      <div
                        role="alert"
                        className="font-ticker text-[11px] tracking-[0.12em] uppercase text-bear hairline-gold-top pt-3"
                      >
                        ▼ {error}
                      </div>
                    ) : null}

                    <button
                      type="submit"
                      disabled={loading}
                      className="group w-full inline-flex items-center justify-between gap-3 bg-gold-500 text-ink px-5 py-4 hover:bg-gold-400 transition-colors disabled:opacity-60 disabled:cursor-wait"
                    >
                      <span className="font-grotesk text-[15px] font-semibold tracking-tight truncate">
                        {loading
                          ? isSignup
                            ? 'Saddling up…'
                            : 'Signing in…'
                          : isSignup
                          ? 'Take the reins'
                          : 'Sign in'}
                      </span>
                      <span className="hidden sm:inline font-ticker text-[11px] tracking-[0.22em] uppercase text-ink/65 group-hover:translate-x-0.5 transition-transform shrink-0">
                        Mount up →
                      </span>
                      <span className="sm:hidden font-ticker text-[14px] text-ink/65 group-hover:translate-x-0.5 transition-transform shrink-0" aria-hidden="true">
                        →
                      </span>
                    </button>
                  </form>

                  {/* divider */}
                  <div className="relative my-7 flex items-center">
                    <span className="flex-1 h-px bg-cream/15" />
                    <span className="px-3 font-ticker text-[10px] tracking-[0.28em] uppercase text-cream/55">
                      or
                    </span>
                    <span className="flex-1 h-px bg-cream/15" />
                  </div>

                  <div className="space-y-3">
                    <SocialButton provider="google" />
                    <SocialButton provider="github" />
                  </div>

                  {/* mode toggle */}
                  <div className="mt-7 pt-5 hairline-cream-top text-center">
                    {isSignup ? (
                      <p className="font-ticker text-[11px] tracking-[0.18em] uppercase text-cream/70">
                        Already riding?{' '}
                        <button
                          type="button"
                          onClick={() => onModeChange('signin')}
                          className="text-gold-400 hover:text-gold-300 underline decoration-gold-400/40 underline-offset-4 transition-colors"
                        >
                          Sign in
                        </button>
                      </p>
                    ) : (
                      <p className="font-ticker text-[11px] tracking-[0.18em] uppercase text-cream/70">
                        New here?{' '}
                        <button
                          type="button"
                          onClick={() => onModeChange('signup')}
                          className="text-gold-400 hover:text-gold-300 underline decoration-gold-400/40 underline-offset-4 transition-colors"
                        >
                          Saddle up — it’s free
                        </button>
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <p className="mt-5 text-center font-ticker text-[10px] tracking-[0.22em] uppercase text-cream/55">
                By continuing you accept the house rules · no fiduciary relationship
              </p>
            </div>
          </div>
      </main>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Subcomponents                                                     */
/* ------------------------------------------------------------------ */

function Field({
  id,
  label,
  type,
  value,
  onChange,
  placeholder,
  autoComplete,
  disabled,
}: {
  id: string
  label: string
  type: 'email' | 'password' | 'text'
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoComplete?: string
  disabled?: boolean
}) {
  return (
    <label htmlFor={id} className="block">
      <span className="block font-ticker text-[10px] tracking-[0.22em] uppercase text-cream/75">
        {label}
      </span>
      <input
        id={id}
        name={id}
        type={type}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        disabled={disabled}
        className="mt-2 w-full rounded-none border border-cream/20 bg-cream/[0.04] px-4 py-3 font-grotesk text-base sm:text-[15px] text-cream placeholder:text-cream/35 focus:outline-none focus:border-gold-500 focus:ring-0 focus:bg-cream/[0.06] disabled:opacity-60 transition-colors"
      />
    </label>
  )
}

function SocialButton({ provider }: { provider: 'google' | 'github' }) {
  const isGoogle = provider === 'google'
  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      tabIndex={-1}
      title="Coming soon"
      className="group w-full inline-flex items-center gap-3 border border-cream/12 bg-cream/[0.02] px-4 py-3 text-cream/45 cursor-not-allowed"
    >
      {isGoogle ? <GoogleGlyph /> : <GithubGlyph />}
      <span className="font-grotesk text-[14px] font-medium">
        Continue with {isGoogle ? 'Google' : 'GitHub'}
      </span>
      <span className="ml-auto font-ticker text-[9.5px] tracking-[0.24em] uppercase text-gold-400/80 border border-gold-400/30 px-2 py-0.5">
        Coming soon
      </span>
    </button>
  )
}

function Tick({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-baseline gap-3">
      <span className="font-ticker text-[11px] tracking-[0.22em] text-gold-500">✓</span>
      <span>{children}</span>
    </li>
  )
}

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className="shrink-0 opacity-70">
      <path
        fill="#EA4335"
        d="M9 3.48c1.69 0 2.83.73 3.48 1.34l2.54-2.48C13.46.89 11.43 0 9 0 5.48 0 2.44 2.02.96 4.96l2.91 2.26C4.6 5.05 6.62 3.48 9 3.48z"
      />
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.74-.06-1.28-.19-1.84H9v3.34h4.96c-.1.83-.64 2.08-1.84 2.92l2.84 2.2c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#FBBC05"
        d="M3.88 10.78a5.54 5.54 0 0 1-.29-1.78c0-.62.11-1.22.28-1.78L.96 4.96a9 9 0 0 0 0 8.08l2.92-2.26z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.84-2.2c-.76.53-1.78.9-3.12.9-2.38 0-4.4-1.57-5.12-3.74L.96 13.04C2.44 15.98 5.48 18 9 18z"
      />
    </svg>
  )
}

function GithubGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className="shrink-0 opacity-70">
      <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}
