import { AdvisoryLock, JobRunner, NoAdvisoryLock } from './job-runner';

/** Khoá giả trong bộ nhớ: giữ theo khoá cho tới khi `fn` xong hoặc lỗi, giống khoá giao dịch thật */
class FakeLock implements AdvisoryLock {
  readonly held = new Set<string>();
  readonly timeouts: number[] = [];

  async tryRun<T>(key: string, fn: () => Promise<T>, timeoutMs: number) {
    this.timeouts.push(timeoutMs);
    if (this.held.has(key)) return { acquired: false as const };
    this.held.add(key);
    try {
      return { acquired: true as const, value: await fn() };
    } finally {
      this.held.delete(key);
    }
  }
}

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};

describe('JobRunner', () => {
  it('chạy việc và trả kết quả', async () => {
    const runner = new JobRunner(new NoAdvisoryLock());
    await expect(runner.run('a', () => Promise.resolve(42))).resolves.toEqual({ status: 'ran', value: 42 });
  });

  it('khoá bằng tên việc có tiền tố riêng của app', async () => {
    const keys: string[] = [];
    const lock: AdvisoryLock = {
      tryRun: (key, fn) => {
        keys.push(key);
        return fn().then((value) => ({ acquired: true as const, value }));
      },
    };
    await new JobRunner(lock).run('alerts.prices', () => Promise.resolve());
    expect(keys).toEqual(['dautu:job:alerts.prices']);
  });

  it('khoá đang bị giữ: bỏ lượt, không chạy việc', async () => {
    const lock = new FakeLock();
    lock.held.add('dautu:job:briefs.morning');
    const fn = jest.fn(() => Promise.resolve());
    const out = await new JobRunner(lock).run('briefs.morning', fn);
    expect(out).toEqual({ status: 'skipped', reason: 'locked' });
    expect(fn).not.toHaveBeenCalled();
  });

  it('hai lượt cùng việc chạy chồng: lượt thứ hai bị bỏ, việc khác tên vẫn chạy', async () => {
    const lock = new FakeLock();
    const runner = new JobRunner(lock);
    const gate = deferred();
    const first = runner.run('same', () => gate.promise);
    await new Promise((r) => setImmediate(r));
    await expect(runner.run('same', () => Promise.resolve())).resolves.toMatchObject({ status: 'skipped' });
    await expect(runner.run('other', () => Promise.resolve(1))).resolves.toMatchObject({ status: 'ran' });
    gate.resolve();
    await expect(first).resolves.toMatchObject({ status: 'ran' });
  });

  it('việc ném lỗi: lỗi được ném lại và khoá được nhả để lượt sau chạy được', async () => {
    const lock = new FakeLock();
    const runner = new JobRunner(lock);
    await expect(runner.run('flaky', () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(lock.held.size).toBe(0);
    await expect(runner.run('flaky', () => Promise.resolve('ok'))).resolves.toEqual({ status: 'ran', value: 'ok' });
  });

  it('truyền hạn giữ khoá: mặc định 30 phút, hoặc theo tuỳ chọn', async () => {
    const lock = new FakeLock();
    const runner = new JobRunner(lock);
    await runner.run('a', () => Promise.resolve());
    await runner.run('b', () => Promise.resolve(), { timeoutMs: 1234 });
    expect(lock.timeouts).toEqual([30 * 60_000, 1234]);
  });

  describe('tắt ứng dụng', () => {
    it('không nhận lượt mới sau khi bắt đầu tắt', async () => {
      const runner = new JobRunner(new NoAdvisoryLock());
      runner.onModuleDestroy();
      const fn = jest.fn(() => Promise.resolve());
      await expect(runner.run('x', fn)).resolves.toEqual({ status: 'skipped', reason: 'shutting-down' });
      expect(fn).not.toHaveBeenCalled();
    });

    it('chờ việc đang chạy xong rồi mới cho tắt', async () => {
      const runner = new JobRunner(new NoAdvisoryLock(), 1000);
      const gate = deferred();
      let finished = false;
      const job = runner.run('slow', async () => {
        await gate.promise;
        finished = true;
      });
      await new Promise((r) => setImmediate(r));
      runner.onModuleDestroy();
      const shutdown = runner.beforeApplicationShutdown();
      setTimeout(() => gate.resolve(), 20);
      await shutdown;
      expect(finished).toBe(true);
      await job;
      expect(runner.running).toBe(0);
    });

    it('việc kẹt quá thời gian chờ thì không chặn tắt', async () => {
      const runner = new JobRunner(new NoAdvisoryLock(), 30);
      void runner.run('stuck', () => new Promise<void>(() => undefined));
      await new Promise((r) => setImmediate(r));
      const started = Date.now();
      await runner.beforeApplicationShutdown();
      expect(Date.now() - started).toBeLessThan(500);
    });

    it('việc lỗi trong lúc chờ tắt không làm hỏng bước tắt', async () => {
      const runner = new JobRunner(new NoAdvisoryLock(), 500);
      const job = runner.run('bad', () => Promise.reject(new Error('x')));
      job.catch(() => undefined);
      await expect(runner.beforeApplicationShutdown()).resolves.toBeUndefined();
    });
  });
});
