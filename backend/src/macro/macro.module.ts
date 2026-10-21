import { Controller, Get, Injectable, Logger, Module, UseGuards } from '@nestjs/common';
import { MacroFact } from '@prisma/client';
import { Subject } from 'rxjs';
import { JwtAuthGuard } from '../auth/auth.module';
import { PrismaService } from '../prisma/prisma.module';

/** Một số liệu vừa đọc được từ nguồn, trước khi lưu */
interface FactInput {
  key: string;
  label: string;
  value: string;
  numericValue: number | null;
  unit: string;
  asOf: string;
  document?: string;
  note?: string;
  sourceName: string;
  sourceUrl: string;
  /** Khoảng giá trị hợp lý — ngoài khoảng này coi như đọc sai, không lưu */
  sane: [number, number];
}

export interface MacroChange {
  fact: MacroFact;
  previousValue: string;
  /** Thay đổi chính sách (lãi suất điều hành, lãi suất Fed) — cần cảnh báo người dùng */
  policy: boolean;
}

/** Header giống trình duyệt: tường lửa của sbv.gov.vn trả trang "Request Rejected" (HTTP 200) cho request thiếu header */
const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Upgrade-Insecure-Requests': '1',
};

const SBV = {
  rates: 'https://sbv.gov.vn/vi/l%C3%A3i-su%E1%BA%A5t1',
  fx: 'https://sbv.gov.vn/vi/t%E1%BB%B7-gi%C3%A1',
  cpi: 'https://sbv.gov.vn/vi/cpi',
};
const FED = 'https://www.federalreserve.gov/monetarypolicy/openmarket.htm';

/** Số liệu chính sách: giá trị đổi nghĩa là có quyết định mới → cảnh báo */
const POLICY_KEYS = new Set(['vn.policy.refinancing', 'vn.policy.rediscount', 'us.fed.target']);

const MONTHS: Record<string, string> = {
  January: '01',
  February: '02',
  March: '03',
  April: '04',
  May: '05',
  June: '06',
  July: '07',
  August: '08',
  September: '09',
  October: '10',
  November: '11',
  December: '12',
};

/**
 * Bảng số liệu vĩ mô tham chiếu, đọc trực tiếp từ trang chính thức của NHNN và Fed.
 * Nguyên tắc: chỉ lưu khi đọc được và giá trị nằm trong khoảng hợp lý; đọc lỗi thì giữ số cũ
 * (kèm thời điểm đọc thành công gần nhất để AI và người dùng biết độ mới). Mọi thay đổi được ghi lịch sử.
 */
@Injectable()
export class MacroService {
  private log = new Logger(MacroService.name);
  readonly changes$ = new Subject<MacroChange>();
  private running = false;

  constructor(private prisma: PrismaService) {}

  /** Khởi động lại nhiều lần (deploy) mà lần nào cũng gọi NHNN sẽ bị chặn 403 → chỉ đọc khi dữ liệu đã cũ. Worker gọi khi khởi động */
  async refreshIfStale() {
    const oldest = await this.prisma.macroFact.findFirst({ orderBy: { fetchedAt: 'asc' } });
    if (!oldest || Date.now() - oldest.fetchedAt.getTime() > 90 * 60_000) void this.refresh();
  }

  /** NHNN cập nhật tỷ giá trung tâm mỗi sáng, lãi suất liên ngân hàng mỗi ngày; 2 giờ/lần là đủ (worker/scheduled-jobs.ts) */
  async refresh() {
    if (this.running) return;
    this.running = true;
    try {
      const jobs: [string, () => Promise<FactInput[]>][] = [
        ['NHNN lãi suất', () => this.sbvRates()],
        ['NHNN tỷ giá', () => this.sbvFx()],
        ['NHNN CPI', () => this.sbvCpi()],
        ['Fed', () => this.fedRate()],
      ];
      for (const [name, job] of jobs) {
        try {
          const facts = await job();
          for (const f of facts) await this.save(f);
          this.log.log(`${name}: cập nhật ${facts.length} số liệu`);
        } catch (e) {
          this.log.warn(`${name}: không đọc được (${(e as Error).message}) — giữ số liệu cũ`);
        }
        // Giãn cách giữa các lần gọi: trang NHNN chặn (403) khi bị truy cập dồn dập
        await sleep(6000);
      }
    } finally {
      this.running = false;
    }
  }

