/**
 * Quy tắc thuần của nhật ký quyết định (FREE-08): bộ nhãn, khoảng tháng, mốc kế hoạch có hiệu lực theo ngày,
 * đối chiếu giá giao dịch với mốc và tổng kết tháng. Không đụng DB / mạng để test được bằng dữ liệu tay.
 *
 * Nguyên tắc: "làm đúng kế hoạch" và "lãi hay lỗ" là hai trục tách rời. Tổng kết chỉ mô tả hành vi bằng lời trung tính;
 * diễn biến giá sau giao dịch được liệt kê riêng để đối chiếu, không dùng để chấm điểm quyết định, không khuyên mua / bán.
 */
import type {
  JournalCount,
  JournalEmotion,
  JournalMonthSummary,
  JournalMonthTotals,
  JournalPressuredTrade,
  JournalReason,
  JournalTxType,
  PlanDecision,
  PlanLevelCheck,
} from '@dautu/contracts';

/** Bộ nhãn lý do: thứ tự là thứ tự hiện trên giao diện. Record bắt buộc đủ mọi khoá của hợp đồng */
export const REASON_LABEL: Record<JournalReason, string> = {
  plan: 'Theo kế hoạch',
  dca: 'Tích luỹ định kỳ',
  price_level: 'Giá chạm mốc',
  thesis_changed: 'Luận điểm thay đổi',
  rebalance: 'Cân bằng tỷ trọng',
  need_cash: 'Cần dùng tiền',
  news: 'Theo tin tức',
  tip: 'Nghe người khác',
};

export const EMOTION_LABEL: Record<JournalEmotion, string> = {
  calm: 'Bình tĩnh',
  confident: 'Tự tin',
  unsure: 'Phân vân',
  anxious: 'Lo lắng',
  fomo: 'Sợ lỡ cơ hội',
  fear: 'Sợ lỗ',
  greedy: 'Hưng phấn',
};

export const JOURNAL_REASONS = Object.keys(REASON_LABEL) as JournalReason[];
export const JOURNAL_EMOTIONS = Object.keys(EMOTION_LABEL) as JournalEmotion[];
const JOURNAL_TX_TYPES: readonly JournalTxType[] = ['buy', 'sell', 'deposit', 'withdraw'];
/** Loại giao dịch gắn được vào kế hoạch (có tài sản và giá) */
export const PLAN_LINK_TX_TYPES: readonly JournalTxType[] = ['buy', 'sell'];
/** Cảm xúc dễ cuốn người ta làm khác kế hoạch: được liệt kê riêng trong tổng kết */
const PRESSURED_EMOTIONS: readonly JournalEmotion[] = ['fomo', 'fear', 'greedy'];

export const isJournalTxType = (t: string): t is JournalTxType => (JOURNAL_TX_TYPES as readonly string[]).includes(t);

// ---------- Tháng ----------

export const isMonthKey = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

/** Cộng / trừ số tháng vào YYYY-MM */
export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

/**
 * Khoảng của tháng: `fromDate`/`toDate` (YYYY-MM-DD, nửa mở) cho cột ngày giao dịch theo lịch VN,
 * `fromTs`/`toTs` cho mốc thời gian (lần xem lại, phiên bản) tính theo giờ VN (UTC+7, không có giờ mùa hè).
 */
export function monthRange(month: string) {
  const next = shiftMonth(month, 1);
  return {
    fromDate: `${month}-01`,
    toDate: `${next}-01`,
    fromTs: new Date(`${month}-01T00:00:00+07:00`),
    toTs: new Date(`${next}-01T00:00:00+07:00`),
  };
}

/** "2026-10" → "tháng 10/2026" */
export function monthLabel(month: string) {
  const [y, m] = month.split('-');
  return `tháng ${Number(m)}/${y}`;
}

// ---------- Kế hoạch & mốc giá ----------

export interface PlanLevels {
  targetPrice: number | null;
  stopPrice: number | null;
}

export interface PlanVersionLite {
  /** Ngày sửa theo giờ VN (YYYY-MM-DD) */
  date: string;
  /** Nội dung kế hoạch TRƯỚC lần sửa đó */
  snapshot: unknown;
}

const numOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Mốc chốt lời / cắt lỗ có hiệu lực vào ngày giao dịch. Mỗi phiên bản lưu bản kế hoạch trước một lần sửa, nên mốc
 * của ngày D là bản trước lần sửa đầu tiên xảy ra SAU ngày D; không có lần sửa nào sau D thì là kế hoạch hiện tại.
 * Sửa cùng ngày giao dịch được coi là đã có hiệu lực (người dùng thường sửa rồi mới đặt lệnh).
 */
