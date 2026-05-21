// HTTP client matching the shape of the Electron preload `Api` object
// (`desktop/electron/preload.ts`), so pages and components copied over from the
// desktop app keep working without changes.
//
// All requests go to `/api/v1/*` and rely on SuperTokens session cookies for auth.

import type {
  Advice,
  AdviceListPage,
  HoldingRow,
  InvestmentPlanApi,
  JobLogEvent,
  ListAdvicesOpts,
  ReportEntry,
  ScriptKind,
  TickerCandles,
  TickerQuote,
  TickerSearchResult,
} from '@investment-plan/shared';

// Re-export shared types so legacy imports like `import type { ReportEntry } from '../api'` keep working.
export type {
  Advice,
  AdviceListEntry,
  AdviceListPage,
  HoldingRow,
  JobLogEvent,
  ListAdvicesOpts,
  ReportEntry,
  TickerCandles,
  TickerQuote,
  TickerSearchResult,
} from '@investment-plan/shared';

// In dev VITE_API_ORIGIN is unset and we hit "/api/v1" — the vite proxy
// forwards to localhost:3000. In prod the build is configured with
// VITE_API_ORIGIN=https://api.invest.example.com so requests cross subdomains.
const API_ORIGIN = (import.meta.env.VITE_API_ORIGIN ?? '').replace(/\/$/, '');
const BASE = `${API_ORIGIN}/api/v1`;

// ---- low-level fetch helpers -------------------------------------------------

async function req(method: string, path: string, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  // Forward the real browser UA so server-side calls to upstream APIs (e.g. Yahoo)
  // can mirror real-user headers instead of a hardcoded server fingerprint.
  if (typeof navigator !== 'undefined' && navigator.userAgent) {
    headers['x-browser-user-agent'] = navigator.userAgent;
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok && res.status !== 204) {
    let detail = '';
    try {
      const j = await res.json();
      detail = j.message ?? JSON.stringify(j);
    } catch {
      detail = await res.text().catch(() => '');
    }
    throw new Error(detail || `HTTP ${res.status}`);
  }
  return res;
}

const getJson = <T,>(path: string): Promise<T> =>
  req('GET', path).then((r) => r.json() as Promise<T>);
const getText = (path: string): Promise<string> =>
  req('GET', path).then((r) => r.text());
const postJson = <T,>(path: string, body?: unknown): Promise<T> =>
  req('POST', path, body).then((r) => (r.status === 204 ? (undefined as T) : (r.json() as Promise<T>)));
const putVoid = (path: string, body?: unknown): Promise<void> =>
  req('PUT', path, body).then(() => undefined);
const delVoid = (path: string): Promise<void> => req('DELETE', path).then(() => undefined);

// ---- global script log fanout -----------------------------------------------
//
// The Electron API exposed a single `onScriptLog(cb)` callback that fired for
// any running job. We replicate that contract by maintaining a per-page set of
// listeners; each `runScript` / `runCustomReport` call subscribes to its job's
// SSE stream and dispatches lines to every registered listener.

const logListeners = new Set<(line: JobLogEvent) => void>();
const dispatchLog = (line: JobLogEvent) => {
  for (const cb of logListeners) cb(line);
};

function consumeJob(jobId: string): Promise<{ code: number }> {
  return new Promise((resolve) => {
    const source = new EventSource(`${BASE}/jobs/${jobId}/log`, { withCredentials: true });
    source.addEventListener('log', (ev) => {
      try {
        const payload = JSON.parse((ev as MessageEvent).data) as JobLogEvent;
        dispatchLog(payload);
      } catch {
        /* ignore malformed frame */
      }
    });
    source.addEventListener('done', (ev) => {
      try {
        const { exitCode } = JSON.parse((ev as MessageEvent).data) as { exitCode: number };
        source.close();
        resolve({ code: exitCode });
      } catch {
        source.close();
        resolve({ code: -1 });
      }
    });
    source.onerror = () => {
      source.close();
      resolve({ code: -1 });
    };
  });
}

// ---- /advice/quick SSE stream -----------------------------------------------
//
// `/advice/quick` is POST + SSE, which `EventSource` can't speak (GET-only).
// Use fetch + a ReadableStream reader and parse the `event:` / `data:` frames
// by hand. Returns an AbortController so callers can cancel mid-stream
// (e.g. user navigates away or fires a new question).

export interface QuickAdviceRequest {
  userPrompt: string;
  profileName?: string;
  anonymousHoldings?: Array<{
    ticker: string;
    quantity: number;
    currency?: string;
    assetClass?: string;
  }>;
}

export interface QuickAdviceHandlers {
  onCreated?: (adviceId: string) => void;
  onDelta?: (chunk: string) => void;
  onDone?: () => void;
  onError?: (message: string) => void;
}

