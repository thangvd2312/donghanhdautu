import type { InvestmentPlan } from '@prisma/client';
import type { ReviewPoint } from '@dautu/contracts';
import { corporateActionReviewPoints, planReviewPoints, sortBySeverity } from './review-points';

const plan = (over: Partial<InvestmentPlan>) =>
  ({
    id: 'p1',
    assetType: 'stock',
    symbol: 'FPT',
    thesis: 'Tăng trưởng',
    targetPrice: null,
    stopPrice: 90_000,
    nextReviewAt: new Date('2026-06-01T00:00:00Z'),
    ...over,
  }) as InvestmentPlan;

describe('planReviewPoints', () => {
  it('raises a high point when the price is at the stop and carries the thesis in the question', () => {
    const [p] = planReviewPoints([plan({})], '2026-03-04', () => 85_000);
    expect(p).toMatchObject({ id: 'plan-stop:p1', severity: 'high', link: '/plans/p1' });
    expect(p.ask).toContain('Tăng trưởng');
  });

  it('raises a medium point without a question when a review is due', () => {
    const [p] = planReviewPoints(
      [plan({ stopPrice: null, nextReviewAt: new Date('2026-03-01T00:00:00Z') })],
      '2026-03-04',
      () => null,
    );
    expect(p).toMatchObject({ id: 'plan-due:p1', severity: 'medium', ask: null });
  });

  it('is empty when nothing is hit or due', () => {
    expect(planReviewPoints([plan({})], '2026-03-04', () => 100_000)).toEqual([]);
  });
});

describe('corporateActionReviewPoints', () => {
  it('summarises up to three missing events and counts them all', () => {
    const items = ['A', 'B', 'C', 'D'].map((symbol) => ({ symbol, title: 'Cổ tức', exDate: '2026-03-04' }));
    const [p] = corporateActionReviewPoints({ items });
    expect(p.title).toBe('4 sự kiện quyền chưa ghi vào sổ');
    expect(p.reason).toContain('A: Cổ tức (GDKHQ 04/03/2026)');
    expect(p.reason).not.toContain('D: ');
    expect(p.reason).toContain('…');
  });

  it('returns nothing without events or when the source failed', () => {
    expect(corporateActionReviewPoints({ items: [] })).toEqual([]);
    expect(corporateActionReviewPoints(null)).toEqual([]);
  });
});

describe('sortBySeverity', () => {
  it('orders high, medium, info and keeps equals in input order', () => {
    const pt = (id: string, severity: ReviewPoint['severity']) => ({ id, severity }) as ReviewPoint;
    const out = sortBySeverity([pt('i', 'info'), pt('m1', 'medium'), pt('h', 'high'), pt('m2', 'medium')]);
    expect(out.map((p) => p.id)).toEqual(['h', 'm1', 'm2', 'i']);
  });
});
