import { parseNum } from './num'
import type {
  AssetType,
  GroupTargets,
  PortfolioAlertKind,
  PortfolioAlertRule,
  PortfolioAlertRuleRequest,
  PortfolioAlertSettings,
} from './types'

export const KINDS: PortfolioAlertKind[] = ['concentration', 'drift', 'drawdown']
export const GROUPS: AssetType[] = ['stock', 'crypto', 'gold', 'cash']
export const GROUP_LABEL: Record<AssetType, string> = { stock: 'Cổ phiếu', crypto: 'Crypto', gold: 'Vàng', cash: 'Tiền mặt' }

export const META: Record<PortfolioAlertKind, { title: string; desc: string; field: string; unit: string }> = {
  concentration: {
    title: 'Tập trung vào một tài sản',
    desc: 'Nhắc khi một tài sản (không tính tiền mặt) chiếm trên ngưỡng này của tổng tài sản.',
    field: 'Trên',
    unit: '%',
  },
  drift: {
    title: 'Lệch tỷ trọng mục tiêu',
    desc: 'Nhắc khi một nhóm tài sản lệch khỏi tỷ trọng bạn đặt từ số điểm % này.',
    field: 'Lệch từ',
    unit: 'điểm',
  },
  drawdown: {
    title: 'Giảm từ đỉnh gần đây',
    desc: 'Nhắc khi danh mục giảm từ ngưỡng này so với đỉnh, đã loại tiền nạp / rút nên nạp hay rút không bị tính là lãi / lỗ.',
    field: 'Giảm từ',
    unit: '%',
  },
}

export interface Draft {
  enabled: boolean
  threshold: string
  windowDays: number
  cooldownDays: number
  targets: Record<AssetType, string> | null
}

export const draftOf = (r: PortfolioAlertRule): Draft => ({
  enabled: r.enabled,
  threshold: String(r.thresholdPct),
  windowDays: r.windowDays ?? 30,
  cooldownDays: r.cooldownDays,
  targets: r.targets
    ? (Object.fromEntries(GROUPS.map((g) => [g, String(r.targets![g])])) as Record<AssetType, string>)
    : null,
})

export const targetsOf = (t: GroupTargets): Record<AssetType, string> =>
  Object.fromEntries(GROUPS.map((g) => [g, String(t[g])])) as Record<AssetType, string>

export const targetSum = (t: Record<AssetType, string>) => GROUPS.reduce((s, g) => s + (parseNum(t[g] || '0') || 0), 0)

/** Lỗi nhập của một dòng (null = hợp lệ) — cùng giới hạn với backend (portfolio-alerts/rules.ts) */
export function draftError(kind: PortfolioAlertKind, d: Draft, s: PortfolioAlertSettings): string | null {
  const lim = s.limits.threshold[kind]
  const v = parseNum(d.threshold)
  if (!Number.isFinite(v) || v < lim.min || v > lim.max) return `Ngưỡng từ ${lim.min} đến ${lim.max}`
  if (kind === 'drift') {
    if (!d.targets) return d.enabled ? 'Đặt tỷ trọng mục tiêu trước khi bật' : null
    if (GROUPS.some((g) => !Number.isFinite(parseNum(d.targets![g] || '0')) || parseNum(d.targets![g] || '0') < 0))
      return 'Tỷ trọng mỗi nhóm từ 0 đến 100%'
    const sum = targetSum(d.targets)
    if (Math.abs(sum - 100) > 0.5) return `Tổng tỷ trọng mục tiêu phải là 100% (đang là ${Math.round(sum * 10) / 10}%)`
  }
  return null
}

export function toRequest(kind: PortfolioAlertKind, d: Draft): PortfolioAlertRuleRequest {
  return {
    enabled: d.enabled,
    thresholdPct: parseNum(d.threshold),
    windowDays: kind === 'drawdown' ? d.windowDays : null,
    targets:
      kind === 'drift' && d.targets
        ? (Object.fromEntries(GROUPS.map((g) => [g, parseNum(d.targets![g] || '0')])) as GroupTargets)
        : null,
    cooldownDays: d.cooldownDays,
  }
}

export const sameDraft = (kind: PortfolioAlertKind, a: Draft, b: Draft) =>
  JSON.stringify(toRequest(kind, a)) === JSON.stringify(toRequest(kind, b))

export const emptyTargets = (): Record<AssetType, string> => ({ stock: '', crypto: '', gold: '', cash: '' })

/** Ngày/tháng theo giờ VN */
export const shortDate = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(iso))
