import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Prisma, Transaction } from '@prisma/client';
import type { ImportBatch, Transaction as TransactionView, TransactionRevision } from '@dautu/contracts';
import { journalColumns } from '../journal/journal-tags';
import { AnalyticsService } from '../analytics/analytics.service';
import { MarketService } from '../market/market.service';
import { PrismaService } from '../prisma/prisma.service';
import type { TransactionDto } from './dto/transaction.dto';
import { syncHoldings } from './holdings-sync';
import { LedgerError, ledgerOfAll } from './ledger';
import type { LedgerResult } from './ledger';
import { migrationRows } from './migration-rows';
import { normalizeTransaction } from './transaction-input';
import type { NormalizedTx } from './transaction-input';
import { toImportBatch, toLedgerTx, toTransactionRevision, toTransactionView } from './transactions.presenter';

type Db = Prisma.TransactionClient | PrismaService;

/**
 * Sổ giao dịch: ghi / sửa / huỷ có kiểm tra toàn bộ sổ, lưu lịch sử thay đổi và tính lại bảng Holding.
 * Mọi thao tác ghi của một người dùng chạy tuần tự (khoá theo userId) để hai yêu cầu cùng lúc
 * không cùng vượt qua kiểm tra rồi tạo ra số dư sai.
 */
@Injectable()
export class TransactionsService {
  constructor(
    private prisma: PrismaService,
    private market: MarketService,
    @Optional() private analytics?: AnalyticsService,
  ) {}

  /** Chuẩn hoá đầu vào theo loại giao dịch; mã tài sản được kiểm tra với nguồn giá */
  normalize(dto: TransactionDto) {
    return normalizeTransaction(dto, this.market);
  }

  async list(userId: string, portfolioId?: string): Promise<TransactionView[]> {
    await this.ensureMigrated(this.prisma, userId);
    // Danh mục không phải của người dùng: 404 như các API danh mục khác, không trả danh sách rỗng
    if (portfolioId) await this.resolvePortfolio(this.prisma, userId, portfolioId);
    const rows = await this.prisma.transaction.findMany({
      where: { userId, deletedAt: null, ...(portfolioId ? { portfolioId } : {}) },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      include: { _count: { select: { revisions: true } }, portfolio: { select: { name: true } } },
    });
    return rows.map((t) => ({ ...this.present(t, t._count.revisions), portfolioName: t.portfolio?.name ?? null }));
  }

