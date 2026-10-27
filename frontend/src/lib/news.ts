import type { NewsHit, NewsKind } from './types'

export const NEWS_PAGE_SIZE = 20

/** Bộ lọc trang Tin tức — giữ trên URL (?q=&kind=&cat=&src=&days=) để chia sẻ link / quay lại đúng chỗ */
export interface NewsFilters {
  q: string
  /** null = mọi loại tin */
  kind: NewsKind | null
  category: string | null
  source: string | null
  days: number | null
}

/**
 * Mặc định là tin chứng khoán & vĩ mô (không có ?kind): tin coin ra vài phút một tin, phần lớn tiếng Anh, gộp chung thì
 * lấn hết tin trong nước. Xem mọi loại: ?kind=all.
 */
export const DEFAULT_KIND: NewsKind = 'stock'

export const KIND_TABS: { value: NewsKind | null; label: string }[] = [
  { value: 'stock', label: 'Chứng khoán & vĩ mô' },
  { value: 'coin', label: 'Coin' },
  { value: null, label: 'Tất cả' },
]

export const DAY_OPTIONS: { value: number | null; label: string }[] = [
  { value: 1, label: '24 giờ' },
  { value: 7, label: '7 ngày' },
  { value: 30, label: '30 ngày' },
  { value: null, label: 'Mọi lúc' },
]

export function filtersFromParams(p: URLSearchParams): NewsFilters {
  const kind = p.get('kind')
  const days = Number(p.get('days'))
  return {
    q: p.get('q') ?? '',
    kind: kind === 'all' ? null : kind === 'stock' || kind === 'coin' ? kind : DEFAULT_KIND,
    category: p.get('cat') || null,
    source: p.get('src') || null,
    days: DAY_OPTIONS.some((o) => o.value === days) ? days : null,
  }
}

export function filtersToParams(f: NewsFilters): Record<string, string> {
  const out: Record<string, string> = {}
  if (f.q.trim()) out.q = f.q
  if (f.kind !== DEFAULT_KIND) out.kind = f.kind ?? 'all'
  if (f.category) out.cat = f.category
  if (f.source) out.src = f.source
  if (f.days) out.days = String(f.days)
  return out
}

/** Từ khoá đã bỏ dấu, chữ thường (để tô sáng mã trùng từ khoá) */
export function foldTerms(q: string): string[] {
  return q
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .split(/[\s,;"']+/)
    .filter((t) => t.length >= 2)
}

const VN_TZ = 'Asia/Ho_Chi_Minh'
const dayKey = (t: number) => new Date(t).toLocaleDateString('en-CA', { timeZone: VN_TZ })

/** "Hôm nay" / "Hôm qua" / "Thứ Hai, 20/10" theo giờ Việt Nam */
export function dayLabel(iso: string, now = Date.now()): string {
  const t = Date.parse(iso)
  const key = dayKey(t)
  if (key === dayKey(now)) return 'Hôm nay'
  if (key === dayKey(now - 86_400_000)) return 'Hôm qua'
  const weekday = new Date(t).toLocaleDateString('vi-VN', { timeZone: VN_TZ, weekday: 'long' })
  const [, m, d] = key.split('-')
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${d}/${m}`
}

/** Chia tin thành nhóm theo ngày (mỗi ngày một nhóm, nhóm theo thứ tự xuất hiện, giữ thứ tự tin trong nhóm) */
export function groupByDay(items: NewsHit[], now = Date.now()): { label: string; items: NewsHit[] }[] {
  const groups = new Map<string, NewsHit[]>()
  for (const it of items) {
    const label = dayLabel(it.publishedAt, now)
    const g = groups.get(label)
    if (g) g.push(it)
    else groups.set(label, [it])
  }
  return [...groups].map(([label, list]) => ({ label, items: list }))
}

/** Câu hỏi gửi cố vấn khi bấm "Tin này ảnh hưởng gì tới tôi?" */
export const advisorLink = (n: { title: string; url: string }) =>
  `/advisor?q=${encodeURIComponent(`Tin này ảnh hưởng thế nào tới thị trường và danh mục của tôi? "${n.title}" (${n.url})`)}`
