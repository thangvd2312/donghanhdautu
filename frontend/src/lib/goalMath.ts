/** Mô phỏng mục tiêu (cùng công thức với backend): lãi kép hằng tháng theo lợi suất năm GIẢ ĐỊNH, góp cuối tháng */
const monthlyRate = (annualPct: number) => Math.pow(1 + annualPct / 100, 1 / 12) - 1

export function project(current: number, monthly: number, annualPct: number, months: number) {
  const r = monthlyRate(annualPct)
  if (Math.abs(r) < 1e-12) return current + monthly * months
  const g = Math.pow(1 + r, months)
  return current * g + monthly * ((g - 1) / r)
}

export function requiredMonthly(current: number, target: number, annualPct: number, months: number) {
  if (months <= 0) return Math.max(0, target - current)
  const r = monthlyRate(annualPct)
  const grown = current * Math.pow(1 + r, months)
  if (grown >= target) return 0
  if (Math.abs(r) < 1e-12) return (target - current) / months
  return ((target - grown) * r) / (Math.pow(1 + r, months) - 1)
}
