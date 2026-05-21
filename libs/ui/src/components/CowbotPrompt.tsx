import { useEffect, useMemo, useRef, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { marked } from 'marked'

export interface QuickAdviceRequest {
  userPrompt: string
  profileName?: string
  anonymousHoldings?: Array<{
    ticker: string
    quantity: number
    currency?: string
    assetClass?: string
  }>
}

export interface QuickAdviceHandlers {
  onCreated?: (adviceId: string) => void
  onDelta?: (chunk: string) => void
  onDone?: () => void
  onError?: (message: string) => void
}

export type StreamQuickAdvice = (
  body: QuickAdviceRequest,
  handlers: QuickAdviceHandlers,
) => AbortController

export type QuipVariant = 'generic' | 'profile'

const QUIP_COUNTS: Record<QuipVariant, number> = {
  generic: 7,
  profile: 6,
}

export interface CowbotPromptProps {
  /** Function that opens the SSE stream and returns an AbortController. */
  streamQuickAdvice: StreamQuickAdvice
  /** When set, backend enriches the prompt with the user's profile YAML + holdings. */
  profileName?: string
  /**
   * 'hero' = marketing landing treatment (display headline + eyebrow + subline + scroll cue).
   * 'card' = compact in-app treatment (just the prompt + answer panel).
   */
  variant?: 'hero' | 'card'
  /**
   * Which pool of headline quips to randomize from.
   * 'generic' = portfolio-agnostic punchlines (homepage, app home).
   * 'profile' = alludes to the user's holdings/plan (profile view).
   * Defaults to 'profile' when `profileName` is set, else 'generic'.
   */
  quipVariant?: QuipVariant
  /** Fires as soon as the server has inserted the advice row and yielded its id. */
  onCreated?: (adviceId: string) => void
  /**
   * Fires when the stream completes successfully. Receives the advice id captured from
   * the `created` event (or `null` if the stream errored before insert).
   */
  onDone?: (adviceId: string | null) => void
}

function useQuipKey(explicit: QuipVariant | undefined, profileName?: string) {
  const variant: QuipVariant =
    explicit ?? (profileName ? 'profile' : 'generic')
  return useMemo(() => {
    const idx = Math.floor(Math.random() * QUIP_COUNTS[variant])
    return `home.quips.${variant}.${idx}`
  }, [variant])
}

export default function CowbotPrompt(props: CowbotPromptProps) {
  if (props.variant === 'hero') {
    return <HeroVariant {...props} />
  }
  return <CardVariant {...props} />
}

function useCowbotStream({
  streamQuickAdvice,
  profileName,
  onCreated,
  onDone,
}: CowbotPromptProps) {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [answer, setAnswer] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const idRef = useRef<string | null>(null)

  useEffect(() => () => abortRef.current?.abort(), [])

  const answerHtml = useMemo(() => {
    if (!answer) return ''
    return marked.parse(answer, { breaks: true, gfm: true, async: false }) as string
  }, [answer])

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const prompt = value.trim()
    if (!prompt || loading) return
    abortRef.current?.abort()
    idRef.current = null
    setLoading(true)
    setError(null)
    setAnswer('')
    abortRef.current = streamQuickAdvice(
      { userPrompt: prompt, profileName },
      {
        onCreated: (id) => {
          idRef.current = id
          onCreated?.(id)
        },
        onDelta: (chunk) => setAnswer((prev) => prev + chunk),
        onDone: () => {
          setLoading(false)
          onDone?.(idRef.current)
        },
        onError: (msg) => {
          console.error('[cowbot]', msg)
          setError(t('home.hero.errorGeneric'))
          setLoading(false)
        },
      },
    )
  }

  return { value, setValue, loading, answer, answerHtml, error, onSubmit }
}

/* ------------------------------------------------------------------ */
/*  Hero variant — full-bleed marketing layout                        */
/* ------------------------------------------------------------------ */

