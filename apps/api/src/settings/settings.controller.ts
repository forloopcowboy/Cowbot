import { Body, Controller, Delete, Get, HttpCode, Put, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { SessionGuard } from '../auth/session.guard';
import { UserId } from '../auth/user.decorator';
import { SettingsService } from './settings.service';
import { HasApiKeyDto, SetApiKeyDto } from './settings.dto';

@ApiTags('settings')
@ApiCookieAuth()
@UseGuards(SessionGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('api-key')
  @ApiOperation({ summary: 'Check whether an Anthropic API key is stored for the current user' })
  @ApiOkResponse({ type: HasApiKeyDto })
  async hasKey(@UserId() userId: string): Promise<HasApiKeyDto> {
    return { hasKey: await this.settings.hasApiKey(userId) };
  }

  @Put('api-key')
  @HttpCode(204)
  @ApiOperation({ summary: 'Encrypt and store an Anthropic API key for the current user' })
  async set(@UserId() userId: string, @Body() dto: SetApiKeyDto): Promise<void> {
    await this.settings.setApiKey(userId, dto.key);
  }

  @Delete('api-key')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove the stored Anthropic API key' })
  async clear(@UserId() userId: string): Promise<void> {
    await this.settings.clearApiKey(userId);
  }
}
