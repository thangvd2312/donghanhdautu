import { BadRequestException, HttpException, Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { IsArray, IsIn, IsInt, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { AnalyticsService } from '../analytics/analytics.service';
import { MarketService } from '../market/market.service';
import { autoMapping, dupKey, FIELD_LABEL, FIELDS, MAX_BYTES, MAX_ROWS, parseCsv, rowToDto } from './csv-import';
import type { Field, Mapping } from './csv-import';
import { computeLedger, LedgerError, LedgerResult, LedgerTx } from './ledger';
import type { Currency, TxType } from './ledger';
import { PrismaService } from '../prisma/prisma.module';
import { NormalizedTx, toLedgerTx, TransactionsService } from './transactions';

export class ImportDto {
  @IsString() @MaxLength(MAX_BYTES, { message: 'File quá lớn (tối đa khoảng 1 MB)' }) csv!: string;
  @IsOptional() @IsString() @MaxLength(200) fileName?: string;
  @IsOptional() @IsObject() mapping?: Mapping;
  @IsOptional() @IsIn(['.', ',']) decimal?: '.' | ',';
  /** Số dòng (theo file) của các dòng nghi trùng mà người dùng vẫn muốn nhập */
  @IsOptional() @IsArray() @IsInt({ each: true }) includeDuplicates?: number[];
  /** Danh mục nhận giao dịch; bỏ trống = danh mục chính */
  @IsOptional() @IsString() @MaxLength(40) portfolioId?: string;
}

type RowStatus = 'ok' | 'error' | 'duplicate';

interface PreviewRow {
  line: number;
  status: RowStatus;
  errors: string[];
  duplicateReason: string | null;
  /** Dòng nghi trùng mà người dùng chọn vẫn nhập */
  included: boolean;
  tx: {
    date: string;
    type: TxType;
    assetType: string | null;
    symbol: string | null;
    quantity: number | null;
    price: number | null;
    amount: number | null;
    fee: number;
    tax: number;
    currency: string;
  } | null;
}

const num = (d: Prisma.Decimal | null) => (d === null ? null : d.toNumber());
const dateKey = (d: Date) => d.toISOString().slice(0, 10);

function normalizedToLedger(n: NormalizedTx, id: string, createdAt: Date): LedgerTx {
  return {
    id,
    type: n.type,
    date: dateKey(n.date),
    createdAt,
    assetType: n.assetType as LedgerTx['assetType'],
    symbol: n.symbol,
    quantity: n.quantity,
    price: n.price,
    amount: n.amount,
    fee: n.fee,
    tax: n.tax,
    currency: n.currency as Currency,
    fxRate: n.fxRate,
    note: n.note,
  };
}

/** Băm nội dung yêu cầu nhập: cùng file, cách đọc cột, danh mục và lựa chọn dòng nghi trùng = cùng một lần nhập */
export function requestHash(userId: string, dto: ImportDto) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        v: 2,
        userId,
        portfolioId: dto.portfolioId || null,
        csv: dto.csv.replace(/\r\n?/g, '\n').trimEnd(),
        mapping: dto.mapping ? Object.entries(dto.mapping).sort(([a], [b]) => a.localeCompare(b)) : null,
        decimal: dto.decimal ?? '.',
        includeDuplicates: [...new Set(dto.includeDuplicates ?? [])].sort((a, b) => a - b),
      }),
    )
    .digest('hex');
}

function alreadyDone(batch: { id: string; importedCount: number }) {
  return {
    batchId: batch.id,
    alreadyImported: true,
    imported: batch.importedCount,
    skippedErrors: 0,
    skippedDuplicates: 0,
  };
}

/** Nhập giao dịch từ CSV: xem trước (không ghi gì) → xác nhận (ghi một đợt, chống trùng khi gửi lại) */
@Injectable()
export class ImportService {
  constructor(
    private transactions: TransactionsService,
    private market: MarketService,
    private prisma: PrismaService,
    @Optional() private analytics?: AnalyticsService,
  ) {}

  async preview(userId: string, dto: ImportDto) {
    const r = await this.analyze(userId, dto);
    return {
      fileName: dto.fileName ?? null,
      headers: r.headers,
      mapping: r.mapping,
      mappingErrors: r.mappingErrors,
      decimal: r.decimal,
      rows: r.rows,
      counts: r.counts,
      impact: r.impact,
    };
  }

