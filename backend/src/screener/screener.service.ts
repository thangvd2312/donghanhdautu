import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { ScreenCriterion, ScreenResult } from '@dautu/contracts';
import { dividendHistory } from '../market/dividends';
import { toCorporateEvent, VietcapEventsAdapter, VietcapScreeningAdapter } from '../market/providers/vietcap';
import type { CorporateEvent, VcScreenCriterion, VcScreenPage, VcScreenRow } from '../market/providers/vietcap';
import { vnDateKey } from '../market/types';
import { PrismaService } from '../prisma/prisma.service';
import { CRITERIA, EXCHANGES, FALLBACK_SECTORS, Option } from './screener.catalog';
import {
  Filter,
  MAX_PAGE_SIZE,
  MultiFilter,
  ScreenItem,
  ScreenerInputError,
  Sort,
  dividendFilter,
  inRange,
  mapRow,
  toVietcapRequest,
  validateFilters,
  validateSort,
  withoutDividend,
} from './screener.logic';

/** Số mã tối đa quét khi phải lọc theo tỷ suất cổ tức ở server (nguồn không lọc được) */
const DIVIDEND_SCAN_CAP = 300;
const SOURCE_PAGE_SIZE = 100;
const SOURCE_DOWN = 'Nguồn dữ liệu lọc cổ phiếu (Vietcap) đang không phản hồi, bạn thử lại sau ít phút nhé';

