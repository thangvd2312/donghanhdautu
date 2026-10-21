import { WorkerLifecycle } from './worker-lifecycle';

function build(role: 'web' | 'worker') {
  const calls: string[] = [];
  const jobs = { run: jest.fn() };
  const lifecycle = new WorkerLifecycle(
    { role, isWorker: role === 'worker' } as never,
    { start: () => (calls.push('heartbeat'), Promise.resolve()) } as never,
    jobs as never,
    { start: () => calls.push('briefQueue') } as never,
    { start: (j: unknown) => calls.push(j === jobs ? 'telegram(jobs)' : 'telegram') } as never,
    { startDelivery: () => calls.push('push') } as never,
    { refreshIfStale: () => (calls.push('macro'), Promise.resolve()) } as never,
    {} as never,
    { getCronJobs: () => new Map(), getIntervals: () => [] } as never,
  );
  return { lifecycle, calls };
}

describe('WorkerLifecycle', () => {
  it('worker: khởi động nhịp tim, hàng đợi bản tin, gửi Telegram (có khoá) và Web Push, đọc vĩ mô', async () => {
    const { lifecycle, calls } = build('worker');
    await lifecycle.onApplicationBootstrap();
    lifecycle.onModuleDestroy();
    expect(calls).toEqual(['heartbeat', 'briefQueue', 'push', 'telegram(jobs)', 'macro']);
  });

  it('web: từ chối khởi động, không chạy vòng lặp nào', async () => {
    const { lifecycle, calls } = build('web');
    await expect(lifecycle.onApplicationBootstrap()).rejects.toThrow(/APP_ROLE=worker/);
    expect(calls).toEqual([]);
  });
});
