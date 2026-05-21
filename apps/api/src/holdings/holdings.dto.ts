import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

export class WriteHoldingsDto {
  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
    description: 'CSV-style row objects (string or number values).',
  })
  @IsArray()
  rows!: Record<string, string | number>[];
}

export class ParseHoldingsCsvDto {
  @ApiProperty({
    type: 'string',
    description: 'Raw CSV text with header row.',
  })
  @IsString()
  csv!: string;
}
