import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile, readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import { Kysely } from 'kysely';
import Papa from 'papaparse';

import { KYSELY } from '../db/kysely.provider';
import type { DB } from '../db/schema';
import { ProfilesService, HOLDINGS_COLUMNS } from '../profiles/profiles.service';
import { SettingsService } from '../settings/settings.service';
import { JobBus } from './job-bus.service';

const CUSTOM_TEXT_MAX = 4000;
const TEMPLATE_PLACEHOLDER_RE = /\{\{[^}]*\}\}/g;

export interface RunResult {
  jobId: string;
  exitCode: number;
  stem?: string;
}

@Injectable()
export class PythonRunnerService {
  private readonly log = new Logger(PythonRunnerService.name);

  constructor(
    @Inject(KYSELY) private readonly db: Kysely<DB>,
    private readonly profiles: ProfilesService,
    private readonly settings: SettingsService,
    private readonly bus: JobBus,
  ) {}

  /**
   * Start a script job synchronously creates the job row and tmpdir,
   * then returns the jobId immediately. The actual run progresses in the background;
   * subscribe to JobBus.stream(jobId) to observe it.
   */
  async startScript(
    userId: string,
    profileName: string,
    kind: 'context' | 'report',
  ): Promise<string> {
    const profileId = await this.profiles.getIdByName(userId, profileName);
    const jobId = await this.createJob(profileId, kind);

    const script = kind === 'context' ? 'build_context.py' : 'generate_report.py';
    void this.runInBackground(userId, profileId, profileName, jobId, kind, [
      script,
      '--profile',
      profileName,
    ]);
    return jobId;
  }

  /**
   * Emit a visible phase banner into the job's SSE stream so the UI can
   * distinguish "rebuilding market context" from "generating report" runs.
   */
  private phaseBanner(jobId: string, label: string): void {
    this.bus.push(jobId, {
      stream: 'stdout',
      text: `─── ${label} ───\n`,
    });
  }

  async startCustomReport(
    userId: string,
    profileName: string,
    userText: string,
    rebuildContext: boolean,
  ): Promise<{ jobId: string; stem: string }> {
    const profileId = await this.profiles.getIdByName(userId, profileName);

    const sanitized = String(userText ?? '')
      .replace(TEMPLATE_PLACEHOLDER_RE, '')
      .slice(0, CUSTOM_TEXT_MAX)
      .trim();
    if (!sanitized) {
      throw new Error('Custom report requires non-empty considerations text');
    }
    const id = randomBytes(4).toString('hex');
    const today = new Date();
    const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const stem = `${profileName}-${ymd}-custom-${id}`;
    const jobId = await this.createJob(profileId, 'custom');

    void this.runCustomInBackground(
      userId,
      profileId,
      profileName,
      jobId,
      sanitized,
      rebuildContext,
      id,
    );
    return { jobId, stem };
  }

  async hasContextCache(userId: string, profileName: string): Promise<boolean> {
    // Context cache is per-run artifact; we mirror it as a row in the reports table
    // with stem '.context'. Absence == no cache.
    const profileId = await this.profiles.getIdByName(userId, profileName);
    const row = await this.db
      .selectFrom('reports')
      .select('id')
      .where('profile_id', '=', profileId)
      .where('kind', '=', 'context')
      .executeTakeFirst();
    return !!row;
  }

  // ---- internals --------------------------------------------------------

  private async createJob(profileId: string, kind: 'context' | 'report' | 'custom'): Promise<string> {
    const row = await this.db
      .insertInto('script_jobs')
      .values({ profile_id: profileId, kind, status: 'pending' })
      .returning('id')
      .executeTakeFirstOrThrow();
    this.bus.open(row.id);
    return row.id;
  }

