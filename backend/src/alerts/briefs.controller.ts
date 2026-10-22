import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import type { Notification as NotificationView } from '@dautu/contracts';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BriefTestService } from './brief-test.service';

@UseGuards(JwtAuthGuard)
@Controller('alerts')
export class BriefsController {
  constructor(private briefTest: BriefTestService) {}

  /** Gửi thử bản tin ngay cho chính mình */
  @Post('brief/:kind')
  briefNow(@CurrentUser() user: AuthUser, @Param('kind') kind: string): Promise<NotificationView> {
    return this.briefTest.sendToSelf(user.id, kind);
  }
}
