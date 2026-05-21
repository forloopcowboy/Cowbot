import { contextBridge, ipcRenderer } from 'electron'
import type {
  HoldingRow,
  InvestmentPlanApi,
  JobLogEvent,
  ReportEntry,
  ScriptKind,
  TickerCandles,
  TickerQuote,
  TickerSearchResult,
} from '@investment-plan/shared'

const api: InvestmentPlanApi = {
  hasApiKey: (): Promise<boolean> => ipcRenderer.invoke('settings:hasApiKey'),
  setApiKey: (key: string): Promise<void> => ipcRenderer.invoke('settings:setApiKey', key),
  clearApiKey: (): Promise<void> => ipcRenderer.invoke('settings:clearApiKey'),
  listProfiles: (): Promise<string[]> => ipcRenderer.invoke('profiles:list'),
  createProfile: (name: string, cloneFrom?: string): Promise<void> =>
    ipcRenderer.invoke('profiles:create', name, cloneFrom),
  createProfileFromWizard: (
    name: string,
    profileYaml: string,
    holdingsCsv: string,
  ): Promise<void> =>
    ipcRenderer.invoke('profiles:createFromWizard', name, profileYaml, holdingsCsv),
  readProfileYaml: (name: string): Promise<string> =>
    ipcRenderer.invoke('profile:readYaml', name),
  writeProfileYaml: (name: string, text: string): Promise<void> =>
    ipcRenderer.invoke('profile:writeYaml', name, text),
  readHoldings: (name: string): Promise<HoldingRow[]> =>
    ipcRenderer.invoke('profile:readHoldings', name),
  writeHoldings: (name: string, rows: HoldingRow[]): Promise<void> =>
    ipcRenderer.invoke('profile:writeHoldings', name, rows),
  parseHoldingsCsv: (name: string, csvText: string): Promise<HoldingRow[]> =>
    ipcRenderer.invoke('profile:parseHoldingsCsv', name, csvText),
  listReports: (name: string): Promise<ReportEntry[]> =>
    ipcRenderer.invoke('reports:list', name),
  readReportMd: (name: string, stem: string): Promise<string> =>
    ipcRenderer.invoke('reports:readMd', name, stem),
  runScript: (
    name: string,
    kind: ScriptKind,
  ): Promise<{ code: number }> => ipcRenderer.invoke('script:run', name, kind),
  hasContextCache: (name: string): Promise<boolean> =>
    ipcRenderer.invoke('context:hasCache', name),
  runCustomReport: (
    name: string,
    userText: string,
    rebuildContext: boolean,
  ): Promise<{ code: number; stem: string }> =>
    ipcRenderer.invoke('script:run:custom', name, userText, rebuildContext),
  renderPdf: (
    name: string,
    mdRelPath: string,
  ): Promise<{ pdfPath: string }> =>
    ipcRenderer.invoke('pdf:render', name, mdRelPath),
  openPath: (absPath: string): Promise<string> =>
    ipcRenderer.invoke('shell:openPath', absPath),
  searchTickers: (query: string): Promise<TickerSearchResult[]> =>
    ipcRenderer.invoke('market:search', query),
  getQuote: (symbol: string): Promise<TickerQuote> =>
    ipcRenderer.invoke('market:quote', symbol),
  getCandles: (symbol: string): Promise<TickerCandles> =>
    ipcRenderer.invoke('market:candles', symbol),
  onScriptLog: (cb: (line: JobLogEvent) => void) => {
    const listener = (_: unknown, payload: JobLogEvent) => cb(payload)
    ipcRenderer.on('script:log', listener)
    return (): void => {
      ipcRenderer.removeListener('script:log', listener)
    }
  },
}

contextBridge.exposeInMainWorld('api', api)

export type Api = InvestmentPlanApi
