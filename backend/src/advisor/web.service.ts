import { Readability } from '@mozilla/readability';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isIP } from 'net';
import { JSDOM, VirtualConsole } from 'jsdom';

interface SearchHit {
  title: string;
  url: string;
  snippet: string;
  date: string | null;
}

interface PageContent {
  url: string;
  title: string;
  siteName: string | null;
  publishedAt: string | null;
  /** Nội dung chính đã bỏ menu/quảng cáo, cắt tối đa MAX_CHARS */
  text: string;
  truncated: boolean;
}

const MAX_CHARS = 8000;
const MAX_HTML_BYTES = 3 * 1024 * 1024;
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';

/**
 * Tìm kiếm web và đọc bài cho cố vấn:
 *  - search(): API tìm kiếm của MiniMax, trả kết quả thô (tiêu đề, link, đoạn trích, ngày) để model tự đọc và trích nguồn
 *  - readPage(): tải trang và rút phần nội dung chính bằng Readability
 */
@Injectable()
export class WebService {
  private log = new Logger(WebService.name);
  private key: string | null;

  constructor(config: ConfigService) {
    this.key = config.get<string>('MINIMAX_API_KEY') || null;
  }

  get searchEnabled() {
    return !!this.key;
  }

  async search(query: string): Promise<SearchHit[]> {
    if (!this.key) throw new Error('Chưa cấu hình MINIMAX_API_KEY');
    const r = await fetch('https://api.minimax.io/v1/coding_plan/search', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw new Error(`MiniMax search ${r.status}`);
    const d = (await r.json()) as {
      organic?: { title?: string; link?: string; snippet?: string; date?: string }[];
      base_resp?: { status_code: number; status_msg: string };
    };
    if (d.base_resp && d.base_resp.status_code !== 0) {
      throw new Error(`MiniMax search: ${d.base_resp.status_msg}`);
    }
    return (d.organic ?? [])
      .filter((o) => o.link && o.title)
      .map((o) => ({
        title: o.title!.trim(),
        url: o.link!,
        snippet: (o.snippet ?? '').trim(),
        date: o.date ?? null,
      }));
  }

  async readPage(rawUrl: string): Promise<PageContent> {
    const url = this.assertPublicUrl(rawUrl);
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw new Error(`Không tải được trang (HTTP ${r.status})`);
    const type = r.headers.get('content-type') ?? '';
    if (!/html|xml/.test(type)) throw new Error(`Trang không phải HTML (${type.split(';')[0]})`);
    const len = Number(r.headers.get('content-length') ?? 0);
    if (len > MAX_HTML_BYTES) throw new Error('Trang quá lớn');
    const html = (await r.text()).slice(0, MAX_HTML_BYTES);

    // Tắt log lỗi CSS/JS của jsdom — trang báo thường có nhiều stylesheet lạ
    const virtualConsole = new VirtualConsole();
    const dom = new JSDOM(html, { url: r.url, virtualConsole });
    const doc = dom.window.document;
    const meta = (sel: string) => doc.querySelector(sel)?.getAttribute('content') ?? null;
    const publishedAt =
      meta('meta[property="article:published_time"]') ??
      meta('meta[name="pubdate"]') ??
      meta('meta[itemprop="datePublished"]') ??
      meta('meta[name="date"]');
    const article = new Readability(doc).parse();
    dom.window.close();

    const text = (article?.textContent ?? doc.body?.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!text) throw new Error('Không rút được nội dung từ trang');
    return {
      url: r.url,
      title: article?.title || doc.title || url,
      siteName: article?.siteName ?? meta('meta[property="og:site_name"]'),
      publishedAt,
      text: text.slice(0, MAX_CHARS),
      truncated: text.length > MAX_CHARS,
    };
  }

  /** Chỉ cho phép http(s) tới host công cộng — URL do model đưa ra là dữ liệu không tin cậy */
  private assertPublicUrl(raw: string) {
    let u: URL;
    try {
      u = new URL(raw);
    } catch {
      throw new Error('URL không hợp lệ');
    }
    if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Chỉ hỗ trợ http/https');
    const host = u.hostname.toLowerCase();
    const privateIp =
      isIP(host) && /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd|fe80)/.test(host);
    if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || privateIp) {
      throw new Error('Không được truy cập địa chỉ nội bộ');
    }
    return u.toString();
  }
}
