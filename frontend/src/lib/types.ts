/**
 * Kiểu của API (yêu cầu / phản hồi) định nghĩa một lần ở `contracts/` và dùng chung với backend; file này chỉ
 * re-export để các import cũ `from '../lib/types'` vẫn chạy. Kiểu mới: thêm vào contracts/src, không viết lại ở đây.
 */
export type * from '@dautu/contracts'

export const RISK_LABEL: Record<string, string> = {
  conservative: 'Thận trọng',
  balanced: 'Cân bằng',
  growth: 'Tăng trưởng',
  aggressive: 'Mạo hiểm',
}
