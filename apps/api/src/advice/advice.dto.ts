import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class AnonymousHoldingDto {
  @ApiProperty({ description: 'Ticker symbol (e.g. AAPL, ASML.AS).' })
  @IsString()
  @MaxLength(32)
  ticker!: string;

  @ApiProperty({ description: 'Number of units held.' })
  @IsNumber()
  quantity!: number;

  @ApiProperty({ description: 'Optional currency code (USD, EUR, BRL...).', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @ApiProperty({ description: 'Optional asset class (equity, bond, etf...).', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  assetClass?: string;
}

export class QuickAdviceDto {
  @ApiProperty({
    description: "The user's free-form question for the advisor.",
    minLength: 3,
    maxLength: 2000,
  })
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  userPrompt!: string;

  @ApiProperty({
    description:
      "Name of a saved profile to enrich the prompt with. Only honored if the request has a valid session cookie.",
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  profileName?: string;

  @ApiProperty({
    description: 'Inline holdings supplied by an anonymous (or non-saved) user.',
    type: [AnonymousHoldingDto],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @ValidateNested({ each: true })
  @Type(() => AnonymousHoldingDto)
  anonymousHoldings?: AnonymousHoldingDto[];
}

export class ListAdvicesQueryDto {
  @ApiProperty({ description: 'Max items to return (1..100).', required: false, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @ApiProperty({ description: 'Offset into the result set.', required: false, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;

  @ApiProperty({ description: 'Restrict to a specific saved profile (authed only).', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  profileName?: string;
}
