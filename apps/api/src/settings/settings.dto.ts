import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class HasApiKeyDto {
  @ApiProperty()
  hasKey!: boolean;
}

export class SetApiKeyDto {
  @ApiProperty({ description: 'Anthropic API key' })
  @IsString()
  @MinLength(10)
  key!: string;
}
