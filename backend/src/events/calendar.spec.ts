import type { VcMarketEvent } from '../market/providers/vietcap.provider';
import {
  buildCalendar,
  classifyEvent,
  DEFAULT_REMINDER_SETTINGS,
  inWindow,
  lastBuyDay,
  remindAt,
  reminderDedupeKey,
  reminderDue,
  reminderMessage,
} from './calendar';
import type { ReminderSettings } from './calendar';

const ev = (o: Partial<VcMarketEvent>): VcMarketEvent => ({ id: 'e1', ticker: 'FPT', eventCode: 'DIV', ...o });
const cash = ev({
  eventTitleVi: 'Trả cổ tức bằng tiền mặt - 1,000 VND',
  exrightDate: '2026-10-23T00:00:00',
  recordDate: '2026-10-26T00:00:00',
  payoutDate: '2026-11-26T00:00:00',
  valuePerShare: 1000,
  publicDate: '2026-10-20T00:00:00',
});
const on: ReminderSettings = { enabled: true, daysBefore: 1, mutedSymbols: [] };
const base = {
  holdings: new Map([['FPT', 500]]),
  watched: new Set<string>(),
  today: '2026-10-21',
  range: 'month' as const,
};

describe('classifyEvent', () => {
  it('cổ tức tiền mặt: các ngày và giá trị', () => {
    expect(classifyEvent(cash)).toMatchObject({
      key: 'FPT:cash:e1',
      kind: 'cash',
      date: '2026-10-23',
      exDate: '2026-10-23',
      recordDate: '2026-10-26',
      payoutDate: '2026-11-26',
      valuePerShare: 1000,
      publishedAt: '2026-10-20',
    });
  });

  it('phân biệt quyền mua và cổ phiếu thưởng / cổ tức bằng cổ phiếu', () => {
    const iss = { eventCode: 'ISS', exrightDate: '2026-10-23T00:00:00', exerciseRatio: 0.235 };
    expect(classifyEvent(ev({ ...iss, eventTitleEn: 'Share Issue - Rights issue ratio 23.5%' }))).toMatchObject({
      kind: 'rights',
      ratioPct: 23.5,
      rightsPrice: null,
    });
    expect(classifyEvent(ev({ ...iss, eventTitleEn: 'Share Issue - Bonus Issue ratio 23.5%' }))?.kind).toBe('stock');
    expect(classifyEvent(ev({ ...iss, eventTitleEn: 'Share Issue - Stock dividend ratio 23.5%' }))?.kind).toBe('stock');
  });

  it('bỏ ESOP, phát hành riêng lẻ, chuyển đổi trái phiếu, cổ tức không có tiền, sự kiện chưa có ngày', () => {
    const iss = { eventCode: 'ISS', exrightDate: '2026-10-23T00:00:00', exerciseRatio: 0.02 };
    for (const t of ['ESOP ratio 1.7%', 'Private Placements ratio 11.2%', 'Transfer from Convertible Bonds']) {
      expect(classifyEvent(ev({ ...iss, eventTitleEn: `Share Issue - ${t}` }))).toBeNull();
    }
    expect(classifyEvent(ev({ valuePerShare: 0, exrightDate: '2026-10-23T00:00:00' }))).toBeNull();
    expect(classifyEvent(ev({ valuePerShare: 1000 }))).toBeNull(); // mới công bố, chưa có ngày GDKHQ
    expect(classifyEvent(ev({ eventCode: 'DDIND', exrightDate: '2026-10-23T00:00:00' }))).toBeNull();
  });

  it('đại hội: GDKHQ làm ngày xếp lịch, ngày họp lấy từ issueDate; thiếu GDKHQ thì dùng ngày họp', () => {
    const agm = ev({ eventCode: 'AGME', exrightDate: '2026-11-05T00:00:00', issueDate: '2026-12-08T00:00:00' });
    expect(classifyEvent(agm)).toMatchObject({ kind: 'agm', date: '2026-11-05', meetingDate: '2026-12-08' });
    expect(classifyEvent(ev({ eventCode: 'EGME', exrightDate: '2026-10-29T00:00:00' }))).toMatchObject({
      kind: 'egm',
      meetingDate: null,
    });
    expect(classifyEvent(ev({ eventCode: 'AGME', issueDate: '2026-12-08T00:00:00' }))).toMatchObject({
      date: '2026-12-08',
      exDate: null,
    });
  });
});

