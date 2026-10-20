import {
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { CurrentUser, JwtAuthGuard } from '../auth/auth.module';
import type { AuthUser } from '../auth/auth.module';
import { MarketModule } from '../market/market.module';
import { MarketService, normalizeCrypto } from '../market/market.service';
import type { AssetType } from '../market/market.service';
import { PrismaService } from '../prisma/prisma.module';

class HoldingDto {
  @IsIn(['stock', 'crypto', 'gold', 'cash']) assetType!: AssetType;
  @IsString() symbol!: string;
  @IsNumber() @Min(0) quantity!: number;
  @IsNumber() @Min(0) avgCost!: number;
  @IsOptional() @IsString() note?: string;
}

const TYPE_LABEL: Record<AssetType, string> = {
  stock: 'Cổ phiếu',
  crypto: 'Crypto',
  gold: 'Vàng',
  cash: 'Tiền mặt / tiết kiệm',
};

@Injectable()
export class PortfolioService {
  constructor(
    private prisma: PrismaService,
    private market: MarketService,
  ) {}

  async normalize(dto: HoldingDto) {
    let symbol = dto.symbol.trim().toUpperCase();
    if (dto.assetType === 'stock') symbol = (await this.market.assertStock(symbol)).symbol;
    if (dto.assetType === 'crypto') symbol = normalizeCrypto(symbol);
    if (dto.assetType === 'gold' && !this.market.goldQuotes().some((g) => g.code === symbol)) {
      throw new NotFoundException(`Không có loại vàng ${symbol}`);
    }
    if (dto.assetType === 'cash') symbol = 'VND';
    return { ...dto, symbol };
  }

  async create(userId: string, dto: HoldingDto) {
    const data = await this.normalize(dto);
    const h = await this.prisma.holding.create({ data: { ...data, userId } });
    if (data.assetType === 'stock') await this.market.stockQuote(data.symbol);
    return h;
  }

  async update(userId: string, id: string, dto: HoldingDto) {
    await this.own(userId, id);
    return this.prisma.holding.update({ where: { id }, data: await this.normalize(dto) });
  }

  async remove(userId: string, id: string) {
    await this.own(userId, id);
    await this.prisma.holding.delete({ where: { id } });
    return { ok: true };
  }

  private async own(userId: string, id: string) {
    const h = await this.prisma.holding.findFirst({ where: { id, userId } });
    if (!h) throw new NotFoundException('Không tìm thấy tài sản');
    return h;
  }

  /** Định giá danh mục theo giá thị trường hiện tại, tất cả quy ra VND */
  async valuation(userId: string) {
    const holdings = await this.prisma.holding.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    // Mã cổ phiếu mới thêm có thể chưa có trong bộ nhớ đệm
    await Promise.all(
      holdings
        .filter((h) => h.assetType === 'stock')
        .map((h) => this.market.stockQuote(h.symbol).catch(() => null)),
    );
    const usdt = this.market.usdtVnd;
    const rows = holdings.map((h) => {
      const type = h.assetType as AssetType;
      const price = this.market.priceVnd(type, h.symbol);
      // Coin: giá vốn và giá hiện tại tính bằng USDT; giá trị / lãi lỗ quy ra VND theo cùng tỷ giá USDT
      const costVnd = type === 'crypto' ? h.avgCost * usdt.rate : h.avgCost;
      const marketValue = price !== null ? price * h.quantity : null;
      const costValue = costVnd * h.quantity;
      return {
        id: h.id,
        assetType: type,
        typeLabel: TYPE_LABEL[type],
        symbol: h.symbol,
        displayName:
          type === 'gold'
            ? (this.market.goldQuotes().find((g) => g.code === h.symbol)?.name ?? h.symbol)
            : h.symbol.replace(/USDT$/, ''),
        quantity: h.quantity,
        avgCost: h.avgCost,
        note: h.note,
        priceVnd: price,
        /** Giá theo đơn vị gốc của tài sản: USDT với coin, VND với phần còn lại */
        priceNative: type === 'crypto' && price !== null ? price / usdt.rate : price,
        currency: type === 'crypto' ? 'USDT' : 'VND',
        marketValue,
        costValue,
        pnl: marketValue !== null ? marketValue - costValue : null,
        pnlPct: marketValue !== null && costValue ? ((marketValue - costValue) / costValue) * 100 : null,
        dayChangePct: this.market.dayChangePct(type, h.symbol),
      };
    });
    const total = rows.reduce((s, r) => s + (r.marketValue ?? r.costValue), 0);
    const totalCost = rows.reduce((s, r) => s + r.costValue, 0);
    const allocation: Record<string, number> = {};
    for (const r of rows) {
      allocation[r.typeLabel] = (allocation[r.typeLabel] ?? 0) + (r.marketValue ?? r.costValue);
    }
    return {
      holdings: rows.map((r) => ({ ...r, weightPct: total ? ((r.marketValue ?? r.costValue) / total) * 100 : 0 })),
      totalValue: total,
      totalCost,
      totalPnl: total - totalCost,
      totalPnlPct: totalCost ? ((total - totalCost) / totalCost) * 100 : 0,
      allocationPct: Object.fromEntries(
        Object.entries(allocation).map(([k, v]) => [k, total ? Math.round((v / total) * 1000) / 10 : 0]),
      ),
      usdtVnd: usdt.rate,
      usdtSource: usdt.source,
      notes: `Vàng định giá theo giá MUA VÀO của cửa hàng (số tiền thực nhận nếu bán). Coin: giá vốn và giá hiện tại tính bằng USDT, giá trị và lãi/lỗ quy ra VND theo tỷ giá USDT/VND ${usdt.rate} (${usdt.source}).`,
    };
  }
}

@UseGuards(JwtAuthGuard)
@Controller('portfolio')
class PortfolioController {
  constructor(
    private portfolio: PortfolioService,
    private market: MarketService,
  ) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.portfolio.valuation(user.id);
  }

  /** Danh sách loại vàng hợp lệ để chọn khi nhập tài sản */
  @Get('gold-options')
  goldOptions() {
    return this.market
      .goldQuotes()
      .filter((g) => g.currency === 'VND')
      .map((g) => ({ code: g.code, name: g.name, buy: g.buy, sell: g.sell }));
  }

  @Post('holdings')
  create(@CurrentUser() user: AuthUser, @Body() dto: HoldingDto) {
    return this.portfolio.create(user.id, dto);
  }

  @Put('holdings/:id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: HoldingDto) {
    return this.portfolio.update(user.id, id, dto);
  }

  @Delete('holdings/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.portfolio.remove(user.id, id);
  }
}

@Module({
  imports: [MarketModule],
  controllers: [PortfolioController],
  providers: [PortfolioService],
  exports: [PortfolioService],
})
export class PortfolioModule {}
