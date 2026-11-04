import type { ReviewPoint } from '@dautu/contracts';
import { corporateActionReviewPoints, sortBySeverity } from './review-points';

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
