import { Injectable, Logger } from '@nestjs/common';
import type { StockHit } from '@dautu/contracts';
import { MarketDataCache } from '../../cache/market-data-cache';
import { VIETCAP_POLICIES, vietcapKey } from '../../cache/vietcap-cache-policy';
import { VietcapQuotesAdapter } from './quotes.adapter';
import { VietcapHttpClient } from './vietcap-http.client';

/** Bản Map dựng từ danh sách giữ trong tiến trình tối đa chừng này rồi hỏi lại cache (rẻ: thường trúng L1/L2) */
const MAP_TTL_MS = 3600_000;

/** Một mã niêm yết; cũng là phần tử của GET /market/search */
type SymbolInfo = StockHit;

/** Danh mục mã niêm yết (HSX, HNX, UPCOM) và các nhóm chỉ số như VN30 */
@Injectable()
export class VietcapSymbolsAdapter {
  private log = new Logger(VietcapSymbolsAdapter.name);
  private symbols: { map: Map<string, SymbolInfo>; builtAt: number } | null = null;

  constructor(
    private readonly http: VietcapHttpClient,
    private readonly cache: MarketDataCache,
    private readonly quotes: VietcapQuotesAdapter,
  ) {}

  /**
   * Danh sách toàn bộ mã niêm yết, lưu bền trong PostgreSQL (mới 1 ngày, dùng tạm tới 14 ngày khi API lỗi — đã gặp:
   * endpoint GET của Vietcap trả 500 cả buổi) nên khởi động lại không phải gọi lại và vẫn tìm kiếm được.
   */
  async allSymbols(): Promise<Map<string, SymbolInfo>> {
    if (this.symbols && Date.now() - this.symbols.builtAt < MAP_TTL_MS) return this.symbols.map;
    const list = await this.cache.get(vietcapKey('symbols', 'all'), VIETCAP_POLICIES.symbols, async () => {
      const rows = await this.http.get<{ symbol: string; organName: string; board: string; type: string }[]>(
        'trading',
        '/price/symbols/getAll',
      );
      const fetched: SymbolInfo[] = rows
        .filter((r) => ['HSX', 'HNX', 'UPCOM'].includes(r.board))
        .map((r) => ({ symbol: r.symbol, name: r.organName, board: r.board, type: r.type }));
      this.log.log(`Đã tải ${fetched.length} mã chứng khoán`);
      return fetched;
    });
    const map = new Map(list.map((s) => [s.symbol, s]));
    this.symbols = { map, builtAt: Date.now() };
    return map;
  }

  /** Kiểm tra một mã có tồn tại không mà không cần danh sách đầy đủ (dùng API bảng giá) */
  async lookup(symbol: string): Promise<SymbolInfo | null> {
    const all = await this.allSymbols().catch(() => null);
    if (all) return all.get(symbol) ?? null;
    const [q] = await this.quotes.board([symbol]).catch(() => []);
    return q?.symbol === symbol ? { symbol, name: q.name, board: q.board, type: 'STOCK' } : null;
  }

  async group(group: string): Promise<string[]> {
    return this.cache.get(vietcapKey('group', group), VIETCAP_POLICIES.group, async () => {
      const rows = await this.http.get<{ symbol: string }[]>('trading', `/price/symbols/getByGroup?group=${group}`);
      return rows.map((r) => r.symbol);
    });
  }
}
