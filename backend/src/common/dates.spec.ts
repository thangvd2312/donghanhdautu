import { isDateKey } from './dates';

describe('isDateKey', () => {
  it('nhận ngày có thật, chặn ngày không tồn tại hoặc sai dạng', () => {
    expect(isDateKey('2026-10-20')).toBe(true);
    expect(isDateKey('2024-02-29')).toBe(true);
    expect(isDateKey('2026-02-29')).toBe(false);
    expect(isDateKey('2026-02-31')).toBe(false);
    expect(isDateKey('2026-13-01')).toBe(false);
    expect(isDateKey('20/10/2026')).toBe(false);
    expect(isDateKey(null)).toBe(false);
  });
});
