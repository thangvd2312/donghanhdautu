import { NotFoundException } from '@nestjs/common';
import { AdvisorConversationsService } from '../advisor/advisor-conversations.service';
import type { AdvisorTools } from '../advisor/tools';
import type { AnalyticsService } from '../analytics/analytics.service';
import type { MarketService } from '../market/market.service';
import type { TrackedSymbolResolver } from '../market/tracked-symbol.resolver';
import { testPrisma, testUser } from '../test-utils/test-db';
import { NotificationInboxService } from './notification-inbox.service';
import type { NotifierService } from './notifier.service';
import { PriceAlertsService } from './price-alerts.service';

const prisma = testPrisma();
const inbox = new NotificationInboxService(prisma);
const alerts = new PriceAlertsService(prisma, {} as MarketService, {} as TrackedSymbolResolver, {} as NotifierService);
const conversations = new AdvisorConversationsService(prisma, {} as AdvisorTools, {} as AnalyticsService);

afterAll(() => prisma.$disconnect());

describe('ID của người khác → 404, không trả ok mà không đổi gì (PostgreSQL)', () => {
  it('đánh dấu đã đọc, xoá cảnh báo giá, xoá cuộc trò chuyện', async () => {
    const owner = await testUser(prisma, 'own-owner');
    const intruder = await testUser(prisma, 'own-intruder');
    const n = await prisma.notification.create({
      data: {
        userId: owner.id,
        kind: 'news',
        severity: 'info',
        title: 't',
        body: 'b',
        sources: [],
        dedupeKey: 'own:1',
      },
    });
    const a = await prisma.priceAlert.create({
      data: { userId: owner.id, assetType: 'stock', symbol: 'FPT', direction: 'above', targetPrice: 1 },
    });
    const c = await prisma.conversation.create({ data: { userId: owner.id, title: 'Của tôi' } });

    await expect(inbox.read(intruder.id, n.id)).rejects.toThrow(NotFoundException);
    await expect(alerts.remove(intruder.id, a.id)).rejects.toThrow(NotFoundException);
    await expect(conversations.deleteConversation(intruder.id, c.id)).rejects.toThrow(NotFoundException);
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: n.id } })).read).toBe(false);
    expect(await prisma.priceAlert.count({ where: { id: a.id } })).toBe(1);
    expect(await prisma.conversation.count({ where: { id: c.id } })).toBe(1);

    // Chủ sở hữu vẫn làm được
    await expect(inbox.read(owner.id, n.id)).resolves.toEqual({ ok: true });
    await expect(alerts.remove(owner.id, a.id)).resolves.toEqual({ ok: true });
    await expect(conversations.deleteConversation(owner.id, c.id)).resolves.toEqual({ ok: true });
  });
});