  private async runInBackground(
    userId: string,
    profileId: string,
    profileName: string,
    jobId: string,
    kind: 'context' | 'report' | 'custom',
    scriptArgs: string[],
  ): Promise<void> {
    try {
      // Standard report flow uses cached `.context.json` if present; only the
      // explicit context-rebuild script (kind='context') should start fresh.
      const seedContext = kind !== 'context';
      const workdir = await this.materialize(userId, profileId, profileName, seedContext);
      this.phaseBanner(
        jobId,
        kind === 'context' ? 'building market context' : 'generating report',
      );
      const exitCode = await this.spawnPython(jobId, userId, workdir, scriptArgs);
      if (exitCode === 0) {
        await this.ingestArtifacts(profileId, workdir, kind);
      }
      await this.finalize(jobId, exitCode);
      await rm(workdir, { recursive: true, force: true }).catch(() => undefined);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.bus.push(jobId, { stream: 'stderr', text: `[runner error] ${msg}\n` });
      await this.finalize(jobId, -1);
    }
  }

  private async runCustomInBackground(
    userId: string,
    profileId: string,
    profileName: string,
    jobId: string,
    sanitized: string,
    rebuildContext: boolean,
    customId: string,
  ): Promise<void> {
    try {
      // When the user asks to rebuild context, don't seed `.context.json` from
      // the DB cache — let build_context.py write a fresh one. Otherwise the
      // cached file is what generate_report.py will read.
      const workdir = await this.materialize(
        userId,
        profileId,
        profileName,
        !rebuildContext,
      );

      if (rebuildContext) {
        this.phaseBanner(jobId, 'building market context');
        const code = await this.spawnPython(jobId, userId, workdir, [
          'build_context.py',
          '--profile',
          profileName,
        ]);
        if (code !== 0) {
          await this.finalize(jobId, code);
          await rm(workdir, { recursive: true, force: true }).catch(() => undefined);
          return;
        }
      }

      const tmpFile = path.join(workdir, 'considerations.txt');
      await writeFile(tmpFile, sanitized, 'utf8');

      this.phaseBanner(jobId, 'generating report');
      const code = await this.spawnPython(jobId, userId, workdir, [
        'generate_report.py',
        '--profile',
        profileName,
        '--user-considerations-file',
        tmpFile,
        '--custom-id',
        customId,
      ]);

      if (code === 0) {
        await this.ingestArtifacts(profileId, workdir, 'custom');
      }
      await this.finalize(jobId, code);
      await rm(workdir, { recursive: true, force: true }).catch(() => undefined);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.bus.push(jobId, { stream: 'stderr', text: `[runner error] ${msg}\n` });
      await this.finalize(jobId, -1);
    }
  }

  /**
   * Build a temp working directory that mirrors the on-disk layout the Python
   * scripts expect: <root>/profiles/<name>/{profile.yaml,holdings.csv,reports/}
   * Returns the *root* (`INVPLAN_ROOT`).
   */
  private async materialize(
    userId: string,
    profileId: string,
    profileName: string,
    seedContext: boolean = true,
  ): Promise<string> {
    const root = await mkdtemp(path.join(os.tmpdir(), 'invplan-'));
    const profileDir = path.join(root, 'profiles', profileName);
    const reportsDir = path.join(profileDir, 'reports');
    await mkdir(reportsDir, { recursive: true });

    const profile = await this.db
      .selectFrom('profiles')
      .select('profile_yaml')
      .where('id', '=', profileId)
      .executeTakeFirst();
    if (!profile) throw new NotFoundException('Profile vanished');
    await writeFile(path.join(profileDir, 'profile.yaml'), profile.profile_yaml, 'utf8');

    const holdings = await this.db
      .selectFrom('holdings')
      .selectAll()
      .where('profile_id', '=', profileId)
      .orderBy('position', 'asc')
      .execute();

    const csvRows = holdings.map((h) => {
      const row: Record<string, string> = {};
      for (const col of HOLDINGS_COLUMNS) {
        const v = (h as Record<string, unknown>)[col];
        row[col] = v == null ? '' : String(v);
      }
      if (h.extra && typeof h.extra === 'object') {
        for (const [k, v] of Object.entries(h.extra)) {
          if (typeof v === 'string' || typeof v === 'number') row[k] = String(v);
        }
      }
      return row;
    });
    const csv = Papa.unparse(csvRows, { columns: [...HOLDINGS_COLUMNS] });
    await writeFile(path.join(profileDir, 'holdings.csv'), csv + '\n', 'utf8');

    // Re-hydrate the context cache row if present, so generate_report.py can
    // skip the rebuild. Skipped when the caller is about to rebuild — otherwise
    // build_context.py would overwrite a file we just wrote.
    if (seedContext) {
      const cached = await this.db
        .selectFrom('reports')
        .select(['md_content'])
        .where('profile_id', '=', profileId)
        .where('kind', '=', 'context')
        .where('stem', '=', '.context')
        .executeTakeFirst();
      if (cached?.md_content) {
        await writeFile(path.join(profileDir, '.context.json'), cached.md_content, 'utf8');
      }
    }

    return root;
  }

