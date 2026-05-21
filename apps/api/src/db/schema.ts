import type { ColumnType, Generated } from 'kysely';

// Kysely table interfaces. Hand-maintained alongside Liquibase changelog.
// Once the schema stabilizes, replace with `npm run codegen` output (kysely-codegen).

export interface ProfilesTable {
  id: Generated<string>;
  user_id: string;
  name: string;
  profile_yaml: string;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string | undefined>;
}

export interface HoldingsTable {
  id: Generated<string>;
  profile_id: string;
  position: number;
  account: string | null;
  instrument: string | null;
  ticker: string | null;
  isin: string | null;
  quantity: number | null;
  avg_cost: number | null;
  currency: string | null;
  asset_class: string | null;
  notes: string | null;
  extra: ColumnType<
    Record<string, unknown> | null,
    string | null | undefined,
    string | null | undefined
  >;
}

export interface ReportsTable {
  id: Generated<string>;
  profile_id: string;
  stem: string;
  kind: 'context' | 'report' | 'custom';
  md_content: string | null;
  pdf_bytes: Buffer | null;
  size_bytes: number;
  created_at: ColumnType<Date, string | undefined, never>;
}

export interface UserSettingsTable {
  user_id: string;
  anthropic_api_key_ciphertext: Buffer | null;
  anthropic_api_key_iv: Buffer | null;
  anthropic_api_key_tag: Buffer | null;
  model: string | null;
  updated_at: ColumnType<Date, string | undefined, string | undefined>;
}

export interface ScriptJobsTable {
  id: Generated<string>;
  profile_id: string;
  kind: 'context' | 'report' | 'custom';
  status: 'pending' | 'running' | 'succeeded' | 'failed';
  exit_code: number | null;
  log: ColumnType<string, string | undefined, string | undefined>;
  started_at: ColumnType<Date, string | undefined, never>;
  ended_at: ColumnType<Date | null, string | null | undefined, string | null | undefined>;
}

export interface MarketSnapshotsTable {
  key: string;
  payload: ColumnType<
    Record<string, unknown>,
    string,
    string
  >;
  created_at: ColumnType<Date, string | undefined, string | undefined>;
}

export interface AdvicesTable {
  id: Generated<string>;
  user_id: string | null;
  profile_id: string | null;
  ip: string;
  user_agent: string | null;
  user_prompt: string;
  response_text: string;
  market_snapshot_created_at: ColumnType<Date | null, string | null | undefined, string | null | undefined>;
  model: string;
  created_at: ColumnType<Date, string | undefined, never>;
}

export interface DB {
  profiles: ProfilesTable;
  holdings: HoldingsTable;
  reports: ReportsTable;
  user_settings: UserSettingsTable;
  script_jobs: ScriptJobsTable;
  market_snapshots: MarketSnapshotsTable;
  advices: AdvicesTable;
}
