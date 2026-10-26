/** Mức độ thông báo → severity của MUI Alert / màu chấm */
export const SEVERITY: Record<string, 'info' | 'warning' | 'error'> = { info: 'info', warning: 'warning', critical: 'error' }

/** Nhãn loại thông báo (thiếu = không hiện nhãn) */
export const KIND_LABEL: Record<string, string> = {
  price_move: 'Biến động',
  news: 'Tin tức',
  macro: 'Vĩ mô',
  brief: 'Bản tin',
  price_target: 'Mốc giá',
  event: 'Sự kiện quyền',
  portfolio_health: 'Tình trạng danh mục',
  journal_monthly: 'Nhật ký',
  crypto_brief: 'Bản tin coin',
  tip_review: 'Soi lời khuyên',
}
