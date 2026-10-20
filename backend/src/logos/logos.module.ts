import { Controller, Get, Injectable, Logger, Module, NotFoundException, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Logo cổ phiếu: CDN công khai của Simplize (không có hợp đồng — lỗi thì app tự hiện chữ cái thay thế) */
const STOCK_LOGO_URL = (symbol: string) => `https://cdn.simplize.vn/simplizevn/logo/${symbol}.jpeg`;
/** Bộ icon coin mã nguồn mở (MIT) cài sẵn trên server, không gọi ra ngoài */
const CRYPTO_ICON_DIR = join(require.resolve('cryptocurrency-icons/package.json'), '..', 'svg', 'color');

const MAX_CACHE = 600;
const HIT_TTL = 7 * 86400_000;
const MISS_TTL = 86400_000;

interface Cached {
  at: number;
  /** null = nguồn không có logo mã này */
  body: Buffer | null;
  type: string;
}

/**
 * Lấy logo cổ phiếu qua server: cache trong bộ nhớ (cả trường hợp không có logo) để không gọi nguồn ngoài lặp lại,
 * trình duyệt người dùng không gọi thẳng trang bên thứ ba.
 */
@Injectable()
export class LogosService {
  private log = new Logger(LogosService.name);
  private cache = new Map<string, Cached>();
  private inflight = new Map<string, Promise<Cached>>();

  async stock(symbol: string): Promise<Cached> {
    const hit = this.cache.get(symbol);
    if (hit && Date.now() - hit.at < (hit.body ? HIT_TTL : MISS_TTL)) return hit;
    let p = this.inflight.get(symbol);
    if (!p) {
      p = this.fetchStock(symbol).finally(() => this.inflight.delete(symbol));
      this.inflight.set(symbol, p);
    }
    return p;
  }

  private async fetchStock(symbol: string): Promise<Cached> {
    let entry: Cached = { at: Date.now(), body: null, type: 'image/jpeg' };
    try {
      const r = await fetch(STOCK_LOGO_URL(symbol), { signal: AbortSignal.timeout(8000) });
      const type = r.headers.get('content-type') ?? '';
      if (r.ok && type.startsWith('image/')) {
        const body = Buffer.from(await r.arrayBuffer());
        // Ảnh quá nhỏ thường là ảnh giữ chỗ / lỗi
        if (body.length > 200) entry = { at: Date.now(), body, type };
      }
    } catch (e) {
      this.log.warn(`Logo ${symbol}: ${(e as Error).message}`);
      // Lỗi mạng: không cache lâu để lần sau thử lại
      return { at: Date.now() - MISS_TTL + 10 * 60_000, body: null, type: '' };
    }
    if (this.cache.size >= MAX_CACHE) {
      // Bỏ mục cũ nhất (Map giữ thứ tự thêm vào)
      const oldest = this.cache.keys().next();
      if (!oldest.done) this.cache.delete(oldest.value);
    }
    this.cache.set(symbol, entry);
    return entry;
  }

  crypto(base: string): Buffer | null {
    const file = join(CRYPTO_ICON_DIR, `${base}.svg`);
    return existsSync(file) ? readFileSync(file) : null;
  }
}

/** Không cần đăng nhập: thẻ <img> không gửi kèm token, và logo là dữ liệu công khai */
@Controller('logos')
class LogosController {
  constructor(private logos: LogosService) {}

  @Get('stock/:symbol')
  async stock(@Param('symbol') raw: string, @Res() res: Response) {
    const symbol = raw.toUpperCase().replace(/\.\w+$/, '');
    if (!/^[A-Z0-9]{3,10}$/.test(symbol)) throw new NotFoundException();
    const logo = await this.logos.stock(symbol);
    if (!logo.body) {
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.status(404).end();
    }
    res.setHeader('Content-Type', logo.type);
    res.setHeader('Cache-Control', 'public, max-age=604800');
    return res.end(logo.body);
  }

  @Get('crypto/:base')
  crypto(@Param('base') raw: string, @Res() res: Response) {
    const base = raw
      .toLowerCase()
      .replace(/usdt$/, '')
      .replace(/\.svg$/, '');
    if (!/^[a-z0-9]{2,10}$/.test(base)) throw new NotFoundException();
    const svg = this.logos.crypto(base);
    if (!svg) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.status(404).end();
    }
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=2592000');
    return res.end(svg);
  }
}

@Module({ controllers: [LogosController], providers: [LogosService] })
export class LogosModule {}
