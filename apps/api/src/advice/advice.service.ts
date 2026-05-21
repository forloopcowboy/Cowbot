import Anthropic from '@anthropic-ai/sdk';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Kysely, sql } from 'kysely';

import { KYSELY } from '../db/kysely.provider';
import type { DB } from '../db/schema';
import { HoldingsService } from '../holdings/holdings.service';
import { MarketSnapshotService } from './market-snapshot.service';
import { buildPrompt, type AnonymousHoldingInput } from './prompt-builder';

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 1500;
const LIST_PROMPT_PREVIEW = 160;

export interface AdviceStreamEvent {
  event: 'created' | 'delta' | 'done' | 'error';
  data: string;
}

export interface StreamAdviceInput {
  userPrompt: string;
  profileName?: string;
  anonymousHoldings?: AnonymousHoldingInput[];
  userId: string | null;
  ip: string;
  userAgent: string | null;
}

export interface AdviceListEntryRow {
  id: string;
  userPrompt: string;
  hasResponse: boolean;
  profileName: string | null;
  createdAt: string;
}

export interface AdviceRow {
  id: string;
  userPrompt: string;
  responseText: string;
  profileName: string | null;
  createdAt: string;
  model: string;
}

@Injectable()
export class AdviceService implements OnModuleInit {
  private readonly logger = new Logger(AdviceService.name);
  private client!: Anthropic;

  constructor(
    @Inject(KYSELY) private readonly db: Kysely<DB>,
    private readonly snapshot: MarketSnapshotService,
    private readonly holdings: HoldingsService,
  ) {}

  onModuleInit(): void {
    const apiKey = process.env.ANTHROPIC_API_KEY_ANONYMOUS?.trim();
    if (!apiKey) {
      throw new Error(
        'ANTHROPIC_API_KEY_ANONYMOUS is not set — required for the /advice/quick endpoint.',
      );
    }
    this.client = new Anthropic({ apiKey });
  }

