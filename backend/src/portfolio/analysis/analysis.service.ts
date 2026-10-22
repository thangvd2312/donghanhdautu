import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { RebalanceResponse, SimulateResponse } from '@dautu/contracts';
import { MarketService } from '../../market/market.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PortfolioService } from '../portfolio.service';
import { TransactionsService } from '../transactions.service';
import { newStockSymbols } from './rebalance.validation';
import { rebalance } from './rebalance';
import type { RebalanceDto } from './dto/rebalance.dto';
import { simulate } from './simulate';
import type { SimulateDto } from './dto/simulate.dto';

/** Mô phỏng trên danh mục đang giữ (kịch bản giá, tái cân bằng): chỉ đọc, không ghi gì vào sổ */
@Injectable()
export class AnalysisService {
  constructor(
    private prisma: PrismaService,
    private market: MarketService,
    private transactions: TransactionsService,
    private portfolio: PortfolioService,
  ) {}

  /**
   * Mô phỏng kịch bản giá trên tài sản đang giữ. "Trước" lấy từ đúng valuation() mà màn Danh mục dùng
   * (cùng danh mục, giá, trạng thái giá, tỷ giá); không ghi gì vào DB.
   */
  async simulate(userId: string, dto: SimulateDto): Promise<SimulateResponse> {
    const portfolioId = dto.portfolioId || undefined;
    if (portfolioId) await this.transactions.resolvePortfolio(this.prisma, userId, portfolioId);
    const v = await this.portfolio.valuation(userId, portfolioId);
    return { ...simulate(v.holdings, dto.shocks), asOf: v.generatedAt };
  }

  /**
   * Mô phỏng tái cân bằng về tỷ trọng mục tiêu. "Trước" lấy từ đúng valuation() mà màn Danh mục dùng;
   * mã cổ phiếu mới được kiểm tra tồn tại; không ghi gì vào DB.
   */
  async rebalance(userId: string, dto: RebalanceDto): Promise<RebalanceResponse> {
    const portfolioId = dto.portfolioId || undefined;
    if (portfolioId) await this.transactions.resolvePortfolio(this.prisma, userId, portfolioId);
    const v = await this.portfolio.valuation(userId, portfolioId);
    const newStocks = await Promise.all(
      newStockSymbols(v.holdings, dto.targets).map(async (symbol) => {
        try {
          await this.market.assertStock(symbol);
        } catch (e) {
          if (e instanceof NotFoundException) throw new BadRequestException(`Mã cổ phiếu ${symbol} không tồn tại`);
          throw e;
        }
        await this.market.stockQuote(symbol).catch(() => null);
        return { symbol, price: this.market.priceInfo('stock', symbol).value };
      }),
    );
    const goldBuyPrices = Object.fromEntries(
      this.market
        .goldQuotes()
        .filter((g) => g.currency === 'VND')
        .map((g) => [g.code, g.sell]),
    );
    return rebalance(dto, { holdings: v.holdings, newStocks, goldBuyPrices, asOf: v.generatedAt });
  }
}
