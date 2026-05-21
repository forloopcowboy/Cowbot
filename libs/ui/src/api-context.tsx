import { createContext, useContext, type ReactNode } from 'react';
import type { InvestmentPlanApi } from '@investment-plan/shared';

const ApiContext = createContext<InvestmentPlanApi | null>(null);

export function ApiProvider({
  value,
  children,
}: {
  value: InvestmentPlanApi;
  children: ReactNode;
}) {
  return <ApiContext.Provider value={value}>{children}</ApiContext.Provider>;
}

export function useApi(): InvestmentPlanApi {
  const ctx = useContext(ApiContext);
  if (!ctx) throw new Error('useApi must be used inside <ApiProvider>');
  return ctx;
}
