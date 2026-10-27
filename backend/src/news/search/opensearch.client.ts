import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export class OpenSearchError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Gọi REST API của OpenSearch bằng fetch. Server dùng Amazon OpenSearch Service (fine-grained access control, đăng
 * nhập bằng master user → Basic auth); local dùng container ở docker-compose (profile `search`, không cần đăng nhập).
 * Không có OPENSEARCH_URL = tắt: tìm tin chỉ dùng tìm toàn văn trên PostgreSQL.
 */
@Injectable()
export class OpenSearchClient {
  readonly enabled: boolean;
  readonly newsIndex: string;
  private readonly base: string;
  private readonly auth: string | null;

  constructor(config: ConfigService) {
    this.base = (config.get<string>('OPENSEARCH_URL') || '').replace(/\/+$/, '');
    this.enabled = !!this.base;
    this.newsIndex = config.get<string>('OPENSEARCH_NEWS_INDEX') || 'dautu-news-v1';
    const user = config.get<string>('OPENSEARCH_USERNAME');
    const pass = config.get<string>('OPENSEARCH_PASSWORD');
    this.auth = user ? `Basic ${Buffer.from(`${user}:${pass ?? ''}`).toString('base64')}` : null;
  }

  /**
   * Một request; `body` là chuỗi thì gửi nguyên văn dạng NDJSON (_bulk). Mã lỗi nằm trong `allow` (vd 404 khi kiểm
   * tra index) trả về bình thường; lỗi khác ném OpenSearchError.
   */
  async request<T>(
    method: 'GET' | 'HEAD' | 'PUT' | 'POST' | 'DELETE',
    path: string,
    body?: unknown,
    opts: { timeoutMs?: number; allow?: number[] } = {},
  ): Promise<{ status: number; json: T }> {
    if (!this.enabled) throw new OpenSearchError(0, 'OpenSearch chưa cấu hình (OPENSEARCH_URL)');
    const ndjson = typeof body === 'string';
    const headers: Record<string, string> = { 'Content-Type': ndjson ? 'application/x-ndjson' : 'application/json' };
    if (this.auth) headers.Authorization = this.auth;
    const r = await fetch(`${this.base}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : ndjson ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 5000),
    });
    const text = method === 'HEAD' ? '' : await r.text();
    if (!r.ok && !opts.allow?.includes(r.status)) {
      throw new OpenSearchError(r.status, `OpenSearch ${method} ${path} → HTTP ${r.status}: ${text.slice(0, 300)}`);
    }
    return { status: r.status, json: (text ? JSON.parse(text) : null) as T };
  }
}
