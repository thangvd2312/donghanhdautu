import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreatedPortfolio,
  OkResponse,
  Performance,
  PortfolioAccount,
  RenamedPortfolio,
  Transaction,
} from '@dautu/contracts';
import { MarketService } from '../market/market.service';
import { vnDateKey } from '../market/types';
import { PrismaService } from '../prisma/prisma.service';
import { computeLedger, performance } from './ledger';
import type { LedgerResult } from './ledger';
import type { HoldingDto } from './dto/portfolio.dto';
import { toLedgerTx } from './transactions.presenter';
import { TransactionsService } from './transactions.service';
import { HoldingInput, valuePortfolio } from './valuation';

@Injectable()
export class PortfolioService {
  constructor(
    private prisma: PrismaService,
    private market: MarketService,
    private transactions: TransactionsService,
  ) {}

  /**
   * Định giá theo giá thị trường hiện tại, quy ra VND, kèm trạng thái dữ liệu.
   * Không truyền danh mục = gộp mọi danh mục (bảng Holding); có danh mục = tính từ sổ của riêng danh mục đó.
   */
  async valuation(userId: string, portfolioId?: string) {
    const holdings: HoldingInput[] = portfolioId
      ? holdingsFromLedger(await this.transactions.ledger(userId, portfolioId), portfolioId, this.market.usdtVnd.rate)
      : await this.prisma.holding.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
    return this.value(holdings);
  }

  /**
   * Coin: thêm lãi/lỗ VND thực tế bên cạnh lãi theo USDT. VND thực tế = giá trị hôm nay − số VND đã bỏ ra theo tỷ giá
   * lúc mua; phần chênh do tỷ giá = giá vốn USDT quy tỷ giá hôm nay − số VND đã bỏ ra. Lô thiếu tỷ giá → không tính.
   */
  async withVndActual<V extends Awaited<ReturnType<PortfolioService['valuation']>>>(
    userId: string,
    v: V,
    portfolioId?: string,
  ) {
    if (!v.holdings.some((h) => h.assetType === 'crypto')) return v;
    const ledger = await this.transactions.ledger(userId, portfolioId);
    const pos = new Map(ledger.positions.map((p) => [`${p.assetType}:${p.symbol}`, p]));
    return {
      ...v,
      holdings: v.holdings.map((h) => {
        if (h.assetType !== 'crypto') return h;
        const costVnd = pos.get(`${h.assetType}:${h.symbol}`)?.costBasisVnd?.toNumber() ?? null;
        return {
          ...h,
          vndActual:
            costVnd === null
              ? { known: false as const }
              : {
                  known: true as const,
                  costVnd,
                  pnlVnd: h.marketValue !== null ? h.marketValue - costVnd : null,
                  pnlVndPct: h.marketValue !== null && costVnd ? ((h.marketValue - costVnd) / costVnd) * 100 : null,
                  fxEffectVnd: h.costValue - costVnd,
                },
        };
      }),
    };
  }

  private async value(holdings: HoldingInput[]) {
    // Mã cổ phiếu mới thêm có thể chưa có trong bộ nhớ đệm
    await Promise.all(
      holdings.filter((h) => h.assetType === 'stock').map((h) => this.market.stockQuote(h.symbol).catch(() => null)),
    );
    return valuePortfolio(holdings, {
      priceInfo: (type, symbol) => this.market.priceInfo(type, symbol),
      dayChangePct: (type, symbol) => this.market.dayChangePct(type, symbol),
      displayName: (type, symbol) =>
        type === 'gold'
          ? (this.market.goldQuotes().find((g) => g.code === symbol)?.name ?? symbol)
          : type === 'cash'
            ? symbol
            : symbol.replace(/USDT$/, ''),
      usdt: this.market.usdtVnd,
    });
  }

  /** Hiệu quả đầu tư từ sổ giao dịch: vốn đưa vào, lãi đã / chưa chốt, cổ tức, phí, tổng lãi */
  async performance(userId: string, portfolioId?: string): Promise<Performance> {
    const ledger = await this.transactions.ledger(userId, portfolioId);
    const v = await this.valuation(userId, portfolioId);
    // Lãi chưa chốt chỉ tính trên tài sản đầu tư (tiền mặt USDT đổi giá theo tỷ giá không phải lãi đầu tư)
    const invested = v.holdings.filter((h) => h.assetType !== 'cash');
    const unrealized = invested.some((h) => h.pnl !== null) ? invested.reduce((s, h) => s + (h.pnl ?? 0), 0) : null;
    return performance({
      ledger,
      totalValueVnd: v.totalValue,
      unrealizedVnd: unrealized,
      totalIsEstimate: v.totalIsEstimate,
      usdtVnd: v.usdtVnd,
    });
  }

