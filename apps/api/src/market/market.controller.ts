import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { SessionGuard } from '../auth/session.guard';
import { MarketService } from './market.service';
import { TickerCandlesDto, TickerQuoteDto, TickerSearchResultDto } from './market.dto';
import type { TickerCandles, TickerQuote, TickerSearchResult } from '@investment-plan/shared';

@ApiTags('market')
@ApiCookieAuth()
@UseGuards(SessionGuard)
@Controller('market')
export class MarketController {
  constructor(private readonly market: MarketService) {}

  @Get('search')
  @ApiOperation({ summary: 'Search Yahoo Finance for ticker symbols' })
  @ApiQuery({ name: 'q', required: true })
  @ApiOkResponse({ type: [TickerSearchResultDto] })
  search(@Query('q') q: string): Promise<TickerSearchResult[]> {
    return this.market.search(q);
  }

  @Get('quote/:symbol')
  @ApiOperation({ summary: 'Last price + previous close for a symbol' })
  @ApiOkResponse({ type: TickerQuoteDto })
  quote(@Param('symbol') symbol: string): Promise<TickerQuote> {
    return this.market.quote(symbol);
  }

  @Get('candles/:symbol')
  @ApiOperation({ summary: 'Weekly close prices for the last year' })
  @ApiOkResponse({ type: TickerCandlesDto })
  candles(@Param('symbol') symbol: string): Promise<TickerCandles> {
    return this.market.candles(symbol);
  }
}
