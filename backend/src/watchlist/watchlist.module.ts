import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsString, MaxLength } from 'class-validator';
import { CurrentUser, JwtAuthGuard } from '../auth/auth.module';
import type { AuthUser } from '../auth/auth.module';
import { MarketModule } from '../market/market.module';
import { MarketService, normalizeCrypto } from '../market/market.service';
import { PrismaService } from '../prisma/prisma.module';

/** Phiên bản đầu: các loại có nguồn giá; tiền mặt không cần theo dõi */
export const WATCH_TYPES = ['stock', 'crypto', 'gold'] as const;
export type WatchType = (typeof WATCH_TYPES)[number];

/** Mỗi mã cổ phiếu trong watchlist được poll giá, nên giới hạn để không phình danh sách theo dõi */
export const MAX_WATCH_ITEMS = 50;

class WatchDto {
  @IsIn(WATCH_TYPES, { message: 'Chỉ theo dõi được cổ phiếu, crypto hoặc vàng' }) assetType!: WatchType;
  @IsString() @MaxLength(20) symbol!: string;
}

@Injectable()
export class WatchlistService {
  constructor(
    private prisma: PrismaService,
    private market: MarketService,
  ) {}

  /** Chuẩn hoá và kiểm tra mã có tồn tại ở nguồn giá; mã sai thì báo lỗi rõ */
  async normalize(assetType: WatchType, raw: string) {
    let symbol = raw.trim().toUpperCase();
    if (!symbol) throw new BadRequestException('Chưa nhập mã tài sản');
    if (assetType === 'stock') {
      symbol = (await this.market.assertStock(symbol)).symbol;
      await this.market.stockQuote(symbol); // đưa mã vào danh sách poll giá ngay, không chờ lần làm mới 5 phút
    }
    if (assetType === 'crypto') {
      symbol = normalizeCrypto(symbol);
      if (!this.market.binance.quotes.has(symbol)) throw new NotFoundException(`Không có cặp ${symbol} trên Binance`);
    }
    if (assetType === 'gold' && !this.market.goldQuotes().some((g) => g.code === symbol)) {
      throw new NotFoundException(`Không có loại vàng ${symbol}`);
    }
    return symbol;
  }

  async list(userId: string) {
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
        createdAt: w.createdAt,
      };
    });
  }

  /** Thêm lại mã đã có không tạo bản ghi mới (unique userId + assetType + symbol) */
  async add(userId: string, dto: WatchDto) {
    const symbol = await this.normalize(dto.assetType, dto.symbol);
    const key = { userId, assetType: dto.assetType, symbol };
    const existing = await this.prisma.watchItem.findUnique({ where: { userId_assetType_symbol: key } });
    if (existing) return existing;
    const count = await this.prisma.watchItem.count({ where: { userId } });
    if (count >= MAX_WATCH_ITEMS) {
      throw new BadRequestException(
        `Danh sách theo dõi tối đa ${MAX_WATCH_ITEMS} mã — hãy bỏ bớt mã không còn quan tâm`,
      );
    }
    // upsert để hai yêu cầu thêm cùng lúc không lỗi trùng khoá
    return this.prisma.watchItem.upsert({ where: { userId_assetType_symbol: key }, create: key, update: {} });
  }

  async remove(userId: string, id: string) {
    const { count } = await this.prisma.watchItem.deleteMany({ where: { id, userId } });
    if (!count) throw new NotFoundException('Không tìm thấy mã trong danh sách theo dõi');
    return { ok: true };
  }
}

@UseGuards(JwtAuthGuard)
@Controller('watchlist')
class WatchlistController {
  constructor(private watchlist: WatchlistService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.watchlist.list(user.id);
  }

  @Post()
  add(@CurrentUser() user: AuthUser, @Body() dto: WatchDto) {
    return this.watchlist.add(user.id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.watchlist.remove(user.id, id);
  }
}

@Module({
  imports: [MarketModule],
  controllers: [WatchlistController],
  providers: [WatchlistService],
})
export class WatchlistModule {}
