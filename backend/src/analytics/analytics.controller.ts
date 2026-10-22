import { Body, Controller, HttpCode, Ip, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/current-user.decorator';
import { OptionalJwtAuthGuard } from '../auth/jwt-auth.guard';
import { vnDateKey } from '../market/types';
import { AnalyticsService } from './analytics.service';
import { EventDto } from './dto/event.dto';
import { EventRateLimiter } from './event-rate-limiter';
import type { EventName } from './events';

/** Sự kiện từ trang danh mục mẫu: tách khỏi số liệu thật, khách cũng phát được */
const DEMO_EVENTS = new Set<EventName>(['demo_viewed', 'demo_signup_clicked']);
/** Sự kiện chỉ phát một lần mỗi người; còn lại một lần mỗi ngày */
const ONCE = new Set<EventName>(['onboarding_skipped']);

@Controller('events')
export class AnalyticsController {
  private limiter = new EventRateLimiter();

  constructor(private analytics: AnalyticsService) {}

  /** Sự kiện phía trình duyệt; tên và thuộc tính chỉ nhận theo từ điển, chống trùng theo ngày */
  @Post()
  @HttpCode(204)
  @UseGuards(OptionalJwtAuthGuard)
  async track(@CurrentUser() user: AuthUser | null, @Body() dto: EventDto, @Ip() ip: string) {
    if (!user && !DEMO_EVENTS.has(dto.name)) return;
    if (this.limiter.limited(user?.id ?? ip)) return;
    await this.analytics.track(dto.name, {
      userId: user?.id ?? null,
      anonId: user ? null : (dto.anonId ?? null),
      props: dto.props,
      sample: DEMO_EVENTS.has(dto.name),
      dedupeKey: ONCE.has(dto.name) ? dto.name : `${dto.name}:${vnDateKey()}`,
    });
  }
}
