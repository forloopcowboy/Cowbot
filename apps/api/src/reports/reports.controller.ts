import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Res,
  Sse,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { map, Observable } from 'rxjs';

import { SessionGuard } from '../auth/session.guard';
import { UserId } from '../auth/user.decorator';
import { ReportsService } from './reports.service';
import { PythonRunnerService } from '../python/python-runner.service';
import { JobBus } from '../python/job-bus.service';
import { PuppeteerService } from '../pdf/puppeteer.service';
import {
  CustomReportDto,
  HasCacheDto,
  ReportEntryDto,
  StartCustomJobResponseDto,
  StartJobResponseDto,
} from './reports.dto';
import type { ReportEntry } from '@investment-plan/shared';

@ApiTags('reports')
@ApiCookieAuth()
@UseGuards(SessionGuard)
@Controller()
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly runner: PythonRunnerService,
    private readonly bus: JobBus,
    private readonly pdf: PuppeteerService,
  ) {}

  @Get('profiles/:name/reports')
  @ApiOperation({ summary: 'List reports for a profile' })
  @ApiOkResponse({ type: [ReportEntryDto] })
  list(@UserId() userId: string, @Param('name') name: string): Promise<ReportEntry[]> {
    return this.reports.list(userId, name);
  }

  // ORDER MATTERS: the `.pdf` route must be declared before the bare `:stem`
  // route below. Express's `:stem` matches `[^/]+` greedily (dots included), so
  // `demo-2026-05.pdf` would otherwise be swallowed by the markdown handler.
  @Get('profiles/:name/reports/:stem.pdf')
  @Header('Content-Type', 'application/pdf')
  @ApiOperation({ summary: 'Render or fetch the cached PDF for a report' })
  async readPdf(
    @UserId() userId: string,
    @Param('name') name: string,
    @Param('stem') stem: string,
    @Res() res: Response,
  ): Promise<void> {
    const existing = await this.reports.getPdfBytes(userId, name, stem);
    if (!existing) {
      res.status(404).send('Not found');
      return;
    }
    let pdf = existing.pdf;
    if (pdf.length === 0) {
      pdf = await this.pdf.renderMarkdown(existing.md, `Investment Report — ${stem}`);
      await this.reports.savePdf(userId, name, stem, pdf);
    }
    res.setHeader('Content-Disposition', `inline; filename="${stem}.pdf"`);
    res.setHeader('Content-Length', pdf.length);
    res.end(pdf);
  }

  @Get('profiles/:name/reports/:stem')
  @ApiOperation({ summary: 'Read a report\'s markdown content' })
  @ApiOkResponse({ schema: { type: 'string' } })
  readMd(
    @UserId() userId: string,
    @Param('name') name: string,
    @Param('stem') stem: string,
  ): Promise<string> {
    return this.reports.readMd(userId, name, stem);
  }

  // ORDER MATTERS: the literal `custom` route must be declared before the
  // `:kind` wildcard below. Otherwise Express routes `POST /scripts/custom`
  // through `runScript` with kind='custom', skipping the user-considerations
  // file and --custom-id, and silently overwriting the monthly report row.
  @Post('profiles/:name/scripts/custom')
  @HttpCode(202)
  @ApiOperation({ summary: 'Generate a custom report with user considerations text' })
  @ApiOkResponse({ type: StartCustomJobResponseDto })
  async runCustom(
    @UserId() userId: string,
    @Param('name') name: string,
    @Body() dto: CustomReportDto,
  ): Promise<StartCustomJobResponseDto> {
    return this.runner.startCustomReport(userId, name, dto.userText, dto.rebuildContext);
  }

  @Post('profiles/:name/scripts/:kind')
  @HttpCode(202)
  @ApiOperation({ summary: 'Kick off a build_context or generate_report script run' })
  @ApiParam({ name: 'kind', enum: ['context', 'report'] })
  @ApiOkResponse({ type: StartJobResponseDto })
  async runScript(
    @UserId() userId: string,
    @Param('name') name: string,
    @Param('kind') kind: 'context' | 'report',
  ): Promise<StartJobResponseDto> {
    if (kind !== 'context' && kind !== 'report') {
      throw new BadRequestException(
        `Unknown script kind '${kind}'. Expected 'context' or 'report'.`,
      );
    }
    const jobId = await this.runner.startScript(userId, name, kind);
    return { jobId };
  }

  @Get('profiles/:name/context-cache')
  @ApiOperation({ summary: 'Check whether a cached build_context output exists' })
  @ApiOkResponse({ type: HasCacheDto })
  async hasCache(
    @UserId() userId: string,
    @Param('name') name: string,
  ): Promise<HasCacheDto> {
    return { hasCache: await this.runner.hasContextCache(userId, name) };
  }

  @Sse('jobs/:id/log')
  @ApiOperation({
    summary: 'SSE stream of stdout/stderr lines from a running script job',
    description:
      "Each `data:` payload is `{ stream: 'stdout' | 'stderr', text: string }`. " +
      "A final event named `done` with `{ exitCode }` is emitted when the job ends, after which the connection closes.",
  })
  log(@Param('id') id: string): Observable<MessageEvent> {
    return this.bus.stream(id).pipe(
      map(
        (ev) =>
          ({
            type: ev.event,
            data: ev.data,
          }) as unknown as MessageEvent,
      ),
    );
  }
}