  async commit(userId: string, dto: ImportDto) {
    // Nhận diện lần nhập theo chính yêu cầu (file + lựa chọn của người dùng), tính trước khi so với sổ:
    // gửi lại sau khi đã nhập thì các dòng đã thành "trùng sổ", tập dòng sẽ nhập đổi theo, không dùng để nhận diện được
    const hash = requestHash(userId, dto);
    const done = await this.prisma.importBatch.findFirst({ where: { userId, hash, undoneAt: null } });
    if (done) return alreadyDone(done);
    const r = await this.analyze(userId, dto);
    if (r.mappingErrors.length) throw new BadRequestException(r.mappingErrors.join(' '));
    if (!r.toImport.length) {
      throw new BadRequestException(
        r.counts.duplicates && !r.counts.errors
          ? 'Mọi dòng trong file đều giống giao dịch đã có trong sổ — có thể file này đã được nhập rồi.'
          : 'Không có dòng hợp lệ nào để nhập',
      );
    }
    const res = await this.transactions.commitImport(
      userId,
      r.toImport.map((x) => x.data),
      { hash, fileName: dto.fileName ?? null, rowCount: r.rows.length, portfolioId: r.portfolioId },
    );
    if (res.alreadyImported) return alreadyDone(res.batch);
    this.transactions.firstRealAsset(userId, 'csv');
    void this.analytics?.track('import_completed', {
      userId,
      props: { rows: r.toImport.length },
      dedupeKey: `import:${res.batch.id}`,
    });
    return {
      batchId: res.batch.id,
      alreadyImported: false,
      imported: r.toImport.length,
      skippedErrors: r.counts.errors,
      skippedDuplicates: r.counts.duplicates - r.counts.duplicatesIncluded,
    };
  }

  private async analyze(userId: string, dto: ImportDto) {
    if (dto.csv.length > MAX_BYTES) throw new BadRequestException('File quá lớn (tối đa khoảng 1 MB)');
    if (dto.csv.includes('�')) {
      throw new BadRequestException('File có ký tự lỗi font. Hãy lưu lại dạng "CSV UTF-8" rồi tải lên lại.');
    }
    const all = parseCsv(dto.csv);
    if (all.length < 2)
      throw new BadRequestException('File không có dòng dữ liệu nào (cần dòng tiêu đề và ít nhất 1 dòng)');
    const [headers, ...data] = all;
    if (data.length > MAX_ROWS)
      throw new BadRequestException(`File có ${data.length} dòng, tối đa ${MAX_ROWS} dòng mỗi lần`);
    const decimal = dto.decimal ?? '.';
    // Ánh xạ do người dùng chọn: chỉ giữ chỉ số cột hợp lệ
    const mapping: Mapping = {};
    for (const [f, i] of Object.entries(dto.mapping ?? autoMapping(headers))) {
      if ((FIELDS as readonly string[]).includes(f) && Number.isInteger(i) && i >= 0 && i < headers.length) {
        mapping[f as Field] = i;
      }
    }
    const mappingErrors = (['date', 'type'] as const)
      .filter((f) => mapping[f] === undefined)
      .map((f) => `Chưa chọn cột "${FIELD_LABEL[f]}".`);

    const include = new Set(dto.includeDuplicates ?? []);
    const rows: PreviewRow[] = [];
    const normalized = new Map<number, NormalizedTx>();

    if (!mappingErrors.length) {
      for (const [i, cells] of data.entries()) {
        const parsed = rowToDto(cells, i + 2, mapping, decimal);
        const row: PreviewRow = {
          line: parsed.line,
          status: 'ok',
          errors: parsed.errors,
          duplicateReason: null,
          included: false,
          tx: null,
        };
        if (parsed.dto) {
          try {
            const n = await this.transactions.normalize(parsed.dto);
            normalized.set(row.line, n);
            row.tx = {
              date: dateKey(n.date),
              type: n.type,
              assetType: n.assetType,
              symbol: n.symbol,
              quantity: num(n.quantity),
              price: num(n.price),
              amount: num(n.amount),
              fee: n.fee.toNumber(),
              tax: n.tax.toNumber(),
              currency: n.currency,
            };
          } catch (e) {
            row.errors.push(e instanceof HttpException ? e.message : (e as Error).message);
          }
        }
        if (row.errors.length) row.status = 'error';
        rows.push(row);
      }
    }

    // Nghi trùng: trùng giao dịch đã có, hoặc trùng một dòng phía trên trong file. Không tự bỏ: người dùng chọn.
    // So trùng và kiểm tra sổ trong đúng danh mục nhận giao dịch
    // Chỉ đọc: xem trước không được tạo danh mục hay chuyển Holding cũ thành sổ (việc đó làm lúc xác nhận nhập)
    const portfolioId = await this.transactions.peekPortfolio(userId, dto.portfolioId);
    const existing = await this.transactions.peekTransactions(userId, portfolioId);
    const existingKeys = new Map<string, string>();
    for (const t of existing) {
      existingKeys.set(
        dupKey({
          date: dateKey(t.date),
          type: t.type,
          assetType: t.assetType,
          symbol: t.symbol,
          quantity: num(t.quantity),
          price: num(t.price),
          amount: num(t.amount),
        }),
        dateKey(t.date),
      );
    }
    const seenInFile = new Map<string, number>();
    for (const row of rows) {
      if (row.status !== 'ok' || !row.tx) continue;
      const key = dupKey(row.tx);
      if (existingKeys.has(key))
        row.duplicateReason = 'Giống một giao dịch đã có trong sổ (cùng ngày, loại, mã, số lượng, giá)';
      else if (seenInFile.has(key)) row.duplicateReason = `Giống dòng ${seenInFile.get(key)} trong file`;
      if (!seenInFile.has(key)) seenInFile.set(key, row.line);
      if (row.duplicateReason) {
        row.status = 'duplicate';
        row.included = include.has(row.line);
      }
    }

    // Kiểm tra cả sổ sau khi thêm: dòng làm sổ sai (vd bán quá số đang có) bị chuyển thành lỗi
    const base = existing.map(toLedgerTx);
    const now = Date.now();
    const candidates = () =>
      rows
        .filter((r) => r.status === 'ok' || (r.status === 'duplicate' && r.included))
        .map((r, i) => normalizedToLedger(normalized.get(r.line)!, `row:${r.line}`, new Date(now + i)));
    let after: LedgerResult | null = null;
    for (let guard = 0; guard <= rows.length; guard++) {
      try {
        after = computeLedger([...base, ...candidates()]);
        break;
      } catch (e) {
        if (!(e instanceof LedgerError) || !e.txId.startsWith('row:')) throw e;
        const row = rows.find((r) => r.line === Number(e.txId.slice(4)))!;
        row.status = 'error';
        row.included = false;
        row.errors.push(e.message);
      }
    }

    const toImport = rows
      .filter((r) => r.status === 'ok' || (r.status === 'duplicate' && r.included))
      .map((r) => ({ line: r.line, data: normalized.get(r.line)! }));
    const counts = {
      total: rows.length,
      errors: rows.filter((r) => r.status === 'error').length,
      duplicates: rows.filter((r) => r.status === 'duplicate').length,
      duplicatesIncluded: rows.filter((r) => r.status === 'duplicate' && r.included).length,
      toImport: toImport.length,
    };
    return {
      headers,
      mapping,
      mappingErrors,
      decimal,
      rows,
      counts,
      impact: after && toImport.length ? this.impact(computeLedger(base), after) : null,
      toImport,
      portfolioId,
    };
  }

