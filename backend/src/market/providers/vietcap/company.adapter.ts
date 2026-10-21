import { Injectable } from '@nestjs/common';
import type { StatRow } from '../../fundamentals';
import { stripHtml } from './html';
import { pct, round } from './numbers';
import { VietcapHttpClient } from './vietcap-http.client';

/** Hồ sơ doanh nghiệp và chỉ số tài chính TTM theo quý */
@Injectable()
export class VietcapCompanyAdapter {
  constructor(private readonly http: VietcapHttpClient) {}

  async company(symbol: string) {
    return this.http.cached(`company:${symbol}`, 6 * 3600_000, async () => {
      const res = await this.http.get<{ data: Record<string, unknown> | null }>('iq', `/company/${symbol}`);
      const d = res.data;
      if (!d) return null;
      return {
        ticker: d.ticker,
        name: d.viOrganName,
        sector: d.sectorVn,
        isBank: d.isBank,
        /** NH ngân hàng, CK chứng khoán, BH bảo hiểm, CT doanh nghiệp thường */
        companyType: d.comTypeCode as string | undefined,
        marketCapBn: Math.round(Number(d.marketCap) / 1e9),
        sharesOutstanding: d.numberOfSharesMktCap,
        high52w: d.highestPrice1Year,
        low52w: d.lowestPrice1Year,
        avgMatchValue1mBn: Math.round(Number(d.averageMatchValue1Month) / 1e9),
        foreignOwnershipPct: pct(d.foreignerPercentage),
        foreignRoomMaxPct: pct(d.maximumForeignPercentage),
        stateOwnershipPct: pct(d.statePercentage),
        freeFloatPct: pct(d.freeFloatPercentage),
        listingDate: d.listingDate,
        analystView: d.rating
          ? {
              source: 'Vietcap Research',
              rating: d.rating,
              ratingAsOf: d.ratingAsOf,
              targetPrice: d.targetPrice,
              upsidePct: pct(d.upsideToTargetPercent),
              previous: d.prevInsight,
            }
          : null,
        profile: stripHtml(typeof d.profile === 'string' ? d.profile : '').slice(0, 1500),
      };
    });
  }

  /** Chỉ số tài chính TTM theo quý, 8 quý gần nhất */
  async ratios(symbol: string) {
    return this.http.cached(`ratios:${symbol}`, 6 * 3600_000, async () => {
      // quarter = 5 là số liệu cả năm, trùng với quý 4 — bỏ đi
      const rows = (await this.statsRaw(symbol))
        .filter((r) => Number(r.quarter) >= 1 && Number(r.quarter) <= 4)
        .sort((a, b) => Number(a.yearReport) - Number(b.yearReport) || Number(a.quarter) - Number(b.quarter))
        .slice(-8);
      const keep = [
        'pe',
        'pb',
        'ps',
        'evToEbitda',
        'roe',
        'roa',
        'roic',
        'grossMargin',
        'afterTaxProfitMargin',
        'debtToEquity',
        'currentRatio',
        'quickRatio',
        'dividendYield',
        'marketCap',
        'netInterestMargin',
        'npl',
        'casaRatio',
        'ldrLoanDepositRatio',
        'costToIncome',
        'car',
        'loansGrowth',
        'depositGrowth',
      ];
      return rows.map((r) => {
        const o: Record<string, number | string> = { period: `Q${r.quarter}/${r.yearReport}` };
        for (const k of keep) {
          const v = r[k];
          if (v === null || v === undefined || v === 0) continue;
          // Vietcap gọi là debtToEquity nhưng thực chất là tổng nợ phải trả / vốn chủ — đổi tên cho khỏi nhầm
          // với "nợ vay / vốn chủ" của bảng cân đối kế toán
          const key = k === 'debtToEquity' ? 'liabilitiesToEquity' : k;
          o[key] = k === 'marketCap' ? Math.round(Number(v) / 1e9) : round(Number(v), 4);
        }
        return o;
      });
    });
  }

  /** Bảng P/E, P/B… TTM theo từng quý (từ 2018) — dùng chung cho ratios() và dải định giá lịch sử */
  async statsRaw(symbol: string): Promise<(StatRow & Record<string, number | string | null>)[]> {
    return this.http.cached(`stats:${symbol}`, 6 * 3600_000, async () => {
      const res = await this.http.get<{ data: (StatRow & Record<string, number | string | null>)[] | null }>(
        'iq',
        `/company/${symbol}/statistics-financial`,
      );
      return res.data ?? [];
    });
  }
}
