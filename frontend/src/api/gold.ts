import type { GoldOption } from '../lib/types'
import { api } from './client'

/** Danh sách loại vàng + giá bán (dùng chung cho các form ghi giao dịch / cảnh báo / kế hoạch) */
export const getGoldOptions = () => api<GoldOption[]>('/portfolio/gold-options')
