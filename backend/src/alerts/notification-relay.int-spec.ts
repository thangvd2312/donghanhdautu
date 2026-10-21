import type { AuthService } from '../auth/auth.module';
import { MarketGateway } from '../market/market.gateway';
import { testPrisma, testUser } from '../test-utils/test-db';
import { NotificationRelayService, RELAY_OVERLAP_MS } from './notification-relay.service';

const prisma = testPrisma();
afterAll(() => prisma.$disconnect());

function newGateway() {
  const emitted: { room: string; event: string; payload: { id: string } }[] = [];
  const gateway = new MarketGateway({ events$: { subscribe: () => undefined } } as never, {} as AuthService);
  gateway.server = {
    to: (room: string) => ({
      emit: (event: string, payload: { id: string }) => emitted.push({ room, event, payload }),
    }),
  } as never;
  return { gateway, emitted };
}

const relayOf = (gateway: MarketGateway) => new NotificationRelayService(prisma, gateway, { isWorker: false } as never);

const create = (userId: string, tag: string, createdAt?: Date) =>
  prisma.notification.create({
    data: {
      userId,
      kind: 'news',
      severity: 'info',
      title: tag,
      body: tag,
      sources: [],
      dedupeKey: `${tag}:${userId}`,
      createdAt,
    },
  });

describe('relay thông báo từ worker xuống socket (web)', () => {
  it('đẩy thông báo mới do tiến trình khác tạo, đúng phòng user, chỉ một lần', async () => {
    const u = await testUser(prisma, 'relay-new');
    const { gateway, emitted } = newGateway();
    const relay = relayOf(gateway);
    const n = await create(u.id, 'from-worker');
    expect(await relay.poll()).toBeGreaterThanOrEqual(1);
    expect(emitted.filter((e) => e.payload.id === n.id)).toEqual([
      expect.objectContaining({ room: `user:${u.id}`, event: 'notification' }),
    ]);
    await relay.poll();
    expect(emitted.filter((e) => e.payload.id === n.id)).toHaveLength(1);
  });

  it('thông báo cũ trước lúc web khởi động không bị đẩy lại', async () => {
    const u = await testUser(prisma, 'relay-old');
    const old = await create(u.id, 'old', new Date(Date.now() - RELAY_OVERLAP_MS - 60_000));
    const { gateway, emitted } = newGateway();
    await relayOf(gateway).poll();
    expect(emitted.find((e) => e.payload.id === old.id)).toBeUndefined();
  });

  it('thông báo do chính web đã đẩy ngay (notifyUser) thì relay không đẩy trùng', async () => {
    const u = await testUser(prisma, 'relay-dupe');
    const { gateway, emitted } = newGateway();
    const relay = relayOf(gateway);
    const n = await create(u.id, 'from-web');
    gateway.notifyUser(u.id, 'notification', n);
    await relay.poll();
    expect(emitted.filter((e) => e.payload.id === n.id)).toHaveLength(1);
  });

  it('dòng commit muộn (createdAt cũ hơn dòng đã thấy) vẫn được đẩy nhờ quét lại khoảng gối', async () => {
    const u = await testUser(prisma, 'relay-late');
    const { gateway, emitted } = newGateway();
    const relay = relayOf(gateway);
    await create(u.id, 'newer');
    await relay.poll();
    const late = await create(u.id, 'late', new Date(Date.now() - 5_000));
    await relay.poll();
    expect(emitted.filter((e) => e.payload.id === late.id)).toHaveLength(1);
  });
});
