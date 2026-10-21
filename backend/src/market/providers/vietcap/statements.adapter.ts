import { Injectable } from '@nestjs/common';
import type { BalanceSheet, CashFlowStatement, StatementRow } from '@dautu/contracts';
import { MarketDataCache } from '../../cache/market-data-cache';
import { VIETCAP_POLICIES, vietcapKey } from '../../cache/vietcap-cache-policy';
import type { CompanyKind } from '../../compare';
import { cashQuality, netDebt } from '../../fundamentals';
import { VietcapCompanyAdapter } from './company.adapter';
import { round } from './numbers';
import { safe } from './safe';
import { BANK_BS, CORP_BS, CORP_CF, KIND_LABEL, KIND_NOTE } from './statement-lines';
import { VietcapHttpClient } from './vietcap-http.client';

/** Báo cáo tài chính: KQKD, cân đối kế toán, lưu chuyển tiền tệ, và loại doanh nghiệp quyết định cách đọc chúng */
@Injectable()
export class VietcapStatementsAdapter {
  constructor(
    private readonly http: VietcapHttpClient,
    private readonly cache: MarketDataCache,
    private readonly companies: VietcapCompanyAdapter,
  ) {}

  /** Báo cáo KQKD: các dòng cấp 1, 5 năm + 6 quý gần nhất, đơn vị tỷ VND */
  async incomeStatement(symbol: string) {
    return this.cache.get(vietcapKey('statements', 'is', symbol), VIETCAP_POLICIES.statements, async () => {
      const [meta, data] = await Promise.all([this.metrics(symbol), this.statementRows(symbol, 'INCOME_STATEMENT')]);
      const lines = meta.INCOME_STATEMENT.filter(
        (m): m is VcMetric & { field: string } =>
          !!m.field && (m.level === 1 || /Tổng lợi nhuận|Tổng thu nhập hoạt động|Trích lập dự phòng/.test(m.titleVi)),
      );
      const pick = (row: Record<string, number>, label: string) => {
        const o: Record<string, number | string> = { period: label };
        for (const m of lines) {
          const v = row[m.field];
          if (typeof v !== 'number') continue;
          o[m.titleVi] = /cổ phiếu \(VND\)/.test(m.titleVi) ? v : round(v / 1e9, 1);
        }
        return o;
      };
      const years = data.years.slice(-5).map((r) => pick(r, `${r.yearReport}`));
      const quarters = data.quarters.slice(-6).map((r) => pick(r, `Q${r.lengthReport}/${r.yearReport}`));
      // Bỏ các dòng toàn 0 (vd. EPS pha loãng không được công bố)
      const empty = lines.map((m) => m.titleVi).filter((k) => [...years, ...quarters].every((r) => !r[k]));
      for (const r of [...years, ...quarters]) for (const k of empty) delete r[k];
      return { unit: 'tỷ VND (EPS: VND)', years, quarters };
    });
  }

  /** Báo cáo KQKD theo năm (tăng dần), nguyên mã trường và đơn vị VND — cho phép tính so sánh ở nơi khác */
  async incomeYears(symbol: string): Promise<Record<string, number>[]> {
    return (await this.statementRows(symbol, 'INCOME_STATEMENT')).years;
  }

  private metrics(symbol: string) {
    return this.cache.get(vietcapKey('metrics', symbol), VIETCAP_POLICIES.metrics, async () => {
      const res = await this.http.get<{ data: Record<string, VcMetric[]> }>(
        'iq',
        `/company/${symbol}/financial-statement/metrics`,
      );
      return res.data;
    });
  }

  /** Số liệu một báo cáo tài chính: năm tăng dần, quý (riêng từng quý, không cộng dồn) tăng dần */
  private statementRows(symbol: string, section: string) {
    return this.cache.get(vietcapKey('statements', 'fs', section, symbol), VIETCAP_POLICIES.statements, async () => {
      const res = await this.http.get<{
        data: { years: Record<string, number>[]; quarters: Record<string, number>[] };
      }>('iq', `/company/${symbol}/financial-statement?section=${section}`);
      const years = [...(res.data?.years ?? [])].sort((a, b) => a.yearReport - b.yearReport);
      const quarters = [...(res.data?.quarters ?? [])]
        .filter((r) => r.lengthReport >= 1 && r.lengthReport <= 4)
        .sort((a, b) => a.yearReport - b.yearReport || a.lengthReport - b.lengthReport);
      return { years, quarters };
    });
  }

