export interface MarketSnapshotRow {
  symbol: string;
  label: string;
  category: 'index' | 'fx' | 'rate' | 'commodity' | 'stock';
  market: 'US' | 'EU' | 'BR' | 'global';
  price: number | null;
  changePct: number | null;
  currency: string;
}

export interface MarketSnapshot {
  asOf: string;
  rows: MarketSnapshotRow[];
  unresolvedSymbols: string[];
}
