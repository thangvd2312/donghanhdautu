import { Injectable, Logger } from '@nestjs/common';
import { NotifierService } from '../alerts/notifier.service';
import { vnDateKey } from '../market/types';
import { PrismaService } from '../prisma/prisma.service';
import { addMonthsKey, REVIEW_MONTHS } from './deployment.plan';

const day = (key: string) => new Date(`${key}T00:00:00Z`);
const trieu = (n: number) => `${String(Math.round(n / 100_000) / 10).replace('.', ',')} tr`;

/** Nhắc đợt mua đến hạn và nhắc xem lại kế hoạch giải ngân (worker, 8:00 hằng ngày) */
@Injectable()
export class DeploymentReminderService {
  private log = new Logger(DeploymentReminderService.name);

  constructor(
    private prisma: PrismaService,
    private notifier: NotifierService,
  ) {}

  /**
   * Đợt chưa làm có hạn tới hôm nay và chưa nhắc: mỗi kế hoạch một thông báo liệt kê các đợt. Mỗi đợt chỉ nhắc một lần;
   * đợt quá hạn vẫn hiện trên Hôm nay và trang kế hoạch.
   */
  async remindDue(today = vnDateKey()) {
    const steps = await this.prisma.deploymentStep.findMany({
      where: { status: 'pending', remindedAt: null, dueDate: { lte: day(today) }, plan: { status: 'active' } },
      include: { plan: { select: { userId: true } } },
      orderBy: [{ dueDate: 'asc' }, { seq: 'asc' }],
    });
    const byPlan = new Map<string, typeof steps>();
    for (const s of steps) byPlan.set(s.planId, [...(byPlan.get(s.planId) ?? []), s]);
    for (const [planId, list] of byPlan) {
      const items = list.map((s) => `${s.label} ${trieu(s.amount)}`);
      const sent = await this.notifier.send(list[0].plan.userId, {
        kind: 'deployment',
        severity: 'info',
        title: `Đến đợt mua theo kế hoạch giải ngân: ${list.length} việc`,
        body:
          `${items.slice(0, 4).join(' · ')}${items.length > 4 ? ` · và ${items.length - 4} việc khác` : ''}. ` +
          'Mua theo lịch, không cần chờ giá giảm; giá vừa tăng mạnh thì cũng không mua thêm ngoài kế hoạch.',
        dedupeKey: `deploy:${planId}:${today}`,
        link: '/deployment',
      });
      // Trùng dedupeKey (đã nhắc hôm nay) cũng đánh dấu; lỗi gửi thì để lượt sau thử lại
      if (sent !== null || (await this.notifier.exists(list[0].plan.userId, `deploy:${planId}:${today}`))) {
        await this.prisma.deploymentStep.updateMany({
          where: { id: { in: list.map((s) => s.id) } },
          data: { remindedAt: new Date() },
        });
      }
    }
    if (byPlan.size) this.log.log(`Nhắc đợt giải ngân cho ${byPlan.size} kế hoạch`);
  }

  /** Đến hạn xem lại (3 tháng một lần, cả khi đã mua xong): nhắc rồi dời hạn sang 3 tháng sau */
  async remindReview(today = vnDateKey()) {
    const due = await this.prisma.deploymentPlan.findMany({
      where: { status: { in: ['active', 'done'] }, nextReviewAt: { lte: day(today) } },
    });
    for (const p of due) {
      const reviewDate = p.nextReviewAt.toISOString().slice(0, 10);
      const sent = await this.notifier.send(p.userId, {
        kind: 'deployment',
        severity: 'info',
        title: 'Đến hạn xem lại kế hoạch giải ngân',
        body:
          'So tỷ trọng hiện tại với mục tiêu. Lệch quá 5 điểm thì dùng tiền mới lấp phần thiếu; hoàn cảnh thay đổi ' +
          '(thu nhập, lúc cần tiền, mức chịu lỗ) thì lập lại kế hoạch.',
        dedupeKey: `deploy-review:${p.id}:${reviewDate}`,
        link: '/deployment',
      });
      if (sent === null && !(await this.notifier.exists(p.userId, `deploy-review:${p.id}:${reviewDate}`))) continue;
      await this.prisma.deploymentPlan.update({
        where: { id: p.id },
        data: { remindedReviewFor: p.nextReviewAt, nextReviewAt: day(addMonthsKey(reviewDate, REVIEW_MONTHS)) },
      });
    }
    if (due.length) this.log.log(`Nhắc xem lại ${due.length} kế hoạch giải ngân`);
  }
}
