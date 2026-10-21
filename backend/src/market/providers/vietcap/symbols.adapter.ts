import { Injectable, Logger } from '@nestjs/common';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { VietcapQuotesAdapter } from './quotes.adapter';
import { VietcapHttpClient } from './vietcap-http.client';

const SYMBOLS_FILE = join(process.cwd(), 'data', 'symbols.json');

export interface SymbolInfo {
  symbol: string;
  name: string;
  board: string;
  type: string;
}

/** Danh mục mã niêm yết (HSX, HNX, UPCOM) và các nhóm chỉ số như VN30 */
@Injectable()
export class VietcapSymbolsAdapter {
  private log = new Logger(VietcapSymbolsAdapter.name);
  private symbols: Map<string, SymbolInfo> | null = null;

  constructor(
    private readonly http: VietcapHttpClient,
    private readonly quotes: VietcapQuotesAdapter,
  ) {}

  /**
   * Danh sách toàn bộ mã niêm yết. Lưu xuống đĩa mỗi lần tải được, để khi API lỗi
   * (đã gặp: endpoint GET của Vietcap trả 500 cả buổi) vẫn tìm kiếm được.
   */
  async allSymbols(): Promise<Map<string, SymbolInfo>> {
    if (this.symbols) return this.symbols;
    try {
      const rows = await this.http.get<{ symbol: string; organName: string; board: string; type: string }[]>(
        'trading',
        '/price/symbols/getAll',
      );
      const list = rows
        .filter((r) => ['HSX', 'HNX', 'UPCOM'].includes(r.board))
        .map((r) => ({ symbol: r.symbol, name: r.organName, board: r.board, type: r.type }));
      await mkdir(dirname(SYMBOLS_FILE), { recursive: true });
      await writeFile(SYMBOLS_FILE, JSON.stringify(list));
      this.symbols = new Map(list.map((s) => [s.symbol, s]));
      this.log.log(`Đã tải ${this.symbols.size} mã chứng khoán`);
    } catch (e) {
      const disk = await readFile(SYMBOLS_FILE, 'utf8').catch(() => null);
      if (!disk) throw e;
      const list = JSON.parse(disk) as SymbolInfo[];
      this.symbols = new Map(list.map((s) => [s.symbol, s]));
      this.log.warn(`API danh sách mã lỗi, dùng bản lưu trên đĩa (${list.length} mã)`);
    }
    return this.symbols;
  }

  /** Kiểm tra một mã có tồn tại không mà không cần danh sách đầy đủ (dùng API bảng giá) */
  async lookup(symbol: string): Promise<SymbolInfo | null> {
    const all = await this.allSymbols().catch(() => null);
    if (all) return all.get(symbol) ?? null;
    const [q] = await this.quotes.board([symbol]).catch(() => []);
    return q?.symbol === symbol ? { symbol, name: q.name, board: q.board, type: 'STOCK' } : null;
  }

  async group(group: string): Promise<string[]> {
    return this.http.cached(`group:${group}`, 6 * 3600_000, async () => {
      const rows = await this.http.get<{ symbol: string }[]>('trading', `/price/symbols/getByGroup?group=${group}`);
      return rows.map((r) => r.symbol);
    });
  }
}
