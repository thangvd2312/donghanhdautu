import type { PortfolioAlertKind } from '@dautu/contracts';
import type { Evaluation } from './evaluators';
import type { RuleConfig } from './rule-config';

/** Lượt chạy theo lịch lệch vài phút: nới giới hạn tần suất một chút để "mỗi ngày" vẫn là mỗi ngày */
const COOLDOWN_SLACK_MS = 60 * 60_000;

// ---------------------------------------------------------------------------------------------------------------------
// Gửi thông báo: giới hạn tần suất, chống trùng

/**
 * Có gửi thông báo cho kết quả này không. Đang đúng điều kiện mà lần báo trước của cùng quy tắc còn trong thời gian
 * giới hạn (cooldownDays) thì chưa báo lại. Chống trùng trong ngày do dedupeKey (`dedupeKey`) bảo đảm ở DB.
 */
export function notifyDecision(
  e: Pick<Evaluation, 'status'>,
  rule: Pick<RuleConfig, 'enabled' | 'cooldownDays'>,
  lastNotifiedAt: Date | null,
  now: Date,
): { notify: boolean; nextAllowedAt: Date | null } {
  const next = lastNotifiedAt
    ? new Date(lastNotifiedAt.getTime() + rule.cooldownDays * 86_400_000 - COOLDOWN_SLACK_MS)
    : null;
  const cooling = next !== null && now < next;
  return { notify: rule.enabled && e.status === 'firing' && !cooling, nextAllowedAt: cooling ? next : null };
}

/** Mỗi quy tắc tối đa một thông báo mỗi ngày (theo giờ VN), kể cả khi hai lượt chạy chồng nhau */
export function dedupeKey(kind: PortfolioAlertKind, vnDay: string) {
  return `portfolio:${kind}:${vnDay}`;
}

export const DEDUPE_PREFIX = 'portfolio:';
export const ALERT_LINK = '/portfolio-alerts';

/** Nội dung thông báo trong app; Telegram / Web Push dùng tiêu đề chung khi người dùng không bật hiện chi tiết */
export function notificationFor(e: Evaluation) {
  return {
    severity: e.severity,
    title: e.headline,
    body: `${e.reason} Mở Cảnh báo danh mục để xem cách tính, đổi ngưỡng hoặc tắt nhắc.`,
    link: ALERT_LINK,
  };
}