export function streamQuickAdvice(
  body: QuickAdviceRequest,
  handlers: QuickAdviceHandlers,
): AbortController {
  const controller = new AbortController();
  void (async () => {
    try {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (typeof navigator !== 'undefined' && navigator.userAgent) {
        headers['x-browser-user-agent'] = navigator.userAgent;
      }
      const res = await fetch(`${BASE}/advice/quick`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        let detail = '';
        try {
          const j = await res.json();
          detail = j.message ?? JSON.stringify(j);
        } catch {
          detail = await res.text().catch(() => '');
        }
        handlers.onError?.(detail || `HTTP ${res.status}`);
        return;
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = '';
      let settled = false;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        // SSE frames are separated by a blank line.
        let sep: number;
        while ((sep = buf.indexOf('\n\n')) !== -1) {
          const frame = buf.slice(0, sep);
          buf = buf.slice(sep + 2);
          let evt = 'message';
          const dataLines: string[] = [];
          for (const line of frame.split('\n')) {
            if (line.startsWith('event:')) evt = line.slice(6).trim();
            else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
          }
          if (!dataLines.length) continue;
          let payload: { text?: string };
          try {
            payload = JSON.parse(dataLines.join('\n')) as { text?: string };
          } catch {
            continue;
          }
          const text = payload.text ?? '';
          if (evt === 'created') handlers.onCreated?.(text);
          else if (evt === 'delta') handlers.onDelta?.(text);
          else if (evt === 'done') {
            settled = true;
            handlers.onDone?.();
          } else if (evt === 'error') {
            settled = true;
            handlers.onError?.(text || 'stream error');
          }
        }
      }
      // Server closed the stream without emitting `done`/`error` — treat as done.
      if (!settled) handlers.onDone?.();
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') return;
      handlers.onError?.((err as Error).message ?? 'network error');
    }
  })();
  return controller;
}

// ---- the API surface --------------------------------------------------------

const impl: InvestmentPlanApi = {
  hasApiKey: () => getJson<{ hasKey: boolean }>('/settings/api-key').then((j) => j.hasKey),
  setApiKey: (key) => putVoid('/settings/api-key', { key }),
  clearApiKey: () => delVoid('/settings/api-key'),

  listProfiles: () => getJson<string[]>('/profiles'),
  createProfile: (name, cloneFrom) =>
    postJson<void>('/profiles', { name, cloneFrom }),
  createProfileFromWizard: (name, profileYaml, holdingsCsv) =>
    postJson<void>('/profiles/from-wizard', { name, profileYaml, holdingsCsv }),

  readProfileYaml: (name) => getText(`/profiles/${encodeURIComponent(name)}/yaml`),
  writeProfileYaml: (name, text) =>
    putVoid(`/profiles/${encodeURIComponent(name)}/yaml`, { text }),

  readHoldings: (name) =>
    getJson<HoldingRow[]>(`/profiles/${encodeURIComponent(name)}/holdings`),
  writeHoldings: (name, rows) =>
    putVoid(`/profiles/${encodeURIComponent(name)}/holdings`, { rows }),
  parseHoldingsCsv: (name, csvText) =>
    postJson<HoldingRow[]>(
      `/profiles/${encodeURIComponent(name)}/holdings/parse`,
      { csv: csvText },
    ),

  listReports: (name) =>
    getJson<ReportEntry[]>(`/profiles/${encodeURIComponent(name)}/reports`),
  readReportMd: (name, stem) =>
    getText(`/profiles/${encodeURIComponent(name)}/reports/${encodeURIComponent(stem)}`),

  runScript: async (name, kind: ScriptKind) => {
    const { jobId } = await postJson<{ jobId: string }>(
      `/profiles/${encodeURIComponent(name)}/scripts/${kind}`,
    );
    return consumeJob(jobId);
  },

  hasContextCache: (name) =>
    getJson<{ hasCache: boolean }>(
      `/profiles/${encodeURIComponent(name)}/context-cache`,
    ).then((j) => j.hasCache),

  runCustomReport: async (name, userText, rebuildContext) => {
    const { jobId, stem } = await postJson<{ jobId: string; stem: string }>(
      `/profiles/${encodeURIComponent(name)}/scripts/custom`,
      { userText, rebuildContext },
    );
    const { code } = await consumeJob(jobId);
    return { code, stem };
  },

  renderPdf: async (name, mdRelPath) => {
    const stem = mdRelPath.replace(/\.md$/, '');
    const url = `${BASE}/profiles/${encodeURIComponent(name)}/reports/${encodeURIComponent(stem)}.pdf`;
    // Pre-flight to trigger server-side render + cache. Returns the URL so the
    // UI can hand it to `openPath` (which now just opens it in a new tab).
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error(`PDF render failed: ${res.status}`);
    return { pdfPath: url };
  },

  openPath: async (absPath) => {
    window.open(absPath, '_blank', 'noopener,noreferrer');
    return absPath;
  },

  searchTickers: (q) =>
    getJson<TickerSearchResult[]>(`/market/search?q=${encodeURIComponent(q)}`),
  getQuote: (symbol) =>
    getJson<TickerQuote>(`/market/quote/${encodeURIComponent(symbol)}`),
  getCandles: (symbol) =>
    getJson<TickerCandles>(`/market/candles/${encodeURIComponent(symbol)}`),

  onScriptLog: (cb) => {
    logListeners.add(cb);
    return () => {
      logListeners.delete(cb);
    };
  },

  listAdvices: (opts?: ListAdvicesOpts) => {
    const params = new URLSearchParams();
    if (opts?.limit != null) params.set('limit', String(opts.limit));
    if (opts?.offset != null) params.set('offset', String(opts.offset));
    if (opts?.profileName) params.set('profileName', opts.profileName);
    const qs = params.toString();
    return getJson<AdviceListPage>(`/advices${qs ? `?${qs}` : ''}`);
  },
  getAdvice: (id: string) =>
    getJson<Advice>(`/advices/${encodeURIComponent(id)}`),
};

export const api = (): InvestmentPlanApi => impl;
