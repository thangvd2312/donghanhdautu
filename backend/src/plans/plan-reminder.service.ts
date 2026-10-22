import { Injectable, Logger } from '@nestjs/common';
import { NotifierService } from '../alerts/notifier.service';
import { MarketService } from '../market/market.service';
import { vnDateKey } from '../market/types';
import { PrismaService } from '../prisma/prisma.service';
import { PlanAssetsService } from './plan-assets.service';

/** Daily reminder for plans that are due for review. */
@Injectable()
export class PlanReminderService {
  private log = new Logger(PlanReminderService.name);

  constructor(
    private prisma: PrismaService,
    private market: MarketService,
    private notifier: NotifierService,
    private assets: PlanAssetsService,
  ) {}

  /** 8:00 mỗi ngày (worker/scheduled-jobs.ts): nhắc các kế hoạch đến hạn xem lại (mỗi ngày xem lại chỉ nhắc một lần) */
  async remindDue() {
    await this.market.ensureFresh(); // tên hiển thị của vàng lấy từ bảng giá
    const today = vnDateKey();
    const due = await this.prisma.investmentPlan.findMany({
      where: { status: 'active', nextReviewAt: { lte: new Date(`${today}T00:00:00Z`) } },
    });
    for (const p of due) {
      const reviewDate = p.nextReviewAt.toISOString().slice(0, 10);
      if (p.remindedFor && p.remindedFor.toISOString().slice(0, 10) === reviewDate) continue;
      const name = this.assets.displayName(p.assetType, p.symbol);
      await this.notifier.send(p.userId, {
        kind: 'plan_review',
        severity: 'info',
        title: `Đến hạn xem lại kế hoạch ${name}`,
        body: 'Luận điểm ban đầu còn đúng không? Mở kế hoạch để đối chiếu với dữ liệu hiện tại rồi chọn giữ, điều chỉnh hay kết thúc.',
        dedupeKey: `plan:${p.id}:${reviewDate}`,
        link: `/plans/${p.id}`,
      });
      await this.prisma.investmentPlan.update({ where: { id: p.id }, data: { remindedFor: p.nextReviewAt } });
    }
    if (due.length) this.log.log(`Nhắc xem lại ${due.length} kế hoạch`);
  }
}
