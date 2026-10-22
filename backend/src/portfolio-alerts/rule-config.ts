import type { AssetType, GroupTargets, PortfolioAlertKind, PortfolioAlertLimits } from '@dautu/contracts';
import { REFERENCE_ALLOCATION } from '../profile/quiz';

export const ALERT_KINDS: readonly PortfolioAlertKind[] = ['concentration', 'drift', 'drawdown'];
export const GROUPS: readonly AssetType[] = ['stock', 'crypto', 'gold', 'cash'];
export const GROUP_LABEL: Record<AssetType, string> = {
  stock: 'Cổ phiếu',
  crypto: 'Crypto',
  gold: 'Vàng',
  cash: 'Tiền mặt / tiết kiệm',
};

export const LIMITS: PortfolioAlertLimits = {
  threshold: {
    concentration: { min: 10, max: 90, default: 30 },
    drift: { min: 3, max: 50, default: 10 },
    drawdown: { min: 3, max: 50, default: 10 },
  },
  windowDays: [7, 30, 90],
  cooldownDays: [1, 3, 7],
};
export const DEFAULT_WINDOW_DAYS = 30;
const DEFAULT_COOLDOWN_DAYS = 3;
/** Cửa sổ dài nhất: lịch sử được dựng một lần cho cửa sổ này rồi cắt theo từng quy tắc */
export const MAX_WINDOW_DAYS = Math.max(...LIMITS.windowDays);

export interface RuleConfig {
  kind: PortfolioAlertKind;
  enabled: boolean;
  thresholdPct: number;
  windowDays: number | null;
  targets: GroupTargets | null;
  cooldownDays: number;
}

export function defaultRule(kind: PortfolioAlertKind): RuleConfig {
  return {
    kind,
    enabled: false,
    thresholdPct: LIMITS.threshold[kind].default,
    windowDays: kind === 'drawdown' ? DEFAULT_WINDOW_DAYS : null,
    targets: null,
    cooldownDays: DEFAULT_COOLDOWN_DAYS,
  };
}

/** Kiểm tra cấu hình người dùng gửi lên; trả danh sách lỗi (rỗng = hợp lệ) */
export function validateRule(r: RuleConfig): string[] {
  const errors: string[] = [];
  const lim = LIMITS.threshold[r.kind];
  if (!Number.isFinite(r.thresholdPct) || r.thresholdPct < lim.min || r.thresholdPct > lim.max) {
    errors.push(`Ngưỡng phải trong khoảng ${lim.min}–${lim.max}`);
  }
  if (!LIMITS.cooldownDays.includes(r.cooldownDays)) {
    errors.push(`Tần suất nhắc lại phải là ${LIMITS.cooldownDays.join(', ')} ngày`);
  }
  if (r.kind === 'drawdown' && (r.windowDays === null || !LIMITS.windowDays.includes(r.windowDays))) {
    errors.push(`Khoảng nhìn lại phải là ${LIMITS.windowDays.join(', ')} ngày`);
  }
  if (r.kind === 'drift') {
    if (r.targets) {
      const err = validateTargets(r.targets);
      if (err) errors.push(err);
    } else if (r.enabled) {
      errors.push('Cần đặt tỷ trọng mục tiêu trước khi bật nhắc lệch tỷ trọng');
    }
  }
  return errors;
}

export function validateTargets(t: Partial<Record<string, unknown>>): string | null {
  const keys = Object.keys(t);
  if (keys.some((k) => !GROUPS.includes(k as AssetType))) return 'Nhóm tài sản không hợp lệ';
  const values = GROUPS.map((g) => t[g] ?? 0);
  if (values.some((v) => typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100)) {
    return 'Tỷ trọng mỗi nhóm phải từ 0 đến 100%';
  }
  const total = (values as number[]).reduce((s, v) => s + v, 0);
  if (Math.abs(total - 100) > 0.5) return `Tổng tỷ trọng mục tiêu phải là 100% (đang là ${fmt(total)}%)`;
  return null;
}

/** Đủ 4 nhóm, làm tròn 1 chữ số */
export function normalizeTargets(t: Partial<Record<AssetType, number>>): GroupTargets {
  return Object.fromEntries(GROUPS.map((g) => [g, Math.round((t[g] ?? 0) * 10) / 10])) as GroupTargets;
}

/** Số % kiểu Việt: 1 chữ số thập phân, dấu phẩy */
export function fmt(x: number) {
  return String(Math.round(Math.abs(x) * 10) / 10).replace('.', ',');
}

/** Mức tham khảo theo kiểu nhà đầu tư (profile/quiz) → 4 nhóm; "dự phòng khác" tính vào tiền mặt */
export function referenceTargets(riskType: string): GroupTargets | null {
  const ref = REFERENCE_ALLOCATION[riskType];
  if (!ref) return null;
  const t: GroupTargets = { stock: 0, crypto: 0, gold: 0, cash: 0 };
  for (const [k, v] of Object.entries(ref)) {
    if (k.startsWith('cổ phiếu')) t.stock += v;
    else if (k === 'crypto') t.crypto += v;
    else if (k === 'vàng') t.gold += v;
    else t.cash += v;
  }
  return validateTargets(t) ? null : t;
}
