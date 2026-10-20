/** Chỉ nhận đường dẫn nội bộ làm đích quay lại (chặn chuyển hướng ra trang ngoài kiểu //evil.com) */
export function safeNext(raw: string | null, fallback = '/') {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return fallback
  if (/^\/(login|register|onboarding)\b/.test(raw)) return fallback
  return raw
}

const SKIP_KEY = 'dautu_onboarding_skipped'

/** Người dùng đã chọn "Để sau" ở khảo sát: không tự chuyển sang khảo sát nữa trên trình duyệt này */
export function onboardingSkipped() {
  try {
    return localStorage.getItem(SKIP_KEY) === '1'
  } catch {
    return false
  }
}

export function skipOnboarding() {
  try {
    localStorage.setItem(SKIP_KEY, '1')
  } catch {
    // Không lưu được (chế độ riêng tư): lần sau vẫn hỏi lại, không sao
  }
}
