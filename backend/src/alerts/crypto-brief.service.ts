import { Injectable, Logger } from '@nestjs/common';
import { CRYPTO_BRIEF_PROMPT } from '../advisor/prompt';
import { MarketService } from '../market/market.service';
import { CryptoMarketProvider } from '../market/providers/crypto-market.provider';
import type { CryptoGlobal, FearGreed } from '../market/providers/crypto-market.provider';
import { VN_TZ, vnDateKey } from '../market/types';
import { itemCoins } from '../news/crypto-news';
import type { CryptoNewsItem } from '../news/crypto-news';
import { CryptoNewsService } from '../news/crypto-news.service';
import { PortfolioService } from '../portfolio/portfolio.service';
import { PrismaService } from '../prisma/prisma.service';
import { RISK_TYPE_LABEL } from '../profile/quiz';
import { AlertAudience } from './alert-audience.service';
import type { UserCoin } from './alert-audience.service';
import { BriefQueueService } from './brief-queue.service';
import { BriefContent, BriefRunService } from './brief-run.service';
import { LlmService } from './llm.service';
import { writeChecked } from './number-check';

const LABEL = 'Bản tin coin';

/** Kỳ của bản tin hằng giờ theo giờ VN: "2026-10-26T15" (mỗi người một bản tin mỗi kỳ) */
export function cryptoPeriod(d = new Date()) {
  const hour = new Intl.DateTimeFormat('en-GB', { timeZone: VN_TZ, hour: '2-digit', hour12: false }).format(d);
  return `${vnDateKey(d)}T${hour.padStart(2, '0').replace('24', '00')}`;
}

/** "2026-10-26T15" → "15:00 26/10" */
const periodLabel = (period: string) => `${period.slice(11, 13)}:00 ${period.slice(8, 10)}/${period.slice(5, 7)}`;

const BRIEF_SCHEMA = {
  type: 'object',
  properties: { headline: { type: 'string' }, markdown: { type: 'string' } },
  required: ['headline', 'markdown'],
  additionalProperties: false,
};

/** Tin trong chừng này giờ gần nhất: bản tin mỗi giờ, lấy rộng hơn một chút để không sót tin đăng muộn */
const NEWS_WINDOW_MS = 3 * 3600_000;
/** Thông báo của Binance về coin của người dùng: còn hiệu lực lâu hơn tin thường */
const NOTICE_WINDOW_MS = 7 * 24 * 3600_000;
/** BTC, ETH luôn có trong bản tin làm mốc so sánh thị trường */
const REFERENCE_COINS = ['BTCUSDT', 'ETHUSDT'];

const round = (v: number | null | undefined, d = 2) =>
  v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d;

export interface CoinFacts {
  pair: string;
  priceUsdt: number | null;
  change1hPct: number | null;
  change24hPct: number | null;
  change7dPct: number | null;
}

export interface HoldingFacts {
  weightPct: number;
  pnlPct: number | null;
  priceStatus: string;
}

/** Tin cho một người: tin theo từng coin (tối đa 3 / coin), tin chung, thông báo Binance về coin của họ, niêm yết mới */
export function selectCryptoNews(items: CryptoNewsItem[], coins: UserCoin[], now: number) {
  const recent = items.filter((i) => Date.parse(i.publishedAt) > now - NEWS_WINDOW_MS);
  const bases = coins.map((c) => c.base);
  const slim = (i: CryptoNewsItem) => ({
    title: i.title,
    url: i.url,
    source: i.source,
    language: i.lang,
    publishedAt: i.publishedAt,
  });
  const used = new Set<string>();
  const byCoin = coins.flatMap((c) =>
    recent
      .filter((i) => !i.notice && itemCoins(i, [c.base]).length)
      .slice(0, 3)
      .map((i) => {
        used.add(i.url);
        return { coin: c.base, ...slim(i) };
      }),
  );
  const general = recent
    .filter((i) => !i.notice && !used.has(i.url))
    .slice(0, 5)
    .map(slim);
  const officialNotices = items
    .filter((i) => i.notice && Date.parse(i.publishedAt) > now - NOTICE_WINDOW_MS && itemCoins(i, bases).length)
    .map((i) => ({ type: i.notice, coins: itemCoins(i, bases), ...slim(i) }));
  const newListings = recent
    .filter((i) => i.notice === 'listing')
    .slice(0, 3)
    .map(slim);
  return { byCoin, general, officialNotices, newListings };
}

