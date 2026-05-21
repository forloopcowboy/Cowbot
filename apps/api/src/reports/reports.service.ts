import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Kysely } from 'kysely';

import { KYSELY } from '../db/kysely.provider';
import type { DB } from '../db/schema';
import { ProfilesService } from '../profiles/profiles.service';
import type { ReportEntry } from '@investment-plan/shared';

@Injectable()
export class ReportsService {
  constructor(
    @Inject(KYSELY) private readonly db: Kysely<DB>,
    private readonly profiles: ProfilesService,
  ) {}

  async list(userId: string, profileName: string): Promise<ReportEntry[]> {
    const profileId = await this.profiles.getIdByName(userId, profileName);
    const rows = await this.db
      .selectFrom('reports')
      .select(['stem', 'md_content', 'pdf_bytes', 'size_bytes', 'created_at'])
      .where('profile_id', '=', profileId)
      .where('stem', '!=', '.context')
      .orderBy('stem', 'desc')
      .execute();

    return rows.map((r) => ({
      stem: r.stem,
      hasMd: !!r.md_content,
      hasPdf: !!r.pdf_bytes,
      mdPath: r.md_content ? `/api/v1/profiles/${profileName}/reports/${r.stem}` : undefined,
      pdfPath: `/api/v1/profiles/${profileName}/reports/${r.stem}.pdf`,
      mtime: r.created_at.getTime(),
      sizeKb: Number(r.size_bytes) / 1024,
    }));
  }

  async readMd(userId: string, profileName: string, stem: string): Promise<string> {
    const profileId = await this.profiles.getIdByName(userId, profileName);
    const row = await this.db
      .selectFrom('reports')
      .select('md_content')
      .where('profile_id', '=', profileId)
      .where('stem', '=', stem)
      .executeTakeFirst();
    if (!row?.md_content) throw new NotFoundException(`Report '${stem}' not found`);
    return row.md_content;
  }

  async getPdfBytes(
    userId: string,
    profileName: string,
    stem: string,
  ): Promise<{ pdf: Buffer; md: string } | null> {
    const profileId = await this.profiles.getIdByName(userId, profileName);
    const row = await this.db
      .selectFrom('reports')
      .select(['md_content', 'pdf_bytes'])
      .where('profile_id', '=', profileId)
      .where('stem', '=', stem)
      .executeTakeFirst();
    if (!row?.md_content) return null;
    return {
      pdf: row.pdf_bytes ? Buffer.from(row.pdf_bytes) : Buffer.alloc(0),
      md: row.md_content,
    };
  }

  async savePdf(
    userId: string,
    profileName: string,
    stem: string,
    pdf: Buffer,
  ): Promise<void> {
    const profileId = await this.profiles.getIdByName(userId, profileName);
    await this.db
      .updateTable('reports')
      .set({ pdf_bytes: pdf })
      .where('profile_id', '=', profileId)
      .where('stem', '=', stem)
      .execute();
  }
}
