import { app, BrowserWindow, Menu, ipcMain, safeStorage, shell } from 'electron'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

process.env.APP_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL
const RENDERER_DIST = path.join(process.env.APP_ROOT!, 'dist')
const MAIN_DIST = path.join(process.env.APP_ROOT!, 'dist-electron')

// In dev: project root is one level above desktop/.
// In packaged: profiles live in userData; the bundled "seed" profile ships under resources/seed/.
function projectRoot(): string {
  return app.isPackaged ? app.getPath('userData') : path.resolve(process.env.APP_ROOT!, '..')
}
function profilesDir(): string {
  const dir = path.join(projectRoot(), 'profiles')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}
function profileDir(name: string): string {
  return path.join(profilesDir(), name)
}
function reportsDir(name: string): string {
  return path.join(profileDir(name), 'reports')
}

function ensureSeedProfile() {
  const target = path.join(profilesDir(), 'default')
  if (existsSync(target)) return
  if (!app.isPackaged) return // dev: profiles/default already in repo
  const seed = path.join(process.resourcesPath, 'seed', 'default')
  if (existsSync(seed)) cpSync(seed, target, { recursive: true })
}

function pythonCommand(): { cmd: string; argsPrefix: string[]; cwd: string } {
  if (app.isPackaged) {
    const py = path.join(process.resourcesPath, 'python', 'bin', 'python3')
    const scriptsDir = path.join(process.resourcesPath, 'scripts')
    return { cmd: py, argsPrefix: [], cwd: scriptsDir }
  }
  return {
    cmd: 'uv',
    argsPrefix: ['run', 'python'],
    cwd: path.resolve(process.env.APP_ROOT!, '..', 'scripts'),
  }
}

function loadEnvFromRoot(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  const envPath = path.join(projectRoot(), '.env')
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/i)
      if (!m) continue
      const v = m[2].replace(/^['"]|['"]$/g, '')
      if (env[m[1]] === undefined) env[m[1]] = v
    }
  }
  // User-set API key from Settings UI (encrypted at rest via safeStorage).
  if (env.ANTHROPIC_API_KEY === undefined || env.ANTHROPIC_API_KEY === '') {
    const stored = readStoredApiKey()
    if (stored) env.ANTHROPIC_API_KEY = stored
  }
  return env
}

// ------------------------------------------------------------
// Anthropic API key — stored encrypted in userData via safeStorage
// ------------------------------------------------------------
function apiKeyPath(): string {
  return path.join(app.getPath('userData'), 'anthropic-api-key.bin')
}

function readStoredApiKey(): string | null {
  const p = apiKeyPath()
  if (!existsSync(p)) return null
  try {
    const buf = readFileSync(p)
    if (!safeStorage.isEncryptionAvailable()) return null
    return safeStorage.decryptString(buf)
  } catch {
    return null
  }
}

function writeStoredApiKey(key: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS keychain unavailable; cannot securely store API key')
  }
  const enc = safeStorage.encryptString(key)
  writeFileSync(apiKeyPath(), enc)
}

function clearStoredApiKey(): void {
  const p = apiKeyPath()
  if (existsSync(p)) rmSync(p)
}

let mainWindow: BrowserWindow | null = null

