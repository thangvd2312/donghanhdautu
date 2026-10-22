import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { NotificationList, OkResponse } from '@dautu/contracts';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationInboxService } from './notification-inbox.service';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private inbox: NotificationInboxService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<NotificationList> {
    return this.inbox.list(user.id);
  }

  @Post('read-all')
  readAll(@CurrentUser() user: AuthUser): Promise<OkResponse> {
    return this.inbox.readAll(user.id);
  }

  @Post(':id/read')
  read(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<OkResponse> {
    return this.inbox.read(user.id, id);
  }
}
