import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { OkResponse, WatchEntry, WatchItem } from '@dautu/contracts';
import { MarketService } from '../market/market.service';
import { TrackedSymbolResolver } from '../market/tracked-symbol.resolver';
import { PrismaService } from '../prisma/prisma.service';
import type { WatchDto } from './dto/watch.dto';
import { toWatchEntry } from './watchlist.presenter';
import { MAX_WATCH_ITEMS } from './watchlist.constants';
import type { WatchType } from './watchlist.constants';

@Injectable()
export class WatchlistService {
  constructor(
    private prisma: PrismaService,
    private market: MarketService,
    private symbols: TrackedSymbolResolver,
  ) {}

  /** Chuẩn hoá và kiểm tra mã có tồn tại ở nguồn giá; mã sai thì báo lỗi rõ */
  async normalize(assetType: WatchType, raw: string) {
    const symbol = raw.trim().toUpperCase();
    if (!symbol) throw new BadRequestException('Chưa nhập mã tài sản');
    return this.symbols.resolve(assetType, symbol);
  }

  async list(userId: string): Promise<WatchItem[]> {
    const [items, held] = await Promise.all([
      this.prisma.watchItem.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.holding.findMany({ where: { userId }, select: { assetType: true, symbol: true } }),
    ]);
    const heldKeys = new Set(held.map((h) => `${h.assetType}:${h.symbol}`));
    const usdt = this.market.usdtVnd;
    return items.map((w) => {
      const type = w.assetType as WatchType;
      const price = this.market.priceInfo(type, w.symbol);
      return {
        id: w.id,
        assetType: type,
        symbol: w.symbol,
        displayName:
          type === 'gold'
            ? (this.market.goldQuotes().find((g) => g.code === w.symbol)?.name ?? w.symbol)
            : w.symbol.replace(/USDT$/, ''),
        priceVnd: price.value,
        /** Coin: USDT; còn lại: VND (vàng: giá mua vào của cửa hàng) */
        priceNative: type === 'crypto' && price.value !== null ? price.value / usdt.rate : price.value,
        currency: type === 'crypto' ? 'USDT' : 'VND',
        dayChangePct: this.market.dayChangePct(type, w.symbol),
        price: { status: price.status, source: price.source, asOf: price.asOf, reason: price.reason ?? null },
        /** Trang chi tiết trong app; vàng chưa có trang riêng */
        link:
          type === 'stock'
            ? `/stock/${w.symbol}`
            : type === 'crypto'
              ? `/crypto/${w.symbol.replace(/USDT$/, '')}`
              : null,
        held: heldKeys.has(`${type}:${w.symbol}`),
        createdAt: w.createdAt.toISOString(),
      };
    });
  }

  /** Thêm lại mã đã có không tạo bản ghi mới (unique userId + assetType + symbol) */
  async add(userId: string, dto: WatchDto): Promise<WatchEntry> {
    const symbol = await this.normalize(dto.assetType, dto.symbol);
    const key = { userId, assetType: dto.assetType, symbol };
    // Đếm và thêm trong cùng transaction có khoá theo người dùng: nhiều yêu cầu thêm cùng lúc không vượt giới hạn
    return this.prisma.$transaction(async (db) => {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`watch:${userId}`}))`;
      const existing = await db.watchItem.findUnique({ where: { userId_assetType_symbol: key } });
      if (existing) return toWatchEntry(existing);
      const count = await db.watchItem.count({ where: { userId } });
      if (count >= MAX_WATCH_ITEMS) {
        throw new BadRequestException(
          `Danh sách theo dõi tối đa ${MAX_WATCH_ITEMS} mã — hãy bỏ bớt mã không còn quan tâm`,
        );
      }
      return toWatchEntry(await db.watchItem.create({ data: key }));
    });
  }

  async remove(userId: string, id: string): Promise<OkResponse> {
    const { count } = await this.prisma.watchItem.deleteMany({ where: { id, userId } });
    if (!count) throw new NotFoundException('Không tìm thấy mã trong danh sách theo dõi');
    return { ok: true };
  }
}