function createWindow() {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(process.env.APP_ROOT!, 'build', 'icon.png')
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    title: 'Cowboy Investor',
    icon: iconPath,
    backgroundColor: '#f8fafc',
    resizable: true,
    movable: true,
    maximizable: true,
    minimizable: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 12 },
    webPreferences: {
      preload: path.join(MAIN_DIST, 'preload.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

function buildAppMenu() {
  const isMac = process.platform === 'darwin'
  const openUserData = {
    label: 'Open User Data Folder',
    accelerator: isMac ? 'Cmd+Shift+O' : 'Ctrl+Shift+O',
    click: () => {
      shell.openPath(projectRoot())
    },
  }
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [{ role: 'appMenu' as const }]
      : []),
    {
      label: 'File',
      submenu: [
        openUserData,
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ] as Electron.MenuItemConstructorOptions[],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(() => {
  ensureSeedProfile()
  buildAppMenu()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ============================================================
// IPC
// ============================================================

ipcMain.handle('settings:hasApiKey', async () => readStoredApiKey() !== null)

ipcMain.handle('settings:setApiKey', async (_e, key: string) => {
  const trimmed = String(key ?? '').trim()
  if (!trimmed) throw new Error('API key cannot be empty')
  writeStoredApiKey(trimmed)
})

ipcMain.handle('settings:clearApiKey', async () => {
  clearStoredApiKey()
})

ipcMain.handle('profiles:list', async () => {
  const dir = profilesDir()
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
})

const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,30}$/i

ipcMain.handle('profiles:create', async (_e, name: string, cloneFrom?: string) => {
  if (!NAME_RE.test(name)) {
    throw new Error('Profile name must be 1–31 chars, alphanumeric/-/_')
  }
  const target = profileDir(name)
  if (existsSync(target)) throw new Error(`Profile '${name}' already exists`)
  if (cloneFrom) {
    const src = profileDir(cloneFrom)
    if (!existsSync(src)) throw new Error(`Source profile '${cloneFrom}' not found`)
    cpSync(src, target, { recursive: true })
    rmSync(path.join(target, 'reports'), { recursive: true, force: true })
    mkdirSync(path.join(target, 'reports'), { recursive: true })
    for (const f of ['.context.json', '.context.md']) {
      const p = path.join(target, f)
      if (existsSync(p)) rmSync(p)
    }
  } else {
    mkdirSync(path.join(target, 'reports'), { recursive: true })
    writeFileSync(path.join(target, 'profile.yaml'), '# new profile\n', 'utf8')
    writeFileSync(
      path.join(target, 'holdings.csv'),
      'account,instrument,ticker,isin,quantity,avg_cost,currency,asset_class,notes\n',
      'utf8',
    )
  }
})

ipcMain.handle(
  'profiles:createFromWizard',
  async (_e, name: string, profileYaml: string, holdingsCsv: string) => {
    if (!NAME_RE.test(name)) {
      throw new Error('Profile name must be 1–31 chars, alphanumeric/-/_')
    }
    const target = profileDir(name)
    if (existsSync(target)) throw new Error(`Profile '${name}' already exists`)
    mkdirSync(path.join(target, 'reports'), { recursive: true })
    writeFileSync(path.join(target, 'profile.yaml'), profileYaml, 'utf8')
    writeFileSync(path.join(target, 'holdings.csv'), holdingsCsv, 'utf8')
  },
)

ipcMain.handle('profile:readYaml', async (_e, name: string) =>
  readFileSync(path.join(profileDir(name), 'profile.yaml'), 'utf8'),
)

ipcMain.handle('profile:writeYaml', async (_e, name: string, text: string) => {
  writeFileSync(path.join(profileDir(name), 'profile.yaml'), text, 'utf8')
})

ipcMain.handle('profile:readHoldings', async (_e, name: string) => {
  const Papa = (await import('papaparse')).default
  const text = readFileSync(path.join(profileDir(name), 'holdings.csv'), 'utf8')
  return Papa.parse(text, { header: true, skipEmptyLines: true }).data
})

ipcMain.handle('profile:parseHoldingsCsv', async (_e, _name: string, csvText: string) => {
  const Papa = (await import('papaparse')).default
  const result = Papa.parse(String(csvText ?? ''), {
    header: true,
    skipEmptyLines: true,
  })
  // Tolerate PapaParse warnings (e.g. trailing quote on multiline fields) when
  // any rows were produced — mirrors the lenient `profile:readHoldings` path.
  if (result.data.length === 0 && result.errors.length > 0) {
    throw new Error(`holdings.csv parse error: ${result.errors[0].message}`)
  }
  return result.data
})

ipcMain.handle(
  'profile:writeHoldings',
  async (_e, name: string, rows: Record<string, unknown>[]) => {
    const Papa = (await import('papaparse')).default
    const cols = [
      'account',
      'instrument',
      'ticker',
      'isin',
      'quantity',
      'avg_cost',
      'currency',
      'asset_class',
      'notes',
    ]
    const csv = Papa.unparse(rows, { columns: cols })
    writeFileSync(path.join(profileDir(name), 'holdings.csv'), csv + '\n', 'utf8')
  },
)

ipcMain.handle('reports:list', async (_e, name: string) => {
  const dir = reportsDir(name)
  if (!existsSync(dir)) return []
  const stems = new Set<string>()
  for (const f of readdirSync(dir)) {
    if (f.endsWith('.md') || f.endsWith('.pdf')) stems.add(f.replace(/\.(md|pdf)$/, ''))
  }
  return [...stems]
    .map((stem) => {
      const md = path.join(dir, `${stem}.md`)
      const pdf = path.join(dir, `${stem}.pdf`)
      const hasMd = existsSync(md)
      const hasPdf = existsSync(pdf)
      const stat = hasMd ? statSync(md) : statSync(pdf)
      const sizeKb = (hasPdf ? statSync(pdf).size : stat.size) / 1024
      return {
        stem,
        hasMd,
        hasPdf,
        mdPath: hasMd ? md : undefined,
        pdfPath: hasPdf ? pdf : undefined,
        mtime: stat.mtimeMs,
        sizeKb,
      }
    })
    .sort((a, b) => b.stem.localeCompare(a.stem))
})

function streamCommand(args: string[]): Promise<{ code: number }> {
  const { cmd, argsPrefix, cwd } = pythonCommand()
  const env = loadEnvFromRoot()
  env.INVPLAN_ROOT = projectRoot()
  const child = spawn(cmd, [...argsPrefix, ...args], { cwd, env })
  return new Promise((resolve) => {
    child.stdout?.on('data', (chunk: Buffer) =>
      mainWindow?.webContents.send('script:log', { stream: 'stdout', text: chunk.toString() }),
    )
    child.stderr?.on('data', (chunk: Buffer) =>
      mainWindow?.webContents.send('script:log', { stream: 'stderr', text: chunk.toString() }),
    )
    child.on('error', (err) => {
      mainWindow?.webContents.send('script:log', {
        stream: 'stderr',
        text: `[spawn error] ${err.message}\n`,
      })
      resolve({ code: -1 })
    })
    child.on('close', (code) => resolve({ code: code ?? -1 }))
  })
}

ipcMain.handle('script:run', async (_e, name: string, kind: 'context' | 'report') => {
  const script = kind === 'context' ? 'build_context.py' : 'generate_report.py'
  return streamCommand([script, '--profile', name])
})

ipcMain.handle('context:hasCache', async (_e, name: string) => {
  return existsSync(path.join(profileDir(name), '.context.json'))
})

const CUSTOM_TEXT_MAX = 4000
const TEMPLATE_PLACEHOLDER_RE = /\{\{[^}]*\}\}/g

ipcMain.handle(
  'script:run:custom',
  async (_e, name: string, userText: string, rebuildContext: boolean) => {
    const sanitized = String(userText ?? '')
      .replace(TEMPLATE_PLACEHOLDER_RE, '')
      .slice(0, CUSTOM_TEXT_MAX)
      .trim()
    if (!sanitized) {
      throw new Error('Custom report requires non-empty considerations text')
    }
    const id = randomBytes(4).toString('hex')
    const today = new Date()
    const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const stem = `${name}-${ymd}-custom-${id}`

    const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'invplan-custom-'))
    const tmpFile = path.join(tmpDir, 'considerations.txt')
    try {
      writeFileSync(tmpFile, sanitized, 'utf8')
      if (rebuildContext) {
        const ctxResult = await streamCommand(['build_context.py', '--profile', name])
        if (ctxResult.code !== 0) {
          return { code: ctxResult.code, stem }
        }
      }
      const result = await streamCommand([
        'generate_report.py',
        '--profile',
        name,
        '--user-considerations-file',
        tmpFile,
        '--custom-id',
        id,
      ])
      return { code: result.code, stem }
    } finally {
      try {
        rmSync(tmpDir, { recursive: true, force: true })
      } catch {
        /* best effort */
      }
    }
  },
)

ipcMain.handle('shell:openPath', async (_e, absPath: string) => shell.openPath(absPath))

// ------------------------------------------------------------
// Market data — Yahoo Finance (unofficial)
// ------------------------------------------------------------
const YAHOO_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

type CacheEntry<T> = { value: T; expiresAt: number }
const marketCache = new Map<string, CacheEntry<unknown>>()
const QUOTE_TTL_MS = 60_000
const CANDLES_TTL_MS = 12 * 60 * 60 * 1000

function cacheGet<T>(key: string): T | null {
  const hit = marketCache.get(key)
  if (!hit) return null
  if (hit.expiresAt < Date.now()) {
    marketCache.delete(key)
    return null
  }
  return hit.value as T
}
function cacheSet<T>(key: string, value: T, ttlMs: number) {
  marketCache.set(key, { value, expiresAt: Date.now() + ttlMs })
  if (marketCache.size > 256) {
    const firstKey = marketCache.keys().next().value
    if (firstKey !== undefined) marketCache.delete(firstKey)
  }
}

async function yahooFetch(url: string): Promise<unknown> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 5000)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': YAHOO_UA, Accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`)
    return await res.json()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(msg.includes('aborted') ? 'Request timed out' : `Yahoo fetch failed: ${msg}`)
  } finally {
    clearTimeout(timer)
  }
}

