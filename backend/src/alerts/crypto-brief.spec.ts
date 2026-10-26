import type { CryptoNewsItem } from '../news/crypto-news';
import { cryptoPeriod, selectCryptoNews } from './crypto-brief.service';

const NOW = Date.parse('2026-10-26T12:00:00Z');
const at = (hoursAgo: number) => new Date(NOW - hoursAgo * 3600_000).toISOString();
const item = (title: string, over: Partial<CryptoNewsItem> = {}): CryptoNewsItem => ({
  title,
  url: `https://x/${title}`,
  summary: '',
  source: 'CoinDesk',
  category: 'Coin',
  publishedAt: at(1),
  lang: 'en',
  coins: [],
  ...over,
});
const coins = [
  { pair: 'SOLUSDT', base: 'SOL', held: true },
  { pair: 'EPICUSDT', base: 'EPIC', held: false },
];

describe('chọn tin cho bản tin coin', () => {
  it('tin theo từng coin (tối đa 3), tin chung không trùng, bỏ tin quá cũ', () => {
    const items = [
      item('Solana A'),
      item('Solana B'),
      item('Solana C'),
      item('Solana D'),
      item('Fed meeting'),
      item('Solana old', { publishedAt: at(4) }),
    ];
    const n = selectCryptoNews(items, coins, NOW);
    expect(n.byCoin.map((x) => x.title)).toEqual(['Solana A', 'Solana B', 'Solana C']);
    expect(n.general.map((x) => x.title)).toEqual(['Solana D', 'Fed meeting']);
  });

  it('thông báo Binance về coin của người dùng giữ tới 7 ngày; niêm yết mới chỉ trong cửa sổ tin', () => {
    const items = [
      item('Binance Will Delist EPIC, QUICK on 2026-10-28', {
        notice: 'delisting',
        coins: ['EPIC', 'QUICK'],
        publishedAt: at(72),
      }),
      item('Binance Will Delist ABC on 2026-10-28', { notice: 'delisting', coins: ['ABC'] }),
      item('New pair XYZ', { notice: 'listing', coins: ['XYZ'] }),
      item('Old listing', { notice: 'listing', publishedAt: at(48) }),
    ];
    const n = selectCryptoNews(items, coins, NOW);
    expect(n.officialNotices).toEqual([expect.objectContaining({ type: 'delisting', coins: ['EPIC'] })]);
    expect(n.newListings.map((x) => x.title)).toEqual(['New pair XYZ']);
    expect(n.general).toEqual([]);
  });
});

describe('kỳ bản tin hằng giờ', () => {
  it('theo giờ VN, kể cả qua nửa đêm UTC', () => {
    expect(cryptoPeriod(new Date('2026-10-26T08:05:00Z'))).toBe('2026-10-26T15');
    expect(cryptoPeriod(new Date('2026-10-26T17:30:00Z'))).toBe('2026-10-27T00');
  });
});
