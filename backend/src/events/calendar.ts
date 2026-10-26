import type { CalendarEvent as PublicCalendarEvent, EventKind, EventRange, ReminderSettings } from '@dautu/contracts';
import type { VcMarketEvent } from '../market/providers/vietcap';

/** Hàm thuần của lịch sự kiện quyền: phân loại sự kiện Vietcap, lọc theo cửa sổ ngày, hợp nhất danh mục / watchlist, quyết định nhắc */

export type { EventRange, ReminderSettings };
const RANGE_DAYS: Record<EventRange, number> = { week: 7, month: 30, quarter: 92 };
/** Số ngày trong quá khứ vẫn hiển thị để người dùng thấy sự kiện vừa qua */
const PAST_DAYS = 7;
/**
 * Nguồn lọc theo ngày GDKHQ, nhưng ngày thanh toán thường sau GDKHQ 1–3 tháng: lấy lùi thêm để thanh toán sắp tới của
 * đợt đã qua GDKHQ vẫn có trong lịch.
 */
const PAYOUT_LOOKBACK_DAYS = 100;

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = { enabled: false, daysBefore: 1, mutedSymbols: [] };

/** Sự kiện trong lịch: các trường công khai (hợp đồng API) cộng id nguồn dùng nội bộ cho dedupeKey nhắc */
export interface CalendarEvent extends PublicCalendarEvent {
  /** id sự kiện ở nguồn — dùng cho dedupeKey nhắc, không trả ra ngoài API */
  sourceId: string;
}

type Classified = Omit<
  CalendarEvent,
  'held' | 'watched' | 'heldQuantity' | 'estimatedCash' | 'entitlementFixed' | 'upcoming' | 'remindAt' | 'companyName'
> & { companyName: string | null };

const day = (s?: string | null) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null);

