import type { MarketGateway } from '../market/market.gateway';
import { testPrisma, testUser } from '../test-utils/test-db';
import { NotifierService } from './notifier.service';

const prisma = testPrisma();
const gateway = { notifyUser: () => undefined } as unknown as MarketGateway;
const notifier = new NotifierService(prisma, gateway);

afterAll(() => prisma.$disconnect());

describe('thông báo và việc gửi ngoài ứng dụng (PostgreSQL)', () => {
  const input = {
    kind: 'news' as const,
    severity: 'info' as const,
    title: 'Tin FPT',
    body: 'Nội dung',
    dedupeKey: 'news:1',
  };

  async function subscribedUser(tag: string) {
    const u = await testUser(prisma, tag);
    await prisma.telegramLink.create({ data: { userId: u.id, chatId: `chat-${u.id}`, kinds: ['news'] } });
    await prisma.pushSubscription.create({
      data: { userId: u.id, endpoint: `https://push.test/${u.id}`, p256dh: 'k', auth: 'a' },
    });
    return u;
  }

  it('lưu thông báo kèm việc gửi Telegram và Web Push; gửi lại cùng khoá không tạo thêm', async () => {
    const u = await subscribedUser('notify-ok');
    expect(await notifier.send(u.id, input)).not.toBeNull();
    expect(await notifier.send(u.id, input)).toBeNull();
    expect(await prisma.notification.count({ where: { userId: u.id } })).toBe(1);
    expect(await prisma.telegramDelivery.count({ where: { userId: u.id } })).toBe(1);
    expect(await prisma.pushDelivery.count({ where: { userId: u.id } })).toBe(1);
  });

  it('không tạo được việc gửi thì không lưu thông báo; lần sau tạo đủ cả hai', async () => {
    const u = await subscribedUser('notify-fail');
    const fn = `fail_push_${u.id.replace(/\W/g, '')}`;
    await prisma.$executeRawUnsafe(
      `CREATE FUNCTION ${fn}() RETURNS trigger AS $$ BEGIN IF NEW."userId" = '${u.id}' THEN RAISE EXCEPTION 'injected'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER ${fn} BEFORE INSERT ON "PushDelivery" FOR EACH ROW EXECUTE FUNCTION ${fn}()`,
    );
    try {
      expect(await notifier.send(u.id, input)).toBeNull();
      expect(await prisma.notification.count({ where: { userId: u.id } })).toBe(0);
      expect(await prisma.telegramDelivery.count({ where: { userId: u.id } })).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER ${fn} ON "PushDelivery"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION ${fn}()`);
    }
    expect(await notifier.send(u.id, input)).not.toBeNull();
    expect(await prisma.pushDelivery.count({ where: { userId: u.id } })).toBe(1);
    expect(await prisma.telegramDelivery.count({ where: { userId: u.id } })).toBe(1);
  });
});
