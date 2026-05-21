import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CowbotPrompt, logoUrl } from '@investment-plan/ui'
import {
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from '@investment-plan/i18n'
import { streamQuickAdvice } from '../api'

export default function Home() {
  const navigate = useNavigate()
  return (
    <div className="h-full w-full flex flex-col bg-night font-grotesk text-cream antialiased">
      <div className="titlebar h-9 shrink-0" />
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <Nav />
        <CowbotPrompt
          streamQuickAdvice={streamQuickAdvice}
          variant="hero"
          quipVariant="generic"
          onDone={(id) => {
            if (id) navigate(`/advice/${id}?from=${encodeURIComponent('/')}`)
          }}
        />
        <ProfileCTA />
        <Footer />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Language selector (dark inline)                                   */
/* ------------------------------------------------------------------ */

function LangSelect({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const { t, i18n } = useTranslation()
  const current = (SUPPORTED_LANGUAGES as readonly string[]).includes(
    i18n.resolvedLanguage ?? '',
  )
    ? (i18n.resolvedLanguage as SupportedLanguage)
    : 'en'
  const onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    void i18n.changeLanguage(e.target.value)
  }
  const sizing =
    size === 'md' ? 'px-2.5 py-1.5 text-[11px]' : 'px-2 py-1 text-[10px]'
  return (
    <label className="inline-flex items-center gap-2">
      <span className="sr-only">{t('language.label')}</span>
      <select
        value={current}
        onChange={onChange}
        aria-label={t('language.label')}
        className={[
          'bg-transparent text-cream font-ticker tracking-[0.18em] uppercase',
          'border border-cream/25 hover:border-gold-500 transition-colors',
          'cursor-pointer focus:outline-none focus:border-gold-500',
          sizing,
        ].join(' ')}
      >
        {SUPPORTED_LANGUAGES.map((code) => (
          <option
            key={code}
            value={code}
            className="bg-navy-900 text-cream normal-case tracking-normal"
          >
            {t(`language.${code}`)}
          </option>
        ))}
      </select>
    </label>
  )
}

/* ------------------------------------------------------------------ */
/*  Wordmark                                                          */
/* ------------------------------------------------------------------ */

function Wordmark() {
  return (
    <Link to="/" className="flex items-center gap-2.5 group">
      <img src={logoUrl} alt="" className="h-7 w-7" />
      <span
        className="font-display text-[20px] leading-none text-cream tracking-tight"
        style={{ fontVariationSettings: '"opsz" 36, "wght" 540' }}
      >
        Cowboy <span className="text-gold-500">Investor</span>
      </span>
    </Link>
  )
}

/* ------------------------------------------------------------------ */
/*  Nav                                                               */
/* ------------------------------------------------------------------ */

function Nav() {
  const { t } = useTranslation()
  return (
    <nav className="hairline-cream">
      <div className="mx-auto max-w-[1240px] px-4 sm:px-6 lg:px-8 py-3 sm:py-4 flex items-center gap-3 sm:gap-6 lg:gap-8">
        <Wordmark />
        <div className="ml-auto flex items-center gap-3 sm:gap-5 lg:gap-7 font-ticker text-[11px] tracking-[0.18em] uppercase text-cream/70 whitespace-nowrap">
          <Link
            to="/auth"
            className="hidden sm:inline hover:text-cream transition-colors"
          >
            {t('home.nav.signIn')}
          </Link>
          <LangSelect />
          <Link
            to="/auth?show=signup"
            className="inline-flex items-center gap-1.5 sm:gap-2 bg-gold-500 text-ink px-3 sm:px-4 py-1.5 sm:py-2 hover:bg-gold-400 transition-colors"
          >
            <span>{t('home.nav.cta')}</span>
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </nav>
  )
}

/* ------------------------------------------------------------------ */
/*  Profile CTA — second scroll section                               */
/* ------------------------------------------------------------------ */

function ProfileCTA() {
  const { t } = useTranslation()
  const bullets = [
    t('home.profile.bullet1'),
    t('home.profile.bullet2'),
    t('home.profile.bullet3'),
    t('home.profile.bullet4'),
  ]
  return (
    <section className="relative bg-navy-900 hairline-cream hairline-cream-top">
      <div className="absolute inset-x-0 top-0 h-px bg-gold-500/40" />
      <div className="mx-auto max-w-[1240px] px-6 sm:px-8 py-24 sm:py-32">
        <div className="grid grid-cols-12 gap-x-8 gap-y-12 items-start">
          <div className="col-span-12 md:col-span-7">
            <div className="font-ticker text-[11px] tracking-[0.28em] uppercase text-gold-400">
              {t('home.profile.eyebrow')}
            </div>
            <h2
              className="mt-4 font-display text-cream leading-[1.02] tracking-[-0.02em]"
              style={{
                fontSize: 'clamp(32px, 4.6vw, 56px)',
                fontVariationSettings: '"opsz" 96, "wght" 400',
              }}
            >
              {t('home.profile.title1')}{' '}
              <em
                className="italic block text-cream/85"
                style={{
                  fontVariationSettings:
                    '"opsz" 96, "wght" 400, "SOFT" 100',
                }}
              >
                {t('home.profile.title2')}
              </em>
            </h2>
            <p className="mt-8 max-w-[520px] text-[15.5px] leading-[1.6] text-cream/75">
              {t('home.profile.body')}
            </p>
          </div>

          <div className="col-span-12 md:col-span-5">
            <div className="border border-cream/15 bg-navy-800/70 p-6 sm:p-8">
              <div className="font-ticker text-[10px] tracking-[0.24em] uppercase text-gold-400">
                {t('home.profile.cardEyebrow')}
              </div>
              <ul className="mt-5 space-y-3 text-[14.5px] leading-[1.5] text-cream/85">
                {bullets.map((b) => (
                  <li key={b} className="flex items-baseline gap-3">
                    <span className="font-ticker text-[11px] tracking-[0.22em] text-gold-500">
                      ✓
                    </span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              <Link
                to="/app"
                className="mt-7 inline-flex w-full items-center justify-between bg-gold-500 text-ink px-5 py-4 hover:bg-gold-400 transition-colors group"
              >
                <span className="font-grotesk text-[15px] font-semibold">
                  {t('home.profile.cta')}
                </span>
                <span className="font-ticker text-[10px] tracking-[0.22em] uppercase text-ink/65 group-hover:translate-x-0.5 transition-transform">
                  {t('home.profile.ctaSub')} →
                </span>
              </Link>
              <div className="mt-3 text-center font-ticker text-[10px] tracking-[0.22em] uppercase text-cream/55">
                {t('home.profile.or')}{' '}
                <Link
                  to="/auth"
                  className="underline decoration-cream/30 underline-offset-2 hover:text-cream"
                >
                  {t('home.profile.signIn')}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/*  Footer                                                            */
/* ------------------------------------------------------------------ */

function Footer() {
  const { t } = useTranslation()
  return (
    <footer className="hairline-cream-top bg-navy-900">
      <div className="mx-auto max-w-[1240px] px-6 sm:px-8 py-10 grid grid-cols-12 gap-x-8 gap-y-6 items-start">
        <div className="col-span-12 md:col-span-6">
          <Wordmark />
          <p className="mt-3 max-w-[420px] text-[12.5px] leading-[1.65] text-cream/65">
            {t('home.footer.tagline')}
          </p>
        </div>

        <div className="col-span-12 md:col-span-3">
          <LangSelect size="md" />
        </div>

        <div className="col-span-12 md:col-span-3 font-ticker text-[10px] tracking-[0.22em] uppercase text-cream/65 md:text-right space-y-1">
          <div>{t('home.footer.copyright')}</div>
          <div>{t('home.footer.builtBy')}</div>
        </div>

        <div className="col-span-12 hairline-cream-top pt-5 font-ticker text-[10px] leading-relaxed tracking-[0.14em] uppercase text-cream/55">
          {t('home.footer.disclaimer')}
        </div>
      </div>
    </footer>
  )
}
