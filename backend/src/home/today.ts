import type { AssetType } from '../market/market.service';
import { REFERENCE_ALLOCATION, RISK_TYPE_LABEL } from '../profile/quiz';
import type { Valuation } from '../portfolio/valuation';

/** Thay đổi "hôm nay" mỗi loại tài sản được tính so với mốc nào */
export const DAY_BASIS: Record<AssetType, string> = {
  stock: 'so với giá tham chiếu phiên gần nhất',
  crypto: 'trong 24 giờ qua',
  gold: 'so với giá mua vào hôm trước',
  cash: 'không đổi',
};

export function holdingLink(h: { assetType: AssetType; symbol: string }) {
  if (h.assetType === 'stock') return `/stock/${h.symbol}`;
  if (h.assetType === 'crypto') return `/crypto/${h.symbol.replace(/USDT$/, '')}`;
  return null;
}

/** Giao dịch trong ngày của một tài sản, quy VND theo tỷ giá hiện tại (cùng cơ sở với giá hiện tại) */
export interface DayTrade {
  assetType: AssetType;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  /** Số lượng × giá khớp */
  valueVnd: number;
  /** Phí + thuế */
  costsVnd: number;
}

/** Tài sản đã bán hết trong ngày: không còn trong định giá nhưng vẫn có lãi/lỗ hôm nay */
export interface ClosedToday {
  assetType: AssetType;
  symbol: string;
  displayName: string;
  /** Giá hiện tại quy VND; null khi thiếu */
  priceVnd: number | null;
  dayChangePct: number | null;
}

/** Vị thế đầu ngày và giao dịch trong ngày, dựng từ sổ giao dịch */
export interface DayLedger {
  /** Số lượng nắm giữ đầu ngày theo `assetType:symbol` (gồm cả số dư khai báo hôm nay — xem openedToday) */
  startQty: Map<string, number>;
  trades: DayTrade[];
  /** Tài sản khai báo số dư đầu kỳ hôm nay: không biết mua lúc nào nên coi như đã giữ từ đầu ngày */
  openedToday: Set<string>;
  closed: ClosedToday[];
}

const keyOf = (h: { assetType: string; symbol: string }) => `${h.assetType}:${h.symbol}`;

/**
 * Danh mục tăng/giảm bao nhiêu hôm nay và do tài sản nào. Với mỗi tài sản:
 * lãi/lỗ hôm nay = giá trị cuối − giá trị đầu ngày (theo giá mốc) − tiền bỏ ra mua hôm nay + tiền thu về khi bán hôm nay.
 * Mua hôm nay chỉ tính phần giá chạy sau lúc mua; bán hôm nay tính theo giá bán thực tế; tiền nạp/rút không phải lãi.
 * Không có sổ (`ledger` bỏ trống) thì giả định số lượng không đổi trong ngày.
 */
