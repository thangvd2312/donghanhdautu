import type { AiUsageService } from '../ai/ai-usage.service';
import { testPrisma, testUser } from '../test-utils/test-db';
import { backoffMs, BriefQueueService, STALE_JOB_MS } from './brief-queue.service';

const prisma = testPrisma();

afterAll(() => prisma.$disconnect());
// Bảng việc chỉ dùng trong file này (DB test): dọn để các lần chạy không lẫn việc của nhau
beforeEach(() => prisma.briefJob.deleteMany({}));

const users = (n: number, tag: string) =>
  Promise.all(Array.from({ length: n }, (_, i) => testUser(prisma, `${tag}-${i}`)));
const DAY = '2026-10-24';

/** Đồng hồ giả để thử lại / hết hạn không phải chờ thật */
function clock(start = new Date()) {
  let t = start.getTime();
  return { now: () => new Date(t), advance: (ms: number) => (t += ms) };
}

describe('hàng đợi bản tin (PostgreSQL)', () => {
  it('xếp lại cùng kỳ không tạo trùng việc', async () => {
    const [a, b] = await users(2, 'q-dup');
    const q = new BriefQueueService(prisma);
    q.register('weekly', () => Promise.resolve(null));
    await q.enqueue('weekly', DAY, [a.id, b.id]);
    await q.enqueue('weekly', DAY, [a.id, b.id]);
    await q.drain();
    expect(await prisma.briefJob.count()).toBe(2);
  });

  it('hai tiến trình cùng lấy việc: mỗi việc chạy đúng một lần', async () => {
    const list = await users(8, 'q-workers');
    const seen: string[] = [];
    const handler = async (userId: string) => {
      seen.push(userId);
      await new Promise((r) => setTimeout(r, 30));
      return { id: 'n' };
    };
    const [w1, w2] = [new BriefQueueService(prisma), new BriefQueueService(prisma)];
    w1.register('morning', handler);
    w2.register('morning', handler);
    await prisma.briefJob.createMany({ data: list.map((u) => ({ userId: u.id, kind: 'morning', day: DAY })) });
    await Promise.all([w1.drain(), w2.drain()]);
    expect(seen.sort()).toEqual(list.map((u) => u.id).sort());
    expect(await prisma.briefJob.count({ where: { status: 'done', result: 'sent' } })).toBe(8);
  });

  it('lỗi thì thử lại có giãn cách, quá số lần thì failed kèm lỗi', async () => {
    const [u] = await users(1, 'q-retry');
    const c = clock();
    let calls = 0;
    const q = new BriefQueueService(prisma);
    q.register('weekly', () => {
      calls++;
      return Promise.reject(new Error('AI không trả về bản tin'));
    });
    await prisma.briefJob.create({
      data: { userId: u.id, kind: 'weekly', day: DAY, createdAt: c.now(), runAfter: c.now() },
    });

    await q.drain(c.now);
    let job = await prisma.briefJob.findFirstOrThrow();
    expect(job).toMatchObject({ status: 'queued', attempts: 1, lastError: 'AI không trả về bản tin' });
    expect(job.runAfter.getTime()).toBe(c.now().getTime() + backoffMs(1));

    // Chưa tới giờ thử lại thì không chạy
    await q.drain(c.now);
    expect(calls).toBe(1);
    for (let i = 1; i <= 3; i++) {
      c.advance(backoffMs(i));
      await q.drain(c.now);
    }
    job = await prisma.briefJob.findFirstOrThrow();
    expect(calls).toBe(4);
    expect(job).toMatchObject({ status: 'failed', attempts: 4 });
  });

  it('lần thử sau thành công thì xong', async () => {
    const [u] = await users(1, 'q-recover');
    const c = clock();
    let calls = 0;
    const q = new BriefQueueService(prisma);
    q.register('closing', () => (++calls === 1 ? Promise.reject(new Error('timeout')) : Promise.resolve(null)));
    await prisma.briefJob.create({
      data: { userId: u.id, kind: 'closing', day: DAY, createdAt: c.now(), runAfter: c.now() },
    });
    await q.drain(c.now);
    c.advance(backoffMs(1));
    await q.drain(c.now);
    expect(await prisma.briefJob.findFirstOrThrow()).toMatchObject({
      status: 'done',
      result: 'nothing',
      lastError: null,
    });
  });

  it('việc đang chạy dở khi tiến trình chết được nhận lại', async () => {
    const [u] = await users(1, 'q-stale');
    const c = clock();
    await prisma.briefJob.create({
      data: {
        userId: u.id,
        kind: 'weekly',
        day: DAY,
        status: 'running',
        attempts: 1,
        lockedAt: c.now(),
        createdAt: c.now(),
        runAfter: c.now(),
      },
    });
    const done: string[] = [];
    const q = new BriefQueueService(prisma);
    q.register('weekly', (userId) => {
      done.push(userId);
      return Promise.resolve({});
    });
    await q.drain(c.now);
    expect(done).toEqual([]);
    c.advance(STALE_JOB_MS + 1000);
    await q.drain(c.now);
    expect(done).toEqual([u.id]);
    expect(await prisma.briefJob.findFirstOrThrow()).toMatchObject({ status: 'done', attempts: 2 });
  });

  it('bản tin sáng quá hạn thì bỏ, không gửi muộn', async () => {
    const [u] = await users(1, 'q-expired');
    const c = clock();
    await prisma.briefJob.create({
      data: { userId: u.id, kind: 'morning', day: DAY, createdAt: c.now(), runAfter: c.now() },
    });
    c.advance(7 * 3600_000);
    const q = new BriefQueueService(prisma);
    const handler = jest.fn(() => Promise.resolve({}));
    q.register('morning', handler);
    await q.drain(c.now);
    expect(handler).not.toHaveBeenCalled();
    expect(await prisma.briefJob.findFirstOrThrow()).toMatchObject({ status: 'skipped', result: 'expired' });
  });

  it('chạm ngân sách AI: hoãn 30 phút, không tính là một lần thử', async () => {
    const [u] = await users(1, 'q-budget');
    const c = clock();
    const q = new BriefQueueService(prisma, { overBudget: () => Promise.resolve(true) } as unknown as AiUsageService);
    const handler = jest.fn(() => Promise.resolve({}));
    q.register('weekly', handler);
    await prisma.briefJob.create({
      data: { userId: u.id, kind: 'weekly', day: DAY, createdAt: c.now(), runAfter: c.now() },
    });
    await q.drain(c.now);
    const job = await prisma.briefJob.findFirstOrThrow();
    expect(handler).not.toHaveBeenCalled();
    expect(job).toMatchObject({ status: 'queued', attempts: 0, lastError: 'Hoãn: đã chạm ngân sách AI trong ngày' });
    expect(job.runAfter.getTime()).toBe(c.now().getTime() + 30 * 60_000);
  });
});