const SYMBOL_RE = /^[A-Z0-9.\-=^]+$/i

ipcMain.handle('market:search', async (_e, query: string) => {
  const q = String(query ?? '').trim()
  if (!q) return []
  const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0`
  const data = (await yahooFetch(url)) as {
    quotes?: Array<{
      symbol?: string
      shortname?: string
      longname?: string
      exchDisp?: string
      typeDisp?: string
      quoteType?: string
    }>
  }
  const quotes = data.quotes ?? []
  return quotes
    .filter((q) => typeof q.symbol === 'string' && q.symbol.length > 0)
    .map((q) => ({
      symbol: q.symbol as string,
      shortname: q.shortname ?? q.longname ?? '',
      longname: q.longname ?? '',
      exchange: q.exchDisp ?? '',
      type: q.typeDisp ?? q.quoteType ?? '',
    }))
})

type ChartResponse = {
  chart?: {
    result?: Array<{
      meta?: {
        symbol?: string
        regularMarketPrice?: number
        chartPreviousClose?: number
        previousClose?: number
        currency?: string
      }
      timestamp?: number[]
      indicators?: { quote?: Array<{ close?: Array<number | null> }> }
    }>
    error?: { description?: string } | null
  }
}

ipcMain.handle('market:quote', async (_e, symbol: string) => {
  const s = String(symbol ?? '').trim()
  if (!s || !SYMBOL_RE.test(s)) throw new Error(`Invalid symbol: ${s}`)
  const cacheKey = `quote:${s}`
  const cached = cacheGet<unknown>(cacheKey)
  if (cached) return cached
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?interval=1d&range=5d`
  const data = (await yahooFetch(url)) as ChartResponse
  const result = data.chart?.result?.[0]
  if (!result || !result.meta) {
    if (data.chart?.error) throw new Error(data.chart.error.description ?? 'No data')
    throw new Error('No data')
  }
  const meta = result.meta
  const price = meta.regularMarketPrice ?? null
  const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? null
  const changePct =
    price !== null && prevClose !== null && prevClose !== 0
      ? ((price - prevClose) / prevClose) * 100
      : null
  const quote = {
    symbol: meta.symbol ?? s,
    price,
    prevClose,
    currency: meta.currency ?? '',
    changePct,
  }
  cacheSet(cacheKey, quote, QUOTE_TTL_MS)
  return quote
})

