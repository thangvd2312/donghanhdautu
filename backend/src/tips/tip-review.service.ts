import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { TipCheck as TipRow } from '@prisma/client';
import type { TipAssetType, TipClaims, TipReviewResult } from '@dautu/contracts';
import { NotifierService } from '../alerts/notifier.service';
import { MarketService } from '../market/market.service';
import { PrismaService } from '../prisma/prisma.service';
import { REVIEW_DAYS, REVIEW_GIVE_UP_DAYS, reviewOutcome } from './tips.logic';
import { tipDisplayName } from './tips.presenter';

const DAY = 86_400_000;
/** Giá đóng cửa cũ hơn chừng này coi như không có giá (mã ngừng giao dịch, nguồn lỗi) */
const STALE_CLOSE_DAYS = 7;
const OUTCOME_TEXT: Record<TipReviewResult['outcome'], string> = {
  right: 'đi đúng hướng',
  wrong: 'đi ngược hướng',
  unclear: 'chưa rõ hướng',
};
const DECISION_TEXT: Record<string, string> = {
  ignore: 'Bạn đã bỏ qua.',
  watch: 'Bạn đã chọn theo dõi.',
  plan: 'Bạn đã viết kế hoạch.',
  practice: 'Bạn đã thử bằng tiền ảo.',
};

type Slot = 30 | 90;
const fmt = (v: number) => `${v > 0 ? '+' : ''}${v.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`;

/**
 * Chấm lại lời khuyên đã soi sau 30 / 90 ngày (worker, 15:30 hằng ngày, không gọi AI): giá đóng cửa gần nhất so với giá
 * lúc soi và với tham chiếu (VN-Index cho cổ phiếu, BTC cho coin), rồi báo cho người dùng. Mỗi mốc chấm và báo một lần.
 */
@Injectable()
export class TipReviewService {
  private log = new Logger(TipReviewService.name);

  constructor(
    private prisma: PrismaService,
    private market: MarketService,
    private notifier: NotifierService,
  ) {}

  async runDue(now = new Date()) {
    let done = 0;
    for (const days of REVIEW_DAYS) {
      const field = days === 30 ? 'review30' : 'review90';
      const due = await this.prisma.tipCheck.findMany({
        where: {
          status: 'analyzed',
          priceAtCheck: { not: null },
          createdAt: { lte: new Date(now.getTime() - days * DAY) },
          [field]: { equals: Prisma.DbNull },
        },
        orderBy: { createdAt: 'asc' },
        take: 500,
      });
      const closes = new Map<string, number | null>();
      for (const tip of due) {
        try {
          if (await this.review(tip, days, now, closes)) done++;
        } catch (e) {
          this.log.warn(`Chấm lại lời khuyên ${tip.id} (${days} ngày) lỗi: ${(e as Error).message}`);
        }
      }
    }
    if (done) this.log.log(`Đã chấm lại ${done} lời khuyên`);
    return done;
  }

  private async review(tip: TipRow, days: Slot, now: Date, closes: Map<string, number | null>) {
    const field = days === 30 ? 'review30' : 'review90';
    const assetType = tip.assetType as TipAssetType;
    const price = await this.close(assetType, tip.symbol, now, closes);
    const overdueDays = (now.getTime() - tip.createdAt.getTime()) / DAY - days;
    if (price === null && overdueDays < REVIEW_GIVE_UP_DAYS) return false; // thử lại ngày mai

    const claims = tip.claims as unknown as TipClaims;
    let result: TipReviewResult;
    if (price === null) {
      result = {
        at: now.toISOString(),
        price: null,
        changePct: null,
        benchmarkChangePct: null,
        hitTarget: false,
        hitStop: false,
        outcome: 'unclear',
      };
    } else {
      const bench = tip.benchmark && tip.benchmarkAtCheck ? await this.benchmark(tip.benchmark, now, closes) : null;
      result = {
        at: now.toISOString(),
        price,
        ...reviewOutcome({ assetType, claims, priceAtCheck: tip.priceAtCheck!, price }),
        benchmarkChangePct:
          bench !== null && tip.benchmarkAtCheck
            ? Math.round(((bench - tip.benchmarkAtCheck) / tip.benchmarkAtCheck) * 10_000) / 100
            : null,
      };
    }
    // Chỉ ghi khi mốc này còn trống: hai worker cùng chạy cũng không chấm / báo hai lần
    const { count } = await this.prisma.tipCheck.updateMany({
      where: { id: tip.id, [field]: { equals: Prisma.DbNull } },
      data: { [field]: result as unknown as Prisma.InputJsonValue },
    });
    if (!count) return false;

    const name = tipDisplayName(tip.assetType, tip.symbol);
    const source = tip.sourceName ? ` (${tip.sourceName})` : '';
    const ref = tip.benchmark === 'BTC' ? 'BTC' : 'VN-Index';
    const body =
      result.changePct === null
        ? `Không lấy được giá ${name} để chấm lời khuyên này.`
        : [
            `Giá ${fmt(result.changePct)} so với lúc soi${result.benchmarkChangePct !== null ? `, ${ref} ${fmt(result.benchmarkChangePct)}` : ''}: lời khuyên ${OUTCOME_TEXT[result.outcome]}.`,
            tip.boughtAt ? 'Bạn đã mua theo.' : (tip.decision && DECISION_TEXT[tip.decision]) || '',
          ]
            .filter(Boolean)
            .join(' ');
    await this.notifier.send(tip.userId, {
      kind: 'tip_review',
      severity: 'info',
      title: `Lời khuyên ${name}${source} sau ${days} ngày`,
      body,
      dedupeKey: `tip_review:${tip.id}:${days}`,
      link: `/tips/${tip.id}`,
    });
    return true;
  }

  /** Giá đóng cửa gần nhất (đơn vị gốc: VND/cp, USDT/coin); null khi không có hoặc quá cũ */
  private async close(assetType: TipAssetType, symbol: string, now: Date, cache: Map<string, number | null>) {
    const key = `${assetType}:${symbol}`;
    if (!cache.has(key)) {
      const candles = await (
        assetType === 'crypto' ? this.market.cryptoHistory(symbol, 5) : this.market.stockHistory(symbol, 10)
      ).catch(() => []);
      const last = candles.at(-1);
      const fresh = last && now.getTime() - last.time * 1000 <= STALE_CLOSE_DAYS * DAY && last.close > 0;
      cache.set(key, fresh ? last.close : null);
    }
    return cache.get(key) ?? null;
  }

  private benchmark(name: string, now: Date, cache: Map<string, number | null>) {
    return name === 'BTC' ? this.close('crypto', 'BTCUSDT', now, cache) : this.close('stock', 'VNINDEX', now, cache);
  }
}
