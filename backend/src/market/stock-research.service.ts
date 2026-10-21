import { Injectable } from '@nestjs/common';
import { dividendHistory } from './dividends';
import { valuationBand } from './fundamentals';
import { MarketService } from './market.service';
import {
  safe,
  VietcapCompanyAdapter,
  VietcapEventsAdapter,
  VietcapHistoryAdapter,
  VietcapOwnershipAdapter,
  VietcapStatementsAdapter,
} from './providers/vietcap';
import { technicals } from './technicals';
import { vnDateKey } from './types';

/** Trang chi tiết cổ phiếu: ghép giá hiện tại với hồ sơ, chỉ số, báo cáo tài chính, cổ đông và sự kiện quyền */
@Injectable()
export class StockResearchService {
  constructor(
    private market: MarketService,
    private companies: VietcapCompanyAdapter,
    private statements: VietcapStatementsAdapter,
    private ownership: VietcapOwnershipAdapter,
    private priceHistory: VietcapHistoryAdapter,
    private corporateEvents: VietcapEventsAdapter,
  ) {}

  async stockDetail(symbol: string) {
    symbol = symbol.toUpperCase();
    const [quote, company, ratios, income, candles] = await Promise.all([
      this.market.stockQuote(symbol),
      safe('company', () => this.companies.company(symbol), null),
      safe('ratios', () => this.companies.ratios(symbol), []),
      safe('income', () => this.statements.incomeStatement(symbol), null),
      safe('history', () => this.priceHistory.history(symbol, 400), []),
    ]);
    return { quote, company, ratios, income, technicals: technicals(candles) };
  }

  /** Dải P/E, P/B ~8 năm của chính doanh nghiệp so với định giá theo giá hiện tại */
  async valuationHistory(symbol: string, price?: number | null) {
    symbol = symbol.toUpperCase();
    const rows = await this.companies.statsRaw(symbol);
    return valuationBand(rows, price ?? this.market.priceInfo('stock', symbol).value);
  }

  /** Dữ liệu cơ bản sâu: định giá lịch sử, cân đối kế toán, dòng tiền, cổ đông lớn, giao dịch nội bộ */
  async stockFundamentals(symbol: string, price?: number | null) {
    symbol = symbol.toUpperCase();
    // Mã ngoài bảng giá đang theo dõi: lấy giá hiện tại để định giá theo giá mới nhất
    price ??=
      this.market.priceInfo('stock', symbol).value ??
      (await this.market.stockQuote(symbol).catch(() => null))?.price ??
      null;
    const [valuationHistory, balanceSheet, cashFlow, majorShareholders, insiderTrades] = await Promise.all([
      safe('valuation', () => this.valuationHistory(symbol, price), null),
      safe('balance', () => this.statements.balanceSheet(symbol), null),
      safe('cashflow', () => this.statements.cashFlow(symbol), null),
      safe('shareholders', () => this.ownership.shareholders(symbol), null),
      safe('insider', () => this.ownership.insiderTrades(symbol), null),
    ]);
    return { valuationHistory, balanceSheet, cashFlow, majorShareholders, insiderTrades };
  }

  /** Lịch sử cổ tức tiền mặt / cổ phiếu (sự kiện quyền Vietcap từ 2018) và tỷ suất cổ tức 12 tháng theo giá hiện tại */
  async stockDividends(symbol: string) {
    symbol = symbol.toUpperCase();
    await this.market.assertStock(symbol);
    const [events, quote] = await Promise.all([
      this.corporateEvents.corporateEvents(symbol),
      this.market.stockQuote(symbol).catch(() => null),
    ]);
    return { ...dividendHistory(events, quote?.price ?? null, vnDateKey()), source: 'Vietcap', since: '2018' };
  }
}
