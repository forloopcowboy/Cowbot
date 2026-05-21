import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import YahooFinance from 'yahoo-finance2';
import type {
  TickerCandles,
  TickerQuote,
  TickerSearchResult,
} from '@investment-plan/shared';

// Silence the one-time "Yahoo Survey" stdout notice. Downgrade schema-validation
// errors to logs so a Yahoo response shape change doesn't crash quote/chart calls.
const yahooFinance = new YahooFinance({
  suppressNotices: ['yahooSurvey'],
  validation: { logErrors: true, logOptionsErrors: false },
});

const SYMBOL_RE = /^[A-Z0-9.\-=^]+$/i;
const QUOTE_TTL_MS = 5 * 60_000;
const CANDLES_TTL_MS = 12 * 60 * 60 * 1000;
const EMPTY_CANDLES_TTL_MS = 30 * 60_000;
const SEARCH_TTL_MS = 10 * 60_000;
const NEGATIVE_TTL_MS = 30_000;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

interface NegativeEntry {
  error: Error;
  expiresAt: number;
}

@Injectable()
export class MarketService {
  private readonly logger = new Logger(MarketService.name);
  private readonly cache = new Map<string, CacheEntry<unknown>>();
  private readonly negativeCache = new Map<string, NegativeEntry>();
  private readonly inflight = new Map<string, Promise<unknown>>();

  async search(query: string): Promise<TickerSearchResult[]> {
    const q = String(query ?? '').trim();
    if (!q) return [];
    const key = `search:${q.toLowerCase()}`;
    return this.withCache(key, SEARCH_TTL_MS, async () => {
      try {
        const data = await yahooFinance.search(q, { quotesCount: 10, newsCount: 0 });
        return (data.quotes ?? [])
          .filter((entry): entry is typeof entry & { symbol: string } =>
            typeof (entry as { symbol?: unknown }).symbol === 'string' &&
            ((entry as { symbol: string }).symbol).length > 0,
          )
          .map((entry) => {
            const e = entry as {
              symbol: string;
              shortname?: string;
              longname?: string;
              exchDisp?: string;
              exchange?: string;
              quoteType?: string;
              typeDisp?: string;
            };
            return {
              symbol: e.symbol,
              shortname: e.shortname ?? e.longname ?? '',
              longname: e.longname ?? e.shortname ?? '',
              exchange: e.exchDisp ?? e.exchange ?? '',
              type: e.quoteType ?? e.typeDisp ?? '',
            };
          });
      } catch (err) {
        this.logger.warn(`Yahoo search failed for ${q}: ${(err as Error).message}`);
        return [];
      }
    });
  }

  async quote(symbol: string): Promise<TickerQuote> {
    const s = this.normalizeSymbol(symbol);
    return this.withCache(`quote:${s}`, QUOTE_TTL_MS, async () => {
      let q: Awaited<ReturnType<typeof yahooFinance.quote>>;
      try {
        q = await yahooFinance.quote(s);
      } catch (err) {
        throw new InternalServerErrorException(
          `Yahoo quote failed for ${s}: ${(err as Error).message}`,
        );
      }
      if (!q || typeof q.regularMarketPrice !== 'number') {
        throw new InternalServerErrorException(`No data for ${s}`);
      }
      const price = q.regularMarketPrice;
      const prevClose =
        typeof q.regularMarketPreviousClose === 'number' ? q.regularMarketPreviousClose : null;
      const changePct =
        typeof q.regularMarketChangePercent === 'number'
          ? q.regularMarketChangePercent
          : prevClose !== null && prevClose !== 0
            ? ((price - prevClose) / prevClose) * 100
            : null;
      return {
        symbol: s,
        price,
        prevClose,
        currency: q.currency ?? '',
        changePct,
      };
    });
  }

  async candles(symbol: string): Promise<TickerCandles> {
    const s = this.normalizeSymbol(symbol);
    const cacheKey = `candles:${s}`;
    const hit = this.cache.get(cacheKey);
    if (hit && hit.expiresAt > Date.now()) return hit.value as TickerCandles;

    try {
      const now = new Date();
      const period1 = new Date(now.getTime() - 366 * 24 * 60 * 60 * 1000);
      const result = await yahooFinance.chart(s, {
        period1,
        period2: now,
        interval: '1wk',
      });
      const points: Array<{ t: number; c: number }> = [];
      for (const row of result.quotes ?? []) {
        const close = row.close;
        if (typeof close === 'number' && Number.isFinite(close) && row.date) {
          points.push({ t: Math.floor(new Date(row.date).getTime() / 1000), c: close });
        }
      }
      if (points.length === 0) {
        const value: TickerCandles = { symbol: s, points: [] };
        this.cache.set(cacheKey, { value, expiresAt: Date.now() + EMPTY_CANDLES_TTL_MS });
        return value;
      }
      const value: TickerCandles = { symbol: s, points };
      this.cache.set(cacheKey, { value, expiresAt: Date.now() + CANDLES_TTL_MS });
      return value;
    } catch (err) {
      this.logger.warn(`Yahoo chart failed for ${s}: ${(err as Error).message} — empty sparkline`);
      const value: TickerCandles = { symbol: s, points: [] };
      this.cache.set(cacheKey, { value, expiresAt: Date.now() + EMPTY_CANDLES_TTL_MS });
      return value;
    }
  }

  private normalizeSymbol(input: string): string {
    const s = String(input ?? '').trim();
    if (!s || !SYMBOL_RE.test(s)) {
      throw new BadRequestException(`Invalid symbol: ${s}`);
    }
    return s;
  }

  private async withCache<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.value as T;
    const neg = this.negativeCache.get(key);
    if (neg && neg.expiresAt > Date.now()) throw neg.error;

    const existing = this.inflight.get(key);
    if (existing) return existing as Promise<T>;

    const promise = (async () => {
      try {
        const value = await loader();
        this.cache.set(key, { value, expiresAt: Date.now() + ttlMs });
        this.negativeCache.delete(key);
        return value;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.negativeCache.set(key, { error, expiresAt: Date.now() + NEGATIVE_TTL_MS });
        throw error;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, promise);
    return promise;
  }
}
