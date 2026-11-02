import { BINANCE_NOTICE_SOURCE } from './crypto-news';
import { coinRow, fixedRow, isNotice, reviewInput, stockRow, uniqueItems } from './news-review';
import type { ReviewItem } from './news-review';

const item = (over: Partial<ReviewItem> = {}): ReviewItem => ({
  url: 'https://cafef.vn/a.chn',
  title: 'HPG báo lãi quý 3 tăng 40%',
  summary: 'Hòa Phát lãi sau thuế 4.000 tỷ đồng.',
  source: 'CafeF',
  category: 'Doanh nghiệp',
  publishedAt: '2026-11-02T01:00:00.000Z',
  kind: 'stock',
  ...over,
});

describe('stockRow', () => {
  it('keeps the labels of a kept story, normalized', () => {
    const row = stockRow(item(), {
      i: 0,
      relevant: true,
      tickers: [' hpg', 'HPG', 'VN30', 'BTC1'],
      macroScore: 7,
      topic: ' doanh_nghiep ',
      impact: ' Tích cực cho nhóm thép. ',
    });
    expect(row).toMatchObject({
      url: 'https://cafef.vn/a.chn',
      kind: 'stock',
      relevant: true,
      tickers: ['HPG'],
      macroScore: 5,
      topic: 'doanh_nghiep',
      impact: 'Tích cực cho nhóm thép.',
    });
    expect(row.publishedAt).toEqual(new Date('2026-11-02T01:00:00.000Z'));
  });

  it('drops every label of a rejected story so it cannot reach alerts by ticker or macro score', () => {
    const row = stockRow(item({ title: 'Gia đình tỷ phú và con trai' }), {
      i: 0,
      relevant: false,
      tickers: ['VIC'],
      macroScore: 4,
      topic: 'khac',
      impact: 'x',
    });
    expect(row).toMatchObject({ relevant: false, tickers: [], macroScore: 0, topic: null, impact: null });
  });

  it('treats anything but an explicit true as rejected', () => {
    const v = { i: 0, relevant: 'true' as unknown as boolean, tickers: [], macroScore: 0, topic: '', impact: '' };
    expect(stockRow(item(), v).relevant).toBe(false);
  });
});

describe('coinRow / fixedRow / isNotice', () => {
  it('stores the coin verdict without stock labels', () => {
    expect(coinRow(item({ kind: 'coin' }), { i: 0, relevant: true })).toMatchObject({
      kind: 'coin',
      relevant: true,
      tickers: [],
      macroScore: 0,
    });
    expect(fixedRow(item({ kind: 'coin' }), false)).toMatchObject({ kind: 'coin', relevant: false });
  });

  it('recognizes official Binance notices by source', () => {
    expect(isNotice({ source: BINANCE_NOTICE_SOURCE })).toBe(true);
    expect(isNotice({ source: 'Binance News' })).toBe(false);
  });
});

describe('uniqueItems', () => {
  it('keeps one copy per link, the stock one when a story is in both', () => {
    const out = uniqueItems([
      item({ kind: 'coin', title: 'coin copy' }),
      item({ kind: 'stock', title: 'stock copy' }),
      item({ url: 'https://coin68.com/b', kind: 'coin' }),
    ]);
    expect(out.map((n) => [n.url, n.kind])).toEqual([
      ['https://cafef.vn/a.chn', 'stock'],
      ['https://coin68.com/b', 'coin'],
    ]);
  });
});

describe('reviewInput', () => {
  it('sends only the text needed to judge, with short summaries', () => {
    const [x] = JSON.parse(reviewInput([item({ summary: 'a'.repeat(500) })])) as Record<string, unknown>[];
    expect(Object.keys(x).sort()).toEqual(['category', 'i', 'source', 'summary', 'title']);
    expect((x.summary as string).length).toBe(300);
  });
});
