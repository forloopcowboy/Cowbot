import { Inject, Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { Kysely } from 'kysely';
import Papa from 'papaparse';

import { KYSELY } from '../db/kysely.provider';
import type { DB } from '../db/schema';
import type { Insertable } from 'kysely';
import { csvRowToHolding } from '../holdings/csv';

export { HOLDINGS_COLUMNS } from '../holdings/csv';

@Injectable()
export class ProfilesService {
  constructor(@Inject(KYSELY) private readonly db: Kysely<DB>) {}

  async list(userId: string): Promise<string[]> {
    const rows = await this.db
      .selectFrom('profiles')
      .select('name')
      .where('user_id', '=', userId)
      .orderBy('name', 'asc')
      .execute();
    return rows.map((r) => r.name);
  }

  async create(userId: string, name: string, cloneFrom?: string): Promise<void> {
    const existing = await this.findByName(userId, name);
    if (existing) throw new ConflictException(`Profile '${name}' already exists`);

    if (cloneFrom) {
      const source = await this.findByName(userId, cloneFrom);
      if (!source) throw new NotFoundException(`Source profile '${cloneFrom}' not found`);

      await this.db.transaction().execute(async (trx) => {
        const inserted = await trx
          .insertInto('profiles')
          .values({
            user_id: userId,
            name,
            profile_yaml: source.profile_yaml,
          })
          .returning('id')
          .executeTakeFirstOrThrow();

        const holdings = await trx
          .selectFrom('holdings')
          .selectAll()
          .where('profile_id', '=', source.id)
          .orderBy('position', 'asc')
          .execute();

        if (holdings.length > 0) {
          const cloneRows: Insertable<DB['holdings']>[] = holdings.map((h) => ({
            profile_id: inserted.id,
            position: h.position,
            account: h.account,
            instrument: h.instrument,
            ticker: h.ticker,
            isin: h.isin,
            quantity: h.quantity,
            avg_cost: h.avg_cost,
            currency: h.currency,
            asset_class: h.asset_class,
            notes: h.notes,
            extra: h.extra ? JSON.stringify(h.extra) : null,
          }));
          await trx.insertInto('holdings').values(cloneRows).execute();
        }
      });
    } else {
      await this.db
        .insertInto('profiles')
        .values({ user_id: userId, name, profile_yaml: '# new profile\n' })
        .execute();
    }
  }

  async createFromWizard(
    userId: string,
    name: string,
    profileYaml: string,
    holdingsCsv: string,
  ): Promise<void> {
    const existing = await this.findByName(userId, name);
    if (existing) throw new ConflictException(`Profile '${name}' already exists`);

    const parsed = Papa.parse<Record<string, string>>(holdingsCsv, {
      header: true,
      skipEmptyLines: true,
    });
    if (parsed.errors.length > 0) {
      throw new Error(`holdings.csv parse error: ${parsed.errors[0].message}`);
    }

    await this.db.transaction().execute(async (trx) => {
      const inserted = await trx
        .insertInto('profiles')
        .values({ user_id: userId, name, profile_yaml: profileYaml })
        .returning('id')
        .executeTakeFirstOrThrow();

      const rows = parsed.data
        .map((row, idx) => csvRowToHolding(inserted.id, idx, row))
        .filter((r): r is NonNullable<typeof r> => r !== null);

      if (rows.length > 0) {
        await trx.insertInto('holdings').values(rows).execute();
      }
    });
  }

  async readYaml(userId: string, name: string): Promise<string> {
    const profile = await this.findByName(userId, name);
    if (!profile) throw new NotFoundException(`Profile '${name}' not found`);
    return profile.profile_yaml;
  }

  async writeYaml(userId: string, name: string, text: string): Promise<void> {
    const result = await this.db
      .updateTable('profiles')
      .set({ profile_yaml: text, updated_at: new Date().toISOString() })
      .where('user_id', '=', userId)
      .where('name', '=', name)
      .executeTakeFirst();
    if (Number(result.numUpdatedRows) === 0) {
      throw new NotFoundException(`Profile '${name}' not found`);
    }
  }

  async getIdByName(userId: string, name: string): Promise<string> {
    const profile = await this.findByName(userId, name);
    if (!profile) throw new NotFoundException(`Profile '${name}' not found`);
    return profile.id;
  }

  async findByName(userId: string, name: string) {
    return this.db
      .selectFrom('profiles')
      .selectAll()
      .where('user_id', '=', userId)
      .where('name', '=', name)
      .executeTakeFirst();
  }

}
