import type { PriceStatus } from '@dautu/contracts';
import { NotifierService } from '../alerts/notifier.service';
import type { MarketGateway } from '../market/market.gateway';
import type { MarketService } from '../market/market.service';
import type { HistoryService } from '../portfolio/history.service';
import type { PortfolioService } from '../portfolio/portfolio.service';
import { JobRunner, NoAdvisoryLock } from '../runtime/job-runner';
import { testPrisma, testUser } from '../test-utils/test-db';
import { PortfolioAlertHistory } from './alert-history.service';
import { PortfolioAlertsRunner } from './portfolio-alerts.runner';
import { PortfolioAlertsService } from './portfolio-alerts.service';
import { PortfolioAlertRuleStore } from './rule-store.service';

const prisma = testPrisma();
const gateway = { notifyUser: () => undefined } as unknown as MarketGateway;
const notifier = new NotifierService(prisma, gateway);
const market = { ensureFresh: () => Promise.resolve() } as unknown as MarketService;

/** Định giá giả theo người dùng: FPT chiếm 60%, HPG 20%, tiền mặt 20%; trạng thái giá HPG đổi được */
let hpgStatus: PriceStatus = 'fresh';
const holding = (symbol: string, weightPct: number, assetType = 'stock', status: PriceStatus = 'fresh') => ({
  id: `h-${symbol}`,
  assetType,
  symbol,
  displayName: symbol,
  weightPct,
  price: { status, source: 'test', asOf: null, reason: null },
});
const portfolio = {
  valuation: () =>
    Promise.resolve({
      totalValue: 100_000_000,
      holdings: [holding('FPT', 60), holding('HPG', 20, 'stock', hpgStatus), holding('VND', 20, 'cash')],
    }),
} as unknown as PortfolioService;

/** Lịch sử giả: đỉnh 110 rồi về 88 (giảm 20%) không có dòng vốn; hoặc ngày cuối thiếu giá */
let lastDayPartial = false;
const history = {
  recentPoints: () => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
    const day = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
    const p = (n: number, value: number, partial = false) => ({
      date: day(n),
      value,
      netContributions: 100,
      profit: value - 100,
      preTrackingGain: 0,
      uncertainOpenings: [],
      dividends: 0,
      status: partial ? ('partial' as const) : ('complete' as const),
      missing: partial ? ['SJC'] : [],
    });
    return Promise.resolve({ today, points: [p(3, 100), p(2, 110), p(1, 100), p(0, 88, lastDayPartial)] });
  },
} as unknown as HistoryService;

const store = new PortfolioAlertRuleStore(prisma);
const historyCache = new PortfolioAlertHistory(history);
const service = new PortfolioAlertsService(prisma, portfolio, store, historyCache);
const runner = new PortfolioAlertsRunner(prisma, market, portfolio, store, historyCache, notifier);
const jobs = new JobRunner(new NoAdvisoryLock(), 1000);
const run = (drawdown: boolean) => jobs.run('portfolioAlerts.test', () => runner.runAll({ drawdown }));

afterAll(() => prisma.$disconnect());
beforeEach(() => {
  hpgStatus = 'fresh';
  lastDayPartial = false;
});

async function userWith(tag: string, kinds: ('concentration' | 'drift' | 'drawdown')[]) {
  const u = await testUser(prisma, tag);
  for (const kind of kinds) {
    await prisma.portfolioAlertRule.create({
      data: {
        userId: u.id,
        kind,
        enabled: true,
        thresholdPct: kind === 'concentration' ? 30 : 10,
        windowDays: kind === 'drawdown' ? 30 : null,
        targets: kind === 'drift' ? { stock: 50, crypto: 0, gold: 0, cash: 50 } : undefined,
        cooldownDays: 1,
      },
    });
  }
  return u;
}
const notes = (userId: string) =>
  prisma.notification.findMany({ where: { userId, kind: 'portfolio_health' }, orderBy: { dedupeKey: 'asc' } });

