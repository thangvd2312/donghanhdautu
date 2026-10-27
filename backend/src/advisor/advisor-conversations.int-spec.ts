/** Danh sách cuộc trò chuyện tách bản tin tự động khỏi câu người dùng tự hỏi (PostgreSQL thật). */
import type { AnalyticsService } from '../analytics/analytics.service';
import { testPrisma, testUser } from '../test-utils/test-db';
import { AdvisorConversationsService } from './advisor-conversations.service';
import type { AdvisorTools } from './tools';

const prisma = testPrisma();
const service = new AdvisorConversationsService(
  prisma,
  {} as unknown as AdvisorTools,
  {} as unknown as AnalyticsService,
);

afterAll(() => prisma.$disconnect());

describe('danh sách cuộc trò chuyện (PostgreSQL)', () => {
  it('bản tin mỗi giờ không đẩy mất câu người dùng tự hỏi; bản tin xếp theo lúc gửi', async () => {
    const u = await testUser(prisma, 'conv-list');
    const own = await prisma.conversation.create({
      data: { userId: u.id, title: 'Có nên mua thêm HPG?', createdAt: new Date('2026-10-20T03:00:00Z') },
    });
    // 150 bản tin coin mới hơn câu hỏi: trước đây giới hạn 50 cuộc chung khiến câu hỏi biến mất
    await prisma.conversation.createMany({
      data: Array.from({ length: 150 }, (_, i) => ({
        userId: u.id,
        title: `Bản tin coin ${i}`,
        brief: 'crypto',
        headline: `BTC đi ngang ${i}`,
        createdAt: new Date(Date.parse('2026-10-21T00:00:00Z') + i * 3_600_000),
      })),
    });
    const list = await service.listConversations(u.id);
    expect(list.chats.map((c) => c.id)).toEqual([own.id]);
    expect(list.chats[0]).not.toHaveProperty('brief');
    expect(list.briefs).toHaveLength(120);
    expect(list.briefs[0]).toMatchObject({ title: 'Bản tin coin 149', brief: 'crypto', headline: 'BTC đi ngang 149' });
  });
});
