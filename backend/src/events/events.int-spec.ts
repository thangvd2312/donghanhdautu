import { NotifierService } from '../alerts/notifier.service';
import type { MarketGateway } from '../market/market.gateway';
import type { VcMarketEvent, VietcapProvider } from '../market/providers/vietcap.provider';
import { testPrisma, testUser } from '../test-utils/test-db';
import { EventsService } from './events.service';

const prisma = testPrisma();
const notifier = new NotifierService(prisma, { notifyUser: () => undefined } as unknown as MarketGateway);
const TODAY = '2026-10-21';

let events: VcMarketEvent[] = [];
let failing = false;
const vietcap = {
  marketEvents: () =>
    failing
      ? Promise.reject(new Error('Vietcap 500'))
      : Promise.resolve({ events, fetchedAt: '2026-10-21T01:00:00.000Z' }),
} as unknown as VietcapProvider;
const service = new EventsService(prisma, vietcap, notifier);

const fpt = (o: Partial<VcMarketEvent> = {}): VcMarketEvent => ({
  id: 'fpt-1',
  ticker: 'FPT',
  eventCode: 'DIV',
  eventTitleVi: 'Trả cổ tức bằng tiền mặt - 1,000 VND',
  exrightDate: '2026-10-22T00:00:00',
  recordDate: '2026-10-23T00:00:00',
  payoutDate: '2026-11-10T00:00:00',
  valuePerShare: 1000,
  ...o,
});

afterAll(() => prisma.$disconnect());
beforeEach(() => {
  events = [fpt()];
  failing = false;
});

async function userWith(tag: string) {
  const u = await testUser(prisma, tag);
  await prisma.holding.create({ data: { userId: u.id, assetType: 'stock', symbol: 'FPT', quantity: 300, avgCost: 1 } });
  await prisma.holding.create({ data: { userId: u.id, assetType: 'stock', symbol: 'VNM', quantity: 0, avgCost: 1 } });
  await prisma.watchItem.create({ data: { userId: u.id, assetType: 'stock', symbol: 'HPG' } });
  return u;
}

describe('cài đặt nhắc sự kiện (PostgreSQL)', () => {
  it('mặc định tắt; PATCH một phần giữ phần còn lại; chuẩn hoá mã bị tắt', async () => {
    const u = await testUser(prisma, 'ev-settings');
    expect(await service.settings(u.id)).toEqual({ enabled: false, daysBefore: 1, mutedSymbols: [] });
    expect(await service.updateSettings(u.id, { enabled: true, daysBefore: 3 })).toEqual({
      enabled: true,
      daysBefore: 3,
      mutedSymbols: [],
    });
    expect(await service.updateSettings(u.id, { mutedSymbols: [' fpt ', 'FPT', 'hpg'] })).toEqual({
      enabled: true,
      daysBefore: 3,
      mutedSymbols: ['FPT', 'HPG'],
    });
    expect((await service.list(u.id, 'month', TODAY)).reminders.daysBefore).toBe(3);
  });
});

describe('lịch sự kiện (PostgreSQL)', () => {
  it('trả sự kiện của mã đang giữ / theo dõi, bỏ mã số lượng 0; nguồn lỗi → unavailable', async () => {
    const u = await userWith('ev-list');
    await prisma.holding.create({
      data: { userId: u.id, assetType: 'stock', symbol: 'FPT', quantity: 200, avgCost: 1 },
    });
    events = [fpt(), fpt({ id: 'vnm-1', ticker: 'VNM' }), fpt({ id: 'hpg-1', ticker: 'HPG', valuePerShare: 500 })];
    const res = await service.list(u.id, 'month', TODAY);
    expect(res.unavailable).toBe(false);
    expect(res.items.map((i) => [i.key, i.held, i.watched, i.estimatedCash])).toEqual([
      ['FPT:cash:fpt-1', true, false, 500_000], // 300 + 200 cổ phiếu ở hai dòng
      ['HPG:cash:hpg-1', false, true, null],
    ]);
    expect(res.symbols).toEqual([
      { symbol: 'FPT', held: true, watched: false },
      { symbol: 'HPG', held: false, watched: true },
    ]);
    failing = true;
    expect(await service.list(u.id, 'month', TODAY)).toMatchObject({ items: [], unavailable: true, source: 'Vietcap' });
  });
});

describe('nhắc sự kiện (PostgreSQL)', () => {
  const notes = (userId: string) => prisma.notification.findMany({ where: { userId, kind: 'event' } });

  it('chạy lại không gửi trùng; đổi ngày gửi một lần với khoá mới; người tắt nhắc không nhận', async () => {
    const on = await userWith('ev-remind-on');
    const off = await userWith('ev-remind-off');
    await service.updateSettings(on.id, { enabled: true, daysBefore: 1 });
    const before = await prisma.notification.count();

    expect(await service.runReminders(TODAY)).toBeGreaterThanOrEqual(1);
    expect(await service.runReminders(TODAY)).toBe(0);
    const first = await notes(on.id);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      dedupeKey: 'event:FPT:fpt-1:2026-10-22',
      title: 'FPT: GDKHQ cổ tức 1.000 ₫/cp ngày 22/10',
      link: '/events?focus=FPT%3Acash%3Afpt-1',
    });
    expect(first[0].body).toContain('300.000 ₫');
    expect(await notes(off.id)).toHaveLength(0);
    expect(await prisma.notification.count()).toBeGreaterThan(before);

    // Công ty dời GDKHQ sang 24/10: hôm nay (21/10) chưa vào cửa sổ 1 ngày → chưa nhắc; ngày 23/10 nhắc một lần theo ngày mới
    events = [fpt({ exrightDate: '2026-10-24T00:00:00' })];
    await service.runReminders(TODAY);
    expect(await notes(on.id)).toHaveLength(1);
    await service.runReminders('2026-10-23');
    await service.runReminders('2026-10-23');
    const keys = (await notes(on.id)).map((n) => n.dedupeKey).sort();
    expect(keys).toEqual(['event:FPT:fpt-1:2026-10-22', 'event:FPT:fpt-1:2026-10-24']);
  });

  it('mã bị tắt nhắc không nhận; nguồn lỗi thì không gửi và không ném lỗi', async () => {
    const u = await userWith('ev-remind-muted');
    await service.updateSettings(u.id, { enabled: true, mutedSymbols: ['FPT'] });
    await service.runReminders(TODAY);
    expect(await notes(u.id)).toHaveLength(0);
    await service.updateSettings(u.id, { mutedSymbols: [] });
    failing = true;
    await expect(service.runReminders(TODAY)).resolves.toBe(0);
    expect(await notes(u.id)).toHaveLength(0);
  });
});
