import { testPrisma } from '../test-utils/test-db';
import { HEARTBEAT_STALE_MS, HeartbeatService } from './heartbeat.service';

const prisma = testPrisma();
const name = `test-worker-${Date.now()}`;
const heartbeat = new HeartbeatService(prisma, name);

afterAll(async () => {
  heartbeat.onModuleDestroy();
  await prisma.workerHeartbeat.deleteMany({ where: { name } });
  await prisma.$disconnect();
});

describe('nhịp tim worker (PostgreSQL)', () => {
  it('chưa có nhịp nào thì không ok', async () => {
    await expect(heartbeat.status()).resolves.toEqual({ ok: false, beatAgoSec: null });
  });

  it('start() ghi nhịp đầu tiên ngay với phiên bản và lúc khởi động', async () => {
    process.env.APP_VERSION = 'abc123';
    const t0 = new Date();
    await heartbeat.start(() => t0);
    heartbeat.onModuleDestroy();
    const row = await prisma.workerHeartbeat.findUniqueOrThrow({ where: { name } });
    expect(row).toMatchObject({ version: 'abc123' });
    expect(row.startedAt.getTime()).toBe(t0.getTime());
    expect(row.beatAt.getTime()).toBe(t0.getTime());
    delete process.env.APP_VERSION;
  });

  it('beat() cập nhật beatAt và giữ nguyên một dòng; status tính tuổi nhịp', async () => {
    const t1 = new Date(Date.now() + 1000);
    await heartbeat.beat(t1);
    expect(await prisma.workerHeartbeat.count({ where: { name } })).toBe(1);
    const row = await prisma.workerHeartbeat.findUniqueOrThrow({ where: { name } });
    expect(row.beatAt.getTime()).toBe(t1.getTime());
    await expect(heartbeat.status(new Date(t1.getTime() + 20_000))).resolves.toEqual({ ok: true, beatAgoSec: 20 });
  });

  it('quá 90 giây không có nhịp thì không ok', async () => {
    const beat = new Date();
    await heartbeat.beat(beat);
    const late = await heartbeat.status(new Date(beat.getTime() + HEARTBEAT_STALE_MS + 1000));
    expect(late.ok).toBe(false);
    expect(late.beatAgoSec).toBe(91);
    const edge = await heartbeat.status(new Date(beat.getTime() + HEARTBEAT_STALE_MS));
    expect(edge.ok).toBe(true);
  });

  it('khởi động lại (instance mới): startedAt đổi, vẫn một dòng', async () => {
    const later = new Date(Date.now() + 60_000);
    const restarted = new HeartbeatService(prisma, name);
    await restarted.start(() => later);
    restarted.onModuleDestroy();
    const rows = await prisma.workerHeartbeat.findMany({ where: { name } });
    expect(rows).toHaveLength(1);
    expect(rows[0].startedAt.getTime()).toBe(later.getTime());
  });

  it('DB lỗi: status không ném lỗi, trả về không ok', async () => {
    const broken = new HeartbeatService(
      { workerHeartbeat: { findUnique: () => Promise.reject(new Error('db')) } } as never,
      name,
    );
    await expect(broken.status()).resolves.toEqual({ ok: false, beatAgoSec: null });
  });
});
