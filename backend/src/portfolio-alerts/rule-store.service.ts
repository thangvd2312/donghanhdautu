import { Injectable } from '@nestjs/common';
import type { PortfolioAlertKind } from '@dautu/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { DEDUPE_PREFIX } from './notify';
import { ALERT_KINDS } from './rule-config';
import { toConfig } from './rule-row';

/** Reads a user's portfolio-alert rules and when each last notified them. */
@Injectable()
export class PortfolioAlertRuleStore {
  constructor(private prisma: PrismaService) {}

  /** Cấu hình cả ba loại (chưa lưu thì là mặc định đang tắt) + dòng DB nếu có */
  async configs(userId: string) {
    const rows = await this.prisma.portfolioAlertRule.findMany({ where: { userId } });
    return ALERT_KINDS.map((kind) => {
      const row = rows.find((r) => r.kind === kind) ?? null;
      return { kind, row, config: toConfig(kind, row) };
    });
  }

  /** Lần gần nhất đã gửi thông báo cho quy tắc này (nguồn sự thật: bảng Notification, không lưu riêng) */
  async lastNotifiedAt(userId: string, kind: PortfolioAlertKind) {
    const n = await this.prisma.notification.findFirst({
      where: { userId, kind: 'portfolio_health', dedupeKey: { startsWith: `${DEDUPE_PREFIX}${kind}:` } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    return n?.createdAt ?? null;
  }
}