  async *streamAdvice(input: StreamAdviceInput): AsyncGenerator<AdviceStreamEvent> {
    let marketSnapshot;
    let marketSnapshotCreatedAt: Date | null = null;
    try {
      const meta = await this.snapshot.getWithMeta();
      marketSnapshot = meta.snapshot;
      marketSnapshotCreatedAt = meta.createdAt;
    } catch (err) {
      this.logger.error(`market snapshot unavailable: ${(err as Error).message}`);
      yield {
        event: 'error',
        data: 'Market data is temporarily unavailable. Please try again in a few minutes.',
      };
      return;
    }

    let profileYaml: string | undefined;
    let profileId: string | null = null;
    let authedHoldings;
    if (input.userId && input.profileName) {
      try {
        const loaded = await this.loadProfile(input.userId, input.profileName);
        profileYaml = loaded?.profile_yaml;
        profileId = loaded?.id ?? null;
        authedHoldings = await this.holdings.read(input.userId, input.profileName);
      } catch (err) {
        this.logger.warn(
          `failed to load profile '${input.profileName}' for user ${input.userId}: ${(err as Error).message} — continuing anonymously`,
        );
        profileYaml = undefined;
        profileId = null;
        authedHoldings = undefined;
      }
    }

    let adviceId: string | null = null;
    try {
      adviceId = await this.insertAdviceShell({
        userId: input.userId,
        profileId,
        ip: input.ip || '0.0.0.0',
        userAgent: input.userAgent,
        userPrompt: input.userPrompt,
        marketSnapshotCreatedAt,
        model: MODEL,
      });
      yield { event: 'created', data: adviceId };
    } catch (err) {
      this.logger.warn(`failed to insert advice shell: ${(err as Error).message}`);
      // Continue streaming even if persistence is unavailable.
    }

    const { system, userMessage } = buildPrompt({
      marketSnapshot,
      profileYaml,
      holdings: authedHoldings,
      anonymousHoldings: input.anonymousHoldings,
      userPrompt: input.userPrompt,
    });

    let responseText = '';
    try {
      const stream = await this.client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system,
        messages: [{ role: 'user', content: userMessage }],
        stream: true,
      });

      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta' &&
          event.delta.text.length > 0
        ) {
          responseText += event.delta.text;
          yield { event: 'delta', data: event.delta.text };
        }
      }
      yield { event: 'done', data: '' };
    } catch (err) {
      const msg = (err as Error).message ?? 'unknown error';
      this.logger.error(`Anthropic stream failed: ${msg}`);
      yield {
        event: 'error',
        data: 'The advisor is temporarily unavailable. Please try again shortly.',
      };
    } finally {
      if (adviceId) {
        try {
          await this.db
            .updateTable('advices')
            .set({ response_text: responseText })
            .where('id', '=', adviceId)
            .execute();
        } catch (err) {
          this.logger.warn(
            `failed to finalize advice ${adviceId}: ${(err as Error).message}`,
          );
        }
      }
    }
  }

  async listAdvicesFor(args: {
    userId: string | null;
    ip: string;
    profileName?: string;
    limit: number;
    offset: number;
  }): Promise<{ items: AdviceListEntryRow[]; total: number }> {
    const ip = args.ip || '0.0.0.0';
    const base = this.db
      .selectFrom('advices')
      .leftJoin('profiles', 'profiles.id', 'advices.profile_id')
      .where((eb) => this.viewerScope(eb, args.userId, ip));

    const filtered = args.profileName
      ? base.where('profiles.name', '=', args.profileName)
      : base;

    const items = await filtered
      .select([
        'advices.id as id',
        'advices.user_prompt as user_prompt',
        'advices.response_text as response_text',
        'profiles.name as profile_name',
        'advices.created_at as created_at',
      ])
      .orderBy('advices.created_at', 'desc')
      .limit(args.limit)
      .offset(args.offset)
      .execute();

    const totalRow = await filtered
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .executeTakeFirst();
    const total = Number(totalRow?.count ?? 0);

    return {
      items: items.map((r) => ({
        id: r.id,
        userPrompt:
          r.user_prompt.length > LIST_PROMPT_PREVIEW
            ? r.user_prompt.slice(0, LIST_PROMPT_PREVIEW).trimEnd() + '…'
            : r.user_prompt,
        hasResponse: (r.response_text ?? '').length > 0,
        profileName: r.profile_name,
        createdAt: new Date(r.created_at).toISOString(),
      })),
      total,
    };
  }

  async getAdviceFor(args: {
    id: string;
    userId: string | null;
    ip: string;
  }): Promise<AdviceRow | null> {
    const ip = args.ip || '0.0.0.0';
    const row = await this.db
      .selectFrom('advices')
      .leftJoin('profiles', 'profiles.id', 'advices.profile_id')
      .select([
        'advices.id as id',
        'advices.user_prompt as user_prompt',
        'advices.response_text as response_text',
        'profiles.name as profile_name',
        'advices.created_at as created_at',
        'advices.model as model',
      ])
      .where('advices.id', '=', args.id)
      .where((eb) => this.viewerScope(eb, args.userId, ip))
      .executeTakeFirst();

    if (!row) return null;
    return {
      id: row.id,
      userPrompt: row.user_prompt,
      responseText: row.response_text ?? '',
      profileName: row.profile_name,
      createdAt: new Date(row.created_at).toISOString(),
      model: row.model,
    };
  }

  private viewerScope(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    eb: any,
    userId: string | null,
    ip: string,
  ) {
    if (userId) {
      return eb.or([
        eb('advices.user_id', '=', userId),
        eb.and([eb('advices.user_id', 'is', null), eb('advices.ip', '=', sql`${ip}::inet`)]),
      ]);
    }
    return eb.and([
      eb('advices.user_id', 'is', null),
      eb('advices.ip', '=', sql`${ip}::inet`),
    ]);
  }

  private async loadProfile(
    userId: string,
    profileName: string,
  ): Promise<{ id: string; profile_yaml: string } | undefined> {
    return this.db
      .selectFrom('profiles')
      .select(['id', 'profile_yaml'])
      .where('user_id', '=', userId)
      .where('name', '=', profileName)
      .executeTakeFirst();
  }

  private async insertAdviceShell(row: {
    userId: string | null;
    profileId: string | null;
    ip: string;
    userAgent: string | null;
    userPrompt: string;
    marketSnapshotCreatedAt: Date | null;
    model: string;
  }): Promise<string> {
    const inserted = await this.db
      .insertInto('advices')
      .values({
        user_id: row.userId,
        profile_id: row.profileId,
        ip: row.ip,
        user_agent: row.userAgent,
        user_prompt: row.userPrompt,
        response_text: '',
        market_snapshot_created_at:
          row.marketSnapshotCreatedAt?.toISOString() ?? null,
        model: row.model,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return inserted.id;
  }
}