  /** Danh mục của người dùng; người chưa có thì tạo "Danh mục chính" */
  async portfolios(db: Db, userId: string) {
    const list = await db.portfolio.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    if (list.length) return list;
    // Trang Danh mục gọi nhiều API cùng lúc: tạo bỏ qua trùng rồi đọc lại, không để yêu cầu thứ hai lỗi khoá chính
    await db.portfolio.createMany({
      data: [{ id: `pf_${userId}`, userId, name: 'Danh mục chính', isDefault: true }],
      skipDuplicates: true,
    });
    return db.portfolio.findMany({ where: { userId }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] });
  }

  /** Danh mục ghi giao dịch: đúng của người dùng, bỏ trống thì là danh mục chính */
  async resolvePortfolio(db: Db, userId: string, portfolioId?: string | null) {
    const list = await this.portfolios(db, userId);
    if (!portfolioId) return (list.find((p) => p.isDefault) ?? list[0]).id;
    if (!list.some((p) => p.id === portfolioId)) throw new NotFoundException('Không tìm thấy danh mục');
    return portfolioId;
  }

  async revisions(userId: string, id: string): Promise<TransactionRevision[]> {
    const tx = await this.prisma.transaction.findFirst({ where: { id, userId } });
    if (!tx) throw new NotFoundException('Không tìm thấy giao dịch');
    const rows = await this.prisma.transactionRevision.findMany({
      where: { transactionId: id },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toTransactionRevision);
  }

  async create(userId: string, dto: TransactionDto): Promise<TransactionView> {
    // Kiểm tra mã với nguồn giá trước, ngoài transaction DB
    const data = await this.normalize(dto);
    const result = await this.write(userId, async (db, txs) => {
      const portfolioId = await this.resolvePortfolio(db, userId, dto.portfolioId);
      const journal = await journalColumns(db, userId, data, dto);
      const row = await db.transaction.create({ data: { ...data, ...journal, userId, portfolioId } });
      return { result: this.present(row, 0), txs: [...txs, row] };
    });
    this.firstRealAsset(userId, 'manual');
    return result;
  }

  async update(userId: string, id: string, dto: TransactionDto): Promise<TransactionView> {
    const data = await this.normalize(dto);
    return this.write(userId, async (db, txs) => {
      const before = txs.find((t) => t.id === id);
      if (!before) throw new NotFoundException('Không tìm thấy giao dịch');
      await db.transactionRevision.create({ data: { transactionId: id, action: 'update', before: snapshot(before) } });
      // Không gửi danh mục thì giữ nguyên danh mục cũ
      const portfolioId = dto.portfolioId
        ? await this.resolvePortfolio(db, userId, dto.portfolioId)
        : before.portfolioId;
      const journal = await journalColumns(db, userId, { ...data, current: before }, dto);
      const row = await db.transaction.update({ where: { id }, data: { ...data, ...journal, portfolioId } });
      return { result: this.present(row, 1), txs: txs.map((t) => (t.id === id ? row : t)) };
    });
  }

  remove(userId: string, id: string): Promise<TransactionView> {
    return this.write(userId, async (db, txs) => {
      const before = txs.find((t) => t.id === id);
      if (!before) throw new NotFoundException('Không tìm thấy giao dịch');
      await db.transactionRevision.create({ data: { transactionId: id, action: 'delete', before: snapshot(before) } });
      const row = await db.transaction.update({ where: { id }, data: { deletedAt: new Date() } });
      return { result: this.present(row, 1), txs: txs.filter((t) => t.id !== id) };
    });
  }

  /**
   * Ghi một đợt nhập CSV. Cùng nội dung (hash) đã nhập và chưa hoàn tác thì trả lại đợt cũ,
   * không tạo thêm giao dịch — bấm lại / gửi lại an toàn.
   */
  commitImport(
    userId: string,
    rows: NormalizedTx[],
    meta: { hash: string; fileName: string | null; rowCount: number; portfolioId: string },
  ) {
    return this.write(userId, async (db, txs) => {
      const existing = await db.importBatch.findFirst({ where: { userId, hash: meta.hash, undoneAt: null } });
      if (existing) return { result: { batch: existing, alreadyImported: true }, txs };
      const portfolioId = await this.resolvePortfolio(db, userId, meta.portfolioId);
      const batch = await db.importBatch.create({
        data: {
          userId,
          hash: meta.hash,
          fileName: meta.fileName,
          rowCount: meta.rowCount,
          importedCount: rows.length,
          portfolioId,
        },
      });
      const base = Date.now();
      // createdAt tăng dần theo thứ tự dòng để giao dịch cùng ngày giữ đúng thứ tự trong file
      await db.transaction.createMany({
        data: rows.map((r, i) => ({
          ...r,
          userId,
          portfolioId,
          source: 'csv',
          importBatchId: batch.id,
          createdAt: new Date(base + i),
        })),
      });
      const created = await db.transaction.findMany({ where: { importBatchId: batch.id } });
      return { result: { batch, alreadyImported: false }, txs: [...txs, ...created] };
    });
  }

  /** Đo kích hoạt: giao dịch thật đầu tiên (chống trùng theo người dùng nên gọi mỗi lần ghi cũng được) */
  firstRealAsset(userId: string, via: 'manual' | 'csv') {
    void this.analytics?.track('first_real_asset_added', {
      userId,
      props: { via },
      dedupeKey: 'first_real_asset_added',
    });
  }

  /** Hoàn tác một đợt nhập: huỷ mọi giao dịch của đợt (có lưu lịch sử), chặn nếu làm sổ sai */
  undoImport(userId: string, batchId: string) {
    return this.write(userId, async (db, txs) => {
      const batch = await db.importBatch.findFirst({ where: { id: batchId, userId } });
      if (!batch) throw new NotFoundException('Không tìm thấy đợt nhập');
      if (batch.undoneAt) throw new BadRequestException('Đợt nhập này đã được hoàn tác');
      const inBatch = txs.filter((t) => t.importBatchId === batchId);
      const now = new Date();
      for (const t of inBatch) {
        await db.transactionRevision.create({ data: { transactionId: t.id, action: 'delete', before: snapshot(t) } });
      }
      await db.transaction.updateMany({ where: { id: { in: inBatch.map((t) => t.id) } }, data: { deletedAt: now } });
      const undone = await db.importBatch.update({ where: { id: batchId }, data: { undoneAt: now } });
      return {
        result: { batch: toImportBatch(undone), removed: inBatch.length },
        txs: txs.filter((t) => t.importBatchId !== batchId),
      };
    });
  }

  async importBatches(userId: string): Promise<ImportBatch[]> {
    const rows = await this.prisma.importBatch.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map(toImportBatch);
  }

  /** Giao dịch hiện có (chưa huỷ) để so trùng khi nhập */
  async activeTransactions(userId: string, portfolioId?: string) {
    await this.ensureMigrated(this.prisma, userId);
    return this.prisma.transaction.findMany({
      where: { userId, deletedAt: null, ...(portfolioId ? { portfolioId } : {}) },
    });
  }

  /** Sổ hiện tại của người dùng (gộp mọi danh mục) hoặc của một danh mục */
  async ledger(userId: string, portfolioId?: string): Promise<LedgerResult> {
    const txs = await this.activeTransactions(userId, portfolioId);
    return ledgerOfAll(txs.map(toLedgerTx));
  }

  /**
   * Chạy một thay đổi trong transaction DB có khoá theo người dùng; kiểm tra toàn bộ sổ sau thay đổi
   * (sổ sai thì huỷ cả thay đổi), rồi tính lại bảng Holding.
   */
  private async write<T>(
    userId: string,
    change: (db: Prisma.TransactionClient, txs: Transaction[]) => Promise<{ result: T; txs: Transaction[] }>,
  ): Promise<T> {
    return this.prisma.$transaction(
      async (db) => {
        await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
        await this.ensureMigrated(db, userId);
        const current = await db.transaction.findMany({ where: { userId, deletedAt: null } });
        const { result, txs } = await change(db, current);
        const names = new Map((await this.portfolios(db, userId)).map((p) => [p.id, p.name]));
        let ledger: LedgerResult;
        try {
          ledger = ledgerOfAll(txs.map(toLedgerTx), (id) => (id ? (names.get(id) ?? null) : null));
        } catch (e) {
          if (e instanceof LedgerError) throw new BadRequestException(e.message);
          throw e;
        }
        await syncHoldings(db, userId, ledger, this.market.usdtVnd.rate);
        return result;
      },
      { timeout: 20_000 },
    );
  }

  /**
   * Tài khoản có tài sản khai báo nhưng chưa có sổ (tạo trước khi có sổ giao dịch): chuyển mỗi tài sản
   * thành một giao dịch số dư đầu kỳ. Cùng id với migration nên chạy lại không tạo trùng.
   */
  private async ensureMigrated(db: Db, userId: string) {
    const hasTx = await db.transaction.count({ where: { userId } });
    if (hasTx) return;
    const holdings = await db.holding.findMany({ where: { userId, quantity: { gt: 0 } } });
    if (!holdings.length) return;
    const portfolioId = await this.resolvePortfolio(db, userId);
    await db.transaction.createMany({ skipDuplicates: true, data: migrationRows(holdings, userId, portfolioId) });
  }

  /**
   * Bản chỉ đọc của danh mục nhận giao dịch và sổ hiện có, cho các bước "xem trước" không được ghi gì:
   * chưa có danh mục thì dùng id danh mục chính sẽ được tạo; chưa có sổ thì dựng số dư đầu kỳ từ Holding
   * giống hệt lúc chuyển đổi nhưng không lưu.
   */
  async peekPortfolio(userId: string, portfolioId?: string | null) {
    const list = await this.prisma.portfolio.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    if (!list.length) {
      if (portfolioId && portfolioId !== `pf_${userId}`) throw new NotFoundException('Không tìm thấy danh mục');
      return `pf_${userId}`;
    }
    if (!portfolioId) return (list.find((p) => p.isDefault) ?? list[0]).id;
    if (!list.some((p) => p.id === portfolioId)) throw new NotFoundException('Không tìm thấy danh mục');
    return portfolioId;
  }

  async peekTransactions(userId: string, portfolioId: string): Promise<Transaction[]> {
    const hasTx = await this.prisma.transaction.count({ where: { userId } });
    if (hasTx) return this.prisma.transaction.findMany({ where: { userId, deletedAt: null, portfolioId } });
    const holdings = await this.prisma.holding.findMany({ where: { userId, quantity: { gt: 0 } } });
    return migrationRows(holdings, userId, portfolioId).map((r) => ({
      ...r,
      amount: null,
      fee: new Prisma.Decimal(0),
      tax: new Prisma.Decimal(0),
      fxRate: null,
      importBatchId: null,
      deletedAt: null,
      updatedAt: r.createdAt,
      reason: null,
      emotion: null,
      planId: null,
    }));
  }

  private present(t: Transaction, revisionCount: number): TransactionView {
    return toTransactionView(t, revisionCount, this.market.goldQuotes().find((g) => g.code === t.symbol)?.name);
  }
}

function snapshot(t: Transaction): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(t)) as Prisma.InputJsonValue;
}