describe('cảnh báo theo tình trạng danh mục — lượt kiểm tra của worker (PostgreSQL)', () => {
  it('chạy hai lần trong ngày → mỗi quy tắc đúng một thông báo', async () => {
    const u = await userWith('palert-twice', ['concentration', 'drift', 'drawdown']);
    await run(true);
    await run(true);
    const list = await notes(u.id);
    expect(list.map((n) => n.dedupeKey.split(':').slice(0, 2).join(':'))).toEqual([
      'portfolio:concentration',
      'portfolio:drawdown',
      'portfolio:drift',
    ]);
    expect(list.find((n) => n.dedupeKey.startsWith('portfolio:concentration'))!.title).toBe(
      'FPT chiếm 60% (ngưỡng 30%)',
    );
    expect(list.find((n) => n.dedupeKey.startsWith('portfolio:drawdown'))!.severity).toBe('warning');
    // Kết quả lần kiểm tra được lưu để trang Hôm nay dùng
    const dd = await prisma.portfolioAlertRule.findFirst({ where: { userId: u.id, kind: 'drawdown' } });
    expect(dd!.lastCheck).toMatchObject({ status: 'firing' });
  });

  it('giá một mã đã cũ → không gửi gì, ghi lại lý do bỏ qua', async () => {
    const u = await userWith('palert-stale', ['concentration', 'drift']);
    hpgStatus = 'stale';
    await run(false);
    expect(await notes(u.id)).toHaveLength(0);
    const rule = await prisma.portfolioAlertRule.findFirst({ where: { userId: u.id, kind: 'concentration' } });
    expect(rule!.lastCheck).toMatchObject({ status: 'skipped' });
    expect(JSON.stringify(rule!.lastCheck)).toContain('HPG');
  });

  it('ngày cuối thiếu giá (tạm tính theo giá vốn) → không báo giảm từ đỉnh', async () => {
    const u = await userWith('palert-partial', ['drawdown']);
    lastDayPartial = true;
    await run(true);
    expect(await notes(u.id)).toHaveLength(0);
  });

  it('trong phiên chỉ kiểm tra tập trung / lệch tỷ trọng; quy tắc tắt không chạy', async () => {
    const u = await userWith('palert-intraday', ['concentration', 'drawdown']);
    await prisma.portfolioAlertRule.updateMany({
      where: { userId: u.id, kind: 'concentration' },
      data: { enabled: false },
    });
    await run(false);
    expect(await notes(u.id)).toHaveLength(0);
  });

  it('giới hạn tần suất: đã báo hôm qua, nhắc lại mỗi 3 ngày → hôm nay chưa báo', async () => {
    const u = await userWith('palert-cooldown', ['concentration']);
    await prisma.portfolioAlertRule.updateMany({ where: { userId: u.id }, data: { cooldownDays: 3 } });
    await prisma.notification.create({
      data: {
        userId: u.id,
        kind: 'portfolio_health',
        severity: 'info',
        title: 'FPT chiếm 58%',
        body: '',
        dedupeKey: 'portfolio:concentration:2000-01-01',
        sources: [],
        createdAt: new Date(Date.now() - 86_400_000),
      },
    });
    await run(false);
    expect(await notes(u.id)).toHaveLength(1);
    const preview = await service.preview(u.id);
    const c = preview.items.find((i) => i.kind === 'concentration')!;
    expect(c).toMatchObject({ status: 'firing', wouldNotify: false });
    expect(c.nextAllowedAt).not.toBeNull();
  });

  it('xem trước theo bản nháp không gửi và không ghi gì', async () => {
    const u = await testUser(prisma, 'palert-preview');
    const p = await service.preview(u.id, [
      { kind: 'concentration', enabled: true, thresholdPct: 50, cooldownDays: 1 },
      {
        kind: 'drift',
        enabled: false,
        thresholdPct: 10,
        cooldownDays: 3,
        targets: { stock: 80, crypto: 0, gold: 0, cash: 20 },
      },
    ]);
    expect(p.items.map((i) => [i.kind, i.status, i.wouldNotify])).toEqual([
      ['concentration', 'firing', true],
      ['drift', 'ok', false],
      ['drawdown', 'firing', false],
    ]);
    expect(await notes(u.id)).toHaveLength(0);
    expect(await prisma.portfolioAlertRule.count({ where: { userId: u.id } })).toBe(0);
  });

  it('lưu cài đặt: kiểm tra hợp lệ, trả từng trường, không lộ id', async () => {
    const u = await testUser(prisma, 'palert-save');
    await expect(
      service.save(u.id, 'drift', { enabled: true, thresholdPct: 10, cooldownDays: 3, targets: null }),
    ).rejects.toThrow();
    await expect(service.save(u.id, 'nope', { enabled: true, thresholdPct: 10, cooldownDays: 3 })).rejects.toThrow();
    const saved = await service.save(u.id, 'concentration', { enabled: true, thresholdPct: 40, cooldownDays: 7 });
    expect(Object.keys(saved).sort()).toEqual(
      [
        'cooldownDays',
        'enabled',
        'kind',
        'lastCheck',
        'lastNotifiedAt',
        'targets',
        'thresholdPct',
        'updatedAt',
        'windowDays',
      ].sort(),
    );
    expect(saved).toMatchObject({ enabled: true, thresholdPct: 40, cooldownDays: 7, lastCheck: { status: 'firing' } });
    const settings = await service.settings(u.id);
    expect(settings.rules.map((r) => [r.kind, r.enabled])).toEqual([
      ['concentration', true],
      ['drift', false],
      ['drawdown', false],
    ]);
  });
});
