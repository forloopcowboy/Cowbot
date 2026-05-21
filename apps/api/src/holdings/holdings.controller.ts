import { Body, Controller, Get, HttpCode, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { SessionGuard } from '../auth/session.guard';
import { UserId } from '../auth/user.decorator';
import { HoldingsService } from './holdings.service';
import { ParseHoldingsCsvDto, WriteHoldingsDto } from './holdings.dto';
import type { HoldingRow } from '@investment-plan/shared';

@ApiTags('holdings')
@ApiCookieAuth()
@UseGuards(SessionGuard)
@Controller('profiles/:name/holdings')
export class HoldingsController {
  constructor(private readonly holdings: HoldingsService) {}

  @Get()
  @ApiOperation({ summary: 'Read holdings rows for a profile' })
  @ApiOkResponse({
    schema: {
      type: 'array',
      items: { type: 'object', additionalProperties: true },
    },
  })
  read(@UserId() userId: string, @Param('name') name: string): Promise<HoldingRow[]> {
    return this.holdings.read(userId, name);
  }

  @Put()
  @HttpCode(204)
  @ApiOperation({ summary: 'Replace all holdings rows for a profile' })
  async write(
    @UserId() userId: string,
    @Param('name') name: string,
    @Body() dto: WriteHoldingsDto,
  ): Promise<void> {
    await this.holdings.write(userId, name, dto.rows);
  }

  @Post('parse')
  @ApiOperation({
    summary: 'Parse a CSV string into HoldingRow objects without persisting',
  })
  @ApiOkResponse({
    schema: { type: 'array', items: { type: 'object', additionalProperties: true } },
  })
  parseCsv(@Body() dto: ParseHoldingsCsvDto): HoldingRow[] {
    return this.holdings.parseCsv(dto.csv);
  }
}
