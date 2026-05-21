import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

export const PROFILE_NAME_RE = /^[a-z0-9][a-z0-9_-]{0,30}$/i;

export class CreateProfileDto {
  @ApiProperty({ example: 'my-profile', description: '1–31 chars, alphanumeric/_/-' })
  @IsString()
  @Matches(PROFILE_NAME_RE, { message: 'Invalid profile name' })
  name!: string;

  @ApiProperty({ required: false, description: 'Existing profile to clone from' })
  @IsOptional()
  @IsString()
  cloneFrom?: string;
}

export class WizardProfileDto {
  @ApiProperty()
  @IsString()
  @Matches(PROFILE_NAME_RE)
  name!: string;

  @ApiProperty({ description: 'Full profile.yaml text' })
  @IsString()
  profileYaml!: string;

  @ApiProperty({ description: 'Full holdings.csv text' })
  @IsString()
  holdingsCsv!: string;
}

export class WriteYamlDto {
  @ApiProperty()
  @IsString()
  text!: string;
}

export class ProfileSummaryDto {
  @ApiProperty()
  name!: string;
}
