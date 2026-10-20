/**
 * Phần số liệu của bản tổng kết tuần, dựng bằng code từ sổ giao dịch + lịch sử giá (không qua AI),
 * để con số luôn khớp với trang Danh mục. AI chỉ viết phần nhận định bên dưới.
 */
import type { HistoryService } from '../portfolio/history.service';

export type WeekSummary = NonNullable<Awaited<ReturnType<HistoryService['weekSummary']>>>;

const TYPE_LABEL: Record<string, string> = { stock: 'Cổ phiếu', crypto: 'Crypto', gold: 'Vàng', cash: 'Tiền mặt' };

export function money(v: number) {
  const a = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  if (a >= 1e9) return `${sign}${(a / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tỷ`;
  if (a >= 1e6) return `${sign}${(a / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} triệu`;
  return `${sign}${Math.round(a).toLocaleString('vi-VN')} ₫`;
}

const signed = (v: number) => (v > 0 ? `+${money(v)}` : money(v));
const pct = (v: number | null) =>
  v === null
    ? '—'
    : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%`;
const day = (d: string) => d.split('-').reverse().slice(0, 2).join('/');

/** Bảng markdown các con số chính của tuần */
export function weeklyTable(s: WeekSummary) {
  const p = s.period;
  const lines: string[] = [];
  lines.push(`**Số liệu tuần ${day(s.from)} – ${day(s.to)}** (tính từ sổ giao dịch, không qua AI)`, '');
  lines.push('| | |', '|---|---|');
  if (p) {
    lines.push(`| Tổng tài sản | ${money(p.endValue)} (đầu kỳ ${money(p.startValue)}) |`);
    lines.push(`| Tiền nạp / rút trong tuần | ${p.netFlows ? signed(p.netFlows) : 'không có'} |`);
    lines.push(
      `| Lãi / lỗ trong tuần | **${signed(p.profit)}** (${pct(p.returnPct)})${p.isEstimate ? ' — ước tính' : ''} |`,
    );
  }
  lines.push(`| Lãi / lỗ luỹ kế so với vốn | ${signed(s.endPoint.profit)} |`);

  const movers = s.assets
    .filter((a) => a.assetType !== 'cash' && a.priceEffect !== null && Math.round(a.priceEffect) !== 0)
    .sort((a, b) => Math.abs(b.priceEffect!) - Math.abs(a.priceEffect!))
    .slice(0, 5);
  if (movers.length) {
    lines.push(
      '',
      '**Tác động của biến động giá lên tài sản đang giữ**',
      '',
      '| Tài sản | Giá trong tuần | Ảnh hưởng |',
      '|---|---|---|',
    );
    for (const a of movers) {
      lines.push(`| ${a.name}${a.tradedThisWeek ? ' *' : ''} | ${pct(a.priceChangePct)} | ${signed(a.priceEffect!)} |`);
    }
    if (movers.some((a) => a.tradedThisWeek))
      lines.push('', '\\* có mua/bán trong tuần; ảnh hưởng tính trên số đang giữ đầu tuần.');
  }

  if (s.allocationStart) {
    const types = [...new Set([...Object.keys(s.allocationStart), ...Object.keys(s.allocationEnd)])];
    const changed = types
      .map((t) => ({ t, a: s.allocationStart![t] ?? 0, b: s.allocationEnd[t] ?? 0 }))
      .filter((x) => Math.abs(x.b - x.a) >= 1);
    if (changed.length) {
      lines.push(
        '',
        `**Phân bổ thay đổi:** ${changed
          .map((x) => `${TYPE_LABEL[x.t] ?? x.t} ${Math.round(x.a)}% → ${Math.round(x.b)}%`)
          .join(' · ')}`,
      );
    }
  }
  const notes = [...(p?.notes ?? []), ...s.notes];
  if (s.assets.some((a) => !a.priced)) notes.push('Có tài sản thiếu giá, phần đó được tạm tính theo giá vốn.');
  if (notes.length) lines.push('', `_${notes.join(' ')}_`);
  return lines.join('\n');
}