ipcMain.handle('market:candles', async (_e, symbol: string) => {
  const s = String(symbol ?? '').trim()
  if (!s || !SYMBOL_RE.test(s)) throw new Error(`Invalid symbol: ${s}`)
  const cacheKey = `candles:${s}`
  const cached = cacheGet<unknown>(cacheKey)
  if (cached) return cached
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?interval=1wk&range=1y`
  const data = (await yahooFetch(url)) as ChartResponse
  const result = data.chart?.result?.[0]
  if (!result) {
    if (data.chart?.error) throw new Error(data.chart.error.description ?? 'No data')
    throw new Error('No data')
  }
  const ts = result.timestamp ?? []
  const closes = result.indicators?.quote?.[0]?.close ?? []
  const points: Array<{ t: number; c: number }> = []
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i]
    if (typeof c === 'number' && Number.isFinite(c)) points.push({ t: ts[i], c })
  }
  const out = { symbol: result.meta?.symbol ?? s, points }
  cacheSet(cacheKey, out, CANDLES_TTL_MS)
  return out
})

ipcMain.handle('reports:readMd', async (_e, name: string, stem: string) => {
  const p = path.join(reportsDir(name), `${stem}.md`)
  if (!existsSync(p)) throw new Error(`Markdown not found: ${p}`)
  return readFileSync(p, 'utf8')
})

// ------------------------------------------------------------
// PDF rendering via hidden BrowserWindow + Chromium printToPDF
// ------------------------------------------------------------
function loadReportCss(): string {
  const candidates = [
    path.join(process.env.APP_ROOT!, 'electron', 'report-template.css'),
    path.join(MAIN_DIST, 'report-template.css'),
    path.join(process.resourcesPath || '', 'electron', 'report-template.css'),
  ]
  for (const c of candidates) {
    try {
      return readFileSync(c, 'utf8')
    } catch {
      /* try next */
    }
  }
  return ''
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )
}

ipcMain.handle('pdf:render', async (_e, name: string, mdRelPath: string) => {
  const { marked } = await import('marked')
  const mdAbs = path.isAbsolute(mdRelPath) ? mdRelPath : path.join(reportsDir(name), mdRelPath)
  if (!existsSync(mdAbs)) throw new Error(`Markdown not found: ${mdAbs}`)
  const mdText = readFileSync(mdAbs, 'utf8')
  // Escape stray single tildes so "~80%" doesn't get strikethrough'd by GFM.
  const mdSafe = mdText.replace(/(?<!~)~(?!~)/g, '\\~')
  const titleMatch = mdText.match(/^#\s+(.+)$/m)
  const title = titleMatch
    ? titleMatch[1].trim()
    : `Investment Report — ${path.basename(mdAbs, '.md')}`
  const today = new Date().toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'long',
    day: '2-digit',
  })
  const bodyHtml = await marked.parse(mdSafe)
  const css = loadReportCss()
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${css}</style></head>
<body>
  <header class="cover">
    <div class="eyebrow">Personal Portfolio · Monthly Report</div>
    <h1 class="title">${escapeHtml(title)}</h1>
    <div class="meta">Prepared <strong>${escapeHtml(today)}</strong></div>
  </header>
  <main>${bodyHtml}</main>
  <p class="disclaimer">Personal investment notes generated by an automated advisor prompt. Not financial advice. Verify all figures and account details before acting. Past performance does not guarantee future results.</p>
</body></html>`

  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } })
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  await new Promise((r) => setTimeout(r, 120))
  const pdfBuffer = await win.webContents.printToPDF({
    pageSize: 'A4',
    printBackground: true,
    margins: { top: 0.866, bottom: 0.945, left: 0.708, right: 0.708 },
    displayHeaderFooter: true,
    headerTemplate: `<div style="font-family:Georgia,serif;font-size:9px;color:#6b7280;width:100%;padding:0 18mm;display:flex;justify-content:space-between;border-bottom:0.4pt solid #c7a44a;padding-bottom:4pt;"><span class="title"></span><span>Confidential — Personal</span></div>`,
    footerTemplate: `<div style="font-family:Georgia,serif;font-size:8.5px;color:#6b7280;width:100%;padding:0 18mm;display:flex;justify-content:space-between;"><span>Generated ${escapeHtml(today)}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
  })
  win.close()
  const pdfAbs = mdAbs.replace(/\.md$/, '.pdf')
  writeFileSync(pdfAbs, pdfBuffer)
  return { pdfPath: pdfAbs }
})
