import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Holding, Prisma, Transaction } from '@prisma/client';
import { IsIn, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { isDateKey, IsDateKey } from '../common/dates';
import { AnalyticsService } from '../analytics/analytics.service';
import { MarketService, normalizeCrypto } from '../market/market.service';
import { vnDateKey } from '../market/types';
import { PrismaService } from '../prisma/prisma.module';
import { LedgerError, ledgerOfAll, TX_TYPES } from './ledger';
import type { Currency, LedgerResult, LedgerTx, TxType } from './ledger';

type Db = Prisma.TransactionClient | PrismaService;

export class TransactionDto {
  @IsIn(TX_TYPES) type!: TxType;
  @IsDateKey() date!: string;
  @IsOptional() @IsIn(['stock', 'crypto', 'gold', 'cash']) assetType?: 'stock' | 'crypto' | 'gold' | 'cash';
  @IsOptional() @IsString() @MaxLength(20) symbol?: string;
  @IsOptional() @IsNumber() @Min(0) quantity?: number;
  @IsOptional() @IsNumber() @Min(0) price?: number;
  @IsOptional() @IsNumber() @Min(0) amount?: number;
  @IsOptional() @IsNumber() @Min(0) fee?: number;
  @IsOptional() @IsNumber() @Min(0) tax?: number;
  @IsOptional() @IsIn(['VND', 'USDT']) currency?: Currency;
  @IsOptional() @IsNumber() @Min(0) fxRate?: number;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  /** Danh mục ghi giao dịch; bỏ trống = danh mục chính */
  @IsOptional() @IsString() @MaxLength(40) portfolioId?: string;
}

const CASH_ONLY: TxType[] = ['deposit', 'withdraw', 'fee'];
/** Ngày giao dịch sớm nhất nhận (chặn gõ nhầm năm, vd 0026 hay 1026) */
const MIN_TX_DATE = '1990-01-01';

const dec = (v: number | undefined | null) => (v === undefined || v === null ? null : new Prisma.Decimal(String(v)));
const dateKey = (d: Date) => d.toISOString().slice(0, 10);

export type NormalizedTx = Awaited<ReturnType<TransactionsService['normalize']>>;

export function toLedgerTx(t: Transaction): LedgerTx {
  return {
    id: t.id,
    type: t.type as TxType,
    date: dateKey(t.date),
    createdAt: t.createdAt,
    assetType: t.assetType as LedgerTx['assetType'],
    symbol: t.symbol,
    quantity: t.quantity,
    price: t.price,
    amount: t.amount,
    fee: t.fee,
    tax: t.tax,
    currency: t.currency as Currency,
    fxRate: t.fxRate,
    note: t.note,
    portfolioId: t.portfolioId,
  };
}

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
  async normalize(dto: TransactionDto) {
    const today = vnDateKey();
    if (!isDateKey(dto.date)) throw new BadRequestException('Ngày giao dịch không hợp lệ');
    if (dto.date > today) throw new BadRequestException('Ngày giao dịch không được ở tương lai');
    if (dto.date < MIN_TX_DATE) throw new BadRequestException('Ngày giao dịch quá xa trong quá khứ (trước năm 1990)');
    const base = {
      type: dto.type,
      date: new Date(`${dto.date}T00:00:00Z`),
      fee: dec(dto.fee) ?? new Prisma.Decimal(0),
      tax: dec(dto.tax) ?? new Prisma.Decimal(0),
      fxRate: dec(dto.fxRate),
      note: dto.note?.trim() || null,
    };

    if (CASH_ONLY.includes(dto.type)) {
      if (!dto.amount) throw new BadRequestException('Nhập số tiền');
      return {
        ...base,
        assetType: null,
        symbol: null,
        quantity: null,
        price: null,
        amount: dec(dto.amount),
        currency: dto.currency ?? 'VND',
      };
    }

    if (dto.type === 'bonus') {
      if (dto.assetType && dto.assetType !== 'stock')
        throw new BadRequestException('Chỉ cổ phiếu mới nhận thêm cổ phiếu');
      if (!dto.symbol) throw new BadRequestException('Chọn mã cổ phiếu');
      if (!dto.quantity) throw new BadRequestException('Nhập số cổ phiếu nhận thêm');
      const symbol = (await this.market.assertStock(dto.symbol.trim().toUpperCase())).symbol;
      return {
        ...base,
        assetType: 'stock',
        symbol,
        quantity: dec(dto.quantity),
        price: null,
        amount: null,
        currency: 'VND',
      };
    }

    if (dto.type === 'dividend') {
      if (!dto.amount) throw new BadRequestException('Nhập số tiền cổ tức');
      const symbol = dto.symbol ? (await this.market.assertStock(dto.symbol.trim().toUpperCase())).symbol : null;
      return {
        ...base,
        assetType: symbol ? 'stock' : null,
        symbol,
        quantity: null,
        price: null,
        amount: dec(dto.amount),
        currency: 'VND',
      };
    }

    // opening / buy / sell: cần tài sản, số lượng, giá
    if (!dto.assetType) throw new BadRequestException('Chọn loại tài sản');
    if (!dto.quantity) throw new BadRequestException('Nhập số lượng');
    if (dto.assetType === 'cash') {
      if (dto.type !== 'opening') throw new BadRequestException('Tiền mặt dùng giao dịch nạp / rút');
      const cur: Currency = dto.symbol?.toUpperCase() === 'USDT' ? 'USDT' : 'VND';
      return {
        ...base,
        assetType: 'cash',
        symbol: cur,
        quantity: dec(dto.quantity),
        price: new Prisma.Decimal(1),
        amount: null,
        currency: cur,
      };
    }
    if (dto.price === undefined || (dto.type !== 'opening' && !dto.price)) throw new BadRequestException('Nhập giá');
    let symbol = (dto.symbol ?? '').trim().toUpperCase();
    if (!symbol) throw new BadRequestException('Chọn mã tài sản');
    if (dto.assetType === 'stock') symbol = (await this.market.assertStock(symbol)).symbol;
    if (dto.assetType === 'crypto') symbol = normalizeCrypto(symbol);
    if (dto.assetType === 'gold' && !this.market.goldQuotes().some((g) => g.code === symbol)) {
      throw new NotFoundException(`Không có loại vàng ${symbol}`);
    }
    return {
      ...base,
      assetType: dto.assetType,
      symbol,
      quantity: dec(dto.quantity),
      price: dec(dto.price),
      amount: null,
      currency: dto.assetType === 'crypto' ? 'USDT' : 'VND',
    };
  }

  async list(userId: string, portfolioId?: string) {
    await this.ensureMigrated(this.prisma, userId);
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
    return [
      await db.portfolio.create({ data: { id: `pf_${userId}`, userId, name: 'Danh mục chính', isDefault: true } }),
    ];
  }

  /** Danh mục ghi giao dịch: đúng của người dùng, bỏ trống thì là danh mục chính */
  async resolvePortfolio(db: Db, userId: string, portfolioId?: string | null) {
    const list = await this.portfolios(db, userId);
    if (!portfolioId) return (list.find((p) => p.isDefault) ?? list[0]).id;
    if (!list.some((p) => p.id === portfolioId)) throw new NotFoundException('Không tìm thấy danh mục');
    return portfolioId;
  }

  async revisions(userId: string, id: string) {
    const tx = await this.prisma.transaction.findFirst({ where: { id, userId } });
    if (!tx) throw new NotFoundException('Không tìm thấy giao dịch');
    return this.prisma.transactionRevision.findMany({ where: { transactionId: id }, orderBy: { createdAt: 'desc' } });
  }

  async create(userId: string, dto: TransactionDto) {
    // Kiểm tra mã với nguồn giá trước, ngoài transaction DB
    const data = await this.normalize(dto);
    const result = await this.write(userId, async (db, txs) => {
      const portfolioId = await this.resolvePortfolio(db, userId, dto.portfolioId);
      const row = await db.transaction.create({ data: { ...data, userId, portfolioId } });
      return { result: this.present(row, 0), txs: [...txs, row] };
    });
    this.firstRealAsset(userId, 'manual');
    return result;
  }

  async update(userId: string, id: string, dto: TransactionDto) {
    const data = await this.normalize(dto);
    return this.write(userId, async (db, txs) => {
      const before = txs.find((t) => t.id === id);
      if (!before) throw new NotFoundException('Không tìm thấy giao dịch');
      await db.transactionRevision.create({ data: { transactionId: id, action: 'update', before: snapshot(before) } });
      // Không gửi danh mục thì giữ nguyên danh mục cũ
      const portfolioId = dto.portfolioId
        ? await this.resolvePortfolio(db, userId, dto.portfolioId)
        : before.portfolioId;
      const row = await db.transaction.update({ where: { id }, data: { ...data, portfolioId } });
      return { result: this.present(row, 1), txs: txs.map((t) => (t.id === id ? row : t)) };
    });
  }

  remove(userId: string, id: string) {
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
        result: { batch: undone, removed: inBatch.length },
        txs: txs.filter((t) => t.importBatchId !== batchId),
      };
    });
  }

  async importBatches(userId: string) {
    return this.prisma.importBatch.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 });
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
        await this.syncHoldings(db, userId, ledger);
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
    }));
  }

  /** Ghi lại bảng Holding từ sổ: chỉ cập nhật dòng thay đổi để giữ id và mốc updatedAt có ý nghĩa */
  private async syncHoldings(db: Prisma.TransactionClient, userId: string, ledger: LedgerResult) {
    const desired = new Map<
      string,
      { assetType: string; symbol: string; quantity: number; avgCost: number; note: string | null }
    >();
    for (const p of ledger.positions) {
      if (!p.quantity.gt(0)) continue;
      desired.set(`${p.assetType}:${p.symbol}`, {
        assetType: p.assetType,
        symbol: p.symbol,
        quantity: p.quantity.toNumber(),
        avgCost: p.costBasis.div(p.quantity).toNumber(),
        note: p.note,
      });
    }
    for (const cur of ['VND', 'USDT'] as const) {
      if (!ledger.cash[cur].gt(0)) continue;
      desired.set(`cash:${cur}`, {
        assetType: 'cash',
        symbol: cur,
        quantity: ledger.cash[cur].toNumber(),
        // Tiền mặt: giá vốn theo VND cho mỗi đơn vị (USDT theo tỷ giá hiện tại)
        avgCost: cur === 'VND' ? 1 : this.market.usdtVnd.rate,
        note: null,
      });
    }

    const existing = await db.holding.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
    const seen = new Set<string>();
    for (const h of existing) {
      const key = `${h.assetType}:${h.symbol}`;
      const want = desired.get(key);
      if (!want || seen.has(key)) {
        await db.holding.delete({ where: { id: h.id } });
        continue;
      }
      seen.add(key);
      if (!same(h.quantity, want.quantity) || !same(h.avgCost, want.avgCost) || h.note !== want.note) {
        await db.holding.update({ where: { id: h.id }, data: want });
      }
    }
    const missing = [...desired.entries()].filter(([k]) => !seen.has(k)).map(([, v]) => ({ ...v, userId }));
    if (missing.length) await db.holding.createMany({ data: missing });
  }

  private present(t: Transaction, revisionCount: number) {
    const gold = t.assetType === 'gold' ? this.market.goldQuotes().find((g) => g.code === t.symbol)?.name : null;
    const qty = t.quantity?.toNumber() ?? null;
    const price = t.price?.toNumber() ?? null;
    return {
      id: t.id,
      type: t.type as TxType,
      date: dateKey(t.date),
      assetType: t.assetType,
      symbol: t.symbol,
      displayName: gold ?? (t.symbol ? (t.assetType === 'cash' ? t.symbol : t.symbol.replace(/USDT$/, '')) : null),
      quantity: qty,
      price,
      amount: t.amount?.toNumber() ?? null,
      fee: t.fee.toNumber(),
      tax: t.tax.toNumber(),
      currency: t.currency as Currency,
      fxRate: t.fxRate?.toNumber() ?? null,
      /** Giá trị giao dịch theo đồng tiền gốc: số lượng × giá, hoặc số tiền */
      grossValue: t.amount?.toNumber() ?? (qty !== null && price !== null ? qty * price : null),
      portfolioId: t.portfolioId,
      note: t.note,
      source: t.source,
      edited: revisionCount > 0,
      createdAt: t.createdAt,
    };
  }
}

/** Số dư đầu kỳ dựng từ bảng Holding cũ: mỗi tài sản một giao dịch opening, id cố định theo holding */
function migrationRows(holdings: Holding[], userId: string, portfolioId: string) {
  return holdings.map((h) => ({
    id: `mig_${h.id}`,
    userId,
    portfolioId,
    type: 'opening',
    date: new Date(`${vnDateKey(h.createdAt)}T00:00:00Z`),
    assetType: h.assetType,
    symbol: h.symbol,
    quantity: new Prisma.Decimal(String(h.quantity)),
    price: new Prisma.Decimal(h.assetType === 'cash' ? 1 : String(h.avgCost)),
    currency: h.assetType === 'crypto' ? 'USDT' : 'VND',
    note: h.note,
    source: 'migration',
    createdAt: h.createdAt,
  }));
}

function same(a: number, b: number) {
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

function snapshot(t: Transaction): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(t)) as Prisma.InputJsonValue;
}
