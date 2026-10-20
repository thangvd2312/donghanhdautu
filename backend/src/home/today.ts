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

/**
 * Danh mục tăng/giảm bao nhiêu hôm nay và do tài sản nào, tính từ % thay đổi trong ngày của từng tài sản.
 * Chưa có sổ giao dịch nên giả định số lượng nắm giữ không đổi trong ngày; tài sản sửa/thêm hôm nay được nêu rõ.
 */
export function dayChange(v: Valuation, changedTodayIds: Set<string> = new Set()) {
  const rows = v.holdings.map((h) => {
    const value = h.marketValue;
    // Giá trị lúc đầu kỳ = giá trị hiện tại / (1 + %thay đổi)
    const change =
      h.assetType === 'cash'
        ? 0
        : value !== null && h.dayChangePct !== null && h.dayChangePct > -100
          ? value - value / (1 + h.dayChangePct / 100)
          : null;
    return { h, change };
  });
  const known = rows.filter((r) => r.change !== null);
  const changeVnd = known.reduce((s, r) => s + r.change!, 0);
  const valueNow = known.reduce((s, r) => s + (r.h.marketValue ?? 0), 0);
  const base = valueNow - changeVnd;

  const contributors = known
    .filter((r) => r.h.assetType !== 'cash' && Math.round(r.change!) !== 0)
    .map((r) => ({
      id: r.h.id,
      assetType: r.h.assetType,
      symbol: r.h.symbol,
      displayName: r.h.displayName,
      link: holdingLink(r.h),
      changeVnd: r.change!,
      dayChangePct: r.h.dayChangePct!,
      weightPct: r.h.weightPct,
      basis: DAY_BASIS[r.h.assetType],
    }));

  const missing = rows.filter((r) => r.change === null).map((r) => r.h.displayName);
  const changedToday = v.holdings
    .filter((h) => h.assetType !== 'cash' && changedTodayIds.has(h.id))
    .map((h) => h.displayName);
  const notes: string[] = [];
  if (missing.length) notes.push(`Chưa có dữ liệu thay đổi trong ngày của ${missing.join(', ')} nên chưa tính vào.`);
  if (changedToday.length) {
    notes.push(
      `${changedToday.join(', ')} vừa được thêm/sửa hôm nay: con số giả định bạn đã nắm giữ số lượng hiện tại từ đầu ngày.`,
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
