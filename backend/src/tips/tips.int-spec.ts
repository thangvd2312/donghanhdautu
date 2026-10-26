import { NotFoundException } from '@nestjs/common';
import type { AdvisorToolData } from '../advisor/tool-data';
import type { VerifierService } from '../advisor/verifier.service';
import { AiUsageService } from '../ai/ai-usage.service';
import type { LlmService } from '../alerts/llm.service';
import type { PriceAlertsService } from '../alerts/price-alerts.service';
import type { AnalyticsService } from '../analytics/analytics.service';
import type { MarketService } from '../market/market.service';
import type { TrackedSymbolResolver } from '../market/tracked-symbol.resolver';
import type { CryptoNewsService } from '../news/crypto-news.service';
import type { PlanAssetsService } from '../plans/plan-assets.service';
import type { PortfolioService } from '../portfolio/portfolio.service';
import { testPrisma, testUser } from '../test-utils/test-db';
import { WatchlistService } from '../watchlist/watchlist.service';
import { TipsService } from './tips.service';

const prisma = testPrisma();
afterAll(() => prisma.$disconnect());

const STOCKS = new Set(['HPG', 'FPT']);
const market = {
  stockSymbols: () => Promise.resolve(STOCKS),
  binance: { quotes: new Map([['BTCUSDT', { price: 60_000 }]]) },
  snapshot: () => ({ indices: [{ symbol: 'VNINDEX', price: 1300 }] }),
  cryptoDetail: () => Promise.resolve({ technicals: { note: 'thiếu' } }),
  usdtVnd: { rate: 26_000 },
  priceInfo: () => ({ value: 25_000, status: 'fresh', source: 'test', asOf: null }),
  goldQuotes: () => [],
} as unknown as MarketService;
const symbols = {
  resolve: (t: string, s: string) => {
    if (t === 'stock' && STOCKS.has(s)) return Promise.resolve(s);
    if (t === 'crypto' && s === 'BTC') return Promise.resolve('BTCUSDT');
    return Promise.reject(new NotFoundException(`Không có ${s}`));
  },
} as unknown as TrackedSymbolResolver;
const assets = {
  priceNative: (t: string) => ({
    value: t === 'crypto' ? 60_000 : 25_000,
    status: 'fresh',
    source: 'Vietcap',
    asOf: null,
  }),
} as unknown as PlanAssetsService;
const portfolio = {
  valuation: () =>
    Promise.resolve({
      totalValue: 100_000_000,
      holdings: [
        { assetType: 'cash', symbol: 'VND', quantity: 50_000_000, marketValue: 50_000_000, costValue: 50_000_000 },
      ],
    }),
} as unknown as PortfolioService;
const TECH = {
  lastClose: 25_000,
  returnPct: { '1w': 12.5, '1m': 20 },
  fromHigh52wPct: -1.2,
  priceVsMa50Pct: 8,
  rsi14: 78.4,
  lastVolumeVsAvg20: 1.2,
};
const toolData = {
  stock: () => Promise.resolve({ source: 'Vietcap', quote: { price: 25_000 }, technicals: TECH, company: null }),
} as unknown as AdvisorToolData;
const verifier = {
  verify: () => Promise.resolve({ status: 'verified', issues: [], discarded: 0, checkedAt: '' }),
} as unknown as VerifierService;
const cryptoNews = { all: () => Promise.resolve([]) } as unknown as CryptoNewsService;
const priceAlerts = {
  create: async (userId: string, dto: { assetType: string; symbol: string; direction: string; targetPrice: number }) =>
    prisma.priceAlert.create({ data: { ...dto, userId } }),
} as unknown as PriceAlertsService;
const analytics = { track: () => Promise.resolve() } as unknown as AnalyticsService;

const calls: string[] = [];
function fakeLlm(enabled = true) {
  return {
    enabled,
    json: (o: { feature: string }) => {
      calls.push(o.feature);
      if (o.feature === 'tip_extract') {
        return Promise.resolve({
          assetType: 'stock',
          symbol: 'HPG',
          direction: 'buy',
          targetPrice: 35,
          stopPrice: null,
          horizonDays: null,
          reasons: ['Sắp có hợp đồng lớn'],
          promises: ['ăn chắc'],
          citesSource: false,
        });
      }
      return Promise.resolve({
        dataSays: [
          { point: 'Giá đã tăng 12,5% trong 1 tuần, cách đỉnh 52 tuần 1,2%.', source: 'Vietcap' },
          { point: 'RSI14 đang ở 78,4, vùng quá mua.', source: 'Vietcap' },
          // Số bịa: không có trong dữ liệu → phải bị bỏ
          { point: 'Lợi nhuận quý gần nhất tăng 87%.', source: 'Vietcap' },
        ],
        unverifiable: ['Thông tin "sắp có hợp đồng lớn" chưa kiểm chứng được.'],
        verdict: 'Giá đã chạy trước tin; lý do của tin chưa có số liệu.',
        questions: ['Nếu giá giảm 15% sau khi mua, bạn sẽ làm gì?'],
      });
    },
  } as unknown as LlmService;
}

