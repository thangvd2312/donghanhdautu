/** Lọc cổ phiếu (/screener) */

export type ScreenCriterionKey =
  | 'exchange'
  | 'sector'
  | 'marketCap'
  | 'price'
  | 'adtv'
  | 'pe'
  | 'pb'
  | 'roe'
  | 'profitGrowth'
  | 'revenueGrowth'
  | 'netMargin'
  | 'grossMargin'
  | 'dividendYield'

export type ScreenGroup = 'Cơ bản' | 'Định giá' | 'Hiệu quả' | 'Tăng trưởng' | 'Cổ tức'
export type ScreenUnit = '₫' | 'tỷ ₫' | '%' | 'x' | null

export interface ScreenOption {
  value: string
  label: string
}

export interface ScreenPreset {
  label: string
  min?: number
  max?: number
}

/** GET /screener/criteria: một tiêu chí lọc */
export interface ScreenCriterion {
  key: ScreenCriterionKey
  label: string
  group: ScreenGroup
  type: 'range' | 'multi'
  unit: ScreenUnit
  min?: number
  max?: number
  step?: number
  options?: ScreenOption[]
  presets?: ScreenPreset[]
  hint: string
  period: string | null
}

export interface ScreenRangeFilter {
  key: ScreenCriterionKey
  min?: number
  max?: number
}

export interface ScreenMultiFilter {
  key: ScreenCriterionKey
  values: string[]
}

export type ScreenFilter = ScreenRangeFilter | ScreenMultiFilter

export interface ScreenSort {
  key: ScreenCriterionKey
  dir: 'asc' | 'desc'
}

/** POST /screener/run */
export interface ScreenRunRequest {
  filters?: ScreenFilter[]
  sort?: ScreenSort
  page?: number
  pageSize?: number
}

export interface ScreenItem {
  symbol: string
  name: string | null
  exchange: string
  price: number | null
  changePct: number | null
  values: Record<string, number | null>
  watched: boolean
  held: boolean
}

export interface ScreenResult {
  items: ScreenItem[]
  total: number
  universe: number
  universeNote: string
  missingNote: string | null
  postFiltered: boolean
  source: 'Vietcap'
  asOf: string
}

/** Bộ lọc đã lưu (GET/POST/PATCH /screener/saved) */
export interface SavedScreen {
  id: string
  name: string
  filters: ScreenFilter[]
  sort: ScreenSort | null
  createdAt: string
  updatedAt: string
}