  /**
   * Chọn các dòng quan trọng của một báo cáo theo mã trường. Dạng báo cáo khác (công ty chứng khoán,
   * bảo hiểm) không có đủ các trường này thì lấy các dòng cấp 1.
   */
  private async keyLines(symbol: string, section: 'BALANCE_SHEET' | 'CASH_FLOW', wanted: [string, string?][]) {
    const [meta, data] = await Promise.all([this.metrics(symbol), this.statementRows(symbol, section)]);
    const all = meta[section] ?? [];
    const byField = new Map(all.filter((m) => m.field).map((m) => [m.field as string, m]));
    let lines = wanted
      .filter(([f]) => byField.has(f))
      .map(([f, label]) => ({ field: f, label: label ?? byField.get(f)!.titleVi }));
    const standard = lines.length >= 5;
    if (!standard)
      lines = all.filter((m) => m.level === 1 && m.field).map((m) => ({ field: m.field as string, label: m.titleVi }));
    const pick = (row: Record<string, number>, period: string) => {
      const o: StatementRow = { period };
      for (const l of lines) {
        const v = row[l.field];
        // Mẫu báo cáo riêng có nhiều dòng không dùng (toàn 0) — bỏ cho gọn
        if (typeof v === 'number' && (standard || v !== 0)) o[l.field] = round(v / 1e9, 1);
      }
      return o;
    };
    return {
      standard,
      lines,
      years: data.years.slice(-5).map((r) => pick(r, `${r.yearReport}`)),
      quarters: data.quarters.map((r) => pick(r, `Q${r.lengthReport}/${r.yearReport}`)),
    };
  }

  /** Đổi mã trường sang tên dòng tiếng Việt cho dễ đọc */
  private labelled(rows: StatementRow[], lines: { field: string; label: string }[]) {
    return rows.map((r) => {
      const o: StatementRow = {};
      for (const [k, v] of Object.entries(r)) o[lines.find((l) => l.field === k)?.label ?? k] = v;
      return o;
    });
  }

  /** Loại doanh nghiệp quyết định cách đọc báo cáo tài chính; hồ sơ doanh nghiệp lỗi thì coi như doanh nghiệp thường */
  async kind(symbol: string): Promise<CompanyKind> {
    return this.classify(symbol, (load) => safe('company', load, null));
  }

  /**
   * Như kind() nhưng để lỗi nguồn nổi lên: dùng bên trong các hàm có kết quả được lưu cache, để một lần nguồn lỗi
   * không bị lưu thành báo cáo sai hình dạng (doanh nghiệp thường thay vì ngân hàng) trong nhiều giờ.
   */
  private kindStrict(symbol: string): Promise<CompanyKind> {
    return this.classify(symbol, (load) => load());
  }

  private async classify(
    symbol: string,
    loadCompany: (
      load: () => ReturnType<VietcapCompanyAdapter['company']>,
    ) => ReturnType<VietcapCompanyAdapter['company']>,
  ): Promise<CompanyKind> {
    const [meta, company] = await Promise.all([
      this.metrics(symbol),
      loadCompany(() => this.companies.company(symbol)),
    ]);
    if (company?.isBank || (meta.BALANCE_SHEET ?? []).some((m) => m.field === 'bsb103')) return 'bank';
    if (company?.companyType === 'CK') return 'securities';
    if (company?.companyType === 'BH') return 'insurance';
    return 'corporate';
  }

