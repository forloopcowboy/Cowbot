import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { DB } from './schema';

export const KYSELY = 'KYSELY';

export function createKysely(): Kysely<DB> {
  const connectionString =
    process.env.DATABASE_URL ??
    'postgres://investment:investment@localhost:5432/investment_plan';

  const pool = new Pool({ connectionString, max: 10 });

  return new Kysely<DB>({
    dialect: new PostgresDialect({ pool }),
  });
}
