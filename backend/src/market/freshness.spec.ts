import { ageStatus, lastSessionCloseBefore, stockStatus, worst } from './freshness';

/** Giờ VN (UTC+7) → Date */
const vn = (iso: string) => new Date(`${iso}+07:00`);

describe('lastSessionCloseBefore', () => {
  it('sau 14:45 ngày thường là 14:45 cùng ngày', () => {
    expect(lastSessionCloseBefore(vn('2026-10-20T16:00:00'))).toEqual(vn('2026-10-20T14:45:00'));
  });

  it('trước 14:45 ngày thường là 14:45 ngày giao dịch trước', () => {
    expect(lastSessionCloseBefore(vn('2026-10-20T08:00:00'))).toEqual(vn('2026-10-19T14:45:00'));
  });

  it('thứ 2 trước giờ đóng cửa lùi về thứ 6', () => {
    expect(lastSessionCloseBefore(vn('2026-10-19T08:00:00'))).toEqual(vn('2026-10-16T14:45:00'));
  });

  it('cuối tuần là thứ 6', () => {
    expect(lastSessionCloseBefore(vn('2026-10-18T10:00:00'))).toEqual(vn('2026-10-16T14:45:00'));
    expect(lastSessionCloseBefore(vn('2026-10-17T23:59:00'))).toEqual(vn('2026-10-16T14:45:00'));
  });
});

describe('stockStatus', () => {
  it('chưa từng lấy được giá là missing', () => {
    expect(stockStatus(null, vn('2026-10-20T10:00:00'))).toBe('missing');
  });

  it('trong phiên: quá 2 phút không cập nhật là stale', () => {
    const now = vn('2026-10-20T10:00:00');
    expect(stockStatus(vn('2026-10-20T09:59:00'), now)).toBe('fresh');
    expect(stockStatus(vn('2026-10-20T09:57:00'), now)).toBe('stale');
  });

  it('ngoài phiên: giá đóng cửa phiên gần nhất không bị coi là lỗi', () => {
    // Chủ nhật, giá lấy lúc 15:05 thứ 6
    expect(stockStatus(vn('2026-10-16T15:05:00'), vn('2026-10-18T10:00:00'))).toBe('fresh');
    // Tối thứ 3, giá lấy lần cuối từ trưa → chưa có giá đóng cửa
    expect(stockStatus(vn('2026-10-20T11:00:00'), vn('2026-10-20T20:00:00'))).toBe('stale');
  });

  it('ngoài phiên: giá từ trước phiên gần nhất là stale', () => {
    // Sáng thứ 3 trước giờ mở cửa, giá lấy lần cuối từ thứ 6 tuần trước
    expect(stockStatus(vn('2026-10-16T15:05:00'), vn('2026-10-20T08:00:00'))).toBe('stale');
  });
});

describe('ageStatus / worst', () => {
  const now = new Date('2026-10-20T00:00:00Z');
  it('theo tuổi dữ liệu', () => {
    expect(ageStatus(new Date('2026-10-19T23:55:00Z'), 10 * 60_000, now)).toBe('fresh');
    expect(ageStatus(new Date('2026-10-19T23:40:00Z'), 10 * 60_000, now)).toBe('stale');
    expect(ageStatus(null, 1000, now)).toBe('missing');
    expect(ageStatus(new Date('không phải ngày'), 1000, now)).toBe('missing');
  });

  it('lấy trạng thái xấu hơn', () => {
    expect(worst('fresh', 'fresh')).toBe('fresh');
    expect(worst('fresh', 'stale')).toBe('stale');
    expect(worst('stale', 'fallback')).toBe('fallback');
    expect(worst('missing', 'fresh')).toBe('missing');
  });
});
