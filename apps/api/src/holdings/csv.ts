import Papa from 'papaparse';
import type { Insertable } from 'kysely';

import type { DB } from '../db/schema';
import type { HoldingRow } from '@investment-plan/shared';

export const HOLDINGS_COLUMNS = [
  'account',
  'instrument',
  'ticker',
  'isin',
  'quantity',
  'avg_cost',
  'currency',
  'asset_class',
  'notes',
] as const;

const NUMERIC_COLUMNS = new Set(['quantity', 'avg_cost']);

export function csvRowToHolding(
  profileId: string,
  position: number,
  row: Record<string, string>,
): Insertable<DB['holdings']> | null {
  const trimmed = Object.fromEntries(
    Object.entries(row).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]),
  );
  if (Object.values(trimmed).every((v) => !v)) return null;

  const known: Record<string, string> = {};
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(trimmed)) {
    if ((HOLDINGS_COLUMNS as readonly string[]).includes(k)) known[k] = v;
    else if (v !== '' && v != null) extra[k] = v;
  }

  const num = (s: string | undefined) => (s == null || s === '' ? null : Number(s));

  return {
    profile_id: profileId,
    position,
    account: known.account ?? null,
    instrument: known.instrument ?? null,
    ticker: known.ticker ?? null,
    isin: known.isin ?? null,
    quantity: num(known.quantity),
    avg_cost: num(known.avg_cost),
    currency: known.currency ?? null,
    asset_class: known.asset_class ?? null,
    notes: known.notes ?? null,
    extra: Object.keys(extra).length > 0 ? JSON.stringify(extra) : null,
  };
}

// Parses CSV text into HoldingRow shape used by the React table — keeps numeric
// columns as numbers, drops empty rows, preserves extra columns as-is.
// Mirrors what `readHoldings` returns so uploaded rows are interchangeable with
// rows already in the in-memory table.
export function parseHoldingsCsvText(csv: string): HoldingRow[] {
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
  });
  // PapaParse emits warnings (e.g. quirky trailing quotes) but still returns
  // usable rows. Only fail when nothing parsed — matches the lenient behavior
  // of `readHoldings`, which already round-trips files with such warnings.
  if (parsed.data.length === 0 && parsed.errors.length > 0) {
    throw new Error(`holdings.csv parse error: ${parsed.errors[0].message}`);
  }
  const out: HoldingRow[] = [];
  for (const raw of parsed.data) {
    const trimmed = Object.fromEntries(
      Object.entries(raw).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]),
    );
    if (Object.values(trimmed).every((v) => !v)) continue;
    const row: HoldingRow = {};
    for (const [k, v] of Object.entries(trimmed)) {
      if (v == null || v === '') continue;
      if (NUMERIC_COLUMNS.has(k)) {
        const n = Number(v);
        row[k] = Number.isFinite(n) ? n : v;
      } else {
        row[k] = v;
      }
    }
    out.push(row);
  }
  return out;
}