export function dayChange(v: Valuation, ledger?: DayLedger) {
  const tradesOf = (k: string) => ledger?.trades.filter((t) => keyOf(t) === k) ?? [];
  const assets = [
    ...v.holdings.map((h) => ({
      h,
      key: keyOf(h),
      quantity: h.quantity,
      priceVnd: h.marketValue !== null && h.quantity > 0 ? h.marketValue / h.quantity : null,
      valueNow: h.marketValue,
    })),
    ...(ledger?.closed ?? []).map((c) => ({
      h: { ...c, id: `closed:${keyOf(c)}`, weightPct: 0 },
      key: keyOf(c),
      quantity: 0,
      priceVnd: c.priceVnd,
      valueNow: 0,
    })),
  ];
  const rows = assets.map((a) => {
    if (a.h.assetType === 'cash') return { ...a, change: 0 };
    const pct = a.h.dayChangePct;
    if (a.priceVnd === null || pct === null || pct <= -100) return { ...a, change: null };
    const refPrice = a.priceVnd / (1 + pct / 100);
    const startQty = ledger ? (ledger.startQty.get(a.key) ?? 0) : a.quantity;
    const trades = tradesOf(a.key);
    const bought = trades.filter((t) => t.side === 'buy').reduce((s, t) => s + t.valueVnd + t.costsVnd, 0);
    const sold = trades.filter((t) => t.side === 'sell').reduce((s, t) => s + t.valueVnd - t.costsVnd, 0);
    const change = a.quantity * a.priceVnd - startQty * refPrice - bought + sold;
    return { ...a, change };
  });
  const known = rows.filter((r) => r.change !== null);
  const changeVnd = known.reduce((s, r) => s + r.change, 0);
  const valueNow = known.reduce((s, r) => s + (r.valueNow ?? 0), 0);
  // Gốc tính %: giá trị hiện tại trừ phần lãi/lỗ hôm nay = giá trị đầu ngày + tiền nạp ròng trong ngày
  const base = valueNow - changeVnd;

  const contributors = known
    .filter((r) => r.h.assetType !== 'cash' && Math.round(r.change) !== 0)
    .map((r) => ({
      id: r.h.id,
      assetType: r.h.assetType,
      symbol: r.h.symbol,
      displayName: r.h.displayName,
      link: holdingLink(r.h),
      changeVnd: r.change,
      dayChangePct: r.h.dayChangePct!,
      weightPct: r.h.weightPct,
      basis: DAY_BASIS[r.h.assetType],
    }));

  const missing = rows.filter((r) => r.change === null).map((r) => r.h.displayName);
  const nameOf = (k: string) => assets.find((a) => a.key === k)?.h.displayName ?? k.split(':')[1];
  const changedToday = ledger ? [...ledger.openedToday].filter((k) => !k.startsWith('cash:')).map(nameOf) : [];
  const traded = ledger ? [...new Set(ledger.trades.map(keyOf))].map(nameOf) : [];
  const notes: string[] = [];
  if (missing.length) notes.push(`Chưa có dữ liệu thay đổi trong ngày của ${missing.join(', ')} nên chưa tính vào.`);
  if (traded.length) {
    notes.push(
      `${traded.join(', ')} có mua/bán hôm nay: phần mua chỉ tính biến động sau giá mua, phần bán tính theo giá bán thực tế (đã trừ phí/thuế).`,
    );
  }
  if (changedToday.length) {
    notes.push(
      `${changedToday.join(', ')} vừa khai báo hôm nay: con số giả định bạn đã nắm giữ số lượng đó từ đầu ngày.`,
    );
  }

  return {
    changeVnd: known.length ? changeVnd : null,
    changePct: known.length && base > 0 ? (changeVnd / base) * 100 : null,
    gainers: contributors
      .filter((c) => c.changeVnd > 0)
      .sort((a, b) => b.changeVnd - a.changeVnd)
      .slice(0, 3),
    losers: contributors
      .filter((c) => c.changeVnd < 0)
      .sort((a, b) => a.changeVnd - b.changeVnd)
      .slice(0, 3),
    missing,
    changedToday,
    notes,
  };
}

export interface ReviewPoint {
  id: string;
  severity: 'high' | 'medium' | 'info';
  title: string;
  reason: string;
  link: string | null;
  /** Câu hỏi gợi ý gửi cố vấn */
  ask: string | null;
}

export interface ProfileLite {
  riskType: string;
  maxDrawdownPct: number;
}

export interface AlertLite {
  id: string;
  assetType: string;
  symbol: string;
  direction: string;
  targetPrice: number;
  currentPrice: number | null;
}

/** Một tài sản (không tính tiền mặt) chiếm quá tỷ trọng này là rủi ro tập trung */
export const CONCENTRATION_PCT = 30;
/** Lệch khỏi phân bổ tham khảo quá số điểm % này thì nhắc */
export const ALLOCATION_DRIFT_PTS = 15;
/** Giá cách mốc cảnh báo trong khoảng % này thì nhắc "sắp chạm" */
export const NEAR_ALERT_PCT = 2;
/** Lỗ đã tới tỷ lệ này của mức lỗ tối đa chịu được thì nhắc "sắp chạm" */
export const NEAR_MAX_LOSS_RATIO = 0.8;

