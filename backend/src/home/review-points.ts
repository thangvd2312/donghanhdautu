import type { InvestmentPlan } from '@prisma/client';
import type { ReviewPoint } from '@dautu/contracts';
import { planSignals } from '../plans/plan-rules';

/** Active plans that hit their own stop / target level or are due for review → "needs a look" points. */
export function planReviewPoints(
  plans: InvestmentPlan[],
  today: string,
  priceOf: (assetType: string, symbol: string) => number | null,
): ReviewPoint[] {
  // Kế hoạch: chạm mốc cắt lỗ / chốt lời tự đặt, đến hạn xem lại
  return plans.flatMap((p) =>
    planSignals(
      { ...p, nextReviewAt: p.nextReviewAt.toISOString().slice(0, 10) },
      today,
      priceOf(p.assetType, p.symbol),
    ).map((s) => ({
      id: `plan-${s.kind}:${p.id}`,
      severity: s.kind === 'stop' ? ('high' as const) : ('medium' as const),
      title: s.message,
      reason:
        s.kind === 'due'
          ? 'Đối chiếu luận điểm và điều kiện bạn đã đặt với dữ liệu hiện tại, rồi ghi quyết định giữ, điều chỉnh hay kết thúc.'
          : 'Đây là mốc bạn tự đặt khi lập kế hoạch. Xem lại điều kiện đã viết trước khi hành động.',
      link: `/plans/${p.id}`,
      ask:
        s.kind === 'due' ? null : `${s.message}. Luận điểm của tôi: "${p.thesis}". Tôi nên làm gì theo đúng kế hoạch?`,
    })),
  );
}

/** Rights events not yet in the ledger: shares, cost and P&L drift away from the real account until they are. */
export function corporateActionReviewPoints(
  actions: { items: { symbol: string; title: string; exDate: string }[] } | null,
): ReviewPoint[] {
  // Sự kiện quyền chưa ghi: số lượng / giá vốn / lãi lỗ đang lệch so với tài khoản thật
  return actions?.items.length
    ? [
        {
          id: 'corporate-actions',
          severity: 'medium',
          title: `${actions.items.length} sự kiện quyền chưa ghi vào sổ`,
          reason: `${actions.items
            .slice(0, 3)
            .map((a) => `${a.symbol}: ${a.title} (GDKHQ ${a.exDate.split('-').reverse().join('/')})`)
            .join(
              '; ',
            )}${actions.items.length > 3 ? '…' : ''}. Chưa ghi thì số cổ phiếu, giá vốn và lãi/lỗ sẽ lệch với tài khoản thật.`,
          link: '/portfolio',
          ask: null,
        },
      ]
    : [];
}

const SEVERITY_ORDER = { high: 0, medium: 1, info: 2 };

export function sortBySeverity(points: ReviewPoint[]): ReviewPoint[] {
  return [...points].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