  all() {
    return this.prisma.macroFact.findMany({ orderBy: { key: 'asc' } });
  }

  private async save(f: FactInput) {
    if (f.numericValue !== null && (f.numericValue < f.sane[0] || f.numericValue > f.sane[1])) {
      this.log.warn(`${f.key}: giá trị ${f.value} ngoài khoảng hợp lý ${f.sane.join('–')}, bỏ qua`);
      return;
    }
    const now = new Date();
    const prev = await this.prisma.macroFact.findUnique({ where: { key: f.key } });
    const data = {
      label: f.label,
      value: f.value,
      numericValue: f.numericValue,
      unit: f.unit,
      asOf: f.asOf,
      document: f.document ?? null,
      note: f.note ?? null,
      sourceName: f.sourceName,
      sourceUrl: f.sourceUrl,
      fetchedAt: now,
    };
    const changed = !prev || prev.value !== f.value || prev.asOf !== f.asOf;
    const saved = await this.prisma.macroFact.upsert({
      where: { key: f.key },
      create: { key: f.key, ...data, changedAt: now },
      update: changed ? { ...data, changedAt: now, previousValue: prev?.value ?? null } : data,
    });
    if (changed) {
      await this.prisma.macroFactHistory.create({
        data: { key: f.key, value: f.value, asOf: f.asOf, sourceUrl: f.sourceUrl },
      });
      // Chỉ báo khi CON SỐ thực sự đổi — không báo lần đầu khởi tạo, khi chỉ đổi ngày,
      // hay khi chỉ đổi cách viết (đã từng báo nhầm "3,75–4%" → "3,75–4,00%")
      const numberChanged = !prev
        ? false
        : f.numericValue !== null && prev.numericValue !== null
          ? Math.abs(prev.numericValue - f.numericValue) > 1e-9
          : prev.value !== f.value;
      if (prev && numberChanged) {
        this.changes$.next({ fact: saved, previousValue: prev.value, policy: POLICY_KEYS.has(f.key) });
      }
    }
  }

