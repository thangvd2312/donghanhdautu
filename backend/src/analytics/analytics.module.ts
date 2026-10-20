import { Body, Controller, Global, HttpCode, Ip, Module, Post, UseGuards } from '@nestjs/common';
import { IsIn, IsObject, IsOptional, Matches } from 'class-validator';
import { CurrentUser, OptionalJwtAuthGuard } from '../auth/auth.module';
import type { AuthUser } from '../auth/auth.module';
import { vnDateKey } from '../market/types';
import { AnalyticsService } from './analytics.service';
import { CLIENT_EVENTS } from './events';
import type { EventName } from './events';

class EventDto {
  @IsIn(CLIENT_EVENTS) name!: EventName;
  /** Mã ngẫu nhiên của trình duyệt khách (chưa đăng nhập) */
  @IsOptional() @Matches(/^[A-Za-z0-9-]{8,64}$/) anonId?: string;
  @IsOptional() @IsObject() props?: Record<string, unknown>;
}

/** Sự kiện từ trang danh mục mẫu: tách khỏi số liệu thật, khách cũng phát được */
const DEMO_EVENTS = new Set<EventName>(['demo_viewed', 'demo_signup_clicked']);
/** Sự kiện chỉ phát một lần mỗi người; còn lại một lần mỗi ngày */
const ONCE = new Set<EventName>(['onboarding_skipped']);

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;

@Controller('events')
class AnalyticsController {
  private hits = new Map<string, { at: number; n: number }>();

  constructor(private analytics: AnalyticsService) {}

  /** Sự kiện phía trình duyệt; tên và thuộc tính chỉ nhận theo từ điển, chống trùng theo ngày */
  @Post()
  @HttpCode(204)
  @UseGuards(OptionalJwtAuthGuard)
  async track(@CurrentUser() user: AuthUser | null, @Body() dto: EventDto, @Ip() ip: string) {
    if (!user && !DEMO_EVENTS.has(dto.name)) return;
    if (this.limited(user?.id ?? ip)) return;
    await this.analytics.track(dto.name, {
      userId: user?.id ?? null,
      anonId: user ? null : (dto.anonId ?? null),
      props: dto.props,
      sample: DEMO_EVENTS.has(dto.name),
      dedupeKey: ONCE.has(dto.name) ? dto.name : `${dto.name}:${vnDateKey()}`,
    });
  }

  /** Giới hạn đơn giản theo người dùng / IP để khách không ghi tràn bảng sự kiện */
  private limited(key: string) {
    const now = Date.now();
    const h = this.hits.get(key);
    if (!h || now - h.at > WINDOW_MS) {
      if (this.hits.size > 10_000) this.hits.clear();
      this.hits.set(key, { at: now, n: 1 });
      return false;
    }
    return ++h.n > MAX_PER_WINDOW;
  }
}

@Global()
@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
