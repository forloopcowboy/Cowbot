import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { Observable, Subject } from 'rxjs';
import type { JobLogEvent } from '@investment-plan/shared';

type Stream = 'stdout' | 'stderr';

interface JobChannel {
  emitter: EventEmitter;
  buffer: JobLogEvent[];
  done: boolean;
  exitCode: number | null;
  // Carry partial trailing text (no terminating newline yet) until more
  // arrives. Keyed by stream so stdout/stderr can't corrupt each other.
  partial: Record<Stream, string>;
  // Cleaned, complete lines waiting to be flushed as a single batched event.
  pending: Record<Stream, string[]>;
  flushTimer: NodeJS.Timeout | null;
}

const FLUSH_MS = 120;

const ANSI_RE = /\x1b\[[0-9;]*m/g;
// Defense in depth: scripts/_ui.py now uses `console.print` so Rich no longer
// emits these, but other Rich users (or future callers) might. Strip them
// here so the SSE payload stays clean regardless of producer.
const RICH_TIME_RE = /^\[\d{1,2}:\d{2}:\d{2}\]\s*/;
const RICH_SRC_RE = /\s+[a-zA-Z_][\w./-]*\.py:\d+(?=\s|$)/g;

function cleanLine(raw: string): string {
  return raw
    .replace(ANSI_RE, '')
    .replace(RICH_TIME_RE, '')
    .replace(RICH_SRC_RE, '')
    .replace(/\s+$/, '');
}

/**
 * In-memory pub/sub for live script job output.
 *
 * Each job gets a channel that:
 *   - Buffers cleaned, line-bounded events (for SSE reconnect / replay)
 *   - Coalesces bursts of stdout/stderr into one debounced event per stream
 *   - Fires once when the job exits, after which subscribers should close
 *
 * Debouncing matters because reactive Python logs (Rich, status spinners,
 * tools that emit a flurry of small writes) would otherwise create a SSE
 * event per chunk, which the React UI re-parses on every event.
 */
@Injectable()
export class JobBus {
  private readonly channels = new Map<string, JobChannel>();

  open(jobId: string): void {
    if (this.channels.has(jobId)) return;
    this.channels.set(jobId, {
      emitter: new EventEmitter(),
      buffer: [],
      done: false,
      exitCode: null,
      partial: { stdout: '', stderr: '' },
      pending: { stdout: [], stderr: [] },
      flushTimer: null,
    });
  }

  push(jobId: string, evt: JobLogEvent): void {
    const ch = this.channels.get(jobId);
    if (!ch) return;
    const combined = ch.partial[evt.stream] + evt.text;
    const lastNl = combined.lastIndexOf('\n');
    if (lastNl < 0) {
      ch.partial[evt.stream] = combined;
    } else {
      const complete = combined.slice(0, lastNl);
      ch.partial[evt.stream] = combined.slice(lastNl + 1);
      for (const raw of complete.split('\n')) {
        const cleaned = cleanLine(raw);
        if (cleaned) ch.pending[evt.stream].push(cleaned);
      }
    }
    this.scheduleFlush(jobId);
  }

  close(jobId: string, exitCode: number): void {
    const ch = this.channels.get(jobId);
    if (!ch) return;
    // Drain any trailing partial line and pending lines before we mark done.
    if (ch.flushTimer) {
      clearTimeout(ch.flushTimer);
      ch.flushTimer = null;
    }
    for (const stream of ['stdout', 'stderr'] as const) {
      if (ch.partial[stream]) {
        const cleaned = cleanLine(ch.partial[stream]);
        if (cleaned) ch.pending[stream].push(cleaned);
        ch.partial[stream] = '';
      }
    }
    this.flushNow(ch);

    ch.done = true;
    ch.exitCode = exitCode;
    ch.emitter.emit('done', exitCode);
    // Keep the channel around for ~5 min so late SSE reconnects can replay
    setTimeout(() => this.channels.delete(jobId), 5 * 60 * 1000);
  }

  /** Stream past + future log lines for the given job. Completes when the job ends. */
  stream(jobId: string): Observable<{ event: 'log' | 'done'; data: JobLogEvent | { exitCode: number } }> {
    const ch = this.channels.get(jobId);
    const subject = new Subject<{ event: 'log' | 'done'; data: JobLogEvent | { exitCode: number } }>();

    if (!ch) {
      // Channel never opened or already evicted — close immediately
      queueMicrotask(() => subject.complete());
      return subject.asObservable();
    }

    // Replay buffered lines
    for (const line of ch.buffer) subject.next({ event: 'log', data: line });

    if (ch.done) {
      subject.next({ event: 'done', data: { exitCode: ch.exitCode ?? -1 } });
      queueMicrotask(() => subject.complete());
      return subject.asObservable();
    }

    const onLine = (line: JobLogEvent) => subject.next({ event: 'log', data: line });
    const onDone = (code: number) => {
      subject.next({ event: 'done', data: { exitCode: code } });
      subject.complete();
      ch.emitter.off('line', onLine);
      ch.emitter.off('done', onDone);
    };
    ch.emitter.on('line', onLine);
    ch.emitter.once('done', onDone);

    return subject.asObservable();
  }

  // ---- internals ------------------------------------------------------

  private scheduleFlush(jobId: string): void {
    const ch = this.channels.get(jobId);
    if (!ch || ch.flushTimer) return;
    ch.flushTimer = setTimeout(() => {
      const c = this.channels.get(jobId);
      if (!c) return;
      c.flushTimer = null;
      this.flushNow(c);
    }, FLUSH_MS);
  }

  private flushNow(ch: JobChannel): void {
    for (const stream of ['stdout', 'stderr'] as const) {
      const lines = ch.pending[stream];
      if (lines.length === 0) continue;
      const text = lines.join('\n') + '\n';
      ch.pending[stream] = [];
      const evt: JobLogEvent = { stream, text };
      ch.buffer.push(evt);
      ch.emitter.emit('line', evt);
    }
  }
}
