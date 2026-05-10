import { useEffect, useMemo, useRef, useState } from 'react'
import { Disclosure, DisclosureButton, DisclosurePanel } from '@headlessui/react'
import ConsoleStream, { type LogLine } from './ConsoleStream'
import Spinner from './Spinner'
import {formatModel} from "../pages/Settings.tsx";

// ──────────────────────────────────────────────────────────────────────────────
// Parsing — maps the markers produced by scripts/_ui.py onto typed events.
//
//   step()   → "✓ <ok_msg>" once the spinner closes (spinner itself is silent
//              when stdout is not a tty, so we only see the completion line)
//   info()   → "· <msg>"
//   warn()   → "! <msg>"
//   err()    → "✗ <msg>"
//   banner() → "── <title> ──" (a Rich rule, lots of ─)
// ──────────────────────────────────────────────────────────────────────────────

type Event =
  | { kind: 'banner'; text: string }
  | { kind: 'done'; text: string }
  | { kind: 'info'; text: string }
  | { kind: 'warn'; text: string }
  | { kind: 'error'; text: string }
  | { kind: 'raw'; text: string }

const ANSI_RE = /\x1b\[[0-9;]*m/g
// Rich's `console.log()` adds a timestamp prefix and a source-location suffix
// when stdout is a tty. We strip both so we can pattern-match on the message.
const TS_RE = /^\[\d{1,2}:\d{2}:\d{2}\]\s*/
const SRC_RE = /\s+[a-zA-Z0-9_./-]+:\d+\s*$/
const RULE_RE = /─{3,}/

function parseLine(raw: string): Event | null {
  let s = raw.replace(ANSI_RE, '').replace(TS_RE, '').replace(SRC_RE, '').trim()
  if (!s) return null

  if (RULE_RE.test(s)) {
    const title = s.replace(/[─━]+/g, '').trim()
    if (!title) return null
    return { kind: 'banner', text: title }
  }
  if (s.startsWith('✓')) return { kind: 'done', text: s.slice(1).trim() }
  if (s.startsWith('✗')) return { kind: 'error', text: s.slice(1).trim() }
  // `·` is the info marker; `!` is warn. Be a little defensive — some shells
  // render the middle-dot funny so we also accept a leading "*" or "•".
  if (/^[·•*]/.test(s)) return { kind: 'info', text: s.slice(1).trim() }
  if (s.startsWith('!')) return { kind: 'warn', text: s.slice(1).trim() }
  return { kind: 'raw', text: s }
}

// ──────────────────────────────────────────────────────────────────────────────
// Quips — shown when the underlying tool is producing uncategorized chatter
// (yfinance retries, requests warnings, etc.) so the user sees motion.
// ──────────────────────────────────────────────────────────────────────────────

const QUIPS = [
  'consulting the tea leaves…',
  'asking the market politely…',
  'checking under the couch cushions…',
  'reticulating splines…',
  'haggling with the exchange rate gnomes…',
  'pinging the central bank…',
  'reading the fine print so you don\'t have to…',
  'counting basis points by hand…',
  'rounding to the nearest centavo…',
  'untangling currency pairs…',
  'asking yfinance to please respond…',
  'waiting for the broker\'s coffee to kick in…',
  'computing alpha (and a little beta)…',
  'bribing the rate limiter with cookies…',
  'translating from Reuters to plain English…',
]

// ──────────────────────────────────────────────────────────────────────────────
// Stages — the high-level pipeline (matches Reports.tsx).
// ──────────────────────────────────────────────────────────────────────────────

export type Stage = 'idle' | 'context' | 'report' | 'pdf' | 'done' | 'error'

const STAGES: { id: Exclude<Stage, 'idle' | 'done' | 'error'>; label: string }[] = [
  { id: 'context', label: 'Context' },
  { id: 'report', label: 'Report' },
  { id: 'pdf', label: 'PDF' },
]

function stageState(id: Stage, current: Stage): 'done' | 'current' | 'error' | 'pending' {
  const order: Stage[] = ['idle', 'context', 'report', 'pdf', 'done']
  const idx = order.indexOf(current)
  const sIdx = order.indexOf(id)
  if (current === 'error') {
    if (sIdx < idx) return 'done'
    if (sIdx === idx) return 'error'
    return 'pending'
  }
  if (sIdx < idx) return 'done'
  if (sIdx === idx) return 'current'
  return 'pending'
}

// ──────────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────────

type TimelineSection = {
  banner: string | null
  events: Event[] // info / done / warn / error events under this banner
}

function buildTimeline(events: Event[]): { sections: TimelineSection[]; lastRaw: Event | null } {
  const sections: TimelineSection[] = []
  let current: TimelineSection = { banner: null, events: [] }
  let lastRaw: Event | null = null
  for (const ev of events) {
    if (ev.kind === 'banner') {
      if (current.banner !== null || current.events.length > 0) sections.push(current)
      current = { banner: ev.text, events: [] }
      continue
    }
    if (ev.kind === 'raw') {
      lastRaw = ev
      continue
    }
    current.events.push(ev)
  }
  if (current.banner !== null || current.events.length > 0) sections.push(current)
  return { sections, lastRaw }
}

export default function LoadingProgress({
  lines,
  stage,
  active,
}: {
  lines: LogLine[]
  stage: Stage
  active: boolean
}) {
  const [showTerminal, setShowTerminal] = useState(false)

  const events = useMemo(
    () => lines.map((l) => parseLine(l.text)).filter((e): e is Event => e !== null),
    [lines],
  )
  const { sections, lastRaw } = useMemo(() => buildTimeline(events), [events])

  // Rotate a quip every few seconds whenever the most recent meaningful line is
  // uncategorized — gives the UI something to say while the tool is chattering.
  const [quipIdx, setQuipIdx] = useState(() => Math.floor(Math.random() * QUIPS.length))
  const quipKeyRef = useRef<string>('')
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => {
      setQuipIdx((i) => (i + 1) % QUIPS.length)
    }, 3500)
    return () => clearInterval(id)
  }, [active])
  // Re-roll a fresh quip whenever the raw line content changes meaningfully.
  useEffect(() => {
    if (lastRaw && lastRaw.text !== quipKeyRef.current) {
      quipKeyRef.current = lastRaw.text
      setQuipIdx(Math.floor(Math.random() * QUIPS.length))
    }
  }, [lastRaw])

  const showQuip = active && lastRaw !== null
  const quip = QUIPS[quipIdx]

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <Stepper current={stage} />
        <button
          type="button"
          onClick={() => setShowTerminal((v) => !v)}
          className="btn-ghost"
          aria-pressed={showTerminal}
        >
          {showTerminal ? 'Show progress' : 'Show terminal'}
        </button>
      </div>

      {showTerminal ? (
        <ConsoleStream lines={lines} />
      ) : (
        <FriendlyView
          sections={sections}
          stage={stage}
          active={active}
          showQuip={showQuip}
          quip={quip}
        />
      )}
    </div>
  )
}

