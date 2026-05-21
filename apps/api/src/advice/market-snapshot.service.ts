import { Inject, Injectable, Logger } from '@nestjs/common';
import { Kysely, sql } from 'kysely';

import { KYSELY } from '../db/kysely.provider';
import type { DB } from '../db/schema';
import { MarketService } from '../market/market.service';
import type { MarketSnapshot, MarketSnapshotRow } from './types';

const SNAPSHOT_KEY = 'global';
const TTL_MS = 60 * 60 * 1000;

interface SymbolSpec {
  symbol: string;
  label: string;
  category: MarketSnapshotRow['category'];
  market: MarketSnapshotRow['market'];
  fallbackCurrency: string;
}

const SYMBOLS: readonly SymbolSpec[] = [
  { symbol: '^GSPC', label: 'S&P 500', category: 'index', market: 'US', fallbackCurrency: 'USD' },
  { symbol: '^STOXX50E', label: 'Euro Stoxx 50', category: 'index', market: 'EU', fallbackCurrency: 'EUR' },
  { symbol: '^BVSP', label: 'Ibovespa', category: 'index', market: 'BR', fallbackCurrency: 'BRL' },
  { symbol: 'EURUSD=X', label: 'EUR/USD', category: 'fx', market: 'global', fallbackCurrency: '' },
  { symbol: 'EURBRL=X', label: 'EUR/BRL', category: 'fx', market: 'global', fallbackCurrency: '' },
  { symbol: 'USDBRL=X', label: 'USD/BRL', category: 'fx', market: 'global', fallbackCurrency: '' },
  { symbol: '^TNX', label: 'US 10Y Treasury yield', category: 'rate', market: 'US', fallbackCurrency: '%' },
  { symbol: 'GC=F', label: 'Gold (front-month future)', category: 'commodity', market: 'global', fallbackCurrency: 'USD' },
  { symbol: 'AAPL', label: 'Apple', category: 'stock', market: 'US', fallbackCurrency: 'USD' },
  { symbol: 'MSFT', label: 'Microsoft', category: 'stock', market: 'US', fallbackCurrency: 'USD' },
  { symbol: 'NVDA', label: 'NVIDIA', category: 'stock', market: 'US', fallbackCurrency: 'USD' },
  { symbol: 'GOOGL', label: 'Alphabet (Class A)', category: 'stock', market: 'US', fallbackCurrency: 'USD' },
  { symbol: 'AMZN', label: 'Amazon', category: 'stock', market: 'US', fallbackCurrency: 'USD' },
  { symbol: 'ASML.AS', label: 'ASML', category: 'stock', market: 'EU', fallbackCurrency: 'EUR' },
  { symbol: 'MC.PA', label: 'LVMH', category: 'stock', market: 'EU', fallbackCurrency: 'EUR' },
  { symbol: 'SAP.DE', label: 'SAP', category: 'stock', market: 'EU', fallbackCurrency: 'EUR' },
  { symbol: 'SIE.DE', label: 'Siemens', category: 'stock', market: 'EU', fallbackCurrency: 'EUR' },
  { symbol: 'VALE3.SA', label: 'Vale', category: 'stock', market: 'BR', fallbackCurrency: 'BRL' },
  { symbol: 'PETR4.SA', label: 'Petrobras (PN)', category: 'stock', market: 'BR', fallbackCurrency: 'BRL' },
  { symbol: 'ITUB4.SA', label: 'Itaú Unibanco (PN)', category: 'stock', market: 'BR', fallbackCurrency: 'BRL' },
  { symbol: 'WEGE3.SA', label: 'WEG', category: 'stock', market: 'BR', fallbackCurrency: 'BRL' },
];

@Injectable()
export class MarketSnapshotService {
  private readonly logger = new Logger(MarketSnapshotService.name);
  private inflight: Promise<MarketSnapshot> | null = null;

  constructor(
    @Inject(KYSELY) private readonly db: Kysely<DB>,
    private readonly market: MarketService,
  ) {}

  async get(): Promise<MarketSnapshot> {
    const { snapshot } = await this.getWithMeta();
    return snapshot;
  }

  async getWithMeta(): Promise<{ snapshot: MarketSnapshot; createdAt: Date }> {
    const cached = await this.readCached();
    if (cached && Date.now() - cached.createdAt.getTime() < TTL_MS) {
      this.logger.debug('snapshot cache hit');
      return cached;
    }

    if (this.inflight) {
      const snapshot = await this.inflight;
      const fresh = await this.readCached();
      return fresh ?? { snapshot, createdAt: new Date() };
    }

    this.inflight = (async () => {
      try {
        const fresh = await this.build();
        await this.persist(fresh);
        return fresh;
      } catch (err) {
        if (cached) {
          this.logger.warn(
            `snapshot rebuild failed (${(err as Error).message}); serving stale cache from ${cached.createdAt.toISOString()}`,
          );
          return cached.snapshot;
        }
        throw err;
      } finally {
        this.inflight = null;
      }
    })();

    const snapshot = await this.inflight;
    const refreshed = await this.readCached();
    return refreshed ?? { snapshot, createdAt: new Date() };
  }

  private async readCached(): Promise<{ snapshot: MarketSnapshot; createdAt: Date } | null> {
    const row = await this.db
      .selectFrom('market_snapshots')
      .select(['payload', 'created_at'])
      .where('key', '=', SNAPSHOT_KEY)
      .executeTakeFirst();
    if (!row) return null;
    return {
      snapshot: row.payload as unknown as MarketSnapshot,
      createdAt: row.created_at,
    };
  }

  private async build(): Promise<MarketSnapshot> {
    const settled = await Promise.allSettled(
      SYMBOLS.map(async (spec) => {
        const q = await this.market.quote(spec.symbol);
        return { spec, quote: q };
      }),
    );

    const rows: MarketSnapshotRow[] = [];
    const unresolved: string[] = [];
    for (let i = 0; i < settled.length; i++) {
      const result = settled[i];
      const spec = SYMBOLS[i];
      if (result.status === 'fulfilled') {
        const { quote } = result.value;
        rows.push({
          symbol: spec.symbol,
          label: spec.label,
          category: spec.category,
          market: spec.market,
          price: quote.price,
          changePct: quote.changePct,
          currency: quote.currency || spec.fallbackCurrency,
        });
      } else {
        this.logger.warn(
          `snapshot: ${spec.symbol} (${spec.label}) failed — ${(result.reason as Error)?.message ?? 'unknown'}`,
        );
        unresolved.push(spec.symbol);
      }
    }

    if (rows.length === 0) {
      throw new Error('Market snapshot build failed: every upstream quote errored');
    }

    return {
      asOf: new Date().toISOString(),
      rows,
      unresolvedSymbols: unresolved,
    };
  }

  private async persist(snapshot: MarketSnapshot): Promise<void> {
    const payload = JSON.stringify(snapshot);
    await this.db
      .insertInto('market_snapshots')
      .values({ key: SNAPSHOT_KEY, payload })
      .onConflict((oc) =>
        oc.column('key').doUpdateSet({
          payload,
          created_at: sql`now()` as unknown as string,
        }),
      )
      .execute();
  }
}
