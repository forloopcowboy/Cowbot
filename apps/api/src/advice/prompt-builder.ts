import type { HoldingRow } from '@investment-plan/shared';
import type { MarketSnapshot, MarketSnapshotRow } from './types';

export interface AnonymousHoldingInput {
  ticker: string;
  quantity: number;
  currency?: string;
  assetClass?: string;
}

export interface PromptInputs {
  marketSnapshot: MarketSnapshot;
  profileYaml?: string;
  holdings?: HoldingRow[];
  anonymousHoldings?: AnonymousHoldingInput[];
  userPrompt: string;
}

export interface BuiltPrompt {
  system: string;
  userMessage: string;
}

export const ADVICE_SYSTEM_PROMPT =
  'You are an expert investor giving a 5-minute investment advice talk to someone with potentially very limited knowledge of investment or finance. ' +
  'Be plain-spoken, concrete, and honest about uncertainty. Surface risks clearly. ' +
  'Do not give regulated personalised financial advice — frame everything as educational and general, considering several disclaimers already warn the user of risks.' +
  'Keep the response under 600 words unless the user asks for depth. ' +
  'When you reference numbers from the market snapshot, cite them by label (e.g. "the S&P 500 is up 0.8% today").';

export function buildPrompt(input: PromptInputs): BuiltPrompt {
  const sections: string[] = [];
  sections.push(renderHeader(input.marketSnapshot));
  sections.push(renderMarketSnapshot(input.marketSnapshot));
  sections.push(renderProfile(input.profileYaml));
  sections.push(renderHoldings(input.holdings, input.anonymousHoldings));
  sections.push(renderUserPrompt(input.userPrompt));

  return {
    system: ADVICE_SYSTEM_PROMPT,
    userMessage: sections.join('\n\n'),
  };
}

function renderHeader(snapshot: MarketSnapshot): string {
  const fetched = new Date(snapshot.asOf);
  const today = fetched.toISOString().slice(0, 10);
  const time = fetched.toISOString().slice(11, 16);
  return `Today is ${today} UTC. Market snapshot fetched at ${time} UTC (cached up to 1 hour).`;
}

function renderMarketSnapshot(snapshot: MarketSnapshot): string {
  const groups: Array<{ title: string; rows: MarketSnapshotRow[] }> = [
    { title: 'Equity indices', rows: snapshot.rows.filter((r) => r.category === 'index') },
    { title: 'FX rates', rows: snapshot.rows.filter((r) => r.category === 'fx') },
    { title: 'Rates & commodities', rows: snapshot.rows.filter((r) => r.category === 'rate' || r.category === 'commodity') },
    { title: 'US stocks (USD)', rows: snapshot.rows.filter((r) => r.category === 'stock' && r.market === 'US') },
    { title: 'European stocks (EUR)', rows: snapshot.rows.filter((r) => r.category === 'stock' && r.market === 'EU') },
    { title: 'Brazilian stocks (BRL)', rows: snapshot.rows.filter((r) => r.category === 'stock' && r.market === 'BR') },
  ];

  const parts: string[] = ['## Market snapshot'];
  for (const group of groups) {
    if (group.rows.length === 0) continue;
    parts.push(`### ${group.title}`);
    parts.push('| Instrument | Symbol | Price | Day change | Currency |');
    parts.push('|---|---|---|---|---|');
    for (const r of group.rows) {
      parts.push(
        `| ${r.label} | \`${r.symbol}\` | ${fmtPrice(r.price)} | ${fmtPct(r.changePct)} | ${r.currency || '—'} |`,
      );
    }
  }

  if (snapshot.unresolvedSymbols.length > 0) {
    parts.push(
      `\n_Unresolved (could not fetch a quote — treat with caution): ${snapshot.unresolvedSymbols.join(', ')}._`,
    );
  }
  return parts.join('\n');
}

function renderProfile(profileYaml: string | undefined): string {
  if (!profileYaml || profileYaml.trim().length === 0) {
    return '## User profile\n\nThe user has not shared a saved investment profile.';
  }
  return ['## User profile', '', 'The user has a saved investment profile:', '', '```yaml', profileYaml.trim(), '```'].join('\n');
}

function renderHoldings(
  holdings: HoldingRow[] | undefined,
  anonymous: AnonymousHoldingInput[] | undefined,
): string {
  const normalized = normalizeHoldings(holdings, anonymous);
  if (normalized.length === 0) {
    return '## Holdings\n\nThe user has not shared any holdings.';
  }
  const lines: string[] = ['## Holdings', '', '| Ticker | Quantity | Currency | Asset class |', '|---|---|---|---|'];
  for (const h of normalized) {
    lines.push(`| ${h.ticker || '—'} | ${h.quantity ?? '—'} | ${h.currency || '—'} | ${h.assetClass || '—'} |`);
  }
  return lines.join('\n');
}

interface NormalizedHolding {
  ticker: string;
  quantity: number | string;
  currency: string;
  assetClass: string;
}

function normalizeHoldings(
  holdings: HoldingRow[] | undefined,
  anonymous: AnonymousHoldingInput[] | undefined,
): NormalizedHolding[] {
  const out: NormalizedHolding[] = [];
  if (holdings) {
    for (const h of holdings) {
      const ticker = pickString(h['ticker']) || pickString(h['instrument']);
      const quantity = pickNumberOrString(h['quantity']);
      const currency = pickString(h['currency']);
      const assetClass = pickString(h['asset_class']);
      if (!ticker && !quantity) continue;
      out.push({ ticker, quantity, currency, assetClass });
    }
  }
  if (anonymous) {
    for (const h of anonymous) {
      out.push({
        ticker: h.ticker,
        quantity: h.quantity,
        currency: h.currency ?? '',
        assetClass: h.assetClass ?? '',
      });
    }
  }
  return out;
}

function pickString(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return '';
}

function pickNumberOrString(v: unknown): number | string {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return v;
  return '';
}

function renderUserPrompt(userPrompt: string): string {
  return `## The user asked\n\n${userPrompt.trim()}`;
}

function fmtPrice(p: number | null): string {
  if (p === null || !Number.isFinite(p)) return '—';
  if (Math.abs(p) >= 100) return p.toFixed(2);
  if (Math.abs(p) >= 1) return p.toFixed(3);
  return p.toFixed(4);
}

function fmtPct(p: number | null): string {
  if (p === null || !Number.isFinite(p)) return '—';
  const sign = p > 0 ? '+' : '';
  return `${sign}${p.toFixed(2)}%`;
}
