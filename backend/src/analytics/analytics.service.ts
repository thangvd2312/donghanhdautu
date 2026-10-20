import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { VN_TZ } from '../market/types';
import { PrismaService } from '../prisma/prisma.module';
import { cleanProps, EventName, RETENTION_DAYS } from './events';

export interface TrackOptions {
  userId?: string | null;
  anonId?: string | null;
  props?: Record<string, unknown>;
  sample?: boolean;
  dedupeKey?: string;
}

/** Ghi sự kiện đo hành vi. Không bao giờ làm hỏng thao tác chính: lỗi chỉ ghi log. */
@Injectable()
export class AnalyticsService {
  private log = new Logger(AnalyticsService.name);

  constructor(private prisma: PrismaService) {}

  async track(name: EventName, o: TrackOptions) {
    const actor = o.userId ?? (o.anonId ? `anon:${o.anonId}` : null);
    if (!actor) return;
    try {
      await this.prisma.analyticsEvent.create({
        data: {
          name,
          userId: o.userId ?? null,
          anonId: o.userId ? null : (o.anonId ?? null),
          actor,
          sample: o.sample ?? false,
          props: cleanProps(name, o.props),
          dedupeKey: o.dedupeKey ?? null,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return;
      this.log.warn(`Không ghi được sự kiện ${name}: ${(e as Error).message}`);
    }
  }

  /** Bản tin gắn với cuộc trò chuyện (nếu có) — để đo lượt mở và hỏi tiếp */
  async briefOf(conversationId: string) {
    const run = await this.prisma.briefRun.findFirst({
      where: { conversationId },
      select: { key: true },
    });
    return run ? { key: run.key, kind: run.key.split(':')[1] } : null;
  }

  /** Chính sách lưu giữ: xoá sự kiện cũ hơn RETENTION_DAYS ngày */
  @Cron('30 3 * * *', { timeZone: VN_TZ })
  async purge() {
    const before = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
    const { count } = await this.prisma.analyticsEvent.deleteMany({ where: { createdAt: { lt: before } } });
    if (count) this.log.log(`Đã xoá ${count} sự kiện cũ hơn ${RETENTION_DAYS} ngày`);
  }
}
