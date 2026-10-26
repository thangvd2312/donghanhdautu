import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { Notification as NotificationView } from '@dautu/contracts';
import { AiUsageService } from '../ai/ai-usage.service';
import { BriefsService } from './briefs.service';
import { LlmService } from './llm.service';
import { toNotificationView } from './notification.presenter';
import { WeeklyBriefService } from './weekly.service';

/** "Send me a test brief now": validates the kind and runs the brief under the daily AI quota. */
@Injectable()
export class BriefTestService {
  constructor(
    private briefs: BriefsService,
    private weekly: WeeklyBriefService,
    private aiUsage: AiUsageService,
    private llm: LlmService,
  ) {}

  async sendToSelf(userId: string, kind: string): Promise<NotificationView> {
    if (kind !== 'weekly' && kind !== 'morning' && kind !== 'closing')
      throw new BadRequestException('kind phải là morning, closing hoặc weekly');
    // Bản tin sáng / chiều do AI viết: AI tắt thì báo rõ, không tính lượt (bản tuần vẫn có bảng số khi không có AI)
    if (kind !== 'weekly' && !this.llm.enabled) {
      throw new ServiceUnavailableException('Trợ lý AI đang tắt nên chưa gửi thử được bản tin sáng / chiều');
    }
    // Gửi thử cũng gọi AI: giới hạn lượt mỗi ngày, một lượt mỗi lúc
    return toNotificationView(await this.aiUsage.run(userId, 'brief_test', () => this.generate(userId, kind)));
  }

  private async generate(userId: string, kind: 'weekly' | 'morning' | 'closing') {
    if (kind === 'weekly') {
      const w = await this.weekly.generate(userId, true);
      if (!w) throw new BadRequestException('Chưa có giao dịch nào trong sổ để tổng kết tuần');
      return w;
    }
    const n = await this.briefs.generate(userId, kind, true);
    if (!n) throw new BadRequestException('Không tạo được bản tin');
    return n;
  }
}
