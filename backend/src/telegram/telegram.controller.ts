import { Body, Controller, Delete, Get, Patch, Post, UseGuards } from '@nestjs/common';
import type { OkResponse, TelegramLinkResponse, TelegramStatus } from '@dautu/contracts';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChannelSettingsDto } from '../notifications/dto/channel-settings.dto';
import { TelegramLinkService } from './telegram-link.service';

@UseGuards(JwtAuthGuard)
@Controller('telegram')
export class TelegramController {
  constructor(private telegram: TelegramLinkService) {}

  @Get()
  status(@CurrentUser() user: AuthUser): Promise<TelegramStatus> {
    return this.telegram.status(user.id);
  }

  @Post('link')
  link(@CurrentUser() user: AuthUser): Promise<TelegramLinkResponse> {
    return this.telegram.createLink(user.id);
  }

  @Patch('settings')
  settings(@CurrentUser() user: AuthUser, @Body() dto: ChannelSettingsDto): Promise<TelegramStatus> {
    return this.telegram.updateSettings(user.id, dto);
  }

  @Post('test')
  test(@CurrentUser() user: AuthUser): Promise<OkResponse> {
    return this.telegram.sendTest(user.id);
  }

  @Delete()
  unlink(@CurrentUser() user: AuthUser): Promise<OkResponse> {
    return this.telegram.unlink(user.id);
  }
}