function formatEventText(ev: Event) {
    if (ev.text.toLowerCase().includes('model')) {
      const [title, model] = ev.text.split(': ');
      return [title, formatModel(model)].join(': ');
    }
    if (ev.kind === 'raw') return ev.text
    return ev.text.replace(/\.$/, '') // trim trailing period for cleaner UI
}

function FriendlyView({
  sections,
  stage,
  active,
  showQuip,
  quip,
}: {
  sections: TimelineSection[]
  stage: Stage
  active: boolean
  showQuip: boolean
  quip: string
}) {
  const empty = sections.length === 0
  const sectionsCount = sections.length
  const lastIdx = sectionsCount - 1

  // Sections the user has explicitly opened. Stored in a ref so its identity
  // is stable across renders (otherwise the SectionPanel effects below would
  // see a fresh value every parent render and fire spuriously).
  const userOpenedRef = useRef<Set<number>>(new Set())

  return (
    <div className="text-sm">
      {empty && active && (
        <div className="flex items-center gap-2 text-slate-500 py-6 justify-center">
          <Spinner />
          <span>Warming up…</span>
        </div>
      )}

      <div className="space-y-2">
        {sections.map((sec, i) => {
          const isLatest = i === lastIdx
          return (
            <Disclosure key={i} defaultOpen={isLatest}>
              {({ open, close }) => (
                <SectionPanel
                  section={sec}
                  index={i}
                  open={open}
                  close={close}
                  isLatest={isLatest}
                  active={active}
                  sectionsCount={sectionsCount}
                  userOpenedRef={userOpenedRef}
                />
              )}
            </Disclosure>
          )
        })}
      </div>

      {showQuip && (
        <div className="mt-4 flex items-center gap-2 text-slate-500 italic">
          <Spinner />
          <span key={quip} className="animate-fadeIn">
            {quip}
          </span>
        </div>
      )}

      {stage === 'done' && (
        <div className="mt-4 flex items-center gap-2 text-emerald-700">
          <span aria-hidden>✓</span>
          <span>All done.</span>
        </div>
      )}
      {stage === 'error' && (
        <div className="mt-4 flex items-center gap-2 text-red-700">
          <span aria-hidden>✗</span>
          <span>Something went wrong — flip to the terminal view for details.</span>
        </div>
      )}
    </div>
  )
}