describe('cửa sổ ngày', () => {
  it('chỉ cần một trong các ngày nằm trong cửa sổ', () => {
    const e = { exDate: '2026-10-01', recordDate: null, payoutDate: '2026-11-05', meetingDate: null };
    expect(inWindow(e, '2026-10-14', '2026-11-20')).toBe(true);
    expect(inWindow(e, '2026-11-06', '2026-11-20')).toBe(false);
  });

  it('range lọc theo số ngày; sự kiện quá 7 ngày trước bị bỏ', () => {
    const far = ev({
      id: 'far',
      exrightDate: '2026-12-15T00:00:00',
      valuePerShare: 1,
      recordDate: '2026-12-16T00:00:00',
    });
    const old = ev({ id: 'old', exrightDate: '2026-10-10T00:00:00', valuePerShare: 1 });
    const recent = ev({ id: 'recent', exrightDate: '2026-10-16T00:00:00', valuePerShare: 1 });
    const events = [cash, far, old, recent];
    const keys = (range: 'week' | 'month' | 'quarter') =>
      buildCalendar({ ...base, range, events, settings: on }).map((i) => i.key);
    expect(keys('week')).toEqual(['FPT:cash:recent', 'FPT:cash:e1']);
    expect(keys('month')).toEqual(['FPT:cash:recent', 'FPT:cash:e1']);
    expect(keys('quarter')).toEqual(['FPT:cash:recent', 'FPT:cash:e1', 'FPT:cash:far']);
  });
});

describe('buildCalendar', () => {
  it('gộp đang giữ và theo dõi, bỏ mã không liên quan, sắp theo ngày', () => {
    const other = ev({ id: 'x', ticker: 'VNM', exrightDate: '2026-10-22T00:00:00', valuePerShare: 500 });
    const stranger = ev({ id: 'y', ticker: 'ZZZ', exrightDate: '2026-10-22T00:00:00', valuePerShare: 500 });
    const items = buildCalendar({
      ...base,
      watched: new Set(['VNM', 'FPT']),
      events: [cash, other, stranger],
      settings: DEFAULT_REMINDER_SETTINGS,
    });
    expect(items.map((i) => [i.symbol, i.held, i.watched])).toEqual([
      ['VNM', false, true],
      ['FPT', true, true],
    ]);
  });

  it('estimatedCash chỉ khi cash và đang giữ; upcoming theo ngày hôm nay', () => {
    const stockEv = ev({
      id: 's',
      eventCode: 'ISS',
      eventTitleEn: 'Bonus Issue',
      exerciseRatio: 0.1,
      exrightDate: '2026-10-22T00:00:00',
    });
    const watchedOnly = ev({ id: 'w', ticker: 'VNM', exrightDate: '2026-10-22T00:00:00', valuePerShare: 500 });
    const past = ev({ id: 'p', exrightDate: '2026-10-20T00:00:00', valuePerShare: 100 });
    const items = buildCalendar({
      ...base,
      watched: new Set(['VNM']),
      events: [cash, stockEv, watchedOnly, past],
      settings: on,
    });
    const by = Object.fromEntries(items.map((i) => [i.key, i]));
    expect(by['FPT:cash:e1']).toMatchObject({ estimatedCash: 500_000, heldQuantity: 500, upcoming: true });
    expect(by['FPT:stock:s']).toMatchObject({ estimatedCash: null, ratioPct: 10 });
    expect(by['VNM:cash:w']).toMatchObject({ estimatedCash: null, heldQuantity: null });
    expect(by['FPT:cash:p']).toMatchObject({ upcoming: false, remindAt: null });
  });

  it('đại hội đã qua GDKHQ nhưng chưa họp vẫn là sắp tới', () => {
    const agm = ev({
      id: 'a',
      eventCode: 'AGME',
      exrightDate: '2026-10-15T00:00:00',
      issueDate: '2026-10-30T00:00:00',
    });
    const [i] = buildCalendar({ ...base, events: [agm], settings: on });
    expect(i).toMatchObject({ kind: 'agm', upcoming: true, remindAt: null });
  });
});

