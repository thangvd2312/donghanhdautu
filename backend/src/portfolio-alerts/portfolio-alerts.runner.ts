import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PortfolioAlertRule as RuleRow } from '@prisma/client';
import type { PortfolioAlertKind } from '@dautu/contracts';
import { NotifierService } from '../alerts/notifier.service';
import { MarketService } from '../market/market.service';
import { vnDateKey } from '../market/types';
import { PortfolioService } from '../portfolio/portfolio.service';
import { PrismaService } from '../prisma/prisma.service';
import { PortfolioAlertHistory } from './alert-history.service';
import { evaluate } from './evaluators';
import { dedupeKey, notificationFor, notifyDecision } from './notify';
import { checkOf } from './portfolio-alerts.presenter';
import { ALERT_KINDS } from './rule-config';
import { PortfolioAlertRuleStore } from './rule-store.service';
import { toConfig } from './rule-row';

/** The worker's periodic check of every enabled portfolio-alert rule (worker/scheduled-jobs.ts). */
@Injectable()
export class PortfolioAlertsRunner {
  private log = new Logger(PortfolioAlertsRunner.name);

  constructor(
    private prisma: PrismaService,
    private market: MarketService,
    private portfolio: PortfolioService,
    private store: PortfolioAlertRuleStore,
    private history: PortfolioAlertHistory,
    private notifier: NotifierService,
  ) {}

  /**
   * Lượt kiểm tra của worker. `drawdown` chỉ chạy sau phiên (cần giá đóng cửa và lịch sử nhiều ngày); trong phiên chỉ
   * kiểm tra tập trung và lệch tỷ trọng (định giá hiện tại). Lỗi của một người không chặn người khác.
   */
  async runAll(opts: { drawdown: boolean }, now = new Date()) {
    const kinds: PortfolioAlertKind[] = opts.drawdown ? [...ALERT_KINDS] : ['concentration', 'drift'];
    const rows = await this.prisma.portfolioAlertRule.findMany({ where: { enabled: true, kind: { in: kinds } } });
    if (!rows.length) return { users: 0, sent: 0, skipped: 0 };
    await this.market.ensureFresh();
    const byUser = new Map<string, RuleRow[]>();
    for (const r of rows) byUser.set(r.userId, [...(byUser.get(r.userId) ?? []), r]);
    const total = { users: byUser.size, sent: 0, skipped: 0 };
    for (const [userId, list] of byUser) {
      try {
        const r = await this.runUser(userId, list, now);
        total.sent += r.sent;
        total.skipped += r.skipped;
      } catch (err) {
        this.log.error(`Cảnh báo danh mục của ${userId}: ${(err as Error).message}`);
      }
    }
    this.log.log(
      `Cảnh báo danh mục: ${total.users} người, gửi ${total.sent}, bỏ qua ${total.skipped} quy tắc vì dữ liệu chưa tin cậy`,
    );
    return total;
  }

  private async runUser(userId: string, rows: RuleRow[], now: Date) {
    const v = await this.portfolio.valuation(userId);
    const history = rows.some((r) => r.kind === 'drawdown') ? await this.history.get(userId, false) : null;
    let sent = 0;
    let skipped = 0;
    for (const row of rows) {
      const c = toConfig(row.kind as PortfolioAlertKind, row);
      const e = evaluate(c, v, history);
      if (e.status === 'skipped') {
        skipped++;
        this.log.log(`Bỏ qua ${c.kind} của ${userId}: ${e.headline}. ${e.reason}`);
      }
      await this.prisma.portfolioAlertRule.update({
        where: { id: row.id },
        data: { lastCheck: checkOf(e, now) as unknown as Prisma.InputJsonValue },
      });
      const decision = notifyDecision(e, c, await this.store.lastNotifiedAt(userId, c.kind), now);
      if (!decision.notify) continue;
      const created = await this.notifier.send(userId, {
        kind: 'portfolio_health',
        dedupeKey: dedupeKey(c.kind, vnDateKey(now)),
        ...notificationFor(e),
      });
      if (created) sent++;
    }
    return { sent, skipped };
  }
}
