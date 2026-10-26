import { BadRequestException, Injectable } from '@nestjs/common';
import type { OkResponse, PriceAlert, PriceAlertListItem } from '@dautu/contracts';
import { MarketService } from '../market/market.service';
import { nativePrice } from '../market/native-price';
import { TrackedSymbolResolver } from '../market/tracked-symbol.resolver';
import { PrismaService } from '../prisma/prisma.service';
import { isTargetHit } from './alert-rules';
import type { PriceAlertDto } from './dto/price-alert.dto';
import { NotifierService } from './notifier.service';
import { toPriceAlert } from './price-alert.presenter';

/** Mốc giá người dùng tự đặt: quản lý (CRUD) và kiểm tra chạm mốc mỗi phút */
@Injectable()
export class PriceAlertsService {
  constructor(
    private prisma: PrismaService,
    private market: MarketService,
    private symbols: TrackedSymbolResolver,
    private notifier: NotifierService,
  ) {}

  /** Giá theo đơn vị gốc dùng cho mốc tự đặt: VND/cp, USDT/coin, VND/lượng (giá bán ra) */
  currentPrice(type: string, symbol: string): number | null {
    return nativePrice(this.market, type, symbol, 'sell');
  }

  async list(userId: string): Promise<PriceAlertListItem[]> {
    const rows = await this.prisma.priceAlert.findMany({
      where: { userId, OR: [{ active: true }, { triggeredAt: { gt: new Date(Date.now() - 7 * 86400_000) } }] },
      orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((r) => ({ ...toPriceAlert(r), currentPrice: this.currentPrice(r.assetType, r.symbol) }));
  }

  async create(userId: string, dto: PriceAlertDto): Promise<PriceAlert> {
    const symbol = await this.symbols.resolve(dto.assetType, dto.symbol.trim().toUpperCase());
    const current = this.currentPrice(dto.assetType, symbol);
    if (current !== null && isTargetHit(dto.direction, current, dto.targetPrice)) {
      throw new BadRequestException('Giá hiện tại đã thoả điều kiện này rồi — hãy đặt một mốc chưa chạm tới');
    }
    return toPriceAlert(await this.prisma.priceAlert.create({ data: { ...dto, symbol, userId } }));
  }

  async remove(userId: string, id: string): Promise<OkResponse> {
    await this.prisma.priceAlert.deleteMany({ where: { id, userId } });
    return { ok: true };
  }

  /** Tắt mốc đã chạm và báo cho chủ nhân */
  async checkTargets() {
    const alerts = await this.prisma.priceAlert.findMany({ where: { active: true } });
    for (const a of alerts) {
      if (a.assetType === 'stock' && !this.market.stockSessionOpen) continue;
      const price = this.currentPrice(a.assetType, a.symbol);
      if (price === null) continue;
      if (!isTargetHit(a.direction, price, a.targetPrice)) continue;
      const name = a.assetType === 'crypto' ? a.symbol.replace(/USDT$/, '') : a.symbol;
      const unit = a.assetType === 'crypto' ? 'USDT' : '₫';
      const fmt = (v: number) => `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(v)} ${unit}`;
      const dedupeKey = `target:${a.id}`;
      const sent = await this.notifier.send(a.userId, {
        kind: 'price_target',
        severity: 'warning',
        title: `${name} đã ${a.direction === 'above' ? 'lên tới' : 'về'} ${fmt(price)} — chạm mốc bạn đặt`,
        body: `Mốc của bạn: ${a.direction === 'above' ? '≥' : '≤'} ${fmt(a.targetPrice)}.${a.note ? ` Ghi chú: ${a.note}.` : ''} Trước khi hành động, hãy xem lại lý do bạn đặt mốc này hoặc hỏi cố vấn.`,
        dedupeKey,
        link: a.assetType === 'stock' ? `/stock/${a.symbol}` : a.assetType === 'crypto' ? `/crypto/${name}` : '/',
      });
      // Chỉ tắt mốc khi thông báo đã lưu (lần này hoặc lần trước trùng khoá); lưu lỗi thì giữ mốc để lượt quét sau thử lại
      const notified =
        sent ??
        (await this.prisma.notification.findFirst({ where: { userId: a.userId, dedupeKey }, select: { id: true } }));
      if (notified) {
        await this.prisma.priceAlert.update({ where: { id: a.id }, data: { active: false, triggeredAt: new Date() } });
      }
    }
  }
}
