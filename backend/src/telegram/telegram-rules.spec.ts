import { decide, formatMessage, inQuietHours, MAX_PER_HOUR, quietEndsAt, retryAt, vnMinutes } from './telegram-rules';

const link = { active: true, kinds: { price_target: true, brief: false }, quietStart: 22 * 60, quietEnd: 7 * 60 };
/** Giờ VN → Date */
const vn = (hhmm: string) => new Date(`2026-10-20T${hhmm}:00+07:00`);

describe('giờ yên lặng', () => {
  it('khoảng qua nửa đêm', () => {
    expect(vnMinutes(vn('23:30'))).toBe(23 * 60 + 30);
    expect(inQuietHours(23 * 60, 1320, 420)).toBe(true);
    expect(inQuietHours(3 * 60, 1320, 420)).toBe(true);
    expect(inQuietHours(7 * 60, 1320, 420)).toBe(false);
    expect(inQuietHours(12 * 60, 1320, 420)).toBe(false);
    expect(inQuietHours(12 * 60, null, null)).toBe(false);
  });

  it('hoãn tới hết giờ yên lặng', () => {
    expect(quietEndsAt(vn('23:30'), 420)).toEqual(new Date('2026-10-21T07:00:00+07:00'));
    expect(quietEndsAt(vn('03:15'), 420)).toEqual(new Date('2026-10-20T07:00:00+07:00'));
  });
});

describe('decide', () => {
  it('kiểm tra cài đặt lúc gửi: chưa kết nối / đã tắt / loại tin bị tắt thì bỏ', () => {
    expect(decide(vn('10:00'), 'price_target', null, 0).action).toBe('skip');
    expect(decide(vn('10:00'), 'price_target', { ...link, active: false }, 0).action).toBe('skip');
    expect(decide(vn('10:00'), 'brief', link, 0)).toMatchObject({
      action: 'skip',
      reason: 'Đã tắt loại thông báo này',
    });
    expect(decide(vn('10:00'), 'price_target', link, 0).action).toBe('send');
  });

  it('giờ yên lặng / vượt giới hạn thì hoãn, không bỏ', () => {
    const q = decide(vn('23:00'), 'price_target', link, 0);
    expect(q.action).toBe('later');
    const r = decide(vn('10:00'), 'price_target', link, MAX_PER_HOUR);
    expect(r).toMatchObject({ action: 'later', reason: 'Vượt giới hạn tần suất' });
  });

  it('thử lại tăng dần rồi dừng', () => {
    const now = new Date('2026-10-20T00:00:00Z');
    expect(retryAt(now, 1)!.getTime() - now.getTime()).toBe(60_000);
    expect(retryAt(now, 3)!.getTime() - now.getTime()).toBe(4 * 60_000);
    expect(retryAt(now, 5)).toBeNull();
  });
});

describe('formatMessage', () => {
  const n = { kind: 'brief', title: 'Tổng kết tuần: lãi 12 triệu', body: 'Danh mục 760 triệu…', link: '/advisor/abc' };

  it('mặc định không đưa số liệu ra ngoài app', () => {
    const m = formatMessage(n, false, 'https://app.example.vn/');
    expect(m).not.toContain('12 triệu');
    expect(m).not.toContain('760');
    expect(m).toContain('Bản tin mới của bạn đã sẵn sàng');
    expect(m).toContain('href="https://app.example.vn/advisor/abc"');
  });

  it('bật hiện chi tiết thì gửi tiêu đề và nội dung, có escape HTML', () => {
    const m = formatMessage({ ...n, title: 'A <b> & B', body: 'x < y' }, true, null);
    expect(m).toContain('A &lt;b&gt; &amp; B');
    expect(m).toContain('x &lt; y');
    expect(m).not.toContain('href');
  });
});
