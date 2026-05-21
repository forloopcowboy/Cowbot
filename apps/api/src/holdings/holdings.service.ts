import { Inject, Injectable } from '@nestjs/common';
import { Kysely, type Insertable } from 'kysely';

import { KYSELY } from '../db/kysely.provider';
import type { DB } from '../db/schema';
import { ProfilesService } from '../profiles/profiles.service';
import { HOLDINGS_COLUMNS, parseHoldingsCsvText } from './csv';
import type { HoldingRow } from '@investment-plan/shared';

@Injectable()
export class HoldingsService {
  constructor(
    @Inject(KYSELY) private readonly db: Kysely<DB>,
    private readonly profiles: ProfilesService,
  ) {}

  async read(userId: string, profileName: string): Promise<HoldingRow[]> {
    const profileId = await this.profiles.getIdByName(userId, profileName);
    const rows = await this.db
      .selectFrom('holdings')
      .selectAll()
      .where('profile_id', '=', profileId)
      .orderBy('position', 'asc')
      .execute();

    return rows.map((r) => {
      const out: HoldingRow = {};
      for (const col of HOLDINGS_COLUMNS) {
        const val = (r as Record<string, unknown>)[col];
        if (val === null || val === undefined) out[col] = '';
        else out[col] = val as string | number;
      }
      if (r.extra && typeof r.extra === 'object') {
        for (const [k, v] of Object.entries(r.extra)) {
          if (typeof v === 'string' || typeof v === 'number') out[k] = v;
        }
      }
      return out;
    });
  }

  parseCsv(csv: string): HoldingRow[] {
    return parseHoldingsCsvText(csv);
  }

  async write(
    userId: string,
    profileName: string,
    rows: Record<string, string | number>[],
  ): Promise<void> {
    const profileId = await this.profiles.getIdByName(userId, profileName);

    await this.db.transaction().execute(async (trx) => {
      await trx.deleteFrom('holdings').where('profile_id', '=', profileId).execute();

      if (rows.length === 0) return;

      const insertable = rows
        .map((row, position) => this.normalize(profileId, position, row))
        .filter((r): r is NonNullable<typeof r> => r !== null);

      if (insertable.length > 0) {
        await trx.insertInto('holdings').values(insertable).execute();
      }
    });
  }

  private normalize(
    profileId: string,
    position: number,
    row: Record<string, string | number>,
  ): Insertable<DB['holdings']> | null {
    const known: Record<string, string> = {};
    const extra: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      if (v == null || v === '') continue;
      if ((HOLDINGS_COLUMNS as readonly string[]).includes(k)) known[k] = String(v);
      else extra[k] = v;
    }
    if (Object.keys(known).length === 0 && Object.keys(extra).length === 0) return null;

    const num = (s: string | undefined) =>
      s == null || s === '' ? null : Number(s);

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
}
