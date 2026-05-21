import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { verifySession } from 'supertokens-node/recipe/session/framework/express';
import type { SessionRequest } from 'supertokens-node/framework/express';

import { AdviceService, type AdviceStreamEvent } from './advice.service';
import { ListAdvicesQueryDto, QuickAdviceDto } from './advice.dto';

@ApiTags('advice')
@Controller('advice')
export class AdviceController {
  constructor(private readonly advice: AdviceService) {}

  @Post('quick')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Stream quick investment advice from Claude (anonymous-friendly)',
    description:
      'POST a free-form question; receive an SSE stream. The first event is `created` ' +
      'carrying the advice id; subsequent events are `delta` chunks and finally `done` ' +
      '(or a single `error`). If the request carries a SuperTokens session cookie and ' +
      "the body contains `profileName`, the prompt is enriched with the user's saved " +
      'profile and holdings.',
  })
  async quick(
    @Req() req: Request,
    @Res() res: Response,
    @Body() dto: QuickAdviceDto,
  ): Promise<void> {
    const userId = await resolveOptionalUserId(req, res);

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const stream = this.advice.streamAdvice({
      userPrompt: dto.userPrompt,
      profileName: dto.profileName,
      anonymousHoldings: dto.anonymousHoldings,
      userId,
      ip: req.ip ?? '0.0.0.0',
      userAgent:
        (req.headers['x-browser-user-agent'] as string | undefined) ??
        req.headers['user-agent'] ??
        null,
    });

    let clientGone = false;
    req.on('close', () => {
      clientGone = true;
    });

    try {
      for await (const event of stream) {
        if (clientGone) break;
        writeSse(res, event);
      }
    } catch (err) {
      writeSse(res, {
        event: 'error',
        data: (err as Error).message ?? 'Unknown stream error',
      });
    } finally {
      res.end();
    }
  }
}

@ApiTags('advice')
@Controller('advices')
export class AdvicesController {
  constructor(private readonly advice: AdviceService) {}

  @Get()
  @ApiOperation({
    summary: 'List advice entries visible to the current viewer',
    description:
      'Paginated. Authed users see their own rows (and anonymous rows from the same IP). ' +
      'Anonymous viewers see rows recorded against their IP only.',
  })
  async list(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Query() query: ListAdvicesQueryDto,
  ) {
    const userId = await resolveOptionalUserId(req, res);
    const limit = query.limit ?? 10;
    const offset = query.offset ?? 0;
    const page = await this.advice.listAdvicesFor({
      userId,
      ip: req.ip ?? '0.0.0.0',
      profileName: query.profileName,
      limit,
      offset,
    });
    return { items: page.items, total: page.total, limit, offset };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Read a single advice entry (viewer-scoped)' })
  async get(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param('id') id: string,
  ) {
    const userId = await resolveOptionalUserId(req, res);
    const row = await this.advice.getAdviceFor({
      id,
      userId,
      ip: req.ip ?? '0.0.0.0',
    });
    if (!row) {
      throw new NotFoundException('Advice not found');
    }
    return row;
  }
}

function writeSse(res: Response, event: AdviceStreamEvent): void {
  res.write(`event: ${event.event}\n`);
  res.write(`data: ${JSON.stringify({ text: event.data })}\n\n`);
}

async function resolveOptionalUserId(req: Request, res: Response): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    verifySession({ sessionRequired: false })(req as SessionRequest, res, (err) => {
      if (err) {
        resolve(null);
        return;
      }
      const session = (req as SessionRequest).session;
      resolve(session?.getUserId() ?? null);
    });
  });
}
