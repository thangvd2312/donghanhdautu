/** Kiểu dùng chung giữa nhiều miền API */

/** Loại tài sản trong sổ danh mục */
export type AssetType = 'stock' | 'crypto' | 'gold' | 'cash'

/** Loại tài sản có giá thị trường để theo dõi / đặt cảnh báo / lập kế hoạch */
export type TrackedAssetType = Exclude<AssetType, 'cash'>

/** Đồng tiền ghi sổ: coin tính bằng USDT, còn lại VND */
export type Currency = 'VND' | 'USDT'

/**
 * Trạng thái một mức giá dùng để định giá:
 * - fresh: lấy thành công gần đây (ngoài phiên: giá đóng cửa phiên gần nhất)
 * - stale: có giá nhưng đã quá lâu không cập nhật được từ nguồn
 * - fallback: giá / tỷ giá dự phòng, không phải số vừa lấy từ nguồn chính
 * - missing: không có giá
 */
export type PriceStatus = 'fresh' | 'stale' | 'fallback' | 'missing'

/** Nguồn, thời điểm và trạng thái của một mức giá */
export interface PriceMeta {
  status: PriceStatus
  source: string
  asOf: string | null
  reason: string | null
}

/** Trạng thái một nguồn dữ liệu: lần lấy thành công / lỗi gần nhất */
export interface SourceStatus {
  source: string
  lastSuccessAt: string | null
  lastErrorAt: string | null
  lastError: string | null
}

export interface DataQuality {
  /** ok: mọi giá mới · partial: có tài sản thiếu giá · degraded: có giá cũ hoặc dự phòng */
  status: 'ok' | 'partial' | 'degraded'
  missing: string[]
  stale: string[]
  fallback: string[]
  oldestPriceAt: string | null
  messages: string[]
}

/** Phản hồi của các thao tác chỉ báo thành công (xoá, đánh dấu đã đọc…) */
export interface OkResponse {
  ok: true
}

/** Một nguồn trích dẫn kèm tin / câu trả lời */
export interface SourceLink {
  title: string
  url: string
}
