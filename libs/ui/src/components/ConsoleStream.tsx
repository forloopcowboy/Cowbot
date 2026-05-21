import { useEffect, useRef } from 'react'

export type LogLine = { stream: 'stdout' | 'stderr'; text: string }

export default function ConsoleStream({ lines }: { lines: LogLine[] }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight })
  }, [lines])
  // Strip ANSI escapes lazily for readability.
  const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '')
  return (
    <div
      ref={ref}
      className="font-mono text-xs bg-navy-900 text-slate-200 dark:bg-ink dark:text-slate-300 rounded-md p-3 h-72 overflow-y-auto whitespace-pre-wrap leading-relaxed"
    >
      {lines.length === 0 && (
        <span className="text-slate-500 dark:text-slate-400">Waiting for output…</span>
      )}
      {lines.map((l, i) => (
        <span key={i} className={l.stream === 'stderr' ? 'text-amber-300' : ''}>
          {stripAnsi(l.text)}
        </span>
      ))}
    </div>
  )
}