/**
 * Bản tin coin mỗi giờ, cả cuối tuần (coin giao dịch 24/7), cho người đang giữ hoặc theo dõi coin.
 * Như bản tin sáng / chiều: lưu thành cuộc trò chuyện với cố vấn để hỏi tiếp, số liệu được đối chiếu trước khi gửi.
 */
@Injectable()
export class CryptoBriefService {
  private log = new Logger(CryptoBriefService.name);

  constructor(
    private prisma: PrismaService,
    private market: MarketService,
    private cryptoMarket: CryptoMarketProvider,
    private portfolio: PortfolioService,
    private news: CryptoNewsService,
    private audience: AlertAudience,
    private llm: LlmService,
    private runs: BriefRunService,
    private queue: BriefQueueService,
  ) {
    queue.register('crypto', (userId, period) => this.generate(userId, false, period));
  }

  /** Đầu mỗi giờ (worker/scheduled-jobs.ts) */
  async runAll() {
    if (!this.llm.enabled) return;
    const wanting = new Set(
      (await this.prisma.investorProfile.findMany({ where: { cryptoBrief: true }, select: { userId: true } })).map(
        (p) => p.userId,
      ),
    );
    const users = (await this.audience.withCoins()).filter((u) => wanting.has(u.id));
    const period = cryptoPeriod();
    this.log.log(`${LABEL} ${period}: xếp việc cho ${users.length} người dùng`);
    await this.queue.enqueue(
      'crypto',
      period,
      users.map((u) => u.id),
    );
  }

  /** Tạo bản tin cho một người. `force` = bỏ qua chống trùng trong kỳ (nút "Gửi thử") */
  generate(userId: string, force = false, period = cryptoPeriod()) {
    const key = `brief:crypto:${period}${force ? `:${Date.now()}` : ''}`;
    return this.runs.run(userId, key, () => this.build(userId, period));
  }

  private async build(userId: string, period: string): Promise<BriefContent | null> {
    const context = await this.context(userId);
    // Không còn giữ / theo dõi coin nào: không có gì để viết
    if (!context) return null;
    const { result, unmatched } = await writeChecked(context, (feedback) =>
      this.llm.json<{ headline: string; markdown: string }>({
        tier: 'brief',
        feature: 'brief_crypto',
        userId,
        system: CRYPTO_BRIEF_PROMPT,
        user: JSON.stringify(context) + feedback,
        schema: BRIEF_SCHEMA,
        effort: 'medium',
        maxTokens: 8000,
      }),
    );
    if (!result?.markdown) throw new Error('AI không trả về bản tin coin');
    if (unmatched.length) this.log.warn(`${LABEL} (${userId}): số chưa đối chiếu được: ${unmatched.join(', ')}`);
    const caution = unmatched.length
      ? `\n\n> Lưu ý: chưa đối chiếu được các con số sau với dữ liệu thị trường / danh mục đã dùng: ${unmatched.join(', ')}. Hãy kiểm tra lại trước khi dựa vào.`
      : '';
    const title = `${LABEL} ${periodLabel(period)}`;
    return {
      title,
      prompt: `[Thời điểm hiện tại: ${nowVn()}]\n${title}`,
      body: result.markdown + caution,
      notification: {
        kind: 'crypto_brief',
        severity: 'info',
        title: `${title}: ${result.headline}`.slice(0, 180),
        body: `${LABEL} đã sẵn sàng. Bấm "Xem bản tin" để đọc chi tiết và hỏi thêm cố vấn ngay trong đó.`,
      },
    };
  }

