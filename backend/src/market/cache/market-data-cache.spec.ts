import { FakeMarketCacheTable } from '../../test-utils/market-cache';
import type { CachePolicy, MarketDataCacheOptions } from './market-data-cache';
import { DEFAULT_CACHE_OPTIONS, MarketDataCache } from './market-data-cache';
import { MarketDataMetrics } from './market-data-metrics';
import { historyPolicy, vietcapKey } from './vietcap-cache-policy';

const MIN = 60_000;
const policy: CachePolicy = { freshMs: 10 * MIN, staleMs: 60 * MIN, source: 'test' };

function setup(options: Partial<MarketDataCacheOptions> = {}) {
  const table = new FakeMarketCacheTable();
  const metrics = new MarketDataMetrics();
  // Mỗi cache là một "tiến trình": L1 riêng, chung bảng L2
  const process = () => new MarketDataCache(table.prisma, metrics, { ...DEFAULT_CACHE_OPTIONS, ...options });
  return { table, metrics, cache: process(), process };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-21T03:00:00Z'));
});
afterEach(() => jest.useRealTimers());

describe('MarketDataCache', () => {
  it('lần đầu gọi nguồn và ghi L2; lần sau trúng L1 không gọi nguồn', async () => {
    const { cache, table, metrics } = setup();
    const load = jest.fn().mockResolvedValue({ pe: 12 });

    await expect(cache.get('vietcap:v1:ratios:FPT', policy, load)).resolves.toEqual({ pe: 12 });
    await expect(cache.get('vietcap:v1:ratios:FPT', policy, load)).resolves.toEqual({ pe: 12 });

    expect(load).toHaveBeenCalledTimes(1);
    expect(table.rows.get('vietcap:v1:ratios:FPT')).toMatchObject({ source: 'test', value: { pe: 12 } });
    expect(metrics.snapshot()).toMatchObject({ miss: 1, hitL1: 1, hitL2: 0 });
  });

  it('tiến trình khác (L1 rỗng) trúng L2, không gọi nguồn', async () => {
    const { process, metrics } = setup();
    await process().get('k:a', policy, () => Promise.resolve({ v: 1 }));

    const load = jest.fn();
    await expect(process().get('k:a', policy, load)).resolves.toEqual({ v: 1 });

    expect(load).not.toHaveBeenCalled();
    expect(metrics.snapshot().hitL2).toBe(1);
  });

  it('single-flight: nhiều request cùng khoá khi chưa có cache chỉ gọi nguồn một lần', async () => {
    const { cache } = setup();
    let release!: (v: string) => void;
    const load = jest.fn(() => new Promise<string>((r) => (release = r)));

    const all = Promise.all([
      cache.get('k:s', policy, load),
      cache.get('k:s', policy, load),
      cache.get('k:s', policy, load),
    ]);
    await jest.advanceTimersByTimeAsync(0);
    release('x');

    await expect(all).resolves.toEqual(['x', 'x', 'x']);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('single-flight được giải phóng sau lỗi: lần sau thử lại', async () => {
    const { cache } = setup();
    const load = jest.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce('ok');
    await expect(cache.get('k:e', policy, load)).rejects.toThrow('boom');
    await expect(cache.get('k:e', policy, load)).resolves.toBe('ok');
  });

  it('hết hạn mới: tải lại và ghi đè; L1 không giữ quá hạn mới', async () => {
    const { cache } = setup();
    const load = jest.fn().mockResolvedValueOnce('một').mockResolvedValueOnce('hai');
    await cache.get('k:t', policy, load);
    jest.setSystemTime(Date.now() + 10 * MIN - 1);
    await expect(cache.get('k:t', policy, load)).resolves.toBe('một');
    jest.setSystemTime(Date.now() + 2);
    await expect(cache.get('k:t', policy, load)).resolves.toBe('hai');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('L1 chỉ giữ TTL ngắn rồi đọc lại L2 (thấy được bản mới do tiến trình khác ghi)', async () => {
    const { cache, table } = setup({ l1TtlMs: MIN });
    const load = jest.fn().mockResolvedValue('cũ');
    await cache.get('k:l1', policy, load);
    const row = table.rows.get('k:l1')!;
    row.value = 'mới'; // tiến trình khác ghi đè L2

    await expect(cache.get('k:l1', policy, load)).resolves.toBe('cũ'); // còn trong TTL của L1
    jest.setSystemTime(Date.now() + MIN + 1);
    await expect(cache.get('k:l1', policy, load)).resolves.toBe('mới');
    expect(load).toHaveBeenCalledTimes(1);
  });

  describe('dùng bản cũ khi nguồn lỗi', () => {
    it('lỗi nguồn trong khoảng dùng tạm: trả bản cũ, đếm staleServed, không gọi lại ngay', async () => {
      const { cache, process, metrics } = setup();
      await cache.get('k:st', policy, () => Promise.resolve('cũ'));
      jest.setSystemTime(Date.now() + 11 * MIN); // quá hạn mới, còn trong dùng tạm

      const fresh = process(); // L1 rỗng: bản cũ lấy từ L2
      const load = jest.fn().mockRejectedValue(new Error('Vietcap 503'));
      await expect(fresh.get('k:st', policy, load)).resolves.toBe('cũ');
      await expect(fresh.get('k:st', policy, load)).resolves.toBe('cũ');

      expect(load).toHaveBeenCalledTimes(1); // chờ staleRetryMs mới thử lại, không dồn request vào nguồn hỏng
      expect(metrics.snapshot()).toMatchObject({ staleServed: 1, fetchError: 1 });

      jest.setSystemTime(Date.now() + DEFAULT_CACHE_OPTIONS.staleRetryMs + 1);
      load.mockResolvedValueOnce('mới');
      await expect(fresh.get('k:st', policy, load)).resolves.toBe('mới');
    });

    it('quá khoảng dùng tạm thì ném lỗi như trước', async () => {
      const { cache, process } = setup();
      await cache.get('k:old', policy, () => Promise.resolve('cũ'));
      jest.setSystemTime(Date.now() + 10 * MIN + 60 * MIN + 1);
      await expect(process().get('k:old', policy, () => Promise.reject(new Error('down')))).rejects.toThrow('down');
    });

    it('chưa từng có dữ liệu thì ném lỗi, và không lưu gì', async () => {
      const { cache, table } = setup();
      await expect(cache.get('k:none', policy, () => Promise.reject(new Error('down')))).rejects.toThrow('down');
      expect(table.rows.size).toBe(0);
    });

    it('L2 (DB) hỏng: vẫn gọi nguồn và trả kết quả; nguồn lỗi thì dùng bản cũ trong L1', async () => {
      const { cache, table, metrics } = setup({ l1TtlMs: 1 });
      table.failReads = true;
      table.failWrites = true;
      await expect(cache.get('k:db', policy, () => Promise.resolve('v1'))).resolves.toBe('v1');
      jest.setSystemTime(Date.now() + 11 * MIN);
      await expect(cache.get('k:db', policy, () => Promise.reject(new Error('down')))).resolves.toBe('v1');
      expect(metrics.snapshot().l2Error).toBeGreaterThan(0);
    });
  });

  describe('không lưu kết quả không đáng lưu', () => {
    it('null / undefined không được lưu (mặc định)', async () => {
      const { cache, table } = setup();
      const load = jest.fn().mockResolvedValue(null);
      await expect(cache.get('k:null', policy, load)).resolves.toBeNull();
      await cache.get('k:null', policy, load);
      expect(load).toHaveBeenCalledTimes(2);
      expect(table.rows.size).toBe(0);
    });

    it('cacheable tuỳ chỉnh: danh sách rỗng do nguồn trả thiếu thì không lưu', async () => {
      const { cache, table } = setup();
      const p: CachePolicy = { ...policy, cacheable: (v) => Array.isArray(v) && v.length > 0 };
      await expect(cache.get('k:empty', p, () => Promise.resolve([]))).resolves.toEqual([]);
      expect(table.rows.size).toBe(0);
    });

    it('giá trị JSON quá lớn: trả về nhưng không ghi L2', async () => {
      const { cache, table, metrics } = setup({ maxValueBytes: 100 });
      const big = { text: 'x'.repeat(500) };
      await expect(cache.get('k:big', policy, () => Promise.resolve(big))).resolves.toEqual(big);
      expect(table.rows.size).toBe(0);
      expect(metrics.snapshot().skippedOversize).toBe(1);
    });

    it('khoá không hợp lệ thì bỏ qua cache, gọi thẳng nguồn', async () => {
      const { cache, table } = setup();
      const load = jest.fn().mockResolvedValue('x');
      await cache.get('vietcap:v1:company:../../etc', policy, load);
      await cache.get('vietcap:v1:company:../../etc', policy, load);
      expect(load).toHaveBeenCalledTimes(2);
      expect(table.rows.size).toBe(0);
    });
  });

  it('giá trị tươi và giá trị đọc lại từ DB có cùng hình dạng JSON (bỏ undefined, Date thành chuỗi)', async () => {
    const { cache, process } = setup();
    const when = new Date('2026-01-02T00:00:00Z');
    const fresh = await cache.get('k:shape', policy, () => Promise.resolve({ a: 1, b: undefined, when }));
    const fromDb = await process().get('k:shape', policy, () => Promise.reject(new Error('không được gọi')));
    expect(fresh).toEqual({ a: 1, when: when.toISOString() });
    expect(fromDb).toEqual(fresh);
  });

  it('LRU: vượt l1MaxEntries thì bỏ khoá ít dùng nhất khỏi L1 (vẫn còn ở L2)', async () => {
    const { cache, table } = setup({ l1MaxEntries: 2 });
    for (const k of ['k:1', 'k:2']) await cache.get(k, policy, () => Promise.resolve(k));
    await cache.get('k:1', policy, () => Promise.resolve('x')); // k:1 mới dùng
    await cache.get('k:3', policy, () => Promise.resolve('k:3')); // đẩy k:2 ra
    const reads = table.reads;
    await cache.get('k:1', policy, jest.fn());
    expect(table.reads).toBe(reads); // k:1 vẫn ở L1
    await cache.get('k:2', policy, jest.fn());
    expect(table.reads).toBe(reads + 1); // k:2 phải đọc L2
  });

  it('khoá có phiên bản: tăng phiên bản thì bản cũ bị bỏ qua', async () => {
    const { cache } = setup();
    const load = jest.fn().mockResolvedValueOnce('v1-data').mockResolvedValueOnce('v2-data');
    expect(vietcapKey('ratios', 'FPT')).toBe('vietcap:v1:ratios:FPT');
    await cache.get('vietcap:v1:ratios:FPT', policy, load);
    await expect(cache.get('vietcap:v2:ratios:FPT', policy, load)).resolves.toBe('v2-data');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('purgeExpired xoá các dòng quá hạn dùng tạm, giữ dòng còn mới và dòng còn dùng tạm được', async () => {
    const { cache, table } = setup();
    await cache.get('k:fresh', policy, () => Promise.resolve(1));
    await cache.get('k:stale', { ...policy, freshMs: MIN, staleMs: 5 * MIN }, () => Promise.resolve(2));
    await cache.get('k:dead', { ...policy, freshMs: MIN, staleMs: MIN }, () => Promise.resolve(3));
    jest.setSystemTime(Date.now() + 3 * MIN);

    await expect(cache.purgeExpired()).resolves.toBe(1);
    expect([...table.rows.keys()].sort()).toEqual(['k:fresh', 'k:stale']);
  });
});

describe('historyPolicy (giờ VN = UTC+7)', () => {
  const at = (iso: string) => historyPolicy(new Date(iso).getTime()).freshMs;
  const H = 60 * MIN;

  it('trong phiên: tươi 1 giờ, nhưng không quá giờ đóng cửa (15:05)', () => {
    expect(at('2026-10-21T03:00:00Z')).toBe(H); // Thứ Tư 10:00
    expect(at('2026-10-21T07:30:00Z')).toBe(35 * MIN); // 14:30 -> 15:05
  });

  it('ngoài phiên: tươi đến lúc mở cửa phiên kế tiếp', () => {
    expect(at('2026-10-21T01:00:00Z')).toBe(H); // Thứ Tư 08:00 -> 9:00
    expect(at('2026-10-21T09:00:00Z')).toBe(17 * H); // Thứ Tư 16:00 -> Thứ Năm 9:00
    expect(at('2026-10-23T09:00:00Z')).toBe(65 * H); // Thứ Sáu 16:00 -> Thứ Hai 9:00
    expect(at('2026-10-24T03:00:00Z')).toBe(47 * H); // Thứ Bảy 10:00 -> Thứ Hai 9:00
  });
});