  /** Bảng cân đối kế toán: 5 năm + 4 quý gần nhất (số dư cuối kỳ), tỷ VND, kèm nợ vay ròng */
  async balanceSheet(symbol: string): Promise<BalanceSheet> {
    return this.cache.get(vietcapKey('statements', 'bs', symbol), VIETCAP_POLICIES.statements, async () => {
      const kind = await this.kindStrict(symbol);
      // Chứng khoán / bảo hiểm có mẫu báo cáo riêng: lấy các dòng cấp 1, không tính chỉ tiêu nợ vay ròng
      const k = await this.keyLines(
        symbol,
        'BALANCE_SHEET',
        kind === 'bank' ? BANK_BS : kind === 'corporate' ? CORP_BS : [],
      );
      const derive = (r: StatementRow): StatementRow => {
        if (kind !== 'corporate' || !k.standard) return r;
        const d = netDebt(r, { stDebt: 'bsa56', ltDebt: 'bsa71', cash: 'bsa2', stInv: 'bsa5' });
        const equity = typeof r.bsa78 === 'number' ? r.bsa78 : 0;
        return {
          ...r,
          'Tổng nợ vay (ngắn + dài hạn)': d.totalDebt,
          'Nợ vay ròng (nợ vay − tiền − đầu tư ngắn hạn; âm = tiền nhiều hơn nợ vay)': d.netDebt,
          'Nợ vay / Vốn chủ sở hữu (lần)': equity > 0 ? round(d.totalDebt / equity, 2) : '',
        };
      };
      return {
        unit: 'tỷ VND, số dư cuối kỳ',
        type: KIND_LABEL[kind],
        note: KIND_NOTE[kind],
        years: this.labelled(k.years.map(derive), k.lines),
        quarters: this.labelled(k.quarters.slice(-4).map(derive), k.lines),
      };
    });
  }

  /** Lưu chuyển tiền tệ: 5 năm + 4 quý gần nhất + tổng 4 quý (TTM), tỷ VND, kèm dòng tiền tự do */
  async cashFlow(symbol: string): Promise<CashFlowStatement> {
    return this.cache.get(vietcapKey('statements', 'cf', symbol), VIETCAP_POLICIES.statements, async () => {
      const kind = await this.kindStrict(symbol);
      if (kind !== 'corporate') return { type: KIND_LABEL[kind], note: KIND_NOTE[kind] };
      const k = await this.keyLines(symbol, 'CASH_FLOW', CORP_CF);
      const derive = (r: StatementRow): StatementRow => {
        if (!k.standard) return r;
        const q = cashQuality(r, { cfo: 'cfa18', capex: 'cfa19', pretax: 'cfa1' });
        return {
          ...r,
          'Dòng tiền tự do (kinh doanh + chi mua sắm TSCĐ)': q.freeCashFlow ?? '',
          'Dòng tiền kinh doanh / Lợi nhuận trước thuế (lần)': q.cfoToPretaxProfit ?? '',
        };
      };
      const last4 = k.quarters.slice(-4);
      const consecutive =
        last4.length === 4 &&
        last4.every(
          (r, i) => i === 0 || quarterIndex(String(r.period)) - quarterIndex(String(last4[i - 1].period)) === 1,
        );
      let ttm: StatementRow | null = null;
      if (consecutive) {
        ttm = { period: `TTM (${last4[0].period} – ${last4[3].period})` };
        for (const l of k.lines) {
          if (last4.every((r) => typeof r[l.field] === 'number')) {
            ttm[l.field] = round(
              last4.reduce((s, r) => s + Number(r[l.field]), 0),
              1,
            );
          }
        }
      }
      const years = k.years.map(derive);
      const sum = (f: string) => years.reduce((s, r) => s + (typeof r[f] === 'number' ? r[f] : 0), 0);
      return {
        unit: 'tỷ VND; số âm là tiền chi ra; số quý là riêng từng quý (không cộng dồn)',
        type: k.standard ? KIND_LABEL.corporate : 'mẫu báo cáo riêng — chỉ các dòng cấp 1',
        years: this.labelled(years, k.lines),
        quarters: this.labelled(last4.map(derive), k.lines),
        ttm: ttm ? this.labelled([derive(ttm)], k.lines)[0] : null,
        cumulative:
          k.standard && years.length >= 3
            ? {
                period: `${years[0].period}–${years[years.length - 1].period}`,
                'Tổng dòng tiền kinh doanh': round(sum('cfa18'), 1),
                'Tổng lợi nhuận trước thuế': round(sum('cfa1'), 1),
                'Tổng chi mua sắm TSCĐ': round(sum('cfa19'), 1),
                'Tổng cổ tức đã trả': round(sum('cfa32'), 1),
                'Dòng tiền kinh doanh / Lợi nhuận trước thuế (lần)':
                  sum('cfa1') > 0 ? round(sum('cfa18') / sum('cfa1'), 2) : '',
              }
            : null,
      };
    });
  }
}

function quarterIndex(period: string) {
  const m = /Q(\d)\/(\d{4})/.exec(period);
  return m ? Number(m[2]) * 4 + Number(m[1]) : NaN;
}

interface VcMetric {
  field: string | null;
  level: number;
  titleVi: string;
}
