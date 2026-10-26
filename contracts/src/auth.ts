/** Đăng nhập, hồ sơ nhà đầu tư và khảo sát khẩu vị rủi ro (/auth, /profile) */

export type RiskType = 'conservative' | 'balanced' | 'growth' | 'aggressive'

export interface InvestorProfile {
  riskScore: number
  riskType: RiskType
  goal: string
  horizon: string
  maxDrawdownPct: number
  fomoProne: boolean
  alertThresholdPct: number
  morningBrief: boolean
  closingBrief: boolean
  weeklyBrief: boolean
  /** Bản tin coin mỗi giờ (khi đang giữ / theo dõi coin) */
  cryptoBrief: boolean
  macroAlerts: boolean
}

/** GET /auth/me */
export interface Me {
  id: string
  email: string
  name: string
  avatarUrl: string | null
  onboarded: boolean
  profile: InvestorProfile | null
}

/** Phản hồi đăng nhập / đăng ký / Google */
export interface AuthToken {
  token: string
}

export interface RegisterRequest {
  name: string
  email: string
  password: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface GoogleLoginRequest {
  credential: string
}

/** GET /auth/config: cấu hình công khai cho trang đăng nhập */
export interface AuthConfig {
  googleClientId: string | null
}

export interface QuizOption {
  value: string
  label: string
}

/** GET /profile/quiz (điểm của từng lựa chọn không gửi ra ngoài) */
export interface QuizQuestion {
  id: string
  question: string
  hint?: string
  options: QuizOption[]
}

/** PUT /profile */
export interface SubmitQuizRequest {
  answers: Record<string, string>
}

/** PATCH /profile/settings: chỉ gửi trường cần đổi */
export interface ProfileSettingsRequest {
  alertThresholdPct?: number
  morningBrief?: boolean
  closingBrief?: boolean
  weeklyBrief?: boolean
  cryptoBrief?: boolean
  macroAlerts?: boolean
}