  private async spawnPython(
    jobId: string,
    userId: string,
    workdir: string,
    args: string[],
  ): Promise<number> {
    const bin = process.env.PYTHON_BIN ?? 'uv';
    const scriptsDir = path.resolve(
      process.env.PYTHON_SCRIPTS_DIR ?? path.join(__dirname, '../../../../scripts'),
    );
    const apiKey = (await this.settings.readApiKey(userId)) ?? '';

    const env = {
      ...process.env,
      INVPLAN_ROOT: workdir,
      ANTHROPIC_API_KEY: apiKey,
    } as NodeJS.ProcessEnv;

    await this.db
      .updateTable('script_jobs')
      .set({ status: 'running' })
      .where('id', '=', jobId)
      .execute();

    return new Promise((resolve) => {
      const argv = bin === 'uv'
        ? ['run', '--project', scriptsDir, 'python', path.join(scriptsDir, args[0]), ...args.slice(1)]
        : [path.join(scriptsDir, args[0]), ...args.slice(1)];

      const child = spawn(bin, argv, { cwd: workdir, env });

      child.stdout?.on('data', (chunk: Buffer) =>
        this.bus.push(jobId, { stream: 'stdout', text: chunk.toString() }),
      );
      child.stderr?.on('data', (chunk: Buffer) =>
        this.bus.push(jobId, { stream: 'stderr', text: chunk.toString() }),
      );
      child.on('error', (err) => {
        this.bus.push(jobId, { stream: 'stderr', text: `[spawn error] ${err.message}\n` });
        resolve(-1);
      });
      child.on('close', (code) => resolve(code ?? -1));
    });
  }

  private async ingestArtifacts(
    profileId: string,
    workdir: string,
    kind: 'context' | 'report' | 'custom',
  ): Promise<void> {
    const profileDirs = await readdir(path.join(workdir, 'profiles')).catch(() => []);
    for (const name of profileDirs) {
      const reportsDir = path.join(workdir, 'profiles', name, 'reports');
      if (!existsSync(reportsDir)) continue;
      const files = await readdir(reportsDir);
      for (const f of files) {
        if (!f.endsWith('.md')) continue;
        const stem = f.replace(/\.md$/, '');
        const md = await readFile(path.join(reportsDir, f), 'utf8');
        const st = await stat(path.join(reportsDir, f));
        await this.db
          .insertInto('reports')
          .values({
            profile_id: profileId,
            stem,
            kind,
            md_content: md,
            size_bytes: st.size,
          })
          .onConflict((oc) =>
            oc.columns(['profile_id', 'stem']).doUpdateSet({
              md_content: md,
              kind,
              size_bytes: st.size,
            }),
          )
          .execute();
      }
    }

    // Persist context cache as a synthetic "report" row keyed by stem '.context'
    const profileDir = path.join(workdir, 'profiles', profileDirs[0] ?? '');
    const ctxPath = path.join(profileDir, '.context.json');
    if (existsSync(ctxPath)) {
      const content = await readFile(ctxPath, 'utf8');
      await this.db
        .insertInto('reports')
        .values({
          profile_id: profileId,
          stem: '.context',
          kind: 'context',
          md_content: content,
          size_bytes: content.length,
        })
        .onConflict((oc) =>
          oc.columns(['profile_id', 'stem']).doUpdateSet({
            md_content: content,
            size_bytes: content.length,
          }),
        )
        .execute();
    }
  }

  private async finalize(jobId: string, exitCode: number): Promise<void> {
    await this.db
      .updateTable('script_jobs')
      .set({
        status: exitCode === 0 ? 'succeeded' : 'failed',
        exit_code: exitCode,
        ended_at: new Date().toISOString(),
      })
      .where('id', '=', jobId)
      .execute();
    this.bus.close(jobId, exitCode);
  }
}
