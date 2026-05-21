import { ApiProperty } from '@nestjs/swagger';

export class TickerSearchResultDto {
  @ApiProperty() symbol!: string;
  @ApiProperty() shortname!: string;
  @ApiProperty() longname!: string;
  @ApiProperty() exchange!: string;
  @ApiProperty() type!: string;
}

export class TickerQuoteDto {
  @ApiProperty() symbol!: string;
  @ApiProperty({ nullable: true, type: Number }) price!: number | null;
  @ApiProperty({ nullable: true, type: Number }) prevClose!: number | null;
  @ApiProperty() currency!: string;
  @ApiProperty({ nullable: true, type: Number }) changePct!: number | null;
}

export class CandlePointDto {
  @ApiProperty() t!: number;
  @ApiProperty() c!: number;
}

export class TickerCandlesDto {
  @ApiProperty() symbol!: string;
  @ApiProperty({ type: [CandlePointDto] }) points!: CandlePointDto[];
}