function SectionPanel({
  section,
  index,
  open,
  close,
  isLatest,
  active,
  sectionsCount,
  userOpenedRef,
}: {
  section: TimelineSection
  index: number
  open: boolean
  close: () => void
  isLatest: boolean
  active: boolean
  sectionsCount: number
  userOpenedRef: React.MutableRefObject<Set<number>>
}) {
  // Track user-driven open transitions. We compare `open` against its previous
  // value: a false→true edge after the first render means the user clicked the
  // button to expand this section. We mark it sticky so the force-collapse
  // effect below leaves it alone. Closing the section clears the sticky bit.
  const prevOpenRef = useRef(open)
  const firstRef = useRef(true)
  useEffect(() => {
    if (firstRef.current) {
      firstRef.current = false
      prevOpenRef.current = open
      return
    }
    if (open && !prevOpenRef.current) {
      userOpenedRef.current.add(index)
    }
    if (!open) {
      userOpenedRef.current.delete(index)
    }
    prevOpenRef.current = open
  }, [open, index, userOpenedRef])

  // Force-collapse on new section arrival. When `sectionsCount` grows, every
  // mounted section runs this effect; sections that are no longer the latest
  // and weren't user-opened get imperatively closed via Disclosure's `close()`.
  const prevCountRef = useRef(sectionsCount)
  useEffect(() => {
    const grew = sectionsCount > prevCountRef.current
    prevCountRef.current = sectionsCount
    if (!grew) return
    const stillLatest = index === sectionsCount - 1
    if (!stillLatest && open && !userOpenedRef.current.has(index)) {
      close()
    }
  }, [sectionsCount, index, open, close, userOpenedRef])

  const banner = section.banner ?? 'Logs'
  const doneCount = section.events.filter((e) => e.kind === 'done').length
  const warnCount = section.events.filter((e) => e.kind === 'warn').length
  const errCount = section.events.filter((e) => e.kind === 'error').length

  return (
    <div className="rounded border border-slate-200 bg-white">
      <DisclosureButton className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 focus:outline-none focus:ring-1 focus:ring-gold-500 rounded">
        <Chevron open={open} />
        <span className="text-[10px] uppercase tracking-[0.2em] text-gold-600 font-medium">
          {banner}
        </span>
        <span className="flex-1 border-t border-slate-200 mx-1" />
        <span className="flex items-center gap-2 text-[10px] text-slate-500">
          {isLatest && active && <Spinner size={10} />}
          {isLatest && !active && errCount === 0 && (
            <span className="text-emerald-600" aria-hidden>
              ✓
            </span>
          )}
          {doneCount > 0 && <span>{doneCount} done</span>}
          {warnCount > 0 && <span className="text-amber-700">{warnCount} warn</span>}
          {errCount > 0 && <span className="text-red-700">{errCount} err</span>}
        </span>
      </DisclosureButton>
      <DisclosurePanel className="px-3 pb-2">
        <ul className="space-y-1">
          {section.events.map((ev, j) => (
            <li key={j} className="flex items-start gap-2 leading-relaxed">
              <EventIcon kind={ev.kind} />
              <span
                className={
                  ev.kind === 'error'
                    ? 'text-red-700'
                    : ev.kind === 'warn'
                    ? 'text-amber-700'
                    : ev.kind === 'done'
                    ? 'text-navy-900'
                    : 'text-slate-600'
                }
              >
                {formatEventText(ev)}
              </span>
            </li>
          ))}
          {section.events.length === 0 && (
            <li className="text-slate-400 italic">no entries yet</li>
          )}
        </ul>
      </DisclosurePanel>
    </div>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className="text-slate-400 transition-transform"
      style={{ width: 10, height: 10, transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden
    >
      <path d="M3 1l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function EventIcon({ kind }: { kind: Event['kind'] }) {
  if (kind === 'done')
    return (
      <span className="mt-[3px] text-emerald-600" aria-hidden>
        ✓
      </span>
    )
  if (kind === 'warn')
    return (
      <span className="mt-[3px] text-amber-600" aria-hidden>
        !
      </span>
    )
  if (kind === 'error')
    return (
      <span className="mt-[3px] text-red-600" aria-hidden>
        ✗
      </span>
    )
  // info / fallback
  return (
    <span className="mt-[3px] text-slate-400" aria-hidden>
      ·
    </span>
  )
}

function Stepper({ current }: { current: Stage }) {
  return (
    <div className="flex items-center gap-1.5">
      {STAGES.map((s, i) => {
        const state = stageState(s.id, current)
        return (
          <span key={s.id} className="flex items-center gap-1.5">
            <span
              className={[
                'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] uppercase tracking-wide',
                state === 'done' && 'bg-navy-50 text-navy-700',
                state === 'current' && 'bg-gold-500 text-white',
                state === 'error' && 'bg-red-100 text-red-700',
                state === 'pending' && 'bg-slate-100 text-slate-500',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {state === 'current' && <Spinner size={10} />}
              {s.label}
            </span>
            {i < STAGES.length - 1 && <span className="text-slate-400">→</span>}
          </span>
        )
      })}
    </div>
  )
}
