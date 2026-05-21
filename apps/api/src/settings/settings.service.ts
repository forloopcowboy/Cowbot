import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Kysely } from 'kysely';

import { KYSELY } from '../db/kysely.provider';
import type { DB } from '../db/schema';

const ALGO = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;

@Injectable()
export class SettingsService {
  private readonly key: Buffer;

  constructor(@Inject(KYSELY) private readonly db: Kysely<DB>) {
    const raw = process.env.API_KEY_ENCRYPTION_KEY;
    if (!raw) {
      throw new InternalServerErrorException(
        'API_KEY_ENCRYPTION_KEY env var is required for the settings service',
      );
    }
    const buf = Buffer.from(raw, 'hex');
    if (buf.length !== KEY_BYTES) {
      throw new InternalServerErrorException(
        `API_KEY_ENCRYPTION_KEY must be ${KEY_BYTES} bytes (${KEY_BYTES * 2} hex chars); got ${buf.length} bytes`,
      );
    }
    this.key = buf;
  }

  async hasApiKey(userId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('user_settings')
      .select('anthropic_api_key_ciphertext')
      .where('user_id', '=', userId)
      .executeTakeFirst();
    return !!row?.anthropic_api_key_ciphertext;
  }

  async setApiKey(userId: string, key: string): Promise<void> {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGO, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(key, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    await this.db
      .insertInto('user_settings')
      .values({
        user_id: userId,
        anthropic_api_key_ciphertext: ciphertext,
        anthropic_api_key_iv: iv,
        anthropic_api_key_tag: tag,
      })
      .onConflict((oc) =>
        oc.column('user_id').doUpdateSet({
          anthropic_api_key_ciphertext: ciphertext,
          anthropic_api_key_iv: iv,
          anthropic_api_key_tag: tag,
          updated_at: new Date().toISOString(),
        }),
      )
      .execute();
  }

  async clearApiKey(userId: string): Promise<void> {
    await this.db
      .updateTable('user_settings')
      .set({
        anthropic_api_key_ciphertext: null,
        anthropic_api_key_iv: null,
        anthropic_api_key_tag: null,
        updated_at: new Date().toISOString(),
      })
      .where('user_id', '=', userId)
      .execute();
  }

  /** Returns null if the user has not set a key. Used by the Python runner. */
  async readApiKey(userId: string): Promise<string | null> {
    const row = await this.db
      .selectFrom('user_settings')
      .select(['anthropic_api_key_ciphertext', 'anthropic_api_key_iv', 'anthropic_api_key_tag'])
      .where('user_id', '=', userId)
      .executeTakeFirst();
    if (!row?.anthropic_api_key_ciphertext || !row.anthropic_api_key_iv || !row.anthropic_api_key_tag) {
      return null;
    }
    const decipher = createDecipheriv(ALGO, this.key, row.anthropic_api_key_iv);
    decipher.setAuthTag(row.anthropic_api_key_tag);
    const plain = Buffer.concat([
      decipher.update(row.anthropic_api_key_ciphertext),
      decipher.final(),
    ]);
    return plain.toString('utf8');
  }
}
