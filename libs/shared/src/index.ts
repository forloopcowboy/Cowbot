// Shared types between the NestJS API (`apps/api`) and the React web app (`apps/web`).
// These mirror the IPC surface previously exposed by `desktop/electron/preload.ts`
// so the web client can keep the same call shapes as the Electron renderer.

export type HoldingRow = Record<string, string | number>;

export interface ReportEntry {
  stem: string;
  hasMd: boolean;
  hasPdf: boolean;
  mdPath?: string;
  pdfPath?: string;
  mtime: number;
  sizeKb: number;
}

export interface TickerSearchResult {
  symbol: string;
  shortname: string;
  longname: string;
  exchange: string;
  type: string;
}

export interface TickerQuote {
  symbol: string;
  price: number | null;
  prevClose: number | null;
  currency: string;
  changePct: number | null;
}

export interface TickerCandles {
  symbol: string;
  points: Array<{ t: number; c: number }>;
}

export interface ProfileSummary {
  name: string;
}

export interface WizardPayload {
  name: string;
  profileYaml: string;
  holdingsCsv: string;
}

export type ScriptKind = 'context' | 'report';

export type JobStatus = 'pending' | 'running' | 'succeeded' | 'failed';

export interface ScriptJob {
  id: string;
  profileName: string;
  kind: ScriptKind | 'custom';
  status: JobStatus;
  exitCode: number | null;
  startedAt: string;
  endedAt: string | null;
}

export interface JobLogEvent {
  stream: 'stdout' | 'stderr';
  text: string;
}

export interface AdviceListEntry {
  id: string;
  userPrompt: string;
  hasResponse: boolean;
  profileName: string | null;
  createdAt: string;
}

export interface Advice {
  id: string;
  userPrompt: string;
  responseText: string;
  profileName: string | null;
  createdAt: string;
  model: string;
}

export interface AdviceListPage {
  items: AdviceListEntry[];
  total: number;
  limit: number;
  offset: number;
}

export interface ListAdvicesOpts {
  limit?: number;
  offset?: number;
  profileName?: string;
}

// The full API contract — must stay structurally identical to
// `desktop/electron/preload.ts:Api` so React pages need zero changes.
export interface InvestmentPlanApi {
  hasApiKey(): Promise<boolean>;
  setApiKey(key: string): Promise<void>;
  clearApiKey(): Promise<void>;

  listProfiles(): Promise<string[]>;
  createProfile(name: string, cloneFrom?: string): Promise<void>;
  createProfileFromWizard(
    name: string,
    profileYaml: string,
    holdingsCsv: string,
  ): Promise<void>;

  readProfileYaml(name: string): Promise<string>;
  writeProfileYaml(name: string, text: string): Promise<void>;

  readHoldings(name: string): Promise<HoldingRow[]>;
  writeHoldings(name: string, rows: HoldingRow[]): Promise<void>;
  parseHoldingsCsv(name: string, csvText: string): Promise<HoldingRow[]>;

  listReports(name: string): Promise<ReportEntry[]>;
  readReportMd(name: string, stem: string): Promise<string>;

  runScript(name: string, kind: ScriptKind): Promise<{ code: number }>;
  hasContextCache(name: string): Promise<boolean>;
  runCustomReport(
    name: string,
    userText: string,
    rebuildContext: boolean,
  ): Promise<{ code: number; stem: string }>;

  renderPdf(name: string, mdRelPath: string): Promise<{ pdfPath: string }>;
  openPath(absPath: string): Promise<string>;

  searchTickers(query: string): Promise<TickerSearchResult[]>;
  getQuote(symbol: string): Promise<TickerQuote>;
  getCandles(symbol: string): Promise<TickerCandles>;

  onScriptLog(cb: (line: JobLogEvent) => void): () => void;

  // Advice history — web only for now; desktop omits these.
  listAdvices?(opts?: ListAdvicesOpts): Promise<AdviceListPage>;
  getAdvice?(id: string): Promise<Advice>;
}
