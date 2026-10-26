/** Quy tắc gửi thông báo ra ngoài app (Telegram, Web Push): loại tin, giờ yên lặng, giới hạn tần suất, nội dung */

export const KINDS = [
  'price_target',
  'price_move',
  'plan_review',
  'brief',
  'news',
  'macro',
  'event',
  'portfolio_health',
  'journal_monthly',
] as const;
export type Kind = (typeof KINDS)[number];

export const KIND_LABEL: Record<Kind, string> = {
  price_target: 'Giá chạm mốc bạn đặt',
  price_move: 'Biến động mạnh của tài sản đang giữ',
  plan_review: 'Nhắc xem lại kế hoạch',
  brief: 'Bản tin sáng / cuối phiên / tổng kết tuần',
  news: 'Tin về mã đang giữ',
  macro: 'Tin vĩ mô quan trọng',
  event: 'Sự kiện quyền sắp tới: cổ tức, quyền mua, đại hội',
  portfolio_health: 'Tình trạng danh mục',
  journal_monthly: 'Tổng kết nhật ký quyết định hằng tháng',
};

/** Mặc định khi mới kết nối: chỉ những tin cần hành động; người dùng tự bật thêm */
export const DEFAULT_KINDS: Record<Kind, boolean> = {
  price_target: true,
  price_move: true,
  plan_review: true,
  brief: false,
  news: false,
  macro: false,
  event: true,
  // Quy tắc người dùng tự bật trong Cảnh báo danh mục: luôn có trong app, gửi ra ngoài khi người dùng chọn thêm
  portfolio_health: false,
  // Lời mời xem tổng kết tháng (nhật ký quyết định): luôn có trong app, gửi ra ngoài khi người dùng tự bật
  journal_monthly: false,
};

/** Tối đa số tin / giờ gửi cho một người */
export const MAX_PER_HOUR = 10;
const MAX_ATTEMPTS = 5;

interface LinkPrefs {
  active: boolean;
  kinds: Partial<Record<string, boolean>>;
  quietStart: number | null;
  quietEnd: number | null;
}

type Decision =
  { action: 'send' } | { action: 'skip'; reason: string } | { action: 'later'; until: Date; reason: string };

/** Phút trong ngày theo giờ VN (UTC+7, không có giờ mùa hè) */
export function vnMinutes(d: Date) {
  return (d.getUTCHours() * 60 + d.getUTCMinutes() + 7 * 60) % 1440;
}

export function inQuietHours(minutes: number, start: number | null, end: number | null) {
  if (start === null || end === null || start === end) return false;
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

/** Thời điểm kết thúc giờ yên lặng gần nhất sau `now` */
export function quietEndsAt(now: Date, end: number) {
  const m = vnMinutes(now);
  const add = (end - m + 1440) % 1440 || 1440;
  return new Date(Math.floor(now.getTime() / 60_000) * 60_000 + add * 60_000);
}

/**
 * Quyết định cho một tin đang chờ: kiểm tra lại cài đặt NGAY lúc gửi (tắt nhận tin có hiệu lực với cả tin đang chờ),
 * giờ yên lặng thì hoãn, vượt giới hạn tần suất thì hoãn.
 */
export function decide(
  now: Date,
  kind: string,
  link: LinkPrefs | null,
  sentLastHour: number,
  channel: 'telegram' | 'push' = 'telegram',
): Decision {
  if (!link || !link.active) {
    return {
      action: 'skip',
      reason:
        channel === 'push'
          ? 'Thiết bị chưa bật hoặc đã tắt thông báo trình duyệt'
          : 'Chưa kết nối hoặc đã tắt Telegram',
    };
  }
  // Liên kết cũ chưa lưu loại tin mới: dùng mặc định của loại đó thay vì coi như đã tắt
  if (!(link.kinds[kind] ?? DEFAULT_KINDS[kind as Kind]))
    return { action: 'skip', reason: 'Đã tắt loại thông báo này' };
  if (inQuietHours(vnMinutes(now), link.quietStart, link.quietEnd)) {
    return { action: 'later', until: quietEndsAt(now, link.quietEnd!), reason: 'Giờ yên lặng' };
  }
  if (sentLastHour >= MAX_PER_HOUR) {
    return { action: 'later', until: new Date(now.getTime() + 15 * 60_000), reason: 'Vượt giới hạn tần suất' };
  }
  return { action: 'send' };
}

/** Thử lại sau 1, 2, 4, 8 phút…; quá số lần thì dừng */
export function retryAt(now: Date, attempts: number) {
  if (attempts >= MAX_ATTEMPTS) return null;
  return new Date(now.getTime() + Math.pow(2, attempts - 1) * 60_000);
}

const GENERIC_TITLE: Record<string, string> = {
  brief: 'Bản tin mới của bạn đã sẵn sàng',
  price_move: 'Một tài sản bạn đang giữ biến động mạnh',
  news: 'Có tin mới liên quan tới mã bạn đang giữ',
  macro: 'Có tin vĩ mô quan trọng',
  plan_review: 'Đến hạn xem lại một kế hoạch đầu tư',
  price_target: 'Giá đã chạm mốc bạn đặt',
  event: 'Sắp có sự kiện quyền của mã bạn quan tâm',
  portfolio_health: 'Danh mục của bạn có điểm cần xem lại',
  journal_monthly: 'Tổng kết thói quen đầu tư tháng trước đã sẵn sàng',
};

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Nội dung tin (HTML của Telegram). Mặc định không đưa số dư / nội dung chi tiết ra ngoài app:
 * chỉ tiêu đề chung theo loại + link. Bật showDetails mới gửi tiêu đề và nội dung thật.
 */
export function formatMessage(
  n: { kind: string; title: string; body: string; link: string | null },
  showDetails: boolean,
  appUrl: string | null,
) {
  const title = showDetails ? n.title : (GENERIC_TITLE[n.kind] ?? 'Bạn có thông báo mới');
  const lines = [`<b>${escapeHtml(title)}</b>`];
  if (showDetails && n.body) lines.push('', escapeHtml(n.body.length > 800 ? `${n.body.slice(0, 800)}…` : n.body));
  if (appUrl) {
    const url = `${appUrl.replace(/\/$/, '')}${n.link && n.link.startsWith('/') ? n.link : '/'}`;
    lines.push('', `<a href="${escapeHtml(url)}">Mở trong Đồng Hành Đầu Tư</a>`);
  }
  return lines.join('\n');
}

/** Nội dung Web Push (chữ thường, không HTML). Cùng quy tắc riêng tư với Telegram */
export function pushPayload(
  n: { kind: string; title: string; body: string; link: string | null },
  showDetails: boolean,
) {
  return {
    title: showDetails ? n.title : (GENERIC_TITLE[n.kind] ?? 'Bạn có thông báo mới'),
    body: showDetails ? (n.body.length > 300 ? `${n.body.slice(0, 300)}…` : n.body) : 'Mở ứng dụng để xem chi tiết',
    url: n.link && n.link.startsWith('/') ? n.link : '/',
    tag: n.kind,
  };
}