interface RunRequest {
  filters?: unknown;
  sort?: unknown;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class ScreenerService {
  private log = new Logger(ScreenerService.name);
  private dividendScans = new Map<string, { at: number; rows: ScannedRow[]; scanned: number }>();

  constructor(
    private prisma: PrismaService,
    private screening: VietcapScreeningAdapter,
    private events: VietcapEventsAdapter,
  ) {}

  /** Danh mục tiêu chí; nhãn ngành và kỳ tăng trưởng lấy từ nguồn, lỗi thì dùng bản dự phòng */
  async criteria(): Promise<ScreenCriterion[]> {
    const live = await this.screening.screeningCriteria().catch(() => null);
    const sectors = sectorOptions(live);
    const quarter = live?.find((c) => c.name === 'npatmiGrowth')?.conditionExtra2?.find((o) => o.isDefault)?.viName;
    return CRITERIA.map((c) => {
      if (c.key === 'sector') return { ...c, options: sectors };
      if (c.key === 'profitGrowth' && quarter) return { ...c, period: `Quý ${quarter} so với cùng kỳ năm trước` };
      return c;
    });
  }

  async run(userId: string, req: RunRequest): Promise<ScreenResult> {
    const live = await this.screening.screeningCriteria().catch(() => null);
    let filters: Filter[];
    let sort: Sort;
    try {
      filters = validateFilters(req.filters, sectorOptions(live));
      sort = validateSort(req.sort, filters);
    } catch (e) {
      if (e instanceof ScreenerInputError) throw new BadRequestException(e.message);
      throw e;
    }
    const page = Number.isInteger(req.page) && req.page! >= 1 ? req.page! : 1;
    const pageSize = Number.isInteger(req.pageSize) ? Math.min(Math.max(req.pageSize!, 1), MAX_PAGE_SIZE) : 20;

    try {
      const dividend = dividendFilter(filters);
      const universe = await this.universe(filters);
      const found = dividend
        ? await this.runWithDividend(filters, sort, page, pageSize)
        : await this.runAtSource(filters, sort, page, pageSize);
      const items = await this.flag(userId, found.rows);
      return {
        items,
        total: found.total,
        universe,
        universeNote: universeNote(filters, universe, dividend !== undefined, found.scanned),
        missingNote: missingNote(filters, sort),
        postFiltered: dividend !== undefined,
        source: 'Vietcap',
        asOf: new Date().toISOString(),
      };
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      this.log.warn(`Lọc cổ phiếu lỗi: ${(e as Error).message}`);
      throw new ServiceUnavailableException(SOURCE_DOWN);
    }
  }

  /** Số mã nguồn quét: mọi mã trên các sàn được chọn (không tính điều kiện khác) */
  private async universe(filters: Filter[]): Promise<number> {
    const exchange = filters.filter((f) => f.key === 'exchange');
    const body = toVietcapRequest(exchange, { key: 'marketCap', dir: 'desc' }, 0, 1);
    return (await this.screening.screeningPage(body)).totalElements;
  }

  private async runAtSource(filters: Filter[], sort: Sort, page: number, pageSize: number) {
    const data = await this.screening.screeningPage(toVietcapRequest(filters, sort, page - 1, pageSize));
    return {
      rows: data.content.map((r) => mapRow(r, filters, sort)),
      total: data.totalElements,
      scanned: data.totalElements,
    };
  }

  /**
   * Lọc tỷ suất cổ tức: nguồn không lọc được, nên lấy tối đa DIVIDEND_SCAN_CAP mã đầu của kết quả đã khớp các điều kiện còn lại
   * (theo thứ tự sắp xếp), tính tỷ suất từng mã rồi lọc. `total` là số mã khớp trong phạm vi đã quét; trang cắt từ danh sách đó
   * nên không bị trang ngắn giữa chừng.
   */
  private async runWithDividend(filters: Filter[], sort: Sort, page: number, pageSize: number) {
    const rest = withoutDividend(filters);
    const range = dividendFilter(filters)!;
    const sourceSort: Sort = sort.key === 'dividendYield' ? { key: 'marketCap', dir: 'desc' } : sort;
    const cacheKey = JSON.stringify([rest, sourceSort, range]);
    let scan = this.dividendScans.get(cacheKey);
    if (!scan || Date.now() - scan.at > 10 * 60_000) {
      const candidates = await this.candidates(rest, sourceSort);
      const eventsByTicker = await this.dividendEventsByTicker();
      const today = vnDateKey();
      const yields = candidates.rows.map((r) => trailingYield(r, eventsByTicker.get(r.ticker) ?? [], today));
      const matched = candidates.rows
        .map((row, i) => ({ row, yieldPct: yields[i] }))
        .filter((c) => inRange(c.yieldPct, range));
      scan = { at: Date.now(), rows: matched, scanned: candidates.rows.length };
      this.dividendScans.set(cacheKey, scan);
      if (this.dividendScans.size > 50) {
        const oldest = this.dividendScans.keys().next();
        if (!oldest.done) this.dividendScans.delete(oldest.value);
      }
    }
    let rows = scan.rows;
    if (sort.key === 'dividendYield') {
      const sign = sort.dir === 'asc' ? 1 : -1;
      rows = [...rows].sort((a, b) => sign * ((a.yieldPct ?? 0) - (b.yieldPct ?? 0)));
    }
    return {
      rows: rows.slice((page - 1) * pageSize, page * pageSize).map((m) => mapRow(m.row, filters, sort, m.yieldPct)),
      total: rows.length,
      scanned: scan.scanned,
    };
  }

  private async candidates(filters: Filter[], sort: Sort): Promise<{ rows: VcScreenRow[] }> {
    const rows: VcScreenRow[] = [];
    for (let page = 0; rows.length < DIVIDEND_SCAN_CAP; page++) {
      const data: VcScreenPage = await this.screening.screeningPage(
        toVietcapRequest(filters, sort, page, SOURCE_PAGE_SIZE),
      );
      rows.push(...data.content);
      if (data.content.length < SOURCE_PAGE_SIZE || rows.length >= data.totalElements) break;
    }
    return { rows: rows.slice(0, DIVIDEND_SCAN_CAP) };
  }

  /**
   * Cổ tức tiền mặt và cổ tức cổ phiếu / thưởng 12 tháng gần nhất của MỌI mã trong một lần lấy sự kiện quyền toàn thị trường
   * (vài trang) thay vì gọi từng mã: gọi từng mã cho 300 ứng viên mất hàng phút. Cùng công thức dividendHistory như trang
   * cổ phiếu (tiền trả trước một đợt chia cổ phiếu được quy về số cổ phiếu hiện tại).
   */
  private async dividendEventsByTicker(): Promise<Map<string, CorporateEvent[]>> {
    const today = vnDateKey();
    const from = `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`;
    const { events } = await this.events.marketEvents(from, today);
    const out = new Map<string, CorporateEvent[]>();
    for (const e of events) {
      const ev = toCorporateEvent(e.ticker, e);
      if (!ev) continue;
      out.set(e.ticker, [...(out.get(e.ticker) ?? []), ev]);
    }
    return out;
  }

  private async flag(userId: string, rows: Omit<ScreenItem, 'watched' | 'held'>[]): Promise<ScreenItem[]> {
    if (rows.length === 0) return [];
    const symbol = { in: rows.map((r) => r.symbol) };
    const [held, watched] = await Promise.all([
      this.prisma.holding.findMany({
        where: { userId, assetType: 'stock', symbol, quantity: { gt: 0 } },
        select: { symbol: true },
      }),
      this.prisma.watchItem.findMany({ where: { userId, assetType: 'stock', symbol }, select: { symbol: true } }),
    ]);
    const heldSet = new Set(held.map((h) => h.symbol));
    const watchedSet = new Set(watched.map((w) => w.symbol));
    return rows.map((r) => ({ ...r, held: heldSet.has(r.symbol), watched: watchedSet.has(r.symbol) }));
  }
}

interface ScannedRow {
  row: VcScreenRow;
  yieldPct: number | null;
}

function sectorOptions(live: VcScreenCriterion[] | null): Option[] {
  const options = live
    ?.find((c) => c.name === 'sectorLv1')
    ?.conditionOptions?.filter((o) => o.value && o.viName)
    .map((o) => ({ value: o.value!, label: o.viName! }));
  return options?.length ? options : FALLBACK_SECTORS;
}

function universeNote(filters: Filter[], universe: number, postFiltered: boolean, scanned: number) {
  const exchanges =
    (filters.find((f) => f.key === 'exchange') as MultiFilter | undefined)?.values ?? EXCHANGES.map((e) => e.value);
  const base = `Quét ${universe.toLocaleString('vi-VN')} mã trên ${exchanges.join(', ')}`;
  if (!postFiltered) return base;
  // Đã xét hết các mã khớp điều kiện còn lại (chưa chạm giới hạn) thì không có gì bị bỏ sót
  if (scanned < DIVIDEND_SCAN_CAP)
    return `${base}. Tỷ suất cổ tức tính ở ứng dụng trên toàn bộ ${scanned.toLocaleString('vi-VN')} mã khớp các điều kiện còn lại`;
  return `${base}. Tỷ suất cổ tức tính ở ứng dụng nên chỉ xét tối đa ${DIVIDEND_SCAN_CAP} mã đầu trong số mã khớp các điều kiện còn lại (đã xét ${scanned.toLocaleString('vi-VN')} mã); có thể bỏ sót mã khớp ngoài phạm vi này`;
}

function missingNote(filters: Filter[], sort: Sort): string | null {
  const labels = CRITERIA.filter((c) =>
    filters.some((f) => f.key === c.key && !('values' in f) && c.key !== 'dividendYield'),
  ).map((c) => c.label);
  if (['pe', 'pb'].includes(sort.key) && !labels.includes(sort.key === 'pe' ? 'P/E' : 'P/B'))
    labels.push(sort.key === 'pe' ? 'P/E' : 'P/B');
  const dividend = dividendFilter(filters) !== undefined;
  if (labels.length === 0 && !dividend) return null;
  const parts: string[] = [];
  if (labels.length) parts.push(`Mã chưa có dữ liệu của chỉ tiêu đang lọc (${labels.join(', ')}) sẽ không xuất hiện`);
  if (dividend) parts.push('mã chưa có lịch sử cổ tức tiền mặt trong 12 tháng được tính là 0%');
  const text = parts.join('; ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Tỷ suất cổ tức tiền mặt 12 tháng; mã không có cổ tức trong kỳ là 0% (không phải thiếu dữ liệu) */
function trailingYield(row: VcScreenRow, events: CorporateEvent[], today: string): number | null {
  const price = typeof row.marketPrice === 'number' ? row.marketPrice : null;
  if (price === null || price <= 0) return null;
  return dividendHistory(events, price, today).trailingYieldPct ?? 0;
}
