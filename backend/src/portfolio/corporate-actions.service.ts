import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { vnDateKey } from '../market/types';
import { VietcapProvider } from '../market/providers/vietcap.provider';
import type { CorporateEvent } from '../market/providers/vietcap.provider';
import { PrismaService } from '../prisma/prisma.module';
import { missingActions } from './corporate-actions';
import { toLedgerTx, TransactionsService } from './transactions';

/** Gợi ý ghi sự kiện quyền còn thiếu vào sổ, theo dữ liệu sự kiện của Vietcap */
@Injectable()
export class CorporateActionsService {
  private log = new Logger(CorporateActionsService.name);

  constructor(
    private prisma: PrismaService,
    private vietcap: VietcapProvider,
    private transactions: TransactionsService,
  ) {}

  async missing(userId: string) {
    const [txs, dismissed, portfolios] = await Promise.all([
      this.transactions.activeTransactions(userId),
      this.prisma.dismissedAction.findMany({ where: { userId }, select: { key: true } }),
      this.prisma.portfolio.findMany({ where: { userId }, select: { id: true, name: true } }),
    ]);
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

  /** Bỏ qua một gợi ý (vd đã tính vào số dư khai báo hoặc nhận ở nơi khác) */
  async dismiss(userId: string, key: string) {
    const { items } = await this.missing(userId);
    if (!items.some((i) => i.key === key)) throw new BadRequestException('Không có gợi ý này');
    await this.prisma.dismissedAction.upsert({
      where: { userId_key: { userId, key } },
      create: { userId, key },
      update: {},
    });
    return { ok: true };
  }
}