  addHolding(userId: string, dto: HoldingDto): Promise<Transaction> {
    return this.transactions.create(userId, {
      type: 'opening',
      date: vnDateKey(),
      assetType: dto.assetType,
      symbol: dto.assetType === 'cash' ? 'VND' : dto.symbol,
      quantity: dto.quantity,
      price: dto.assetType === 'cash' ? 1 : dto.avgCost,
      note: dto.note,
      portfolioId: dto.portfolioId,
    });
  }

  /** Danh mục kèm giá trị hiện tại và số giao dịch */
  async listPortfolios(userId: string): Promise<PortfolioAccount[]> {
    const [list, txs] = await Promise.all([
      this.transactions.portfolios(this.prisma, userId),
      this.transactions.activeTransactions(userId),
    ]);
    const rate = this.market.usdtVnd.rate;
    return Promise.all(
      list.map(async (p) => {
        const own = txs.filter((t) => t.portfolioId === p.id);
        let totalValue = 0;
        if (own.length) {
          const v = await this.value(holdingsFromLedger(computeLedger(own.map(toLedgerTx)), p.id, rate));
          totalValue = v.totalValue;
        }
        return { id: p.id, name: p.name, isDefault: p.isDefault, transactionCount: own.length, totalValue };
      }),
    );
  }

  /** Mỗi tài sản đang nằm ở danh mục nào, bao nhiêu (để biết bán từ đâu) */
  async breakdown(userId: string) {
    const [list, txs] = await Promise.all([
      this.transactions.portfolios(this.prisma, userId),
      this.transactions.activeTransactions(userId),
    ]);
    const out: Record<string, { portfolioId: string; name: string; quantity: number }[]> = {};
    if (list.length < 2) return out;
    for (const p of list) {
      const own = txs.filter((t) => t.portfolioId === p.id);
      if (!own.length) continue;
      const l = computeLedger(own.map(toLedgerTx));
      const add = (key: string, q: number) => (out[key] ??= []).push({ portfolioId: p.id, name: p.name, quantity: q });
      for (const pos of l.positions)
        if (pos.quantity.gt(0)) add(`${pos.assetType}:${pos.symbol}`, pos.quantity.toNumber());
      for (const c of ['VND', 'USDT'] as const) if (l.cash[c].gt(0)) add(`cash:${c}`, l.cash[c].toNumber());
    }
    return out;
  }

  async createPortfolio(userId: string, name: string): Promise<CreatedPortfolio> {
    await this.transactions.portfolios(this.prisma, userId);
    const p = await this.prisma.portfolio.create({ data: { userId, name: name.trim() } });
    return { id: p.id, name: p.name, isDefault: false };
  }

  async renamePortfolio(userId: string, id: string, name: string): Promise<RenamedPortfolio> {
    const p = await this.prisma.portfolio.findFirst({ where: { id, userId } });
    if (!p) throw new NotFoundException('Không tìm thấy danh mục');
    await this.prisma.portfolio.update({ where: { id }, data: { name: name.trim() } });
    return { id, name: name.trim() };
  }

  /** Chỉ xoá được danh mục trống (không còn giao dịch) và không phải danh mục chính */
  async deletePortfolio(userId: string, id: string): Promise<OkResponse> {
    const p = await this.prisma.portfolio.findFirst({ where: { id, userId } });
    if (!p) throw new NotFoundException('Không tìm thấy danh mục');
    if (p.isDefault) throw new BadRequestException('Không xoá được danh mục chính');
    const used = await this.prisma.transaction.count({ where: { portfolioId: id, deletedAt: null } });
    if (used) throw new BadRequestException(`Danh mục còn ${used} giao dịch — huỷ hoặc chuyển giao dịch trước khi xoá`);
    await this.prisma.$transaction([
      // Giao dịch đã huỷ vẫn giữ lịch sử, chỉ bỏ liên kết tới danh mục bị xoá
      this.prisma.transaction.updateMany({ where: { portfolioId: id }, data: { portfolioId: null } }),
      this.prisma.portfolio.delete({ where: { id } }),
    ]);
    return { ok: true };
  }
}

/** Vị thế và tiền mặt của một sổ → đầu vào định giá */
function holdingsFromLedger(l: LedgerResult, portfolioId: string, usdtRate: number): HoldingInput[] {
  const out: HoldingInput[] = l.positions
    .filter((p) => p.quantity.gt(0))
    .map((p) => ({
      id: `${portfolioId}:${p.assetType}:${p.symbol}`,
      assetType: p.assetType,
      symbol: p.symbol,
      quantity: p.quantity.toNumber(),
      avgCost: p.costBasis.div(p.quantity).toNumber(),
      note: p.note,
    }));
  for (const c of ['VND', 'USDT'] as const) {
    if (!l.cash[c].gt(0)) continue;
    out.push({
      id: `${portfolioId}:cash:${c}`,
      assetType: 'cash',
      symbol: c,
      quantity: l.cash[c].toNumber(),
      avgCost: c === 'VND' ? 1 : usdtRate,
      note: null,
    });
  }
  return out;
}
