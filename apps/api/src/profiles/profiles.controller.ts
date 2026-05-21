import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

import { SessionGuard } from '../auth/session.guard';
import { UserId } from '../auth/user.decorator';
import { ProfilesService } from './profiles.service';
import {
  CreateProfileDto,
  ProfileSummaryDto,
  WizardProfileDto,
  WriteYamlDto,
} from './profiles.dto';

@ApiTags('profiles')
@ApiCookieAuth()
@UseGuards(SessionGuard)
@Controller('profiles')
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get()
  @ApiOperation({ summary: 'List profile names owned by the current user' })
  @ApiOkResponse({ type: [String] })
  list(@UserId() userId: string): Promise<string[]> {
    return this.profiles.list(userId);
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a profile (optionally clone from another)' })
  async create(@UserId() userId: string, @Body() dto: CreateProfileDto): Promise<ProfileSummaryDto> {
    await this.profiles.create(userId, dto.name, dto.cloneFrom);
    return { name: dto.name };
  }

  @Post('from-wizard')
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a profile from full wizard payload (yaml + csv)' })
  async createFromWizard(
    @UserId() userId: string,
    @Body() dto: WizardProfileDto,
  ): Promise<ProfileSummaryDto> {
    await this.profiles.createFromWizard(userId, dto.name, dto.profileYaml, dto.holdingsCsv);
    return { name: dto.name };
  }

  @Get(':name/yaml')
  @ApiOperation({ summary: 'Read profile.yaml content' })
  @ApiOkResponse({ schema: { type: 'string' } })
  readYaml(@UserId() userId: string, @Param('name') name: string): Promise<string> {
    return this.profiles.readYaml(userId, name);
  }

  @Put(':name/yaml')
  @HttpCode(204)
  @ApiOperation({ summary: 'Replace profile.yaml content' })
  async writeYaml(
    @UserId() userId: string,
    @Param('name') name: string,
    @Body() dto: WriteYamlDto,
  ): Promise<void> {
    await this.profiles.writeYaml(userId, name, dto.text);
  }
}
