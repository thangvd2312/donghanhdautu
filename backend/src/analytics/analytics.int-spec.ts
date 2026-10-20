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
    // Báo cáo tính trên toàn DB: dọn dữ liệu giả của các lần chạy trước (đều đặt ở năm 2001–2020, chỉ có trong DB test)
    const past = { lt: new Date('2021-01-01') };
    await prisma.analyticsEvent.deleteMany({ where: { createdAt: past } });
    await prisma.aiUsage.deleteMany({ where: { createdAt: past } });
    await prisma.investmentPlan.deleteMany({ where: { createdAt: past } });
    await prisma.user.deleteMany({ where: { createdAt: past } });
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

    // Chi phí AI mỗi người: A tốn 0,3 USD, B 0,1 USD; chi phí chung 0,2 USD chia cho 1 người hoạt động
    await prisma.aiUsage.createMany({
      data: [
        { userId: a.id, feature: 'chat', model: 'm', costUsd: 0.3, durationMs: 1, outcome: 'ok', createdAt: at(60) },
        {
          userId: b.id,
          feature: 'brief_weekly',
          model: 'm',
          costUsd: 0.1,
          durationMs: 1,
          outcome: 'ok',
          createdAt: at(60),
        },
        { feature: 'news_tag', model: 'm', costUsd: 0.2, durationMs: 1, outcome: 'ok', createdAt: at(60) },
      ],
    });
    // Thời gian tới giá trị đầu tiên: A có giao dịch thật ngày 2, xem danh mục ngày 3 → 72 giờ
    await ev(a.id, 'portfolio_viewed', 3, 'portfolio_viewed:d3');
    // Kế hoạch: A xem lại trong 30 ngày, B có kế hoạch quá hạn
    const planOf = (userId: string, nextReview: number) =>
      prisma.investmentPlan.create({
        data: {
          userId,
          assetType: 'stock',
          symbol: 'FPT',
          thesis: 't',
          exitConditions: 'e',
          nextReviewAt: at(nextReview),
          createdAt: at(1),
        },
      });
    const pa = await planOf(a.id, 90);
    await planOf(b.id, 40);
    await prisma.planReview.create({ data: { planId: pa.id, decision: 'keep', createdAt: at(55) } });
    // Chất lượng dữ liệu: 3 ngày đủ giá, 1 ngày thiếu giá
    for (const [i, status] of (['ok', 'ok', 'ok', 'partial'] as const).entries()) {
      await ev(a.id, 'portfolio_valued', 50 + i, `pv:${i}`, { status });
    }
    // Chất lượng AI: 4 câu hỏi, 1 lần báo sai số; 1 câu trả lời tự đối chiếu có lỗi
    for (let i = 0; i < 4; i++) await ev(a.id, 'advisor_asked', 50 + i);
    await prisma.answerFeedback.create({
      data: {
        userId: a.id,
        conversationId: 'c',
        answerId: 'm',
        reason: 'wrong_number',
        question: 'q',
        answer: 'a',
        createdAt: at(51),
      },
    });
    const conv = await prisma.conversation.create({ data: { userId: a.id, title: 't' } });
    await prisma.chatMessage.create({
      data: {
        conversationId: conv.id,
        role: 'assistant',
        content: [],
        meta: { verification: { status: 'issues', issues: [] } },
        createdAt: at(51),
      },
    });

    const full = await usageReport(prisma, { weeks: 10, now: at(62) });
    expect(full.timeToFirstValue).toMatchObject({ users: 1, median_hours: 72 });
    expect(full.planReviews30Days).toEqual({
      users_with_plans: 2,
      users_reviewed: 1,
      overdue_plans: 1,
      reviewedPct: 50,
    });
    expect(full.dataQuality30Days.okPct).toBe(75);
    expect(full.aiQuality30Days).toMatchObject({
      questions: 4,
      reports: 1,
      reportPct: 25,
      byReason: [{ reason: 'wrong_number', reports: 1 }],
      verification: [{ status: 'issues', answers: 1 }],
    });

    // Phễu: 2 thiết bị xem trang mẫu, 1 bấm đăng ký; 3 người đăng ký, A làm khảo sát, B bỏ qua, A có giao dịch thật
    const anon = (id: string, name: string, day: number) =>
      prisma.analyticsEvent.create({
        data: { anonId: id, actor: `anon:${id}`, name, sample: true, createdAt: at(day), dedupeKey: `${name}:${day}` },
      });
    const tag = Math.random().toString(36).slice(2);
    await anon(`d1-${tag}`, 'demo_viewed', -1);
    await anon(`d2-${tag}`, 'demo_viewed', -1);
    await anon(`d1-${tag}`, 'demo_signup_clicked', -1);
    await prisma.investorProfile.create({
      data: {
        userId: a.id,
        answers: {},
        riskScore: 50,
        riskType: 'balanced',
        goal: 'g',
        horizon: 'h',
        maxDrawdownPct: 20,
        fomoProne: false,
      },
    });
    await ev(b.id, 'onboarding_skipped', 0, 'onboarding_skipped');
    // Nhập CSV: 1 lần thành công (8/10 dòng, 2 lỗi), 1 lần không nhập được vì mọi dòng lỗi (5 dòng)
    await ev(a.id, 'import_completed', 50, 'import:1', { rows: 8, errors: 2, total: 10 });
    await ev(a.id, 'import_rejected', 51, undefined, { reason: 'errors', errors: 5, total: 5 });

    const withFunnel = await usageReport(prisma, { weeks: 10, now: at(62) });
    expect(withFunnel.funnel).toMatchObject({
      demo_viewers: 2,
      demo_cta: 1,
      ctaPct: 50,
      signups: 3,
      onboarded: 1,
      skipped_survey: 1,
      activated_7d: 1,
    });
    expect(withFunnel.importQuality30Days).toMatchObject({
      imports: 1,
      rows_imported: 8,
      rows_in_files: 15,
      error_rows: 7,
      rejected: 1,
      rejectedBy: [{ reason: 'errors', count: 1 }],
    });

    const c = (await usageReport(prisma, { weeks: 10, now: at(62) })).aiCostPerUser30Days;
    expect(c).toMatchObject({ users: 2, max_usd: 0.3, sharedUsd: 0.2, sharedPerActiveUserUsd: 0.2 });
    expect(c.avg_usd).toBeCloseTo(0.2);
  });
});
