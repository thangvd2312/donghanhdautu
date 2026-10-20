import { testPrisma, testUser } from '../test-utils/test-db';
import { AiQuotaError, AiUsageService } from './ai-usage.service';

const prisma = testPrisma();
const ai = new AiUsageService(prisma);

afterAll(() => prisma.$disconnect());

describe('quota AI (PostgreSQL)', () => {
  it('hai câu hỏi gửi cùng lúc: chỉ một câu chạy, câu kia được báo dễ hiểu', async () => {
    const u = await testUser(prisma, 'ai-concurrent');
    const res = await Promise.allSettled([ai.reserve(u.id, 'chat'), ai.reserve(u.id, 'chat')]);
    expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = res.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rejected?.reason).toBeInstanceOf(AiQuotaError);
    expect((rejected?.reason as Error).message).toContain('đang trả lời câu trước');
  });

  it('hết lượt trong ngày thì chặn; lượt đang chạy bị bỏ dở quá lâu không chặn mãi', async () => {
    const u = await testUser(prisma, 'ai-limit');
    for (let i = 0; i < ai.limits.brief_test; i++) await ai.finish(await ai.reserve(u.id, 'brief_test'));
    await expect(ai.reserve(u.id, 'brief_test')).rejects.toThrow('hết');

    const v = await testUser(prisma, 'ai-stale');
    await prisma.aiRequest.create({
      data: { userId: v.id, kind: 'chat', createdAt: new Date(Date.now() - 11 * 60_000) },
    });
    await expect(ai.reserve(v.id, 'chat')).resolves.toEqual(expect.any(String));
  });

  it('chạm ngân sách chung trong ngày thì mọi người đều được báo, dữ liệu khác không ảnh hưởng', async () => {
    const budget = new AiUsageService(prisma);
    Object.assign(budget, { dailyBudgetUsd: 0.000001 });
    await budget.record({
      feature: 'chat',
      model: 'claude-opus-5-5',
      usage: { input_tokens: 1000, output_tokens: 1000 },
      durationMs: 10,
      outcome: 'ok',
    });
    const u = await testUser(prisma, 'ai-budget');
    await expect(budget.reserve(u.id, 'chat')).rejects.toThrow('ngân sách');
  });

  it('ghi usage: chi phí null khi không rõ, có phiên bản giá khi tính được', async () => {
    const u = await testUser(prisma, 'ai-usage');
    await ai.record({ feature: 'chat', userId: u.id, model: 'MiniMax-M2', durationMs: 5, outcome: 'aborted' });
    await ai.record({
      feature: 'verifier',
      userId: u.id,
      model: 'claude-haiku-5-5',
      usage: { input_tokens: 1_000_000, output_tokens: 0 },
      durationMs: 5,
      outcome: 'ok',
    });
    const rows = await prisma.aiUsage.findMany({ where: { userId: u.id }, orderBy: { feature: 'asc' } });
    expect(rows.map((r) => [r.feature, r.costUsd?.toNumber() ?? null, r.priceVersion])).toEqual([
      ['chat', null, null],
      ['verifier', 0.1, '2026-10-06'],
    ]);
  });
});