  private async page(url: string) {
    let lastErr: Error | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch(url, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(30000) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const html = await r.text();
        if (/Request Rejected|The requested URL was rejected/i.test(html))
          throw new Error('bị tường lửa của trang chặn');
        return html;
      } catch (e) {
        lastErr = e as Error;
        await sleep(8000 * (attempt + 1));
      }
    }
    throw lastErr ?? new Error('không tải được');
  }

  private async sbvRates(): Promise<FactInput[]> {
    const t = toText(await this.page(SBV.rates));
    const out: FactInput[] = [];
    for (const [key, name] of [
      ['vn.policy.rediscount', 'tái chiết khấu'],
      ['vn.policy.refinancing', 'tái cấp vốn'],
    ] as const) {
      const m = t.match(
        new RegExp(`Lãi suất ${name} ([\\d,]+)% (\\S+) ngày (\\d{2}/\\d{2}/\\d{4}) (\\d{2}/\\d{2}/\\d{4})`),
      );
      if (!m) throw new Error(`không thấy dòng lãi suất ${name}`);
      // Kiểm tra logic ngày: ngày áp dụng không thể sớm hơn ngày ban hành văn bản
      const issued = toDate(m[3]);
      const applied = toDate(m[4]);
      const dateWarning =
        issued && applied && applied < issued
          ? `Trang NHNN ghi ngày áp dụng ${m[4]}, sớm hơn ngày ban hành văn bản ${m[3]} — nhiều khả năng là lỗi đánh máy của trang. Khi trích dẫn, ghi theo văn bản ${m[2]} ngày ${m[3]}, không khẳng định ngày áp dụng ${m[4]}.`
          : null;
      out.push({
        key,
        label: `Lãi suất ${name} (NHNN)`,
        value: `${vn(m[1])}%/năm`,
        numericValue: num(m[1]),
        unit: '%/năm',
        asOf: dateWarning ? `văn bản ngày ${m[3]}` : m[4],
        document: `${m[2]} ngày ${m[3]}`,
        note: dateWarning ?? 'Ngày áp dụng ghi theo trang NHNN',
        sourceName: 'Ngân hàng Nhà nước Việt Nam',
        sourceUrl: SBV.rates,
        sane: [0, 20],
      });
    }
    const day = t.match(/Lãi suất thị trường liên ngân hàng Ngày áp dụng: (\d{2}\/\d{2}\/\d{4})/)?.[1];
    if (day) {
      for (const [key, tenor] of [
        ['vn.interbank.overnight', 'Qua đêm'],
        ['vn.interbank.1w', '1 Tuần'],
        ['vn.interbank.1m', '1 Tháng'],
        ['vn.interbank.3m', '3 Tháng'],
      ] as const) {
        const m = t.match(new RegExp(`${tenor} ([\\d,]+)`));
        if (!m) continue;
        out.push({
          key,
          label: `Lãi suất liên ngân hàng bình quân kỳ hạn ${tenor.toLowerCase()}`,
          value: `${vn(m[1])}%/năm`,
          numericValue: num(m[1]),
          unit: '%/năm',
          asOf: day,
          sourceName: 'Ngân hàng Nhà nước Việt Nam',
          sourceUrl: SBV.rates,
          sane: [0, 30],
        });
      }
    }
    return out;
  }

  private async sbvFx(): Promise<FactInput[]> {
    const t = toText(await this.page(SBV.fx));
    const m = t.match(/1 Đô la Mỹ = ([\d.]+) VND.*?Số văn bản (\S+) Ngày ban hành (\d{2}\/\d{2}\/\d{4})/);
    if (!m) throw new Error('không thấy tỷ giá trung tâm');
    return [
      {
        key: 'vn.fx.central_usd',
        label: 'Tỷ giá trung tâm VND/USD (NHNN)',
        value: `${m[1]} VND`,
        numericValue: Number(m[1].replace(/\./g, '')),
        unit: 'VND/USD',
        asOf: m[3],
        document: m[2],
        sourceName: 'Ngân hàng Nhà nước Việt Nam',
        sourceUrl: SBV.fx,
        sane: [15000, 40000],
      },
    ];
  }

  private async sbvCpi(): Promise<FactInput[]> {
    const t = toText(await this.page(SBV.cpi));
    const mom = t.match(/CPI tháng (\d{1,2})\/(\d{4}) (tăng|giảm) ([\d,]+)% so với tháng trước/);
    if (!mom) throw new Error('không thấy CPI tháng');
    const period = `${mom[1].padStart(2, '0')}/${mom[2]}`;
    const signed = (dir: string, v: string) => (dir === 'giảm' ? -num(v) : num(v));
    const out: FactInput[] = [
      {
        key: 'vn.cpi.mom',
        label: 'CPI so với tháng trước',
        value: `${mom[3] === 'giảm' ? '-' : '+'}${vn(mom[4])}%`,
        numericValue: signed(mom[3], mom[4]),
        unit: '%',
        asOf: `tháng ${period}`,
        note: 'Theo Cục Thống kê, NHNN đăng lại',
        sourceName: 'Ngân hàng Nhà nước Việt Nam (dẫn Cục Thống kê)',
        sourceUrl: SBV.cpi,
        sane: [-10, 10],
      },
    ];
    const rest = t.match(
      /So với tháng 12\/(\d{4}), CPI tháng \d{1,2}\/\d{4} (tăng|giảm) ([\d,]+)%; (tăng|giảm) ([\d,]+)% so với cùng kỳ/,
    );
    if (rest) {
      out.push(
        {
          key: 'vn.cpi.ytd',
          label: `CPI so với tháng 12/${rest[1]}`,
          value: `${rest[2] === 'giảm' ? '-' : '+'}${vn(rest[3])}%`,
          numericValue: signed(rest[2], rest[3]),
          unit: '%',
          asOf: `tháng ${period}`,
          sourceName: 'Ngân hàng Nhà nước Việt Nam (dẫn Cục Thống kê)',
          sourceUrl: SBV.cpi,
          sane: [-20, 40],
        },
        {
          key: 'vn.cpi.yoy',
          label: 'CPI so với cùng kỳ năm trước',
          value: `${rest[4] === 'giảm' ? '-' : '+'}${vn(rest[5])}%`,
          numericValue: signed(rest[4], rest[5]),
          unit: '%',
          asOf: `tháng ${period}`,
          sourceName: 'Ngân hàng Nhà nước Việt Nam (dẫn Cục Thống kê)',
          sourceUrl: SBV.cpi,
          sane: [-20, 40],
        },
      );
    }
    return out;
  }

  private async fedRate(): Promise<FactInput[]> {
    const h = await this.page(FED);
    const i = h.indexOf('<table');
    if (i < 0) throw new Error('không thấy bảng lãi suất');
    // Năm của bảng đầu tiên là mốc năm xuất hiện ngay trước bảng
    const year = [...toText(h.slice(Math.max(0, i - 3000), i)).matchAll(/(20\d\d)/g)].pop()?.[1];
    const table = h.slice(i, h.indexOf('</table>', i));
    const row = [...table.matchAll(/<tr[\s\S]*?<\/tr>/g)]
      .map((r) => [...r[0].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => toText(c[1]).trim()))
      .find((cells) => /^[A-Z][a-z]+ \d{1,2}/.test(cells[0] ?? ''));
    if (!row || !year) throw new Error('không đọc được dòng mới nhất');
    const [date, inc, dec, level] = row;
    const [mon, day] = date.split(' ');
    const [lo, hi] = level.split('-').map(Number);
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) throw new Error(`mức lãi suất lạ: ${level}`);
    const move =
      Number(inc) > 0 ? `tăng ${inc} điểm cơ bản` : Number(dec) > 0 ? `giảm ${dec} điểm cơ bản` : 'giữ nguyên';
    return [
      {
        key: 'us.fed.target',
        label: 'Lãi suất mục tiêu quỹ liên bang Mỹ (Fed funds)',
        value: `${pct2(lo)}–${pct2(hi)}%`,
        numericValue: hi,
        unit: '%/năm',
        asOf: `${day.padStart(2, '0')}/${MONTHS[mon] ?? '??'}/${year}`,
        note: `Lần quyết định gần nhất: ${move}`,
        sourceName: 'Federal Reserve',
        sourceUrl: FED,
        sane: [0, 20],
      },
    ];
  }
}

function toText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');
}

/** "16/06/2023" → Date */
function toDate(dmy: string) {
  const [d, m, y] = dmy.split('/').map(Number);
  return d && m && y ? new Date(Date.UTC(y, m - 1, d)) : null;
}

/** "4,500" → 4.5 */
function num(s: string) {
  return Number(s.replace(/\./g, '').replace(',', '.'));
}

/** Chuẩn hoá cách viết số kiểu Việt Nam: "4,500" → "4,5"; "4.45" → "4,45" */
function vn(s: string) {
  const n = num(s.includes(',') ? s : s.replace('.', ','));
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 }).format(n);
}

/** 3.75 → "3,75"; 4 → "4,00" (lãi suất Fed luôn viết 2 chữ số thập phân) */
function pct2(n: number) {
  return new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

@UseGuards(JwtAuthGuard)
@Controller('macro')
class MacroController {
  constructor(private macro: MacroService) {}

  @Get()
  list() {
    return this.macro.all();
  }
}

@Module({
  controllers: [MacroController],
  providers: [MacroService],
  exports: [MacroService],
})
export class MacroModule {}
