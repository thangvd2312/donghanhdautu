import { Injectable } from '@nestjs/common';
import { MarketDataCache } from '../../cache/market-data-cache';
import { VIETCAP_POLICIES, vietcapKey } from '../../cache/vietcap-cache-policy';
import { VietcapHttpClient } from './vietcap-http.client';

export interface CorporateEvent {
  symbol: string;
  kind: 'stock' | 'cash';
  title: string;
  /** Ngày giao dịch không hưởng quyền (YYYY-MM-DD) */
  exDate: string;
  recordDate: string | null;
  payoutDate: string | null;
  /** stock: số cổ phiếu nhận thêm cho mỗi cổ phiếu đang giữ (0.1 = 10%) */
  ratio: number | null;
  /** cash: VND / cổ phiếu, trước thuế */
  valuePerShare: number | null;
}

/**
 * Sự kiện quyền toàn thị trường, nguyên văn từ Vietcap (đã kiểm tra bằng gọi thật 21/10/2026, 4 tháng, 143 sự kiện DIV/ISS/AGME/EGME):
 *  - ngày dạng "YYYY-MM-DDT00:00:00" (lịch VN); phân trang size<=500, totalElements đủ cho cả cửa sổ 120 ngày.
 *  - Sự kiện mới công bố có thể CHƯA có exrightDate/recordDate (chỉ displayDate1 = ngày công bố): không đủ để xếp lịch.
 *  - DIV: exrightDate = GDKHQ, recordDate = chốt danh sách, payoutDate = thanh toán, valuePerShare = VND/cp (exerciseRatio = %/mệnh giá).
 *  - ISS: eventTitleEn "Rights issue" = quyền mua (KHÔNG có trường giá phát hành), "Bonus Issue"/"Stock dividend" = cổ phiếu thưởng /
 *    cổ tức bằng CP; còn lại (ESOP, Private Placements, Convertible Bonds) không phải quyền của cổ đông hiện hữu. exerciseRatio = tỷ lệ (0.5 = 50%).
 *  - AGME/EGME: exrightDate = GDKHQ để được dự họp, recordDate = ngày chốt, issueDate = ngày họp (không phải lúc nào cũng có;
 *    displayDate1 là ngày họp nếu có issueDate, còn không thì bằng exrightDate nên không dùng làm ngày họp).
 */
export interface VcMarketEvent {
  id: string;
  ticker: string;
  organNameVi?: string;
  eventCode: string;
  eventTitleVi?: string;
  eventTitleEn?: string;
  publicDate?: string;
  issueDate?: string;
  recordDate?: string;
  exrightDate?: string;
  payoutDate?: string;
  exerciseRatio?: number;
  valuePerShare?: number;
}

export interface MarketEvents {
  events: VcMarketEvent[];
  fetchedAt: string;
}

interface VcEvent {
  eventCode?: string;
  eventNameVi?: string;
  eventTitleVi?: string;
  eventTitleEn?: string;
  exrightDate?: string;
  recordDate?: string;
  payoutDate?: string;
  exerciseRatio?: number;
  valuePerShare?: number;
}

/** Sự kiện quyền (cổ tức, phát hành, họp cổ đông) của một mã hoặc của toàn thị trường */
@Injectable()
export class VietcapEventsAdapter {
  constructor(
    private readonly http: VietcapHttpClient,
    private readonly cache: MarketDataCache,
  ) {}

  /**
   * Sự kiện quyền làm thay đổi số cổ phiếu / tiền của cổ đông hiện hữu: cổ phiếu thưởng, cổ tức bằng cổ phiếu,
   * chia tách (kind = stock, ratio = số cổ phiếu nhận thêm cho mỗi cổ phiếu đang giữ) và cổ tức tiền mặt
   * (kind = cash, VND / cổ phiếu). Bỏ ESOP, phát hành riêng lẻ, chuyển đổi trái phiếu, quyền mua (phải tự mua).
   */
  async corporateEvents(symbol: string): Promise<CorporateEvent[]> {
    return this.cache.get(vietcapKey('events', symbol), VIETCAP_POLICIES.corporateEvents, async () => {
      const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
      const res = await this.http.get<{ data: { content?: VcEvent[] } | VcEvent[] | null }>(
        'iq',
        `/events?ticker=${symbol}&fromDate=20180101&toDate=${ymd(new Date(Date.now() + 180 * 86_400_000))}&eventCode=DIV,ISS&page=0&size=200`,
      );
      const items = Array.isArray(res.data) ? res.data : (res.data?.content ?? []);
      const out: CorporateEvent[] = [];
      for (const e of items) {
        const exDate = e.exrightDate?.slice(0, 10);
        if (!exDate) continue;
        const base = {
          symbol,
          title: e.eventTitleVi ?? e.eventNameVi ?? '',
          exDate,
          recordDate: e.recordDate?.slice(0, 10) ?? null,
          payoutDate: e.payoutDate?.slice(0, 10) ?? null,
        };
        if (e.eventCode === 'DIV' && e.valuePerShare && e.valuePerShare > 0) {
          out.push({ ...base, kind: 'cash', valuePerShare: e.valuePerShare, ratio: null });
        } else if (
          e.eventCode === 'ISS' &&
          /bonus issue|stock dividend|split/i.test(e.eventTitleEn ?? '') &&
          e.exerciseRatio &&
          e.exerciseRatio > 0
        ) {
          out.push({ ...base, kind: 'stock', ratio: e.exerciseRatio, valuePerShare: null });
        }
      }
      return out.sort((a, b) => a.exDate.localeCompare(b.exDate));
    });
  }

  /**
   * Sự kiện quyền (DIV, ISS, AGME, EGME) của TOÀN thị trường trong khoảng ngày, một lần gọi (phân trang nếu cần),
   * cache 1 giờ theo khoảng ngày (bền qua khởi động lại, dùng tạm bản cũ tối đa 3 ngày khi nguồn lỗi). Lỗi nguồn thì ném lỗi — nơi gọi quyết định hiển thị "chưa lấy được".
   */
  async marketEvents(fromDate: string, toDate: string): Promise<MarketEvents> {
    return this.cache.get(vietcapKey('marketEvents', fromDate, toDate), VIETCAP_POLICIES.marketEvents, async () => {
      const ymd = (d: string) => d.replace(/-/g, '');
      const events: VcMarketEvent[] = [];
      for (let page = 0; page < 10; page++) {
        const res = await this.http.get<{ data: { content?: VcMarketEvent[]; totalPages?: number } | null }>(
          'iq',
          `/events?fromDate=${ymd(fromDate)}&toDate=${ymd(toDate)}&eventCode=DIV,ISS,AGME,EGME&page=${page}&size=500`,
        );
        if (!res.data || !Array.isArray(res.data.content)) throw new Error('Vietcap events: phản hồi không đúng dạng');
        events.push(...res.data.content);
        if (page + 1 >= (res.data.totalPages ?? 1)) break;
      }
      return { events, fetchedAt: new Date().toISOString() };
    });
  }
}
