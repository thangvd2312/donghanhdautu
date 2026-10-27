/** Tin tức (GET /news) */

export interface NewsItem {
  title: string
  url: string
  summary: string
  source: string
  category: string
  publishedAt: string
}

/** Tin chứng khoán / vĩ mô (RSS báo Việt) hay tin coin */
export type NewsKind = 'stock' | 'coin'

/** Một đoạn chữ; `hit` = đoạn khớp từ khoá tìm kiếm (tô sáng) */
export interface TextPart {
  text: string
  hit: boolean
}

export interface NewsHit extends NewsItem {
  kind: NewsKind
  /** Mã cổ phiếu / coin gắn với tin (nếu đã nhận ra) */
  tickers: string[]
  /** Tiêu đề chia đoạn khớp / không khớp; chỉ có khi tìm theo từ khoá và tiêu đề có chỗ khớp */
  titleParts?: TextPart[]
  /** Đoạn trích tóm tắt quanh chỗ khớp (các đoạn nối bằng " … "); chỉ có khi tóm tắt có chỗ khớp */
  snippetParts?: TextPart[]
}

export interface NewsFacet {
  value: string
  count: number
}

/** GET /news?q=&kind=&category=&source=&days=&offset=&limit= */
export interface NewsSearchResult {
  items: NewsHit[]
  /** Tổng số tin khớp (để biết còn trang sau) */
  total: number
  offset: number
  /** Tin quan trọng nhất 24 giờ qua, chỉ có ở trang đầu khi không tìm từ khoá và không lọc chủ đề / nguồn */
  featured: NewsHit | null
  /** Số tin theo loại / chủ đề / nguồn (đếm theo từ khoá, thời gian và các bộ lọc còn lại) */
  facets: { kind: NewsFacet[]; category: NewsFacet[]; source: NewsFacet[] }
  /** Kho tin 180 ngày tìm bằng OpenSearch, hoặc tìm toàn văn trên PostgreSQL khi OpenSearch lỗi / chưa cấu hình */
  engine: 'opensearch' | 'postgres'
}