function HeroVariant(props: CowbotPromptProps) {
  const { t } = useTranslation()
  const { value, setValue, loading, answer, answerHtml, error, onSubmit } =
    useCowbotStream(props)
  const quipKey = useQuipKey(props.quipVariant, props.profileName)

  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 bg-starfield opacity-50 pointer-events-none" />
      <div className="relative mx-auto flex min-h-[calc(100svh-6rem)] max-w-[960px] flex-col justify-center px-6 sm:px-8 py-16 sm:py-24">
        <div
          className="font-ticker text-[11px] tracking-[0.28em] uppercase text-gold-400 animate-rise"
          style={{ animationDelay: '0ms' }}
        >
          {t('home.hero.eyebrow')}
        </div>

        <h1
          className="mt-6 font-display text-cream leading-[1.02] tracking-[-0.02em]"
          style={{
            fontSize: 'clamp(34px, 5.4vw, 68px)',
            fontVariationSettings: '"opsz" 144, "wght" 380, "SOFT" 30',
          }}
        >
          <span
            className="block animate-rise"
            style={{ animationDelay: '80ms' }}
          >
            <Trans
              i18nKey={quipKey}
              components={{ gold: <span className="text-gold-500" /> }}
            />
          </span>
          <span
            className="block italic animate-rise mt-2"
            style={{ animationDelay: '280ms' }}
          >
            <Trans
              i18nKey="home.hero.pitch3"
              components={{ gold: <span className="text-gold-500" /> }}
            />
          </span>
        </h1>

        <p
          className="mt-6 max-w-[560px] text-[15px] leading-[1.55] text-cream/65 animate-rise"
          style={{ animationDelay: '380ms' }}
        >
          {t('home.hero.subline')}
        </p>

        <form
          onSubmit={onSubmit}
          className="mt-10 animate-rise"
          style={{ animationDelay: '480ms' }}
        >
          <PromptInput
            value={value}
            onChange={setValue}
            loading={loading}
            inputSize="lg"
            appearance="dark"
          />
          <div className="mt-3 font-ticker text-[10px] tracking-[0.22em] uppercase text-cream/45">
            {t('home.hero.hint')}
          </div>
        </form>

        <AnswerPanel
          loading={loading}
          answer={answer}
          answerHtml={answerHtml}
          error={error}
          appearance="dark"
        />

        <div
          className="mt-16 flex items-center gap-3 font-ticker text-[10px] tracking-[0.28em] uppercase text-cream/45 animate-rise"
          style={{ animationDelay: '620ms' }}
        >
          <span className="h-px w-10 bg-cream/30" />
          <span>{t('home.hero.scrollCue')}</span>
          <span aria-hidden="true">↓</span>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/*  Card variant — compact, embeddable                                */
/* ------------------------------------------------------------------ */

function CardVariant(props: CowbotPromptProps) {
  const { t } = useTranslation()
  const { value, setValue, loading, answer, answerHtml, error, onSubmit } =
    useCowbotStream(props)
  const quipKey = useQuipKey(props.quipVariant, props.profileName)

  return (
    <section className="bg-canvas text-navy-900 dark:bg-navy-900 dark:text-cream">
      <div className="mx-auto max-w-[960px] px-6 sm:px-8 py-12 sm:py-16">
        <div className="font-ticker text-[11px] tracking-[0.28em] uppercase text-gold-600 dark:text-gold-400">
          {t('home.hero.eyebrow')}
        </div>
        <h2
          className="mt-3 font-display text-navy-900 dark:text-cream leading-[1.05] tracking-[-0.02em]"
          style={{
            fontSize: 'clamp(24px, 3.2vw, 36px)',
            fontVariationSettings: '"opsz" 72, "wght" 420',
          }}
        >
          <Trans
            i18nKey={quipKey}
            components={{ gold: <span className="text-gold-600 dark:text-gold-500" /> }}
          />
        </h2>

        <form onSubmit={onSubmit} className="mt-6">
          <PromptInput
            value={value}
            onChange={setValue}
            loading={loading}
            inputSize="md"
            appearance="auto"
          />
          <div className="mt-2 font-ticker text-[10px] tracking-[0.22em] uppercase text-slate-500 dark:text-cream/45">
            {t('home.hero.hint')}
          </div>
        </form>

        <AnswerPanel
          loading={loading}
          answer={answer}
          answerHtml={answerHtml}
          error={error}
          appearance="auto"
        />
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/*  Shared subcomponents                                              */
/* ------------------------------------------------------------------ */

function PromptInput({
  value,
  onChange,
  loading,
  inputSize,
  appearance = 'dark',
}: {
  value: string
  onChange: (v: string) => void
  loading: boolean
  inputSize: 'md' | 'lg'
  appearance?: 'dark' | 'auto'
}) {
  const { t } = useTranslation()
  const padY = inputSize === 'lg' ? 'py-5 sm:py-6' : 'py-4'
  const padBtn = inputSize === 'lg' ? 'py-5 sm:py-6' : 'py-4'
  const wrapperBg =
    appearance === 'auto'
      ? 'bg-slate-200 dark:bg-cream/15'
      : 'bg-cream/15'
  const inputClass =
    appearance === 'auto'
      ? 'flex-1 bg-white dark:bg-navy-800 text-navy-900 dark:text-cream placeholder:text-slate-400 dark:placeholder:text-cream/35'
      : 'flex-1 bg-navy-800 text-cream placeholder:text-cream/35'
  return (
    <div
      className={[
        'relative flex flex-col sm:flex-row items-stretch gap-px focus-within:bg-gold-500/60 transition-colors',
        wrapperBg,
      ].join(' ')}
    >
      <label htmlFor="cowbot-prompt" className="sr-only">
        {t('home.hero.inputLabel')}
      </label>
      <input
        id="cowbot-prompt"
        name="q"
        type="text"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('home.hero.placeholder')}
        disabled={loading}
        className={[
          inputClass,
          'px-5 sm:px-6',
          padY,
          'font-ticker text-[14px] sm:text-[15px] tracking-[0.01em]',
          'placeholder:font-ticker',
          'focus:outline-none disabled:opacity-60',
        ].join(' ')}
      />
      <button
        type="submit"
        disabled={loading || !value.trim()}
        className={[
          'group inline-flex items-center justify-center gap-3',
          'bg-gold-500 text-ink px-7',
          padBtn,
          'font-grotesk text-[15px] font-semibold',
          'hover:bg-gold-400 transition-colors',
          'disabled:bg-gold-500/40 disabled:cursor-not-allowed',
        ].join(' ')}
      >
        <span>{loading ? t('home.hero.submitLoading') : t('home.hero.submit')}</span>
        <span
          aria-hidden="true"
          className="text-ink/70 group-hover:translate-x-0.5 transition-transform"
        >
          {loading ? '·' : '→'}
        </span>
      </button>
    </div>
  )
}

function AnswerPanel({
  loading,
  answer,
  answerHtml,
  error,
  appearance = 'dark',
}: {
  loading: boolean
  answer: string
  answerHtml: string
  error: string | null
  appearance?: 'dark' | 'auto'
}) {
  const { t } = useTranslation()
  if (!loading && !answer && !error) return null
  const panelClass =
    appearance === 'auto'
      ? 'border-slate-200 bg-white/80 dark:border-cream/12 dark:bg-navy-800/70'
      : 'border-cream/12 bg-navy-800/70'
  const headerBorder =
    appearance === 'auto'
      ? 'border-b border-slate-200 dark:border-0 dark:[box-shadow:inset_0_-1px_0_0_rgba(236,230,211,0.16)]'
      : 'hairline-cream'
  const labelClass =
    appearance === 'auto'
      ? 'text-slate-600 dark:text-cream/75'
      : 'text-cream/75'
  const bodyClass =
    appearance === 'auto'
      ? 'text-navy-900 dark:text-cream/90'
      : 'text-cream/90'
  const placeholderClass =
    appearance === 'auto'
      ? 'text-slate-500 dark:text-cream/55'
      : 'text-cream/55'
  return (
    <div
      className={[
        'mt-8 border backdrop-blur-sm',
        panelClass,
      ].join(' ')}
      aria-live="polite"
    >
      <div
        className={['px-5 py-3 flex items-center gap-3', headerBorder].join(
          ' ',
        )}
      >
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-gold-400 animate-pulse" />
        <span
          className={[
            'font-ticker text-[10px] tracking-[0.22em] uppercase',
            labelClass,
          ].join(' ')}
        >
          {loading && !answer
            ? t('home.hero.replyThinking')
            : t('home.hero.replyLabel')}
        </span>
      </div>
      <div
        className={[
          'px-5 py-5 font-display text-[17px] leading-snug',
          bodyClass,
        ].join(' ')}
        style={{ fontVariationSettings: '"opsz" 24, "wght" 440' }}
      >
        {error ? (
          <span className="text-bear">{error}</span>
        ) : answer ? (
          <div
            className="report-prose space-y-3 overflow-x-scroll"
            dangerouslySetInnerHTML={{ __html: answerHtml }}
          />
        ) : (
          <span className={placeholderClass}>
            {t('home.hero.replyThinkingBody')}
          </span>
        )}
      </div>
    </div>
  )
}
