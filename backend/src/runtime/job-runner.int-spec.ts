import { testPrisma } from '../test-utils/test-db';
import { JobRunner, PgAdvisoryLock } from './job-runner';

// Hai PrismaService = hai pool kết nối riêng, như hai tiến trình worker
const prismaA = testPrisma();
const prismaB = testPrisma();
const workerA = new JobRunner(new PgAdvisoryLock(prismaA));
const workerB = new JobRunner(new PgAdvisoryLock(prismaB));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const unique = (tag: string) => `${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

afterAll(async () => {
  await prismaA.$disconnect();
  await prismaB.$disconnect();
});

describe('JobRunner + khoá tư vấn PostgreSQL', () => {
  it('hai worker cùng chạy một việc cùng lúc: đúng một bên chạy, bên kia bỏ lượt', async () => {
    const name = unique('same');
    let runs = 0;
    const job = async () => {
      runs++;
      await sleep(300);
      return 'done';
    };
    const [a, b] = await Promise.all([workerA.run(name, job), workerB.run(name, job)]);
    expect(runs).toBe(1);
    expect([a.status, b.status].sort()).toEqual(['ran', 'skipped']);
  });

  it('nhiều lượt dồn dập từ nhiều worker vẫn chỉ một lượt chạy tại mỗi thời điểm', async () => {
    const name = unique('burst');
    let concurrent = 0;
    let maxConcurrent = 0;
    const job = async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await sleep(150);
      concurrent--;
    };
    const outcomes = await Promise.all([
      workerA.run(name, job),
      workerB.run(name, job),
      workerA.run(name, job),
      workerB.run(name, job),
    ]);
    expect(maxConcurrent).toBe(1);
    expect(outcomes.filter((o) => o.status === 'ran')).toHaveLength(1);
  });

  it('việc khác tên không chặn nhau', async () => {
    const [a, b] = await Promise.all([
      workerA.run(unique('x'), async () => (await sleep(150), 1)),
      workerB.run(unique('y'), async () => (await sleep(150), 2)),
    ]);
    expect([a.status, b.status]).toEqual(['ran', 'ran']);
  });

  it('chạy xong thì khoá được nhả: lượt sau (kể cả worker kia) chạy được', async () => {
    const name = unique('release');
    await expect(workerA.run(name, () => Promise.resolve(1))).resolves.toEqual({ status: 'ran', value: 1 });
    await expect(workerB.run(name, () => Promise.resolve(2))).resolves.toEqual({ status: 'ran', value: 2 });
  });

  it('việc ném lỗi: lỗi được ném lại và khoá được nhả cho worker khác', async () => {
    const name = unique('error');
    await expect(workerA.run(name, () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(workerB.run(name, () => Promise.resolve('ok'))).resolves.toEqual({ status: 'ran', value: 'ok' });
  });

  it('việc kẹt quá hạn: giao dịch bị huỷ nên khoá không treo mãi', async () => {
    const name = unique('hung');
    const hung = workerA.run(name, () => sleep(1500), { timeoutMs: 300 });
    await sleep(50);
    expect(await workerB.run(name, () => Promise.resolve(1))).toEqual({ status: 'skipped', reason: 'locked' });
    await expect(hung).rejects.toThrow();
    await expect(workerB.run(name, () => Promise.resolve(2))).resolves.toEqual({ status: 'ran', value: 2 });
  });
});
