import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsString, MinLength } from 'class-validator';

export class ReportEntryDto {
  @ApiProperty() stem!: string;
  @ApiProperty() hasMd!: boolean;
  @ApiProperty() hasPdf!: boolean;
  @ApiProperty({ required: false }) mdPath?: string;
  @ApiProperty({ required: false }) pdfPath?: string;
  @ApiProperty({ description: 'Created-at epoch (ms)' }) mtime!: number;
  @ApiProperty() sizeKb!: number;
}

export class StartJobResponseDto {
  @ApiProperty() jobId!: string;
}

export class StartCustomJobResponseDto {
  @ApiProperty() jobId!: string;
  @ApiProperty() stem!: string;
}

export class CustomReportDto {
  @ApiProperty({ minLength: 1, maxLength: 4000 })
  @IsString()
  @MinLength(1)
  userText!: string;

  @ApiProperty()
  @IsBoolean()
  rebuildContext!: boolean;
}

export class ScriptKindParam {
  @ApiProperty({ enum: ['context', 'report'] })
  @IsIn(['context', 'report'])
  kind!: 'context' | 'report';
}

export class HasCacheDto {
  @ApiProperty() hasCache!: boolean;
}
