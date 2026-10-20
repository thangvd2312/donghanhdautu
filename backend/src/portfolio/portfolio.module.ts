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
import { valuePortfolio } from './valuation';

class HoldingDto {
  @IsIn(['stock', 'crypto', 'gold', 'cash']) assetType!: AssetType;
  @IsString() symbol!: string;
  @IsNumber() @Min(0) quantity!: number;
  @IsNumber() @Min(0) avgCost!: number;
  @IsOptional() @IsString() note?: string;
}

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

  /** Định giá danh mục theo giá thị trường hiện tại, tất cả quy ra VND, kèm trạng thái dữ liệu */
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
    return valuePortfolio(holdings, {
      priceInfo: (type, symbol) => this.market.priceInfo(type, symbol),
      dayChangePct: (type, symbol) => this.market.dayChangePct(type, symbol),
      displayName: (type, symbol) =>
        type === 'gold'
          ? (this.market.goldQuotes().find((g) => g.code === symbol)?.name ?? symbol)
          : symbol.replace(/USDT$/, ''),
      usdt: this.market.usdtVnd,
    });
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
