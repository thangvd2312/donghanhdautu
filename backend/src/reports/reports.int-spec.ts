import { NotFoundException } from '@nestjs/common';
import type { MarketService } from '../market/market.service';
import type { VndirectProvider } from '../market/providers/vndirect.provider';
import { vnDateKey } from '../market/types';
import { addDays, daysBetween } from '../plans/plan-rules';
import { HistoryService } from '../portfolio/history.service';
import { PortfolioService } from '../portfolio/portfolio.service';
import { TransactionsService } from '../portfolio/transactions';
import { fakeMarket, testPrisma, testUser } from '../test-utils/test-db';
import { toCsv } from './report';
import { ReportsService } from './reports.service';

const prisma = testPrisma();
const today = vnDateKey();
const BASE: Record<string, number> = { FPT: 100_000, HPG: 25_000 };
/** Giá giả theo ngày, đổi mỗi ngày để lợi suất từng ngày khác 0 */
const px = (symbol: string, date: string) =>
  BASE[symbol] + ((daysBetween('2020-01-01', date) % 9) - 4) * (BASE[symbol] / 100);
const days = (n: number) => Array.from({ length: n }, (_, i) => addDays(today, -i)).reverse();

const market = {
  ...fakeMarket(),
  priceInfo: (t: string, symbol: string) => ({
    // Tiền mặt VND = 1 ₫ như MarketService
    value: t === 'cash' ? 1 : px(symbol, today),
    status: 'fresh',
    source: 'test',
    asOf: null,
  }),
  stockHistory: (symbol: string) =>
    Promise.resolve(
      symbol in BASE ? days(120).map((d) => ({ time: Date.parse(`${d}T02:00:00Z`) / 1000, close: px(symbol, d) })) : [],
    ),
  snapshot: () => ({ indices: [] }),
} as unknown as MarketService;
const vndirect = {
  rawCloses: (symbol: string) =>
    Promise.resolve(days(120).map((d) => ({ date: d, close: px(symbol, d), adjClose: px(symbol, d) }))),
} as unknown as VndirectProvider;

const transactions = new TransactionsService(prisma, market);
const portfolio = new PortfolioService(prisma, market, transactions);
const history = new HistoryService(prisma, market, transactions, vndirect);
const reports = new ReportsService(prisma, transactions, history);

afterAll(() => prisma.$disconnect());

/** Sổ mẫu 60 ngày: nạp, mua hai mã, bán một phần (phí, thuế), cổ tức, rút, phí riêng */
async function investor(tag: string) {
  const u = await testUser(prisma, tag);
  const d = (n: number) => addDays(today, -n);
  const add = (dto: Parameters<TransactionsService['create']>[1]) => transactions.create(u.id, dto);
  await add({ type: 'deposit', date: d(60), amount: 300_000_000 });
  await add({
    type: 'buy',
    date: d(50),
    assetType: 'stock',
    symbol: 'FPT',
    quantity: 1000,
    price: 99_000,
    fee: 150_000,
  });
  await add({ type: 'deposit', date: d(25), amount: 50_000_000 });
  await add({
    type: 'buy',
    date: d(20),
    assetType: 'stock',
    symbol: 'HPG',
    quantity: 2000,
    price: 25_500,
    fee: 76_000,
  });
  await add({
    type: 'sell',
    date: d(15),
    assetType: 'stock',
    symbol: 'FPT',
    quantity: 300,
    price: 103_000,
    fee: 46_000,
    tax: 31_000,
  });
  await add({ type: 'dividend', date: d(10), assetType: 'stock', symbol: 'FPT', amount: 1_400_000, tax: 70_000 });
  await add({ type: 'withdraw', date: d(5), amount: 20_000_000 });
  await add({ type: 'fee', date: d(3), amount: 22_000 });
  return u;
}

