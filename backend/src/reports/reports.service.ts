import { Injectable } from '@nestjs/common';
import type { PortfolioReport } from '@dautu/contracts';
import { vnDateKey } from '../market/types';
import { HistoryService } from '../portfolio/history.service';
import { TransactionsService } from '../portfolio/transactions';
import { PrismaService } from '../prisma/prisma.module';
import { buildReport, periodHasData, resolvePeriod } from './report';
import type { ReportQueryDto } from './reports.dto';

/** Báo cáo danh mục theo kỳ: chỉ đọc sổ và lịch sử, không ghi gì, không tạo link công khai */
@Injectable()
export class ReportsService {
  constructor(
    private prisma: PrismaService,
    private transactions: TransactionsService,
    private history: HistoryService,
  ) {}

  async report(userId: string, q: ReportQueryDto, now = new Date()): Promise<PortfolioReport> {
    const portfolioId = q.portfolioId || undefined;
    const list = await this.transactions.portfolios(this.prisma, userId);
    if (portfolioId) await this.transactions.resolvePortfolio(this.prisma, userId, portfolioId);
    const txs = await this.transactions.activeTransactions(userId, portfolioId);
    const dataStart = txs.length
      ? txs.reduce((m, t) => {
          const d = t.date.toISOString().slice(0, 10);
          return d < m ? d : m;
        }, '9999-12-31')
      : null;
    const today = vnDateKey(now);
    const period = resolvePeriod(q, today, dataStart);
    const source = periodHasData(period, dataStart)
      ? await this.history.periodData(userId, period.from, period.to, portfolioId)
      : null;
    const name = portfolioId
      ? list.find((p) => p.id === portfolioId)!.name
      : list.length === 1
        ? list[0].name
        : 'Tất cả danh mục';
    return buildReport({
      period,
      portfolio: { id: portfolioId ?? null, name },
      // Chỉ hiện danh mục của từng giao dịch khi báo cáo gộp nhiều danh mục
      portfolioNames: !portfolioId && list.length > 1 ? new Map(list.map((p) => [p.id, p.name])) : null,
      generatedAt: now,
      dataStart,
      source,
      mask: q.mask ?? 'none',
    });
  }
}