describe('nhắc trước', () => {
  it('cửa sổ nhắc: daysBefore 1 và 3, sự kiện công bố muộn, sự kiện đã qua', () => {
    expect(reminderDue('2026-10-23', '2026-10-22', 1)).toBe(true);
    expect(reminderDue('2026-10-23', '2026-10-21', 1)).toBe(false);
    expect(reminderDue('2026-10-23', '2026-10-20', 3)).toBe(true);
    expect(reminderDue('2026-10-23', '2026-10-19', 3)).toBe(false);
    // công bố muộn: hôm nay đã cách 2 ngày với daysBefore 3 → vào cửa sổ ngay
    expect(reminderDue('2026-10-23', '2026-10-21', 3)).toBe(true);
    expect(reminderDue('2026-10-23', '2026-10-23', 3)).toBe(false); // đúng ngày GDKHQ: quá muộn
    expect(reminderDue('2026-10-23', '2026-10-25', 3)).toBe(false);
    expect(reminderDue(null, '2026-10-21', 3)).toBe(false);
  });

  it('remindAt: tắt, muted, đã qua → null; công bố muộn → hôm nay', () => {
    const e = { kind: 'cash' as const, symbol: 'FPT', exDate: '2026-10-30', meetingDate: null };
    expect(remindAt(e, on, '2026-10-21')).toBe('2026-10-29');
    expect(remindAt(e, { ...on, daysBefore: 3 }, '2026-10-21')).toBe('2026-10-27');
    expect(remindAt(e, { ...on, daysBefore: 3 }, '2026-10-29')).toBe('2026-10-29');
    expect(remindAt(e, DEFAULT_REMINDER_SETTINGS, '2026-10-21')).toBeNull();
    expect(remindAt(e, { ...on, mutedSymbols: ['FPT'] }, '2026-10-21')).toBeNull();
    expect(remindAt(e, on, '2026-10-30')).toBeNull();
  });

  it('đổi ngày → khoá nhắc mới; cùng ngày → cùng khoá', () => {
    const e = { symbol: 'FPT', sourceId: 'e1' };
    expect(reminderDedupeKey(e, '2026-10-23')).toBe('event:FPT:e1:2026-10-23');
    expect(reminderDedupeKey(e, '2026-10-23')).toBe(reminderDedupeKey(e, '2026-10-23'));
    expect(reminderDedupeKey(e, '2026-10-27')).not.toBe(reminderDedupeKey(e, '2026-10-23'));
  });

  it('phiên mua chậm nhất bỏ qua cuối tuần', () => {
    expect(lastBuyDay('2026-10-23')).toBe('2026-10-22'); // thứ 6 → thứ 5
    expect(lastBuyDay('2026-10-26')).toBe('2026-10-23'); // thứ 2 → thứ 6
  });

  it('nội dung nhắc: tiêu đề, phiên mua chậm nhất, ước tính tiền chỉ khi giữ', () => {
    const [held] = buildCalendar({ ...base, events: [cash], settings: on });
    const m = reminderMessage(held, '2026-10-23');
    expect(m.title).toBe('FPT: GDKHQ cổ tức 1.000 ₫/cp ngày 23/10');
    expect(m.body).toContain('mua chậm nhất phiên 22/10');
    expect(m.body).toContain('500.000 ₫');
    expect(m.link).toBe('/events?focus=FPT%3Acash%3Ae1');
    const [watched] = buildCalendar({
      ...base,
      holdings: new Map(),
      watched: new Set(['FPT']),
      events: [cash],
      settings: on,
    });
    expect(reminderMessage(watched, '2026-10-23').body).not.toContain('Ước tính');
  });
});