  /** Tác động dự kiến lên số dư: số lượng từng tài sản, tiền mặt, vốn đưa vào */
  private impact(before: LedgerResult, after: LedgerResult) {
    const qty = (l: LedgerResult) => new Map(l.positions.map((p) => [`${p.assetType}:${p.symbol}`, p]));
    const b = qty(before);
    const a = qty(after);
    const positions = [...new Set([...b.keys(), ...a.keys()])]
      .map((k) => {
        const p = a.get(k) ?? b.get(k)!;
        const name =
          p.assetType === 'gold'
            ? (this.market.goldQuotes().find((g) => g.code === p.symbol)?.name ?? p.symbol)
            : p.symbol.replace(/USDT$/, '');
        return { name, before: b.get(k)?.quantity.toNumber() ?? 0, after: a.get(k)?.quantity.toNumber() ?? 0 };
      })
      .filter((p) => p.before !== p.after);
    const rate = this.market.usdtVnd.rate;
    const contrib = (l: LedgerResult) =>
      l.contributions.VND.vndKnown
        .add(l.contributions.USDT.vndKnown)
        .add(l.contributions.USDT.unknownFx.mul(rate))
        .toNumber();
    return {
      positions,
      cash: {
        VND: { before: before.cash.VND.toNumber(), after: after.cash.VND.toNumber() },
        USDT: { before: before.cash.USDT.toNumber(), after: after.cash.USDT.toNumber() },
      },
      netContributions: { before: contrib(before), after: contrib(after) },
      implicitDeposits: {
        before: before.implicitDeposits.VND.toNumber(),
        after: after.implicitDeposits.VND.toNumber(),
      },
    };
  }
}
