/** Lợi suất tháng từ lợi suất năm (lãi kép hằng tháng, cùng cách tính với backend) */
const monthlyRate = (annualPct: number) => Math.pow(1 + annualPct / 100, 1 / 12) - 1

/** Giá trị sau `months` tháng khi góp cuối tháng theo lợi suất năm GIẢ ĐỊNH */
export function project(current: number, monthly: number, annualPct: number, months: number) {
  const r = monthlyRate(annualPct)
  if (Math.abs(r) < 1e-12) return current + monthly * months
  const g = Math.pow(1 + r, months)
  return current * g + monthly * ((g - 1) / r)
}

/**
 * Vạch lộ trình hôm nay: số tiền cần có ngay bây giờ để, cứ góp đúng mức đã định theo lợi suất trung bình, vẫn tới
 * `target` đúng hạn. Dưới vạch = đang chậm hơn lộ trình. null khi không tính được (hết hạn, vạch ≤ 0 hoặc quá đích).
 */
export function pathToday(target: number, monthly: number, annualPct: number, months: number): number | null {
  if (months <= 0 || !(target > 0)) return null
  const grown = project(0, monthly, annualPct, months)
  const g = project(1, 0, annualPct, months)
  const v = (target - grown) / g
  return v > 0 && v < target ? v : null
}