  private async context(userId: string) {
    const [me] = await this.audience.withCoins([userId]);
    if (!me?.coins.length) return null;
    await this.market.ensureFresh();
    const [valuation, fearGreed, global, items] = await Promise.all([
      this.portfolio.valuation(userId),
      this.cryptoMarket.fearGreed().catch(() => null),
      this.cryptoMarket.global().catch(() => null),
      this.news.all(),
    ]);
    const profile = me.profile;
    const pairs = [...new Set([...me.coins.map((c) => c.pair), ...REFERENCE_COINS])];
    const facts = new Map(await Promise.all(pairs.map(async (p) => [p, await this.coinFacts(p)] as const)));
    const held = new Map(
      valuation.holdings
        .filter((h) => h.assetType === 'crypto')
        .map((h) => [
          h.symbol,
          { weightPct: round(h.weightPct), pnlPct: round(h.pnlPct), priceStatus: h.price.status },
        ]),
    );
    return {
      briefType: 'Bản tin coin hằng giờ (người đọc nhận mỗi giờ: tập trung vào điều mới so với giờ trước)',
      now: nowVn(),
      investor: profile
        ? {
            type: RISK_TYPE_LABEL[profile.riskType],
            goal: profile.goal,
            horizon: profile.horizon,
            maxDrawdownPct: profile.maxDrawdownPct,
            fomoProne: profile.fomoProne,
          }
        : 'chưa khảo sát',
      yourCoins: me.coins.map((c) => {
        const h = held.get(c.pair);
        return {
          coin: c.base,
          status: c.held ? 'đang giữ' : 'đang theo dõi, chưa giữ',
          ...facts.get(c.pair),
          ...(c.held && h
            ? {
                weightInPortfolioPct: h.weightPct,
                pnlPct: h.pnlPct,
                priceStatus: h.priceStatus,
                exceedsYourMaxLoss: profile && h.pnlPct !== null ? h.pnlPct <= -profile.maxDrawdownPct : null,
              }
            : {}),
        };
      }),
      market: {
        source: 'Binance (giá, 24 giờ, 7 ngày), alternative.me (Sợ hãi & Tham lam), CoinGecko (tỷ lệ chiếm lĩnh BTC)',
        reference: REFERENCE_COINS.map((p) => ({ coin: p.replace(/USDT$/, ''), ...facts.get(p) })),
        fearGreedIndex: fearGreed && fearGreedView(fearGreed),
        btcDominance: global && globalView(global),
        usdtVnd: this.market.snapshot().usdt?.mid ?? null,
        note: 'priceUsdt tính bằng USDT. change1hPct = thay đổi khoảng 1 giờ qua; change24hPct = thay đổi 24 giờ; change7dPct = thay đổi 7 ngày. pnlPct = lãi/lỗ so với giá vốn; null khi chưa có giá (không phải hoà vốn). exceedsYourMaxLoss = true nghĩa là đã lỗ vượt mức lỗ tối đa người dùng chấp nhận.',
      },
      news: selectCryptoNews(items, me.coins, Date.now()),
    };
  }

  private async coinFacts(pair: string): Promise<CoinFacts> {
    const q = this.market.binance.quotes.get(pair);
    return {
      pair,
      priceUsdt: q ? q.price : null,
      change1hPct: round(await this.cryptoMarket.hourChange(pair).catch(() => null)),
      change24hPct: q ? round(q.changePct) : null,
      change7dPct: round(await this.cryptoMarket.weekChange(pair).catch(() => null)),
    };
  }
}

function fearGreedView(f: FearGreed) {
  return { value: f.value, label: f.label, previousDay: f.previous, asOf: f.asOf, source: f.source };
}

function globalView(g: CryptoGlobal) {
  return {
    btcDominancePct: round(g.btcDominancePct, 1),
    totalMarketCapChange24hPct: round(g.marketCapChange24hPct),
    asOf: g.asOf,
    source: g.source,
  };
}

function nowVn() {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: VN_TZ,
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date());
}
