import type { AnalyticsService } from '../analytics/analytics.service';
import type { MarketService } from '../market/market.service';
import { vnDateKey } from '../market/types';
import type { PortfolioService } from '../portfolio/portfolio.service';
import { testPrisma, testUser } from '../test-utils/test-db';
import type { PlanAssetsService } from './plan-assets.service';
import { addDays } from './plan-rules';
import { PlansService } from './plans.service';

const prisma = testPrisma();
const assets = {
  normalize: (_t: string, s: string) => Promise.resolve(s.trim().toUpperCase()),
  displayName: (_t: string, s: string) => s,
  priceNative: () => ({ value: 100_000, status: 'fresh' }),
} as unknown as PlanAssetsService;
const portfolio = { valuation: () => Promise.resolve({ holdings: [] }) } as unknown as PortfolioService;
const analytics = { track: () => Promise.resolve() } as unknown as AnalyticsService;
const plans = new PlansService(prisma, {} as MarketService, portfolio, assets, analytics);

afterAll(() => prisma.$disconnect());

const dto = (over: Record<string, unknown> = {}) => ({
  assetType: 'stock' as const,
  symbol: 'VNM',
  thesis: 'Cổ tức đều',
  exitConditions: 'Biên lợi nhuận giảm hai quý',
  reviewEveryDays: 30,
  ...over,
});

describe('kế hoạch đầu tư (PostgreSQL)', () => {
  it('tạo đồng thời cùng một tài sản: chỉ một kế hoạch đang theo dõi', async () => {
    const u = await testUser(prisma, 'plan-race');
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => plans.create(u.id, dto())));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.investmentPlan.count({ where: { userId: u.id, status: 'active' } })).toBe(1);
  });

  it('kết thúc / xem lại đồng thời: chỉ lần đầu được ghi', async () => {
    const u = await testUser(prisma, 'plan-review-race');
    const p = await plans.create(u.id, dto());
    const results = await Promise.allSettled([
      plans.review(u.id, p.id, { decision: 'close' }),
      plans.review(u.id, p.id, { decision: 'close' }),
      plans.review(u.id, p.id, { decision: 'keep' }),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    expect(ok.length).toBeGreaterThanOrEqual(1);
    const reviews = await prisma.planReview.findMany({ where: { planId: p.id } });
    // Sau lần kết thúc đầu tiên không ghi thêm lần xem lại nào
    const firstClose = reviews.findIndex((r) => r.decision === 'close');
    expect(reviews.filter((r) => r.decision === 'close')).toHaveLength(1);
    expect(reviews.length).toBe(ok.length);
    expect(firstClose).toBeGreaterThanOrEqual(0);
  });

  it('sửa kế hoạch không gửi ngày xem lại: giữ ngày cũ, kể cả đã quá hạn', async () => {
    const u = await testUser(prisma, 'plan-edit-keep');
    const p = await plans.create(u.id, dto());
    const overdue = addDays(vnDateKey(), -3);
    await prisma.investmentPlan.update({
      where: { id: p.id },
      data: { nextReviewAt: new Date(`${overdue}T00:00:00Z`) },
    });
    const edited = await plans.update(u.id, p.id, dto({ thesis: 'Cổ tức đều, nợ thấp' }));
    expect(edited.nextReviewAt).toBe(overdue);
    expect(edited.thesis).toBe('Cổ tức đều, nợ thấp');
  });

  it('sửa chu kỳ xem lại: tính lại ngày theo chu kỳ mới; gửi ngày cụ thể thì dùng ngày đó', async () => {
    const u = await testUser(prisma, 'plan-edit-every');
    const p = await plans.create(u.id, dto());
    const changed = await plans.update(u.id, p.id, dto({ reviewEveryDays: 7 }));
    expect(changed.nextReviewAt).toBe(addDays(vnDateKey(), 7));
    const chosen = addDays(vnDateKey(), 12);
    const explicit = await plans.update(u.id, p.id, dto({ reviewEveryDays: 7, nextReviewAt: chosen }));
    expect(explicit.nextReviewAt).toBe(chosen);
  });

  it('mốc cắt lỗ cao hơn mốc chốt lời bị từ chối', async () => {
    const u = await testUser(prisma, 'plan-stop-target');
    await expect(plans.create(u.id, dto({ targetPrice: 50_000, stopPrice: 90_000 }))).rejects.toThrow('cắt lỗ');
  });
});
