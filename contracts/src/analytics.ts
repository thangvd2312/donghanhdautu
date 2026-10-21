/** Sự kiện đo hành vi phía trình duyệt (POST /events); máy chủ chỉ nhận đúng các tên trong từ điển */

export type ClientEvent =
  | 'app_active'
  | 'portfolio_viewed'
  | 'onboarding_skipped'
  | 'demo_viewed'
  | 'demo_signup_clicked'

/** POST /events (204, không có thân phản hồi); khách chưa đăng nhập chỉ gửi được sự kiện của danh mục mẫu */
export interface AnalyticsEventRequest {
  name: ClientEvent
  /** Mã ngẫu nhiên của trình duyệt khách (chưa đăng nhập) */
  anonId?: string
  props?: Record<string, unknown>
}