const service = (llm = fakeLlm()) =>
  new TipsService(
    prisma,
    market,
    symbols,
    assets,
    portfolio,
    llm,
    new AiUsageService(prisma),
    toolData,
    verifier,
    cryptoNews,
    new WatchlistService(prisma, market, symbols),
    priceAlerts,
    analytics,
  );
const TEXT = 'HPG múc ngay anh em, target 35, ăn chắc. Sắp có hợp đồng lớn!';

describe('soi lời khuyên (PostgreSQL)', () => {
  beforeEach(() => (calls.length = 0));

  it('bóc tách: mã, hướng, mục tiêu theo nghìn đồng quy ra đồng; chưa phân tích', async () => {
    const u = await testUser(prisma, 'tip-extract');
    const t = await service().create(u.id, { text: TEXT, sourceName: 'Nhóm VIP' });
    expect(t).toMatchObject({
      assetType: 'stock',
      symbol: 'HPG',
      status: 'extracted',
      sourceName: 'Nhóm VIP',
      claims: { direction: 'buy', targetPrice: 35_000, stopPrice: null, extractedBy: 'ai' },
    });
    expect(t.claims.candidates.map((c) => c.symbol)).toEqual(['HPG']);
  });

  it('tin không có mã nào: báo để người dùng chọn mã; chọn mã thì soi được', async () => {
    const u = await testUser(prisma, 'tip-nosymbol');
    const llm = fakeLlm(false);
    await expect(service(llm).create(u.id, { text: 'Mai thị trường bùng nổ, múc đi' })).rejects.toThrow('chọn mã');
    const t = await service(llm).create(u.id, { text: 'Mai thị trường bùng nổ, múc đi', symbol: 'fpt' });
    expect(t).toMatchObject({ symbol: 'FPT', claims: { direction: 'buy', extractedBy: 'rules' } });
  });

  it('phân tích: mức nóng, với riêng bạn, ý có số không khớp dữ liệu bị bỏ; soi lại không gọi AI lần nữa', async () => {
    const u = await testUser(prisma, 'tip-analyze');
    const s = service();
    const t = await s.create(u.id, { text: TEXT });
    const a = await s.analyze(u.id, t.id, {});
    expect(a.status).toBe('analyzed');
    expect(a.scoreParts.map((p) => p.key)).toEqual(
      expect.arrayContaining(['run_1w', 'near_high', 'rsi', 'urgency', 'no_stop']),
    );
    expect(a.score).toBeGreaterThanOrEqual(60);
    expect(a.hotLevel).toBe('very_hot');
    expect(a.priceAtCheck).toBe(25_000);
    expect(a.benchmark).toBe('VNINDEX');
    expect(a.personal).toMatchObject({ amountVnd: 10_000_000, amountAssumed: true, cash: { enough: true } });
    expect(a.report).toMatchObject({ ai: 'ok', droppedPoints: 1 });
    expect(a.report!.dataSays.map((d) => d.point).join(' ')).not.toContain('87%');
    expect(a.report!.dataSays).toHaveLength(2);

    const again = await s.analyze(u.id, t.id, {});
    expect(again.report).toEqual(a.report);
    expect(calls.filter((c) => c === 'tip_check')).toHaveLength(1);
  });

  it('đổi số tiền giả định: tính lại "với riêng bạn", không gọi AI', async () => {
    const u = await testUser(prisma, 'tip-amount');
    const s = service();
    const t = await s.create(u.id, { text: TEXT });
    await s.analyze(u.id, t.id, {});
    calls.length = 0;
    const r = await s.setAmount(u.id, t.id, 30_000_000);
    expect(r.personal).toMatchObject({
      amountVnd: 30_000_000,
      amountAssumed: false,
      weightAfterPct: 30,
      overWeight: true,
    });
    expect(calls).toEqual([]);
  });

  it('AI tắt: vẫn ra phiếu với mức nóng và dữ liệu thô', async () => {
    const u = await testUser(prisma, 'tip-noai');
    const s = service(fakeLlm(false));
    const t = await s.create(u.id, { text: TEXT });
    const a = await s.analyze(u.id, t.id, {});
    expect(a.report).toMatchObject({ ai: 'off', dataSays: [] });
    expect(a.report!.facts.map((f) => f.label)).toEqual(expect.arrayContaining(['Giá lúc soi', 'RSI14']));
    expect(a.score).not.toBeNull();
  });

  it('theo dõi bấm nhiều lần cùng lúc: một mã theo dõi, một cảnh báo giảm 10% so với giá lúc soi', async () => {
    const u = await testUser(prisma, 'tip-watch');
    const s = service();
    const t = await s.create(u.id, { text: TEXT });
    await s.analyze(u.id, t.id, {});
    await Promise.all([1, 2, 3].map(() => s.decide(u.id, t.id, { decision: 'watch' })));
    expect(await prisma.watchItem.count({ where: { userId: u.id } })).toBe(1);
    const alerts = await prisma.priceAlert.findMany({ where: { userId: u.id } });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ symbol: 'HPG', direction: 'below', targetPrice: 22_500 });
    const got = await s.get(u.id, t.id);
    expect(got).toMatchObject({ decision: 'watch', priceAlertId: alerts[0].id });
  });

  it('gắn kế hoạch: chỉ kế hoạch của chính người dùng, đúng mã', async () => {
    const u = await testUser(prisma, 'tip-plan');
    const other = await testUser(prisma, 'tip-plan-other');
    const s = service();
    const t = await s.create(u.id, { text: TEXT });
    await s.analyze(u.id, t.id, {});
    const plan = (o: string, symbol: string) =>
      prisma.investmentPlan.create({
        data: { userId: o, assetType: 'stock', symbol, thesis: 'x', exitConditions: 'y', nextReviewAt: new Date() },
      });
    const foreign = await plan(other.id, 'HPG');
    const wrongSymbol = await plan(u.id, 'FPT');
    const mine = await plan(u.id, 'HPG');
    await expect(s.decide(u.id, t.id, { decision: 'plan', planId: foreign.id })).rejects.toThrow(NotFoundException);
    await expect(s.decide(u.id, t.id, { decision: 'plan', planId: wrongSymbol.id })).rejects.toThrow(NotFoundException);
    const r = await s.decide(u.id, t.id, { decision: 'plan', planId: mine.id });
    expect(r).toMatchObject({ decision: 'plan', planId: mine.id });
    const draft = await s.planDraft(u.id, t.id);
    expect(draft).toMatchObject({
      symbol: 'HPG',
      targetPrice: 35_000,
      thesis: 'Theo lời khuyên nhận được: Sắp có hợp đồng lớn',
    });
  });

  it('mua thật trong 7 ngày sau khi soi: phiếu ghi "đã mua theo"; mua trước khi soi thì không', async () => {
    const u = await testUser(prisma, 'tip-bought');
    const s = service();
    const t = await s.create(u.id, { text: TEXT });
    const buy = (createdAt: Date) =>
      prisma.transaction.create({
        data: {
          userId: u.id,
          type: 'buy',
          date: createdAt,
          assetType: 'stock',
          symbol: 'HPG',
          currency: 'VND',
          createdAt,
        },
      });
    await buy(new Date(Date.now() - 3600_000));
    expect((await s.get(u.id, t.id)).boughtAt).toBeNull();
    const at = new Date();
    await buy(at);
    expect((await s.get(u.id, t.id)).boughtAt).toBe(at.toISOString());
    expect((await s.list(u.id, {})).items[0].boughtAt).toBe(at.toISOString());
  });

  it('hỏi tiếp cố vấn gọi cùng lúc: một cuộc trò chuyện, mở đầu bằng tin gốc và tóm tắt', async () => {
    const u = await testUser(prisma, 'tip-conv');
    const s = service();
    const t = await s.create(u.id, { text: TEXT });
    await s.analyze(u.id, t.id, {});
    const ids = await Promise.all([1, 2, 3].map(() => s.conversation(u.id, t.id)));
    expect(new Set(ids.map((i) => i.conversationId)).size).toBe(1);
    const msgs = await prisma.chatMessage.findMany({
      where: { conversationId: ids[0].conversationId },
      orderBy: { seq: 'asc' },
    });
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(JSON.stringify(msgs[1].content)).toContain('Mức nóng');
  });

  it('phiếu của người khác: 404 ở mọi thao tác', async () => {
    const u = await testUser(prisma, 'tip-owner');
    const other = await testUser(prisma, 'tip-intruder');
    const s = service();
    const t = await s.create(u.id, { text: TEXT });
    await expect(s.get(other.id, t.id)).rejects.toThrow(NotFoundException);
    await expect(s.analyze(other.id, t.id, {})).rejects.toThrow(NotFoundException);
    await expect(s.decide(other.id, t.id, { decision: 'ignore' })).rejects.toThrow(NotFoundException);
    await expect(s.conversation(other.id, t.id)).rejects.toThrow(NotFoundException);
    await expect(s.remove(other.id, t.id)).rejects.toThrow(NotFoundException);
    expect((await s.list(other.id, {})).items).toEqual([]);
    expect(await s.remove(u.id, t.id)).toEqual({ ok: true });
  });

  it('danh sách phân trang mới nhất trước; giới hạn số phiếu mỗi ngày', async () => {
    const u = await testUser(prisma, 'tip-list');
    const s = service(fakeLlm(false));
    for (let i = 0; i < 3; i++) await s.create(u.id, { text: `${TEXT} ${i}` });
    const p1 = await s.list(u.id, { limit: 2 });
    expect(p1.items).toHaveLength(2);
    expect(p1.items[0].excerpt).toContain(' 2');
    const p2 = await s.list(u.id, { limit: 2, cursor: p1.nextCursor! });
    expect(p2).toMatchObject({ nextCursor: null });
    expect(p2.items[0].excerpt).toContain(' 0');

    await prisma.tipCheck.createMany({
      data: Array.from({ length: 27 }, () => ({
        userId: u.id,
        text: 'x',
        assetType: 'stock',
        symbol: 'HPG',
        claims: {},
      })),
    });
    await expect(s.create(u.id, { text: TEXT })).rejects.toThrow('30 lời khuyên');
  });
});