function addDays(date: string, n: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Phiên thứ `n` trước ngày `date` (bỏ qua thứ 7, chủ nhật; chưa tính ngày nghỉ lễ) */
function sessionBefore(date: string, n: number) {
  let d = date;
  for (let left = n; left > 0;) {
    d = addDays(d, -1);
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (dow !== 0 && dow !== 6) left--;
  }
  return d;
}

/** Phiên giao dịch cuối cùng trước ngày GDKHQ (bỏ qua thứ 7, chủ nhật; chưa tính ngày nghỉ lễ) */
export function lastBuyDay(exDate: string) {
  return sessionBefore(exDate, 1);
}

/**
 * Phân loại một sự kiện Vietcap; null nếu không phải quyền của cổ đông hiện hữu hoặc chưa có ngày để xếp lịch
 * (sự kiện mới công bố thường chưa có ngày GDKHQ).
 */
export function classifyEvent(e: VcMarketEvent): Classified | null {
  const exDate = day(e.exrightDate);
  const meetingDate = day(e.issueDate);
  const titleEn = e.eventTitleEn ?? '';
  const ratioPct = e.exerciseRatio && e.exerciseRatio > 0 ? Math.round(e.exerciseRatio * 10_000) / 100 : null;

  let kind: EventKind | null = null;
  if (e.eventCode === 'DIV') {
    if (e.valuePerShare && e.valuePerShare > 0) kind = 'cash';
  } else if (e.eventCode === 'ISS') {
    if (/rights issue/i.test(titleEn)) kind = ratioPct ? 'rights' : null;
    else if (/bonus issue|stock dividend|split/i.test(titleEn)) kind = ratioPct ? 'stock' : null;
  } else if (e.eventCode === 'AGME') kind = 'agm';
  else if (e.eventCode === 'EGME') kind = 'egm';
  if (!kind) return null;

  const isMeeting = kind === 'agm' || kind === 'egm';
  const date = exDate ?? (isMeeting ? meetingDate : null);
  if (!date) return null;
  const symbol = e.ticker.toUpperCase();
  return {
    key: `${symbol}:${kind}:${e.id}`,
    sourceId: e.id,
    symbol,
    companyName: e.organNameVi ?? null,
    kind,
    title: e.eventTitleVi ?? '',
    date,
    exDate,
    recordDate: day(e.recordDate),
    payoutDate: day(e.payoutDate),
    meetingDate: isMeeting ? meetingDate : null,
    valuePerShare: kind === 'cash' ? (e.valuePerShare ?? null) : null,
    ratioPct: kind === 'stock' || kind === 'rights' ? ratioPct : null,
    rightsPrice: null, // Vietcap không có giá phát hành quyền mua
    publishedAt: day(e.publicDate),
  };
}

/** Khoảng ngày cần lấy từ nguồn: đủ cho mọi `range` và cho cửa sổ nhắc; một lần gọi dùng chung (cache theo ngày) */
export function fetchWindow(today: string) {
  return { from: addDays(today, -PAYOUT_LOOKBACK_DAYS), to: addDays(today, RANGE_DAYS.quarter) };
}

/** Sự kiện có ít nhất một ngày quan trọng nằm trong [from, to] */
export function inWindow(
  e: Pick<CalendarEvent, 'exDate' | 'recordDate' | 'payoutDate' | 'meetingDate'>,
  from: string,
  to: string,
) {
  return [e.exDate, e.recordDate, e.payoutDate, e.meetingDate].some((d) => d !== null && d >= from && d <= to);
}

/**
 * Ngày dùng để nhắc: GDKHQ. Đại hội không có GDKHQ, hoặc GDKHQ đã qua mà buổi họp còn ở phía trước: ngày họp
 * (người đã chốt quyền dự họp vẫn cần được nhắc trước buổi họp).
 */
export function reminderAnchor(e: Pick<CalendarEvent, 'kind' | 'exDate' | 'meetingDate'>, today?: string) {
  const meeting = e.kind === 'agm' || e.kind === 'egm' ? e.meetingDate : null;
  if (e.exDate && meeting && today && e.exDate <= today && meeting > today) return meeting;
  return e.exDate ?? meeting;
}

/**
 * Cửa sổ nhắc [ngày đầu, ngày cuối]. GDKHQ: tính theo phiên — từ `daysBefore` phiên trước GDKHQ tới phiên mua cuối
 * (GDKHQ thứ 2 thì nhắc "1 ngày trước" vào thứ 6, không phải chủ nhật khi đã hết phiên mua). Ngày họp: theo ngày lịch.
 */
function reminderWindow(anchor: string, isEx: boolean, daysBefore: number) {
  return isEx
    ? { first: sessionBefore(anchor, daysBefore), last: lastBuyDay(anchor) }
    : { first: addDays(anchor, -daysBefore), last: addDays(anchor, -1) };
}

/** Hôm nay có nằm trong cửa sổ nhắc không (sự kiện công bố muộn: vào cửa sổ là nhắc ngay) */
export function reminderDue(
  e: Pick<CalendarEvent, 'exDate'>,
  anchor: string | null,
  today: string,
  daysBefore: number,
) {
  if (!anchor) return false;
  const w = reminderWindow(anchor, anchor === e.exDate, daysBefore);
  return today >= w.first && today <= w.last;
}

/** Ngày sẽ nhắc: null nếu tắt nhắc, mã bị tắt, hoặc đã qua cửa sổ nhắc */
export function remindAt(
  e: Pick<CalendarEvent, 'kind' | 'exDate' | 'meetingDate' | 'symbol'>,
  s: ReminderSettings,
  today: string,
) {
  const anchor = reminderAnchor(e, today);
  if (!s.enabled || !anchor || s.mutedSymbols.includes(e.symbol)) return null;
  const w = reminderWindow(anchor, anchor === e.exDate, s.daysBefore);
  if (today > w.last) return null;
  return w.first > today ? w.first : today;
}

type KeyEvent = Pick<CalendarEvent, 'symbol' | 'sourceId' | 'exDate'>;

/** Một lần nhắc theo (mã, sự kiện, ngày): đổi ngày → khoá mới, nên không bao giờ nhắc lại theo ngày cũ */
export function reminderDedupeKey(e: KeyEvent, anchor: string) {
  return `${reminderKeyPrefix(e, anchor)}${anchor}`;
}

/** Tiền tố khoá của lần nhắc ngày họp khi sự kiện có GDKHQ — không lẫn với lần nhắc theo GDKHQ */
export const meetingKeyPrefix = (e: Pick<CalendarEvent, 'symbol' | 'sourceId'>) =>
  `event:${e.symbol}:${e.sourceId}:hop:`;

/**
 * Tiền tố chung của mọi lần nhắc cùng một sự kiện và cùng loại mốc (mọi ngày) — để thu hồi lần nhắc theo ngày cũ khi
 * nguồn đổi ngày. Nhắc theo GDKHQ giữ khoá cũ; nhắc ngày họp của sự kiện có GDKHQ thêm `hop:` (họp không phải ngày
 * GDKHQ bị đổi).
 */
export function reminderKeyPrefix(e: KeyEvent, anchor: string) {
  return e.exDate && anchor !== e.exDate ? meetingKeyPrefix(e) : `event:${e.symbol}:${e.sourceId}:`;
}

interface CalendarInput {
  events: VcMarketEvent[];
  /** mã → tổng số cổ phiếu đang giữ (mọi danh mục), chỉ mã > 0 */
  holdings: Map<string, number>;
  /**
   * Số cổ phiếu được hưởng quyền: giữ tới hết phiên trước ngày GDKHQ (giao dịch có ngày < GDKHQ). Không truyền thì
   * dùng số đang giữ.
   */
  entitledAt?: (symbol: string, exDate: string) => number;
  watched: Set<string>;
  today: string;
  range: EventRange;
  settings: ReminderSettings;
}

/** Lịch sự kiện của các mã người dùng giữ / theo dõi, sắp theo ngày tăng dần */
export function buildCalendar(input: CalendarInput): CalendarEvent[] {
  const { holdings, watched, today, settings } = input;
  const from = addDays(today, -PAST_DAYS);
  const to = addDays(today, RANGE_DAYS[input.range]);
  const out: CalendarEvent[] = [];
  for (const raw of input.events) {
    const c = classifyEvent(raw);
    if (!c) continue;
    const now = holdings.get(c.symbol) ?? 0;
    // Đã qua GDKHQ: quyền đã chốt theo số giữ trước GDKHQ (mua sau không được, bán sau vẫn được)
    const fixed = c.exDate !== null && c.exDate <= today && c.kind !== 'agm' && c.kind !== 'egm';
    const entitled = fixed ? (input.entitledAt?.(c.symbol, c.exDate!) ?? now) : now;
    const qty = fixed ? entitled : now;
    const held = now > 0 || entitled > 0;
    const isWatched = watched.has(c.symbol);
    if (!held && !isWatched) continue;
    if (!inWindow(c, from, to)) continue;
    // Đợt đã qua GDKHQ nhưng chưa thanh toán: xếp vào ngày thanh toán (mốc còn lại với người được hưởng)
    const payoutAhead = c.exDate !== null && c.exDate < today && c.payoutDate !== null && c.payoutDate >= today;
    out.push({
      ...c,
      date: payoutAhead ? c.payoutDate! : c.date,
      held,
      watched: isWatched,
      heldQuantity: qty > 0 ? qty : null,
      estimatedCash: c.kind === 'cash' && qty > 0 ? Math.round(qty * (c.valuePerShare ?? 0)) : null,
      entitlementFixed: fixed,
      // Đại hội: còn "sắp tới" khi ngày họp chưa qua dù GDKHQ đã qua
      upcoming: c.date >= today || payoutAhead || (c.meetingDate !== null && c.meetingDate >= today),
      remindAt: remindAt(c, settings, today),
    });
  }
  return out.sort(
    (a, b) => a.date.localeCompare(b.date) || a.symbol.localeCompare(b.symbol) || a.key.localeCompare(b.key),
  );
}

const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const vnd = (n: number) => `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(n)} ₫`;

/** Nội dung nhắc. Ước tính tiền nhận (số liệu danh mục) chỉ nằm trong body — kênh ngoài chỉ hiện khi bật showDetails */
export function reminderMessage(e: CalendarEvent, anchor: string, previousAnchor: string | null = null) {
  const what: Record<EventKind, string> = {
    cash: `cổ tức ${vnd(e.valuePerShare ?? 0)}/cp`,
    stock: `cổ phiếu thưởng / cổ tức bằng cổ phiếu tỷ lệ ${e.ratioPct}%`,
    rights: `quyền mua cổ phiếu tỷ lệ ${e.ratioPct}%`,
    agm: 'quyền dự ĐHĐCĐ thường niên',
    egm: 'quyền dự ĐHĐCĐ bất thường',
  };
  const isAnchorEx = e.exDate === anchor;
  const changed = previousAnchor && previousAnchor !== anchor ? ` (đổi từ ${dm(previousAnchor)})` : '';
  const title = `${e.symbol}: ${isAnchorEx ? 'GDKHQ' : 'họp'} ${what[e.kind]} ngày ${dm(anchor)}${changed}`;
  const parts: string[] = [];
  if (changed)
    parts.push(
      `Nguồn đã đổi ngày từ ${dm(previousAnchor!)} sang ${dm(anchor)}; lần nhắc theo ngày cũ đã được thu hồi.`,
    );
  if (isAnchorEx) {
    parts.push(
      `Muốn hưởng quyền phải sở hữu cổ phiếu trước ngày GDKHQ — mua chậm nhất phiên ${dm(lastBuyDay(anchor))}.`,
    );
    if (e.recordDate) parts.push(`Ngày đăng ký cuối cùng: ${dm(e.recordDate)}.`);
    if (e.payoutDate) parts.push(`Thanh toán dự kiến: ${dm(e.payoutDate)}.`);
  } else {
    parts.push(`Đại hội cổ đông họp ngày ${dm(anchor)}.`);
  }
  if (e.kind === 'rights')
    parts.push('Quyền mua cần tự đăng ký và nộp tiền mua; giá phát hành xem thông báo của công ty.');
  if (e.kind === 'cash' && e.estimatedCash !== null) {
    parts.push(`Ước tính nhận ${vnd(e.estimatedCash)} cho ${e.heldQuantity} cp đang giữ (trước thuế).`);
  }
  parts.push('Ngày có thể được công ty điều chỉnh; nguồn Vietcap, nên đối chiếu thông báo chính thức.');
  return { title, body: parts.join(' '), link: `/events?focus=${encodeURIComponent(e.key)}` };
}
