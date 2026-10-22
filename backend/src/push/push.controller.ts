import { Body, Controller, Delete, Get, Headers, Patch, Post, UseGuards } from '@nestjs/common';
import type { PushStatus, PushTestResponse } from '@dautu/contracts';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChannelSettingsDto } from '../notifications/dto/channel-settings.dto';
import { SubscribeDto, UnsubscribeDto } from './dto/push.dto';
import { PushSubscriptionService } from './push-subscription.service';

@UseGuards(JwtAuthGuard)
@Controller('push')
export class PushController {
  constructor(private push: PushSubscriptionService) {}

  @Get()
  status(@CurrentUser() user: AuthUser): Promise<PushStatus> {
    return this.push.status(user.id);
  }

  @Post('subscribe')
  subscribe(
    @CurrentUser() user: AuthUser,
    @Body() dto: SubscribeDto,
    @Headers('user-agent') ua?: string,
  ): Promise<PushStatus> {
    return this.push.subscribe(user.id, dto, ua);
  }

  @Delete('subscribe')
  unsubscribe(@CurrentUser() user: AuthUser, @Body() dto: UnsubscribeDto): Promise<PushStatus> {
    return this.push.unsubscribe(user.id, dto.endpoint);
  }

  @Patch('settings')
  settings(@CurrentUser() user: AuthUser, @Body() dto: ChannelSettingsDto): Promise<PushStatus> {
    return this.push.updateSettings(user.id, dto);
  }

  @Post('test')
  test(@CurrentUser() user: AuthUser): Promise<PushTestResponse> {
    return this.push.sendTest(user.id);
  }
}
