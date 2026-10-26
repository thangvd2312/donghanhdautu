import {
  classifyNotice,
  coinsIn,
  itemCoins,
  noticeCoins,
  parseBinanceNews,
  parseBinanceNotices,
  searchCryptoNews,
} from './crypto-news';
import type { CryptoNewsItem } from './crypto-news';
import { parseFeed } from './news-feeds';

const item = (over: Partial<CryptoNewsItem>): CryptoNewsItem => ({
  title: '',
  url: 'https://x/1',
  summary: '',
  source: 'CoinDesk',
  category: 'Coin',
  publishedAt: '2026-10-26T00:00:00.000Z',
  lang: 'en',
  coins: [],
  ...over,
});

describe('coinsIn', () => {
  it('mã viết hoa đứng riêng hoặc tên thường gọi; không bắt mã viết thường hay mã nằm trong từ khác', () => {
    expect(coinsIn('Bitcoin slips under $80,000', ['BTC', 'ETH'])).toEqual(['BTC']);
    expect(coinsIn('$SOL and ETH rally', ['BTC', 'ETH', 'SOL'])).toEqual(['ETH', 'SOL']);
    expect(coinsIn('Ethereum hoãn nâng cấp Glamsterdam', ['ETH'])).toEqual(['ETH']);
    expect(coinsIn('Regulators op-ed on solar power', ['OP', 'SOL'])).toEqual([]);
    expect(coinsIn('BTCUSDT perpetual', ['BTC'])).toEqual([]);
    expect(coinsIn('Ethereum Classic upgrade', ['ETC'])).toEqual(['ETC']);
  });
});

describe('Binance News (Binance Square)', () => {
  const vo = (over: Record<string, unknown>) => ({
    title: 'Bitcoin(BTC) Drops Below 80,000 USDT',
    subTitle: 'BTC fell…',
    authorName: 'Binance News',
    webLink: 'https://www.binance.com/en/square/post/1',
    date: 1793000946,
    tradingPairsV2: [{ code: 'BTC', symbol: 'BTCUSDT' }],
    ...over,
  });

  it('chỉ giữ tin của tài khoản Binance News có gắn mã coin, mã lấy từ nguồn', () => {
    const out = parseBinanceNews({
      data: {
        vos: [
          vo({}),
          vo({ authorName: 'CryptoKOL', webLink: 'https://www.binance.com/en/square/post/2' }),
          vo({ tradingPairsV2: [], webLink: 'https://www.binance.com/en/square/post/3' }),
          vo({ webLink: 'https://evil.example/4' }),
          'rác',
        ],
      },
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      coins: ['BTC'],
      source: 'Binance News',
      lang: 'en',
      publishedAt: new Date(1793000946 * 1000).toISOString(),
    });
  });

  it('dữ liệu sai dạng (nguồn đổi) → rỗng, không ném lỗi', () => {
    expect(parseBinanceNews(null)).toEqual([]);
    expect(parseBinanceNews({ data: { vos: 'x' } })).toEqual([]);
  });
});

describe('thông báo chính thức của Binance', () => {
  it('huỷ niêm yết giao ngay khác gỡ khỏi Futures / Alpha / cặp giao dịch', () => {
    expect(classifyNotice('delisting', 'Binance Will Delist EPIC, QUICK on 2026-10-28')).toBe('delisting');
    expect(
      classifyNotice('delisting', 'Binance Futures Will Delist PTBUSDT and MITOUSDT USDⓈ-M Perpetual Contracts'),
    ).toBe('delisting_other');
    expect(classifyNotice('delisting', 'Binance Alpha Will Remove PTB, AA (2026-10-23)')).toBe('delisting_other');
    expect(classifyNotice('delisting', 'Notice of Removal of Spot Trading Pairs - 2026-10-23')).toBe('delisting_other');
    expect(classifyNotice('maintenance', 'Binance Will Support the Filecoin (FIL) Network Upgrade')).toBe(
      'maintenance',
    );
  });

  it('mã coin từ tiêu đề thật', () => {
    expect(noticeCoins('Binance Will Delist EPIC, QUICK on 2026-10-28')).toEqual(['EPIC', 'QUICK']);
    expect(noticeCoins('Binance Will Support the Filecoin (FIL) Network Upgrade & Hard Fork')).toEqual(['FIL']);
    expect(
      noticeCoins('Binance Futures Will Delist PTBUSDT and MITOUSDT USDⓈ-M Perpetual Contracts (2026-10-23)'),
    ).toEqual(['PTB', 'MITO']);
  });

  it('bài viết → link thông báo, bỏ bài thiếu mã / ngày', () => {
    const out = parseBinanceNotices(
      {
        data: {
          catalogs: [
            {
              articles: [
                {
                  title: 'Binance Will Delist EPIC, QUICK on 2026-10-28',
                  code: '290a660c0b2e4e888c582cd29ecf9ecc',
                  releaseDate: 1792747808273,
                },
                { title: 'Không mã', code: '../../x', releaseDate: 1792747808273 },
                { title: 'Không ngày', code: '290a660c0b2e4e888c582cd29ecf9ecd' },
              ],
            },
          ],
        },
      },
      'delisting',
    );
    expect(out).toEqual([
      expect.objectContaining({
        url: 'https://www.binance.com/en/support/announcement/detail/290a660c0b2e4e888c582cd29ecf9ecc',
        notice: 'delisting',
        coins: ['EPIC', 'QUICK'],
      }),
    ]);
  });
});

describe('itemCoins / searchCryptoNews', () => {
  const tagged = item({ title: 'Gold and copper outlook', coins: ['XAU', 'BTC'], source: 'Binance News' });
  const rss = item({ title: 'Solana upgrade ships', summary: 'Also mentions Bitcoin', url: 'https://x/2' });

  it('tin đã gắn mã dùng mã nguồn; RSS tìm trong tiêu đề, `deep` thì cả tóm tắt', () => {
    expect(itemCoins(tagged, ['BTC', 'ETH'])).toEqual(['BTC']);
    expect(itemCoins(rss, ['BTC', 'SOL'])).toEqual(['SOL']);
    expect(itemCoins(rss, ['BTC', 'SOL'], true)).toEqual(['BTC', 'SOL']);
  });

  it('query là mã coin → tin về coin đó; từ khoá → tìm chữ; trống → mới nhất', () => {
    expect(searchCryptoNews([tagged, rss], 'sol', 5)).toEqual([rss]);
    expect(searchCryptoNews([tagged, rss], 'SOLUSDT', 5)).toEqual([rss]);
    expect(searchCryptoNews([tagged, rss], 'copper outlook', 5)).toEqual([tagged]);
    expect(searchCryptoNews([tagged, rss], undefined, 1)).toEqual([tagged]);
  });
});

describe('parseFeed — link tương đối (Coin68)', () => {
  it('ghép với baseUrl', () => {
    const xml = '<rss><channel><item><title>A</title><link>/bai-viet/</link></item></channel></rss>';
    expect(parseFeed(xml, { url: 'u', source: 'Coin68', category: 'Coin', baseUrl: 'https://coin68.com' })[0].url).toBe(
      'https://coin68.com/bai-viet/',
    );
  });
});
