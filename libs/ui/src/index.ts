export { ApiProvider, useApi } from './api-context';
export {
  ThemeProvider,
  useTheme,
  type Theme,
  type EffectiveTheme,
} from './theme-context';

export { default as logoUrl } from './assets/logo.svg';

export { default as ConsoleStream, type LogLine } from './components/ConsoleStream';
export { default as HoldingsTable, type HoldingRow } from './components/HoldingsTable';
export { default as LanguagePicker } from './components/LanguagePicker';
export { default as Layout } from './components/Layout';
export { default as LoadingProgress, type Stage } from './components/LoadingProgress';
export { default as Sidebar } from './components/Sidebar';
export { default as Sparkline } from './components/Sparkline';
export { default as Spinner } from './components/Spinner';
export { default as TickerSearcher } from './components/TickerSearcher';
export { default as ThemeToggle } from './components/ThemeToggle';
export {
  default as AuthScreen,
  type AuthMode,
  type AuthScreenProps,
} from './components/AuthScreen';
export {
  default as CowbotPrompt,
  type CowbotPromptProps,
  type QuickAdviceRequest,
  type QuickAdviceHandlers,
  type StreamQuickAdvice,
} from './components/CowbotPrompt';
export {
  default as AdviceList,
  type AdviceListProps,
} from './components/AdviceList';

export { default as AdviceDetail } from './pages/AdviceDetail';
export { default as AppHome } from './pages/AppHome';
export { default as AskCowbot } from './pages/AskCowbot';
export { default as Holdings } from './pages/Holdings';
export { default as ProfilePicker } from './pages/ProfilePicker';
export { default as ProfileWizard } from './pages/ProfileWizard';
export { default as Reports } from './pages/Reports';
export { default as ReportView } from './pages/ReportView';
export { default as Settings, formatModel } from './pages/Settings';

export * from './lib/markdown';
export * from './lib/profileTemplate';