describe('báo cáo theo kỳ khớp màn hình (PostgreSQL)', () => {
  it('kỳ 30 ngày tới hôm nay = hiệu quả kỳ "1 tháng" của GET /portfolio/history', async () => {
    const u = await investor('report-1m');
    // Màn Lịch sử "1m": mốc đầu kỳ là cuối ngày hôm nay − 30 → báo cáo từ hôm nay − 29 tới hôm nay
    const [r, h] = await Promise.all([
      reports.report(u.id, { from: addDays(today, -29), to: today }),
      history.history(u.id, '1m'),
    ]);
    const p = h.period!;
    expect(r.hasData).toBe(true);
    expect(r.period.inProgress).toBe(true);
    expect(r.summary!.startValue.vnd).toBeCloseTo(p.startValue, 4);
    expect(r.summary!.endValue.vnd).toBeCloseTo(p.endValue, 4);
    expect(r.summary!.netFlows.vnd).toBeCloseTo(p.netFlows, 4);
    expect(r.summary!.profit.vnd).toBeCloseTo(p.profit, 4);
    expect(r.summary!.returnPct).toBeCloseTo(p.returnPct!, 9);
    expect(r.summary!.twrPct).toBeCloseTo(p.twrPct!, 9);
    expect(r.income!.dividends.vnd).toBeCloseTo(p.dividends, 4);
    expect(r.summary!.isEstimate).toBe(p.isEstimate);
    // Dòng vốn trong 30 ngày: nạp 50tr, rút 20tr
    expect(r.flows).toMatchObject({ deposits: { vnd: 50_000_000 }, withdrawals: { vnd: 20_000_000 } });
    expect(r.flows!.net.vnd).toBeCloseTo(p.netFlows, 4);
  });

  it('kỳ từ giao dịch đầu tiên tới hôm nay: tổng = GET /portfolio/performance và GET /portfolio', async () => {
    const u = await investor('report-all');
    const [r, perf, val] = await Promise.all([
      reports.report(u.id, { from: addDays(today, -60), to: today }),
      portfolio.performance(u.id),
      portfolio.valuation(u.id),
    ]);
    expect(r.summary!.startedInPeriod).toBe(true);
    expect(r.summary!.startValue.vnd).toBe(0);
    expect(r.summary!.endValue.vnd).toBeCloseTo(perf.totalValue, 4);
    expect(r.summary!.profit.vnd).toBeCloseTo(perf.totalProfit, 4);
    expect(r.flows!.net.vnd).toBeCloseTo(perf.netContributions, 4);
    expect(r.income!.realized.vnd).toBeCloseTo(perf.realized, 4);
    expect(r.income!.dividends.vnd).toBeCloseTo(perf.dividends, 4);
    expect(r.income!.feesAndTaxes.vnd).toBeCloseTo(perf.feesAndTaxes, 4);
    // Phân bổ cuối kỳ = định giá màn Danh mục
    expect(r.allocation!.total.vnd).toBeCloseTo(val.totalValue, 4);
    for (const h of val.holdings) {
      const row = r.allocation!.rows.find((x) =>
        h.assetType === 'cash' ? x.key === `cash:${h.symbol}` : x.key === `${h.assetType}:${h.symbol}`,
      )!;
      expect(row.weightPct).toBeCloseTo(h.weightPct, 9);
      expect(row.value.vnd).toBeCloseTo(h.marketValue ?? h.costValue, 4);
    }
    // Đóng góp từng tài sản + phần khác = lãi/lỗ
    const c = r.contributors!;
    expect(c.rows.reduce((s, x) => s + x.contribution.vnd!, 0) + c.other.vnd!).toBeCloseTo(perf.totalProfit, 4);
    expect(r.transactions).toHaveLength(8);
  });

  it('tháng trọn vẹn: chỉ giao dịch của tháng; báo cáo trước ngày giao dịch đầu tiên thì trống', async () => {
    const u = await investor('report-month');
    const month = addDays(`${today.slice(0, 7)}-01`, -1).slice(0, 7);
    const r = await reports.report(u.id, { month });
    expect(r.period).toMatchObject({ month, from: `${month}-01`, inProgress: false });
    expect(r.transactions.every((t) => t.date.startsWith(month))).toBe(true);
    const empty = await reports.report(u.id, { month: addDays(today, -400).slice(0, 7) });
    expect(empty).toMatchObject({ hasData: false, summary: null, transactions: [] });
    expect(empty.dataStart).toBe(addDays(today, -60));
  });

  it('lọc theo danh mục; danh mục của người khác → 404', async () => {
    const u = await investor('report-pf');
    const other = await portfolio.createPortfolio(u.id, 'Ví crypto');
    await transactions.create(u.id, {
      type: 'deposit',
      date: addDays(today, -2),
      amount: 7_000_000,
      portfolioId: other.id,
    });
    const own = await reports.report(u.id, { from: addDays(today, -29), to: today, portfolioId: other.id });
    expect(own.portfolio).toEqual({ id: other.id, name: 'Ví crypto' });
    expect(own.transactions).toHaveLength(1);
    expect(own.summary!.endValue.vnd).toBe(7_000_000);
    const all = await reports.report(u.id, { from: addDays(today, -29), to: today });
    expect(all.portfolio.name).toBe('Tất cả danh mục');
    expect(all.transactions.find((t) => t.grossValue === 7_000_000)!.portfolioName).toBe('Ví crypto');

    const stranger = await testUser(prisma, 'report-stranger');
    await expect(reports.report(stranger.id, { portfolioId: other.id })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('ẩn số tiền và mã ở backend: JSON và CSV không còn số tiền / mã', async () => {
    const u = await investor('report-mask');
    const r = await reports.report(u.id, { from: addDays(today, -60), to: today, mask: 'both' });
    const csv = toCsv(r, 'semicolon');
    for (const s of [JSON.stringify(r), csv]) {
      expect(s).not.toMatch(/FPT|HPG|300000000|1400000/);
    }
    expect(r.allocation!.rows.map((x) => x.name)).toEqual(expect.arrayContaining(['Mã 1', 'Mã 2']));
    expect(csv.startsWith('﻿Mục;Chỉ tiêu;')).toBe(true);
  });
});