export function levelsOn(current: PlanLevels, versions: PlanVersionLite[], date: string): PlanLevels {
  const later = versions.filter((v) => v.date > date).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (!later.length) return current;
  const s = (later[0].snapshot ?? {}) as Record<string, unknown>;
  return { targetPrice: numOrNull(s.targetPrice), stopPrice: numOrNull(s.stopPrice) };
}

/** Giá giao dịch nằm đâu so với mốc kế hoạch (cùng đơn vị giá gốc: VND/cp, USDT/coin, VND/lượng) */
export function levelCheck(price: number | null, levels: PlanLevels): PlanLevelCheck | null {
  if (price === null || !(price > 0)) return null;
  const { targetPrice: target, stopPrice: stop } = levels;
  if (target === null && stop === null) return 'no_levels';
  if (target !== null && price >= target) return 'at_or_above_target';
  if (stop !== null && price <= stop) return 'at_or_below_stop';
  return 'within';
}

/** Giá hiện tại so với giá lúc giao dịch (%), làm tròn 0,1 */
export function priceSincePct(tradePrice: number | null, currentPrice: number | null) {
  if (tradePrice === null || currentPrice === null || !(tradePrice > 0) || !(currentPrice > 0)) return null;
  return Math.round(((currentPrice - tradePrice) / tradePrice) * 1000) / 10;
}

// ---------- Tổng kết tháng ----------

export interface SummaryTrade {
  id: string;
  date: string;
  type: JournalTxType;
  displayName: string | null;
  reason: JournalReason | null;
  emotion: JournalEmotion | null;
  linked: boolean;
  levelCheck: PlanLevelCheck | null;
  priceSincePct: number | null;
}

export interface SummaryReview {
  decision: PlanDecision;
  reason: JournalReason | null;
  emotion: JournalEmotion | null;
}

export interface SummaryInput {
  month: string;
  trades: SummaryTrade[];
  reviews: SummaryReview[];
  /** Số lần sửa nội dung kế hoạch trong tháng */
  edits: number;
}

const isTrade = (t: SummaryTrade) => t.type === 'buy' || t.type === 'sell';
const pressured = (e: JournalEmotion | null) => e !== null && PRESSURED_EMOTIONS.includes(e);

/** Đếm theo nhãn, nhiều trước; hoà thì theo thứ tự bộ nhãn để kết quả ổn định */
function countBy<K extends string>(values: (K | null)[], order: readonly K[]): JournalCount<K>[] {
  const m = new Map<K, number>();
  for (const v of values) if (v !== null) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || order.indexOf(a.key) - order.indexOf(b.key));
}

export function monthTotals(input: SummaryInput): JournalMonthTotals {
  const trades = input.trades.filter(isTrade);
  const emotions = [...input.trades.map((t) => t.emotion), ...input.reviews.map((r) => r.emotion)];
  return {
    month: input.month,
    trades: trades.length,
    linked: trades.filter((t) => t.linked).length,
    emotionTagged: emotions.filter((e) => e !== null).length,
    pressured: emotions.filter(pressured).length,
    reviews: input.reviews.length,
    kept: input.reviews.filter((r) => r.decision === 'keep').length,
    changed: input.reviews.filter((r) => r.decision !== 'keep').length + input.edits,
  };
}

export function summarize(input: SummaryInput, previous: JournalMonthTotals | null): JournalMonthSummary {
  const totals = monthTotals(input);
  const trades = input.trades.filter(isTrade);
  const linked = trades.filter((t) => t.linked);
  const sells = linked.filter((t) => t.type === 'sell');
  const buys = linked.filter((t) => t.type === 'buy');
  const pressuredTrades: JournalPressuredTrade[] = input.trades
    .filter((t) => pressured(t.emotion))
    .map((t) => ({
      id: t.id,
      date: t.date,
      type: t.type,
      displayName: t.displayName,
      emotion: t.emotion!,
      priceSincePct: t.priceSincePct,
    }));
  const summary: JournalMonthSummary = {
    ...totals,
    unlinked: trades.length - linked.length,
    tagged: trades.filter((t) => t.reason !== null || t.emotion !== null).length,
    levels: {
      sellsAtLevel: sells.filter((t) => t.levelCheck === 'at_or_above_target' || t.levelCheck === 'at_or_below_stop')
        .length,
      sellsBeforeLevel: sells.filter((t) => t.levelCheck === 'within').length,
      buysOutsideRange: buys.filter((t) => t.levelCheck === 'at_or_above_target' || t.levelCheck === 'at_or_below_stop')
        .length,
      buysWithinRange: buys.filter((t) => t.levelCheck === 'within').length,
      noLevels: linked.filter((t) => t.levelCheck === 'no_levels').length,
    },
    decisions: {
      keep: input.reviews.filter((r) => r.decision === 'keep').length,
      adjust: input.reviews.filter((r) => r.decision === 'adjust').length,
      close: input.reviews.filter((r) => r.decision === 'close').length,
      edits: input.edits,
    },
    reasons: countBy([...input.trades.map((t) => t.reason), ...input.reviews.map((r) => r.reason)], JOURNAL_REASONS),
    emotions: countBy(
      [...input.trades.map((t) => t.emotion), ...input.reviews.map((r) => r.emotion)],
      JOURNAL_EMOTIONS,
    ),
    pressuredTrades,
    previous,
    insights: [],
  };
  summary.insights = insights(summary, input.trades.length - trades.length);
  return summary;
}

