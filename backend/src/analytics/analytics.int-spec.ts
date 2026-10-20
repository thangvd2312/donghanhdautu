import { testPrisma, testUser } from '../test-utils/test-db';
import { AnalyticsService } from './analytics.service';
import { usageReport } from './report';

const prisma = testPrisma();
const analytics = new AnalyticsService(prisma);

afterAll(() => prisma.$disconnect());

const DAY = 86_400_000;

describe('đo hành vi (PostgreSQL)', () => {
  it('chống trùng theo khoá, bỏ thuộc tính ngoài từ điển', async () => {
    const u = await testUser(prisma, 'events');
    await analytics.track('signup', {
      userId: u.id,
      props: { method: 'password', email: 'x@y.z' },
      dedupeKey: 'signup',
    });
    await analytics.track('signup', { userId: u.id, props: { method: 'password' }, dedupeKey: 'signup' });
    const rows = await prisma.analyticsEvent.findMany({ where: { userId: u.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].props).toEqual({ method: 'password' });
  });

  it('khách dùng mã ẩn danh, sự kiện danh mục mẫu tách khỏi số liệu thật', async () => {
    const anonId = `anon-${Date.now()}`;
    await analytics.track('demo_viewed', { anonId, sample: true, dedupeKey: 'demo_viewed:2026-10-20' });
    const row = await prisma.analyticsEvent.findFirst({ where: { anonId } });
    expect(row).toMatchObject({ userId: null, actor: `anon:${anonId}`, sample: true });
  });

  it('báo cáo: kích hoạt, giữ chân D7/D30, lượt mở bản tin', async () => {
    // Một tuần ngẫu nhiên trong quá khứ để không lẫn dữ liệu của lần chạy khác
    const monday = new Date(Date.UTC(2001, 0, 1) + Math.floor(Math.random() * 1000) * 7 * DAY);
    const signupAt = new Date(monday.getTime() + 3 * 3600_000); // 10h sáng thứ 2 giờ VN
    const at = (days: number) => new Date(signupAt.getTime() + days * DAY);
    const users = await Promise.all([0, 1, 2].map((i) => testUser(prisma, `cohort-${i}`)));
    await prisma.user.updateMany({ where: { id: { in: users.map((u) => u.id) } }, data: { createdAt: signupAt } });
    const [a, b] = users;
    // A: ghi giao dịch thật ngày 2 (kích hoạt), hoạt động ngày 8 và ngày 35
    await prisma.transaction.create({
      data: { userId: a.id, type: 'deposit', date: at(2), amount: 1_000_000, currency: 'VND', createdAt: at(2) },
    });
    // B: chỉ có số dư chuyển đổi từ dữ liệu cũ (không tính kích hoạt), hoạt động ngày 3
    await prisma.transaction.create({
      data: {
        userId: b.id,
        type: 'deposit',
        date: at(1),
        amount: 1,
        currency: 'VND',
        source: 'migration',
        createdAt: at(1),
      },
    });
    const ev = (userId: string, name: string, day: number, dedupeKey?: string, props = {}) =>
      prisma.analyticsEvent.create({ data: { userId, actor: userId, name, createdAt: at(day), dedupeKey, props } });
    await ev(a.id, 'app_active', 8);
    await ev(a.id, 'app_active', 35);
    await ev(b.id, 'app_active', 3);
    // Bản tin tuần cho A và B; A mở và hỏi tiếp, B không mở. Bản "Gửi thử" không tính.
    const key = (u: string) => `brief:weekly:${u}`;
    await ev(a.id, 'brief_generated', 60, key(a.id), { kind: 'weekly' });
    await ev(b.id, 'brief_generated', 60, key(b.id), { kind: 'weekly' });
    await ev(a.id, 'brief_generated', 60, `${key(a.id)}:test`, { kind: 'weekly', test: true });
    await ev(a.id, 'brief_opened', 61, `brief_opened:${key(a.id)}`, { kind: 'weekly' });
    await ev(a.id, 'brief_followup', 61, `brief_followup:${key(a.id)}`, { kind: 'weekly' });

    const r = await usageReport(prisma, { weeks: 10, now: at(62) });
    const week = r.cohorts.find((c) => c.week === monday.toISOString().slice(0, 10));
    expect(week).toMatchObject({
      signups: 3,
      activated: 1,
      d7_eligible: 3,
      d7_retained: 1,
      d30_eligible: 3,
      d30_retained: 1,
    });
    expect(r.briefs).toEqual([
      { kind: 'weekly', generated: 2, opened: 1, followed_up: 1, openPct: 50, followupPct: 50 },
    ]);
    // Bản tin hệ thống tự tạo không tính là hoạt động: chỉ A (mở bản tin ngày 61, hoạt động ngày 35)
    expect(r.active).toEqual({ dau: 1, wau: 1, mau: 1 });
  });
});
