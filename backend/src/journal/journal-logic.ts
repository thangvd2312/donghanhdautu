/**
 * Quy tắc thuần của nhật ký quyết định (FREE-08): bộ nhãn, khoảng tháng và tổng kết tháng. Không đụng DB / mạng để
 * test được bằng dữ liệu tay.
 *
 * Nguyên tắc: tổng kết chỉ mô tả hành vi bằng lời trung tính; diễn biến giá sau giao dịch được liệt kê riêng để đối chiếu,
 * không dùng để chấm điểm quyết định, không khuyên mua / bán.
 */
import type {
  JournalCount,
  JournalEmotion,
  JournalMonthSummary,
  JournalMonthTotals,
  JournalPressuredTrade,
  JournalReason,
  JournalTxType,
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
/** Loại giao dịch có tài sản và giá (để đối chiếu diễn biến giá sau đó) */
export const TRADE_TX_TYPES: readonly JournalTxType[] = ['buy', 'sell'];
/** Cảm xúc dễ cuốn người ta làm khác dự định: được liệt kê riêng trong tổng kết */
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
 * `fromTs`/`toTs` cho mốc thời gian tính theo giờ VN (UTC+7, không có giờ mùa hè).
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

// ---------- Diễn biến giá ----------

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
  priceSincePct: number | null;
}

export interface SummaryInput {
  month: string;
  trades: SummaryTrade[];
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
  const emotions = input.trades.map((t) => t.emotion);
  return {
    month: input.month,
    trades: input.trades.filter(isTrade).length,
    emotionTagged: emotions.filter((e) => e !== null).length,
    pressured: emotions.filter(pressured).length,
  };
}

export function summarize(input: SummaryInput, previous: JournalMonthTotals | null): JournalMonthSummary {
  const totals = monthTotals(input);
  const trades = input.trades.filter(isTrade);
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
    tagged: trades.filter((t) => t.reason !== null || t.emotion !== null).length,
    reasons: countBy(
      input.trades.map((t) => t.reason),
      JOURNAL_REASONS,
    ),
    emotions: countBy(
      input.trades.map((t) => t.emotion),
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
  const prev = s.previous && s.previous.trades > 0 ? s.previous : null;
  if (s.trades === 0) {
    out.push(
      cashEntries
        ? `Tháng này chưa có lệnh mua / bán nào, chỉ có ${cashEntries} khoản nạp / rút tiền (ở dòng thời gian bên dưới).`
        : 'Tháng này chưa có lệnh mua / bán nào được ghi.',
    );
    return out;
  }
  out.push(
    s.tagged === s.trades
      ? `Cả ${s.trades} lệnh mua / bán đều có ghi lý do hoặc cảm xúc${versus(prev?.trades)}.`
      : s.tagged === 0
        ? `Có ${s.trades} lệnh mua / bán${versus(prev?.trades)}.`
        : `Có ${s.trades} lệnh mua / bán, ${s.tagged} lệnh có ghi lý do hoặc cảm xúc${versus(prev?.trades)}.`,
  );
  if (s.reasons.length) {
    const top = s.reasons[0];
    out.push(`Lý do bạn ghi nhiều nhất: ${quote(REASON_LABEL[top.key])} (${top.count} lần).`);
  }
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
  if (s.tagged === 0) {
    out.push('Chưa lệnh nào có nhãn lý do / cảm xúc. Gắn nhãn ngay khi ghi giao dịch giúp tổng kết tháng sau rõ hơn.');
  }
  return out;
}
