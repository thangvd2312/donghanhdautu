import { Injectable } from '@nestjs/common';
import { ALERT_SYSTEM_PROMPT } from '../advisor/prompt';
import { MarketService } from '../market/market.service';
import { PortfolioService } from '../portfolio/portfolio.service';
import { RISK_TYPE_LABEL } from '../profile/quiz';
import type { AlertRecipient } from './alert-audience.service';
import { LlmService } from './llm.service';
import { NotifierService } from './notifier.service';
import type { NotificationInput } from './notifier.service';

interface AlertDraft {
  title: string;
  body: string;
  severity: 'info' | 'warning' | 'critical';
}

const ALERT_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    body: { type: 'string' },
    severity: { type: 'string', enum: ['info', 'warning', 'critical'] },
  },
  required: ['title', 'body', 'severity'],
  additionalProperties: false,
};

interface PersonalAlertEvent {
  kind: NotificationInput['kind'];
  dedupeKey: string;
  severity: AlertDraft['severity'];
  event: string;
  details: unknown;
  sources?: { title: string; url: string }[];
}

/** Nhờ AI viết lời nhắn hợp với hồ sơ & danh mục người đó; AI lỗi thì dùng câu chữ mẫu, rồi lưu + đẩy thông báo */
@Injectable()
export class PersonalAlertService {
  constructor(
    private market: MarketService,
    private portfolio: PortfolioService,
    private llm: LlmService,
    private notifier: NotifierService,
  ) {}

  async fire(user: AlertRecipient, e: PersonalAlertEvent) {
    await this.market.ensureFresh();
    const valuation = await this.portfolio.valuation(user.id);
    const p = user.profile;
    const draft = await this.llm.json<AlertDraft>({
      tier: 'fast',
      feature: 'alert',
      userId: user.id,
      system: ALERT_SYSTEM_PROMPT,
      user: JSON.stringify({
        event: e.event,
        details: e.details,
        investor: p
          ? {
              type: RISK_TYPE_LABEL[p.riskType],
              goal: p.goal,
              horizon: p.horizon,
              maxDrawdownPct: p.maxDrawdownPct,
              fomoProne: p.fomoProne,
            }
          : 'chưa khảo sát',
        portfolio: valuation.holdings.map((h) => ({
          name: h.displayName,
          type: h.typeLabel,
          weightPct: Math.round(h.weightPct * 10) / 10,
          pnlPct: h.pnlPct === null ? null : Math.round(h.pnlPct * 10) / 10,
          // Tính sẵn để AI không tự so sánh số (đã thấy cả model mạnh nói "tiệm cận" khi đã vượt)
          exceedsYourMaxLoss: p && h.pnlPct !== null ? h.pnlPct <= -p.maxDrawdownPct : null,
        })),
      }),
      schema: ALERT_SCHEMA,
    });
    return this.notifier.send(user.id, {
      kind: e.kind,
      dedupeKey: e.dedupeKey,
      sources: e.sources,
      ...(draft ?? {
        title: e.event.slice(0, 160),
        body: 'Mở trang cố vấn để xem phân tích chi tiết về sự kiện này đối với danh mục của bạn.',
        severity: e.severity,
      }),
    });
  }
}
