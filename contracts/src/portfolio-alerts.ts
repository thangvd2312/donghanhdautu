/**
 * Cảnh báo theo tình trạng danh mục (/portfolio-alerts): tập trung một tài sản, lệch tỷ trọng so với mục tiêu,
 * tài sản giảm từ đỉnh gần đây sau khi loại nạp / rút. Khác cảnh báo giá một mã (/alerts/price).
 */

import type { AssetType } from './common'

export type PortfolioAlertKind = 'concentration' | 'drift' | 'drawdown'

/** Tỷ trọng mục tiêu theo nhóm tài sản (%), tổng 100 */
export type GroupTargets = Record<AssetType, number>

/** Kết quả lần kiểm tra gần nhất do worker (hoặc lúc lưu cài đặt) ghi lại */
export interface PortfolioAlertCheck {
  at: string
  status: PortfolioAlertStatus
  title: string
  reason: string
}

/** GET /portfolio-alerts — một dòng cho mỗi loại (chưa lưu thì là mặc định, đang tắt) */
export interface PortfolioAlertRule {
  kind: PortfolioAlertKind
  enabled: boolean
  /** concentration: % tổng tài sản; drift: số điểm % lệch; drawdown: % giảm từ đỉnh */
  thresholdPct: number
  /** Chỉ drawdown: số ngày nhìn lại để tìm đỉnh */
  windowDays: number | null
  /** Chỉ drift: tỷ trọng mục tiêu theo nhóm */
  targets: GroupTargets | null
  /** Nhắc lại tối đa mỗi N ngày khi tình trạng vẫn còn */
  cooldownDays: number
  lastNotifiedAt: string | null
  lastCheck: PortfolioAlertCheck | null
  updatedAt: string | null
}

/** Giới hạn nhập cho từng loại, để form hiển thị đúng */
export interface PortfolioAlertLimits {
  threshold: Record<PortfolioAlertKind, { min: number; max: number; default: number }>
  windowDays: number[]
  cooldownDays: number[]
}

/** Gợi ý tỷ trọng mục tiêu cho quy tắc lệch tỷ trọng */
export interface TargetSuggestion {
  /** profile | goal */
  source: 'profile' | 'goal'
  label: string
  targets: GroupTargets
}

export interface PortfolioAlertSettings {
  rules: PortfolioAlertRule[]
  limits: PortfolioAlertLimits
  suggestions: TargetSuggestion[]
}

/** PUT /portfolio-alerts/:kind */
export interface PortfolioAlertRuleRequest {
  enabled: boolean
  thresholdPct: number
  windowDays?: number | null
  targets?: GroupTargets | null
  cooldownDays: number
}

/** firing: điều kiện đang đúng; ok: chưa tới ngưỡng; skipped: dữ liệu chưa đủ tin cậy nên không đánh giá */
export type PortfolioAlertStatus = 'firing' | 'ok' | 'skipped'

export interface PortfolioAlertItem {
  /** concentration: assetType:symbol; drift: nhóm tài sản; drawdown: "drawdown" */
  key: string
  label: string
  /** Giá trị hiện tại (%) */
  value: number
  /** Ngưỡng / mục tiêu (%) để so */
  reference: number
}

export interface PortfolioAlertPreviewItem {
  kind: PortfolioAlertKind
  enabled: boolean
  status: PortfolioAlertStatus
  /** Một dòng: "FPT chiếm 42% (ngưỡng 30%)" hoặc lý do bỏ qua */
  headline: string
  /** Giải thích thêm: cách tính, nguồn dữ liệu, vì sao bỏ qua */
  reason: string
  items: PortfolioAlertItem[]
  /** Bật quy tắc này thì lượt kiểm tra tới có gửi thông báo không (đã tính giới hạn tần suất) */
  wouldNotify: boolean
  /** Còn trong thời gian giới hạn tần suất thì đến lúc này mới nhắc lại */
  nextAllowedAt: string | null
}

/** POST /portfolio-alerts/preview: xem trước theo cài đặt đang sửa (chưa lưu), không gửi thông báo */
export interface PortfolioAlertPreviewRequest {
  rules?: (PortfolioAlertRuleRequest & { kind: PortfolioAlertKind })[]
}

export interface PortfolioAlertPreview {
  items: PortfolioAlertPreviewItem[]
  generatedAt: string
}
