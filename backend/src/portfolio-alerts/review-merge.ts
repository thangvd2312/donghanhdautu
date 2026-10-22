import type { PortfolioAlertCheck, PortfolioAlertKind, ReviewPoint } from '@dautu/contracts';
import { evaluateConcentration, evaluateDrift } from './evaluators';
import type { ValuationLite } from './evaluators';
import { ALERT_LINK } from './notify';
import { fmt } from './rule-config';
import type { RuleConfig } from './rule-config';

/** Kết quả giảm từ đỉnh lưu lại (worker chạy sau phiên) chỉ hiện ở trang Hôm nay trong khoảng này */
const STORED_CHECK_TTL_MS = 36 * 3600_000;

// ---------------------------------------------------------------------------------------------------------------------
// Trang Hôm nay — "Cần xem lại"

/**
 * Đưa các quy tắc người dùng đã bật vào danh sách "Cần xem lại" để trang Hôm nay nói cùng một điều với thông báo:
 *  - tập trung: bật thì thay điểm tập trung mặc định (ngưỡng 30%) bằng ngưỡng của người dùng;
 *  - lệch tỷ trọng: bật thì thay điểm so với mức tham khảo theo kiểu nhà đầu tư bằng mục tiêu người dùng tự đặt;
 *  - giảm từ đỉnh: lấy kết quả worker đã kiểm tra (cần lịch sử giá nên không tính lại mỗi lần mở trang).
 * Quy tắc bị bỏ qua vì dữ liệu chưa tin cậy thì không tạo điểm (điểm "giá cũ / thiếu giá" đã có sẵn).
 */
export function mergeReviewPoints(
  existing: ReviewPoint[],
  v: ValuationLite,
  rules: RuleConfig[],
  drawdownCheck: PortfolioAlertCheck | null,
  now: Date,
): ReviewPoint[] {
  const on = (k: PortfolioAlertKind) => rules.find((r) => r.kind === k && r.enabled);
  const conc = on('concentration');
  const drift = on('drift');
  const dd = on('drawdown');
  let out = existing;
  const added: ReviewPoint[] = [];
  if (conc) {
    out = out.filter((p) => !p.id.startsWith('concentration:'));
    const e = evaluateConcentration(v, conc.thresholdPct);
    if (e.status === 'firing') {
      for (const it of e.items) {
        const h = v.holdings.find((x) => `${x.assetType}:${x.symbol}` === it.key)!;
        added.push({
          id: `concentration:${h.id}`,
          severity: 'medium',
          title: `${it.label} chiếm ${fmt(it.value)}% danh mục`,
          reason: `Trên ngưỡng ${fmt(conc.thresholdPct)}% bạn đặt trong Cảnh báo danh mục. Một tài sản chiếm tỷ trọng lớn khiến danh mục phụ thuộc nhiều vào riêng nó.`,
          link: ALERT_LINK,
          ask: `${it.label} chiếm ${fmt(it.value)}% danh mục của tôi, trên ngưỡng ${fmt(conc.thresholdPct)}% tôi tự đặt. Như vậy có quá tập trung so với khẩu vị rủi ro của tôi không?`,
        });
      }
    }
  }
  if (drift && drift.targets) {
    out = out.filter((p) => !p.id.startsWith('allocation:'));
    const e = evaluateDrift(v, drift.targets, drift.thresholdPct);
    if (e.status === 'firing') {
      for (const it of e.items) {
        const diff = it.value - it.reference;
        added.push({
          id: `allocation:${it.key}`,
          severity: 'info',
          title: `${it.label} ${fmt(it.value)}%, mục tiêu của bạn ${fmt(it.reference)}%`,
          reason: `${diff > 0 ? 'Cao' : 'Thấp'} hơn mục tiêu ${fmt(diff)} điểm, vượt ngưỡng lệch ${fmt(drift.thresholdPct)} điểm bạn đặt. Đây là mốc bạn tự đặt, không phải quy tắc bắt buộc.`,
          link: '/rebalance',
          ask: `Tỷ trọng ${it.label.toLowerCase()} của tôi là ${fmt(it.value)}%, mục tiêu tôi đặt là ${fmt(it.reference)}%. Có nên cân đối lại không, và nếu có thì theo cách nào ít tốn phí nhất?`,
        });
      }
    }
  }
  if (
    dd &&
    drawdownCheck &&
    drawdownCheck.status === 'firing' &&
    now.getTime() - Date.parse(drawdownCheck.at) < STORED_CHECK_TTL_MS
  ) {
    added.push({
      id: 'drawdown',
      severity: 'medium',
      title: drawdownCheck.title,
      reason: drawdownCheck.reason,
      link: ALERT_LINK,
      ask: `${drawdownCheck.title}. Tôi nên xem lại điều gì trong kế hoạch và mức rủi ro của mình?`,
    });
  }
  const order = { high: 0, medium: 1, info: 2 };
  return [...out, ...added].sort((a, b) => order[a.severity] - order[b.severity]);
}