const TYPE_TO_REFERENCE: Record<AssetType, (key: string) => boolean> = {
  cash: (k) => k.startsWith('tiền gửi'),
  gold: (k) => k === 'vàng',
  stock: (k) => k.startsWith('cổ phiếu'),
  crypto: (k) => k === 'crypto',
};

const fmtPct = (x: number) => `${Math.round(Math.abs(x) * 10) / 10}%`.replace('.', ',');

/** Những điểm cần xem lại hôm nay, mỗi điểm có lý do tính được từ dữ liệu */
export function reviewPoints(v: Valuation, profile: ProfileLite | null, alerts: AlertLite[]): ReviewPoint[] {
  const points: ReviewPoint[] = [];

  if (!profile) {
    points.push({
      id: 'profile',
      severity: 'medium',
      title: 'Chưa có hồ sơ khẩu vị rủi ro',
      reason:
        'Cố vấn chưa biết mức lỗ bạn chịu được và mục tiêu đầu tư, nên chưa đánh giá được danh mục có hợp với bạn không.',
      link: '/onboarding',
      ask: null,
    });
  }

  const nonCash = v.holdings.filter((h) => h.assetType !== 'cash');
  for (const h of nonCash) {
    if (!profile || h.pnlPct === null) continue;
    if (h.pnlPct <= -profile.maxDrawdownPct) {
      points.push({
        id: `maxloss:${h.id}`,
        severity: 'high',
        title: `${h.displayName} đang lỗ ${fmtPct(h.pnlPct)}`,
        reason: `Đã vượt mức lỗ tối đa ${profile.maxDrawdownPct}% bạn chấp nhận. Xem lại lý do mua ban đầu còn đúng không trước khi quyết định giữ, bán hay mua thêm.`,
        link: holdingLink(h),
        ask: `${h.displayName} đang lỗ ${fmtPct(h.pnlPct)}, vượt mức lỗ tối đa ${profile.maxDrawdownPct}% của tôi. Luận điểm đầu tư còn đúng không và tôi nên làm gì?`,
      });
    } else if (h.pnlPct <= -profile.maxDrawdownPct * NEAR_MAX_LOSS_RATIO) {
      points.push({
        id: `nearloss:${h.id}`,
        severity: 'medium',
        title: `${h.displayName} lỗ ${fmtPct(h.pnlPct)}, sắp chạm mức lỗ tối đa`,
        reason: `Mức lỗ tối đa bạn chấp nhận là ${profile.maxDrawdownPct}%. Nên chuẩn bị trước kế hoạch nếu giá giảm tiếp.`,
        link: holdingLink(h),
        ask: `${h.displayName} đang lỗ ${fmtPct(h.pnlPct)}, gần mức lỗ tối đa ${profile.maxDrawdownPct}% của tôi. Tôi nên chuẩn bị kế hoạch gì?`,
      });
    }
  }

  // Tập trung: chỉ khi danh mục có từ 2 tài sản trở lên mới có ý nghĩa
  if (v.holdings.length > 1) {
    for (const h of nonCash) {
      if (h.weightPct > CONCENTRATION_PCT) {
        points.push({
          id: `concentration:${h.id}`,
          severity: 'medium',
          title: `${h.displayName} chiếm ${fmtPct(h.weightPct)} danh mục`,
          reason: `Một tài sản trên ${CONCENTRATION_PCT}% tổng tài sản khiến danh mục phụ thuộc nhiều vào riêng nó.`,
          link: holdingLink(h),
          ask: `${h.displayName} chiếm ${fmtPct(h.weightPct)} danh mục của tôi. Như vậy có quá tập trung so với khẩu vị rủi ro của tôi không?`,
        });
      }
    }
  }

  const reference = profile ? REFERENCE_ALLOCATION[profile.riskType] : undefined;
  if (profile && reference && v.holdings.length) {
    const actual: Record<AssetType, number> = { stock: 0, crypto: 0, gold: 0, cash: 0 };
    for (const h of v.holdings) actual[h.assetType] += h.weightPct;
    for (const type of Object.keys(actual) as AssetType[]) {
      const refKey = Object.keys(reference).find(TYPE_TO_REFERENCE[type]);
      if (!refKey) continue;
      const diff = actual[type] - reference[refKey];
      if (diff > ALLOCATION_DRIFT_PTS) {
        const label = { stock: 'Cổ phiếu', crypto: 'Crypto', gold: 'Vàng', cash: 'Tiền mặt / tiết kiệm' }[type];
        const refText = `${label} chiếm ${fmtPct(actual[type])}, mức tham khảo cho kiểu nhà đầu tư ${RISK_TYPE_LABEL[profile.riskType] ?? profile.riskType} là ${reference[refKey]}%.`;
        // Một tài sản đã bị nhắc tập trung gần như là cả nhóm này: gộp vào điểm đó thay vì nhắc hai lần
        const concentrated = points.filter(
          (p) =>
            p.id.startsWith('concentration:') &&
            v.holdings.find((h) => `concentration:${h.id}` === p.id)?.assetType === type,
        );
        const concentratedWeight = sum(
          concentrated.map((p) => v.holdings.find((h) => `concentration:${h.id}` === p.id)!.weightPct),
        );
        if (concentrated.length && concentratedWeight >= actual[type] * 0.9) {
          for (const p of concentrated) p.reason += ` ${refText}`;
          continue;
        }
        points.push({
          id: `allocation:${type}`,
          severity: 'info',
          title: `${label} chiếm ${fmtPct(actual[type])}, cao hơn mức tham khảo ${reference[refKey]}%`,
          reason: `Mức tham khảo cho kiểu nhà đầu tư ${RISK_TYPE_LABEL[profile.riskType] ?? profile.riskType}. Đây là mốc gợi ý, không phải quy tắc bắt buộc.`,
          link: '/portfolio',
          ask: `Phân bổ ${label.toLowerCase()} của tôi đang là ${fmtPct(actual[type])}, cao hơn mức tham khảo ${reference[refKey]}%. Có cần cân đối lại không?`,
        });
      }
    }
  }

  for (const a of alerts) {
    if (a.currentPrice === null || !a.targetPrice) continue;
    const gapPct = ((a.targetPrice - a.currentPrice) / a.currentPrice) * 100;
    const approaching = a.direction === 'above' ? gapPct > 0 : gapPct < 0;
    if (!approaching || Math.abs(gapPct) > NEAR_ALERT_PCT) continue;
    const name = a.assetType === 'crypto' ? a.symbol.replace(/USDT$/, '') : a.symbol;
    points.push({
      id: `alert:${a.id}`,
      severity: 'info',
      title: `${name} còn ${fmtPct(gapPct)} nữa chạm mốc cảnh báo`,
      reason: `Mốc bạn đặt: giá ${a.direction === 'above' ? '≥' : '≤'} ${a.targetPrice.toLocaleString('vi-VN')}${a.assetType === 'crypto' ? ' USDT' : ' ₫'}. Nếu chạm, bạn định làm gì?`,
      link: holdingLink({ assetType: a.assetType as AssetType, symbol: a.symbol }),
      ask: null,
    });
  }

  if (v.dataQuality.status !== 'ok') {
    points.push({
      id: 'data',
      severity: 'info',
      title:
        v.dataQuality.status === 'partial'
          ? 'Có tài sản chưa có giá thị trường'
          : 'Có giá cũ hoặc dùng tỷ giá dự phòng',
      reason: v.dataQuality.messages.join(' '),
      link: '/portfolio',
      ask: null,
    });
  }

  const order = { high: 0, medium: 1, info: 2 };
  return points.sort((a, b) => order[a.severity] - order[b.severity]);
}

function sum(xs: number[]) {
  return xs.reduce((a, b) => a + b, 0);
}
