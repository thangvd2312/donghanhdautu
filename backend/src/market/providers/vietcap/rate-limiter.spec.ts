import { RateLimiter } from './rate-limiter';

const deferred = () => {
  let resolve!: (v: string) => void;
  const promise = new Promise<string>((r) => (resolve = r));
  return { promise, resolve };
};

describe('RateLimiter', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('cho burst tối đa ratePerSec request ngay, phần còn lại xếp hàng và nhỏ giọt theo tốc độ', async () => {
    const limiter = new RateLimiter({ ratePerSec: 2, maxConcurrent: 10 });
    const startedAt: number[] = [];
    const t0 = Date.now();
    const jobs = Array.from({ length: 5 }, () =>
      limiter.run(() => {
        startedAt.push(Date.now() - t0);
        return Promise.resolve();
      }),
    );

    await jest.advanceTimersByTimeAsync(0);
    expect(startedAt).toEqual([0, 0]);

    await jest.advanceTimersByTimeAsync(500);
    expect(startedAt).toEqual([0, 0, 500]);

    await jest.advanceTimersByTimeAsync(1000);
    await Promise.all(jobs);
    expect(startedAt).toEqual([0, 0, 500, 1000, 1500]);
  });

  it('không chạy quá maxConcurrent request cùng lúc, task xong thì chạy tiếp request đang chờ', async () => {
    const limiter = new RateLimiter({ ratePerSec: 100, maxConcurrent: 2 });
    const gates = [deferred(), deferred(), deferred()];
    const started: number[] = [];
    const jobs = gates.map((g, i) =>
      limiter.run(() => {
        started.push(i);
        return g.promise;
      }),
    );

    await jest.advanceTimersByTimeAsync(0);
    expect(started).toEqual([0, 1]);

    gates[0].resolve('a');
    await jest.advanceTimersByTimeAsync(0);
    expect(started).toEqual([0, 1, 2]);

    gates[1].resolve('b');
    gates[2].resolve('c');
    await expect(Promise.all(jobs)).resolves.toEqual(['a', 'b', 'c']);
  });

  it('task lỗi (kể cả ném đồng bộ) vẫn trả lại chỗ chạy và token cho request sau', async () => {
    const limiter = new RateLimiter({ ratePerSec: 100, maxConcurrent: 1 });
    const failing = limiter.run(() => {
      throw new Error('đồng bộ');
    });
    const rejected = expect(failing).rejects.toThrow('đồng bộ');
    const after = limiter.run(() => Promise.resolve('ok'));

    await jest.advanceTimersByTimeAsync(0);
    await rejected;
    await expect(after).resolves.toBe('ok');
  });

  it('nạp lại token theo thời gian trôi, tối đa bằng độ dài burst', async () => {
    const limiter = new RateLimiter({ ratePerSec: 3, maxConcurrent: 10 });
    await Promise.all([1, 2, 3].map(() => limiter.run(() => Promise.resolve())));

    await jest.advanceTimersByTimeAsync(60_000);
    const t0 = Date.now();
    const startedAt: number[] = [];
    const jobs = Array.from({ length: 4 }, () => limiter.run(() => Promise.resolve(startedAt.push(Date.now() - t0))));
    await jest.advanceTimersByTimeAsync(1000);
    await Promise.all(jobs);
    // Nghỉ lâu cũng chỉ tích được 3 token: request thứ 4 phải đợi ~1/3 giây
    expect(startedAt).toEqual([0, 0, 0, 334]);
  });
});
