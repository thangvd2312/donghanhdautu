import type { ReviewPoint } from '@dautu/contracts';

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
