import { Injectable, Logger } from '@nestjs/common';
import { Subject } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { parseFedRate, parseSbvCpi, parseSbvFx, parseSbvRates } from './macro-parsers';
import { fetchPage, FED, SBV } from './macro-sources';
import { sleep } from './macro-text';
import type { FactInput, MacroChange } from './macro.types';

/** Số liệu chính sách: giá trị đổi nghĩa là có quyết định mới → cảnh báo */
const POLICY_KEYS = new Set(['vn.policy.refinancing', 'vn.policy.rediscount', 'us.fed.target']);

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
        ['NHNN lãi suất', async () => parseSbvRates(await fetchPage(SBV.rates))],
        ['NHNN tỷ giá', async () => parseSbvFx(await fetchPage(SBV.fx))],
        ['NHNN CPI', async () => parseSbvCpi(await fetchPage(SBV.cpi))],
        ['Fed', async () => parseFedRate(await fetchPage(FED))],
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
}
