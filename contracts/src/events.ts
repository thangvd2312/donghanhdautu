/** Lịch sự kiện quyền (GET /events, PATCH /events/reminders) */

export type EventKind = 'cash' | 'stock' | 'rights' | 'agm' | 'egm'
export type EventRange = 'week' | 'month' | 'quarter'

export interface CalendarEvent {
  /** Ổn định: `${symbol}:${kind}:${vietcapId}` */
  key: string
  symbol: string
  companyName: string | null
  kind: EventKind
  /** Tiêu đề gốc của nguồn */
  title: string
  /** Ngày dùng để xếp lịch: GDKHQ (ngày họp nếu không có GDKHQ), YYYY-MM-DD */
  date: string
  exDate: string | null
  recordDate: string | null
  payoutDate: string | null
  meetingDate: string | null
  /** cash: VND / cổ phiếu, trước thuế */
  valuePerShare: number | null
  /** stock / rights: 100 cổ phiếu → ratioPct cổ phiếu */
  ratioPct: number | null
  rightsPrice: number | null
  held: boolean
  watched: boolean
  heldQuantity: number | null
  /** cash && held: số cổ phiếu × mức chi trả, trước thuế */
  estimatedCash: number | null
  upcoming: boolean
  /** Ngày sẽ nhắc nếu đang bật nhắc và chưa qua */
  remindAt: string | null
  publishedAt: string | null
}

export interface ReminderSettings {
  enabled: boolean
  daysBefore: 1 | 3
  mutedSymbols: string[]
}

/** PATCH /events/reminders: chỉ gửi trường cần đổi */
export type ReminderSettingsPatch = Partial<ReminderSettings>

export interface EventSymbol {
  symbol: string
  held: boolean
  watched: boolean
}

export interface EventsResponse {
  items: CalendarEvent[]
  symbols: EventSymbol[]
  reminders: ReminderSettings
  source: 'Vietcap'
  fetchedAt: string
  /** Nguồn lỗi lần này: danh sách rỗng có thể do lỗi chứ không phải do không có sự kiện */
  unavailable: boolean
}
