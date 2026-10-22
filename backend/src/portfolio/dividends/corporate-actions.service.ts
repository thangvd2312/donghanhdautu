import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { CorporateActionsResponse, IncomeResponse, OkResponse } from '@dautu/contracts';
import { vnDateKey } from '../../market/types';
import { VietcapEventsAdapter } from '../../market/providers/vietcap';
import type { CorporateEvent } from '../../market/providers/vietcap';
import { PrismaService } from '../../prisma/prisma.service';
import { missingActions } from './corporate-actions';
import { buildIncome, clampPast } from './income';
import { toLedgerTx } from '../transactions.presenter';
import { TransactionsService } from '../transactions.service';

/** Gợi ý ghi sự kiện quyền còn thiếu vào sổ, theo dữ liệu sự kiện của Vietcap */
@Injectable()
export class CorporateActionsService {
  private log = new Logger(CorporateActionsService.name);

  constructor(
    private prisma: PrismaService,
    private vietcap: VietcapEventsAdapter,
    private transactions: TransactionsService,
  ) {}

  async missing(userId: string): Promise<CorporateActionsResponse> {
    const [txs, dismissed, portfolios] = await Promise.all([
      this.transactions.activeTransactions(userId),
      this.prisma.dismissedAction.findMany({ where: { userId }, select: { key: true } }),
      this.prisma.portfolio.findMany({ where: { userId }, select: { id: true, name: true } }),
    ]);
    const { events, unavailable } = await this.loadEvents(txs);
    const names = new Map(portfolios.map((p) => [p.id, p.name]));
    const items = missingActions(txs.map(toLedgerTx), events, vnDateKey(), new Set(dismissed.map((d) => d.key))).map(
      (a) => ({ ...a, portfolioName: a.portfolioId ? (names.get(a.portfolioId) ?? null) : null }),
    );
    return {
      items,
      /** Mã không lấy được dữ liệu sự kiện lần này (nguồn lỗi) — không có nghĩa là không có sự kiện */
      unavailable: unavailable.sort(),
      source: 'Vietcap',
    };
  }

  /** Sự kiện quyền của các mã từng có trong sổ (bộ nhớ đệm theo mã); mã lỗi nguồn được liệt kê riêng */
  private async loadEvents(txs: { assetType: string | null; symbol: string | null }[]) {
    const symbols = [...new Set(txs.filter((t) => t.assetType === 'stock' && t.symbol).map((t) => t.symbol!))];
    const unavailable: string[] = [];
    const events: CorporateEvent[] = [];
    await Promise.all(
      symbols.map(async (s) => {
        try {
          events.push(...(await this.vietcap.corporateEvents(s)));
        } catch (e) {
          this.log.warn(`Sự kiện quyền ${s}: ${(e as Error).message}`);
          unavailable.push(s);
        }
      }),
    );
    return { events, unavailable };
  }

  /**
   * Lịch thu nhập cổ tức: đã nhận (sổ) và dự kiến (sự kiện Vietcap). Một mã lỗi nguồn → `unavailable` và chỉ còn
   * phần đã nhận, kèm ghi chú mã nào lỗi; không ghi gì vào sổ.
   */
  async income(userId: string, pastRaw?: unknown, today = vnDateKey()): Promise<IncomeResponse> {
    const past = clampPast(pastRaw);
    const [txs, dismissed, portfolios] = await Promise.all([
      this.transactions.activeTransactions(userId),
      this.prisma.dismissedAction.findMany({ where: { userId }, select: { key: true } }),
      this.prisma.portfolio.findMany({ where: { userId }, select: { id: true, name: true } }),
    ]);
    const { events, unavailable } = await this.loadEvents(txs);
    const result = buildIncome({
      txs: txs.map(toLedgerTx),
      events,
      today,
      past,
      dismissed: new Set(dismissed.map((d) => d.key)),
      portfolioNames: new Map(portfolios.map((p) => [p.id, p.name])),
    });
    const notes = unavailable.length
      ? [`Không lấy được sự kiện cổ tức của ${unavailable.sort().join(', ')}: chỉ hiện phần đã nhận.`, ...result.notes]
      : result.notes;
    return {
      ...result,
      notes,
      unavailable: unavailable.length > 0,
      source: 'Sổ giao dịch của bạn + Vietcap' as const,
      asOf: new Date().toISOString(),
    };
  }

  private async lockedIncomeKeys(userId: string) {
    const { months } = await this.income(userId, 36);
    const keys = months
      .flatMap((m) => m.items)
      .flatMap((i) => (i.type === 'expected' && i.certainty === 'locked' ? [i.key] : []));
    return new Set(keys);
  }

  /** Bỏ qua một gợi ý (vd đã tính vào số dư khai báo hoặc nhận ở nơi khác) */
  async dismiss(userId: string, key: string): Promise<OkResponse> {
    const { items } = await this.missing(userId);
    // Khoản đã chốt quyền nhưng chưa tới ngày trả không nằm trong gợi ý ghi sổ, song vẫn hiện trên lịch thu nhập
    const known = items.some((i) => i.key === key) || (await this.lockedIncomeKeys(userId)).has(key);
    if (!known) throw new BadRequestException('Không có gợi ý này');
    await this.prisma.dismissedAction.upsert({
      where: { userId_key: { userId, key } },
      create: { userId, key },
      update: {},
    });
    return { ok: true };
  }
}
