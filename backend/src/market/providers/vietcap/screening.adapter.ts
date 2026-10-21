import { Injectable } from '@nestjs/common';
import { VietcapHttpClient } from './vietcap-http.client';

/** Tiêu chí lọc của Vietcap (rút gọn phần dùng tới) */
export interface VcScreenCriterion {
  name: string;
  conditionOptions?: { type: string; value?: string; viName?: string }[];
  conditionExtra2?: { name: string; viName?: string; isDefault?: boolean }[];
}

/**
 * Định dạng yêu cầu lọc của Vietcap (đã dò bằng gọi thật 21/10/2026, đối chiếu mã nguồn web iq.vietcap.com):
 *  - Dùng v1 /screening/paging: v2 chỉ nhận điều kiện kỹ thuật (indicators) và bỏ qua `filter`.
 *  - Mỗi phần tử filter: {name, extraName?, extraName2?, conditionOptions:[...]}. Khoảng: [{type:"range", from?, to?}] (đơn vị THÔ:
 *    marketCap/adtv nhân multiplier 1e9 = VND); chọn nhiều: [{type:"value", value}] (exchange: hsx|hnx|upcom, sectorLv1: mã ICB).
 *  - adtv bắt buộc extraName (10Days|20Days|30Days), growth cần extraName (Yoy|Qoq) (+ extraName2 Qm1..Qm4 cho npatmiGrowth), thiếu thì 500.
 *  - Các điều kiện AND với nhau; mã thiếu dữ liệu của chỉ tiêu được lọc không xuất hiện. Phân trang: page từ 0, pageSize (tới 200 chạy được).
 *  - sortFields/sortOrders: tên trường trong kết quả (marketCap, marketPrice, ttmPe, adtv30Days...), sortOrders "ASC"|"DESC".
 *  - Kết quả mỗi dòng chỉ chứa giá trị của các chỉ tiêu ĐANG LỌC (+ marketCap, marketPrice, dailyPriceChangePercent) dưới tên trường
 *    riêng: ttmPe, ttmPb, ttmRoe, adtv30Days, npatmiGrowthYoyQm1, revenueGrowthYoy, netMargin, grossMargin.
 *  - ttmPe 0 là mã không có lợi nhuận/không có dữ liệu và có thể âm: cần chặn dưới > 0 để loại.
 */
export interface VcScreenRequest {
  page: number;
  pageSize: number;
  sortFields: string[];
  sortOrders: ('ASC' | 'DESC')[];
  filter: VcScreenFilter[];
}

export interface VcScreenFilter {
  name: string;
  extraName?: string;
  extraName2?: string;
  conditionOptions: ({ type: 'range'; from?: number; to?: number } | { type: 'value'; value: string })[];
}

export interface VcScreenRow {
  ticker: string;
  exchange: string;
  viOrganShortName?: string;
  marketPrice?: number;
  marketCap?: number;
  dailyPriceChangePercent?: number;
  [field: string]: unknown;
}

export interface VcScreenPage {
  content: VcScreenRow[];
  totalElements: number;
  totalPages: number;
}

/** Bộ lọc cổ phiếu của Vietcap iq */
@Injectable()
export class VietcapScreeningAdapter {
  constructor(private readonly http: VietcapHttpClient) {}

  /** Tiêu chí lọc của Vietcap (nhãn ngành tiếng Việt, kỳ số liệu của các chỉ tiêu tăng trưởng); đổi rất ít nên cache 1 ngày */
  async screeningCriteria(): Promise<VcScreenCriterion[]> {
    return this.http.cached('screening:criteria', 24 * 3600_000, async () => {
      const res = await this.http.get<{ data: VcScreenCriterion[] | null }>('iq', '/screening/criteria');
      if (!Array.isArray(res.data)) throw new Error('Vietcap screening criteria: dữ liệu rỗng');
      return res.data;
    });
  }

  /**
   * Một trang kết quả lọc (v1 /screening/paging). Nguồn hay trả rỗng/lỗi thoáng qua, nên thử lại một lần.
   * Cache 10 phút theo nội dung yêu cầu.
   */
  async screeningPage(body: VcScreenRequest): Promise<VcScreenPage> {
    return this.http.cached(`screening:${JSON.stringify(body)}`, 10 * 60_000, async () => {
      const call = () =>
        this.http.post<{ status: number; exception: string | null; data: VcScreenPage | null }>(
          'iq',
          '/screening/paging',
          body,
        );
      let res = await call().catch(() => null);
      if (res?.status !== 200 || !res.data) res = await call();
      if (res.status !== 200 || !res.data) throw new Error(`Vietcap screening ${res.status} ${res.exception ?? ''}`);
      return res.data;
    });
  }
}
