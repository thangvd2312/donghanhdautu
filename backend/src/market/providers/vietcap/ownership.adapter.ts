import { Injectable } from '@nestjs/common';
import { round } from './numbers';
import { VietcapHttpClient } from './vietcap-http.client';

/** Cổ đông lớn và giao dịch của người nội bộ */
@Injectable()
export class VietcapOwnershipAdapter {
  constructor(private readonly http: VietcapHttpClient) {}

  /** Cổ đông lớn còn cập nhật (bỏ các bản ghi cũ hơn 18 tháng so với kỳ công bố mới nhất) */
  async shareholders(symbol: string) {
    return this.http.cached(`sh:${symbol}`, 12 * 3600_000, async () => {
      const res = await this.http.get<{ data: VcShareholder[] | null }>('iq', `/company/${symbol}/shareholder`);
      const rows = (res.data ?? []).filter((r) => r.publicDate && r.percentage);
      if (!rows.length) return null;
      const latest = rows
        .map((r) => r.publicDate)
        .sort()
        .at(-1)!;
      const cutoff = new Date(latest);
      cutoff.setMonth(cutoff.getMonth() - 18);
      // Bỏ người nắm dưới 0,1% — không phải cổ đông lớn theo nghĩa thông thường
      const fresh = rows
        .filter((r) => new Date(r.publicDate) >= cutoff && r.percentage >= 0.001)
        .sort((a, b) => b.percentage - a.percentage);
      const top = fresh.slice(0, 10);
      return {
        latestDisclosure: latest,
        note: 'Theo công bố gần nhất của từng cổ đông, chỉ người nắm từ 0,1% trở lên. Bản ghi cũ hơn 18 tháng so với kỳ công bố mới nhất đã bị loại vì có thể không còn đúng.',
        top: top.map((r) => ({
          name: r.ownerName,
          type: r.ownerType === 'INDIVIDUAL' ? 'cá nhân' : 'tổ chức',
          position: r.positionName ?? undefined,
          ownershipPct: round(r.percentage * 100, 2),
          asOf: r.publicDate,
        })),
        top10TotalPct: round(top.reduce((s, r) => s + r.percentage, 0) * 100, 2),
        excludedStale: rows.filter((r) => new Date(r.publicDate) < cutoff).length,
      };
    });
  }

  /** Giao dịch của người nội bộ và người liên quan đã hoàn tất trong 12 tháng (không tính cổ phiếu thưởng/ESOP) */
  async insiderTrades(symbol: string) {
    return this.http.cached(`insider:${symbol}`, 6 * 3600_000, async () => {
      const res = await this.http.get<{ data: { content: VcInsider[] } | null }>(
        'iq',
        `/company/${symbol}/insider-transaction?page=0&size=200`,
      );
      const since = new Date();
      since.setFullYear(since.getFullYear() - 1);
      const done = (res.data?.content ?? []).filter(
        (r) =>
          r.tradeStatusVi === 'Đã thực hiện xong' &&
          (r.actionTypeCode === 'B' || r.actionTypeCode === 'S') &&
          new Date(r.publicDate) >= since,
      );
      // Vietcap ghi khối lượng bán là số âm; một số bản ghi "đã thực hiện" không có khối lượng
      const shares = (r: VcInsider) =>
        Math.abs(r.shareAcquire || 0) || Math.abs((r.shareAfterTrade || 0) - (r.shareBeforeTrade || 0)) || null;
      const total = (code: string) =>
        done.filter((r) => r.actionTypeCode === code).reduce((s, r) => s + (shares(r) ?? 0), 0);
      const bought = total('B');
      const sold = total('S');
      return {
        period: '12 tháng gần nhất',
        note: 'Chỉ tính giao dịch đã hoàn tất (không tính đăng ký chưa thực hiện, không tính cổ phiếu thưởng/ESOP). Người liên quan = người thân hoặc tổ chức liên quan của lãnh đạo.',
        sharesBought: bought,
        sharesSold: sold,
        net: bought - sold,
        count: done.length,
        withoutVolume: done.filter((r) => shares(r) == null).length,
        recent: done.slice(0, 10).map((r) => ({
          date: r.endDate?.slice(0, 10) ?? r.publicDate.slice(0, 10),
          trader: r.traderNameVi ?? r.eventTitleVi?.split(' - ')[0] ?? 'không rõ',
          position: r.traderPositionVi ?? undefined,
          relatedTo: r.relativeNameVi && r.relativeNameVi !== r.traderNameVi ? r.relativeNameVi : undefined,
          action: r.actionTypeVi,
          shares: shares(r) ?? 'chưa ghi nhận khối lượng',
          ownershipAfterPct: r.ownershipAfterTrade ? round(r.ownershipAfterTrade * 100, 3) : undefined,
        })),
      };
    });
  }
}

interface VcShareholder {
  ownerName: string;
  ownerType: string;
  positionName: string | null;
  percentage: number;
  publicDate: string;
}

interface VcInsider {
  publicDate: string;
  endDate?: string;
  traderNameVi: string | null;
  eventTitleVi?: string;
  shareBeforeTrade?: number | null;
  shareAfterTrade?: number | null;
  traderPositionVi?: string | null;
  relativeNameVi?: string | null;
  actionTypeCode: string;
  actionTypeVi: string;
  tradeStatusVi: string;
  shareAcquire: number;
  ownershipAfterTrade?: number | null;
}