const quote = (s: string) => `“${s}”`;

/** So với tháng trước bằng lời: "tháng trước 3" (bỏ qua khi tháng trước không có gì để so) */
const versus = (prev: number | undefined) => (prev === undefined ? '' : ` (tháng trước ${prev})`);

/**
 * Nhận xét bằng lời thường. Chỉ mô tả điều đã xảy ra theo đúng nhãn người dùng tự gắn: không khen chê,
 * không suy ra động cơ, không nói quyết định đúng hay sai, không khuyên mua / bán.
 */
export function insights(s: JournalMonthSummary, cashEntries = 0): string[] {
  const out: string[] = [];
  const prev = s.previous && (s.previous.trades > 0 || s.previous.reviews > 0) ? s.previous : null;
  if (s.trades === 0 && s.reviews === 0 && s.decisions.edits === 0) {
    out.push(
      cashEntries
        ? `Tháng này chưa có lệnh mua / bán hay lần xem lại kế hoạch nào, chỉ có ${cashEntries} khoản nạp / rút tiền (ở dòng thời gian bên dưới).`
        : 'Tháng này chưa có lệnh mua / bán hay lần xem lại kế hoạch nào được ghi.',
    );
    return out;
  }
  if (s.trades > 0) {
    out.push(
      s.linked === s.trades
        ? `Cả ${s.trades} lệnh mua / bán đều gắn với một kế hoạch đã viết${versus(prev?.trades)}.`
        : s.linked === 0
          ? `Có ${s.trades} lệnh mua / bán, chưa lệnh nào gắn với kế hoạch${versus(prev?.trades)}.`
          : `Có ${s.trades} lệnh mua / bán, ${s.linked} lệnh gắn với kế hoạch và ${s.unlinked} lệnh ngoài kế hoạch${versus(prev?.trades)}.`,
    );
  }
  const lv = s.levels;
  if (lv.sellsAtLevel) out.push(`${lv.sellsAtLevel} lần bán diễn ra khi giá đã tới mốc chốt lời hoặc cắt lỗ bạn đặt.`);
  if (lv.sellsBeforeLevel)
    out.push(
      `${lv.sellsBeforeLevel} lần bán khi giá còn nằm giữa hai mốc của kế hoạch — ghi lại lý do sẽ giúp bạn đối chiếu về sau.`,
    );
  if (lv.buysOutsideRange)
    out.push(`${lv.buysOutsideRange} lần mua ở mức giá nằm ngoài khoảng giữa mốc cắt lỗ và mốc chốt lời của kế hoạch.`);
  const d = s.decisions;
  if (s.reviews > 0) {
    const parts = [
      d.keep && `giữ nguyên ${d.keep}`,
      d.adjust && `điều chỉnh ${d.adjust}`,
      d.close && `kết thúc ${d.close}`,
    ].filter(Boolean);
    out.push(`Bạn xem lại kế hoạch ${s.reviews} lần: ${parts.join(', ')}${versus(prev?.reviews)}.`);
  }
  if (d.edits) out.push(`Nội dung kế hoạch được sửa ${d.edits} lần; bản cũ vẫn được lưu để so.`);
  if (s.emotions.length) {
    const top = s.emotions[0];
    out.push(`Cảm xúc bạn ghi nhiều nhất: ${quote(EMOTION_LABEL[top.key])} (${top.count} lần).`);
  }
  if (s.pressured > 0) {
    const names = s.emotions.filter((e) => PRESSURED_EMOTIONS.includes(e.key)).map((e) => quote(EMOTION_LABEL[e.key]));
    out.push(
      `${s.pressured} quyết định được ghi lúc ${names.join(' hoặc ')}${prev && prev.emotionTagged > 0 ? ` (tháng trước ${prev.pressured})` : ''}. ` +
        'Nhận ra lúc đó đã là một bước tốt.',
    );
  } else if (s.emotionTagged > 0 && prev && prev.pressured > 0) {
    out.push(
      `Tháng này không có quyết định nào được ghi lúc sợ lỡ cơ hội, sợ lỗ hay hưng phấn (tháng trước ${prev.pressured}).`,
    );
  }
  if (s.trades > 0 && s.tagged === 0) {
    out.push('Chưa lệnh nào có nhãn lý do / cảm xúc. Gắn nhãn ngay khi ghi giao dịch giúp tổng kết tháng sau rõ hơn.');
  }
  return out;
}
