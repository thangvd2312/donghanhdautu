/** Chỉ nhận đường dẫn nội bộ làm đích quay lại (chặn chuyển hướng ra trang ngoài kiểu //evil.com) */
export function safeNext(raw: string | null, fallback = '/') {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return fallback
  // Trình duyệt coi "\" như "/" và bỏ tab / xuống dòng: "/\evil.com" hay "/<tab>/evil.com" thành địa chỉ ngoài
  if (raw.includes('\\') || [...raw].some((c) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f)) return fallback
  // Router chỉ đi được trong app: đường dẫn phải là đường dẫn nội bộ thật
  try {
    if (new URL(raw, window.location.origin).origin !== window.location.origin) return fallback
  } catch {
    return fallback
  }
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
