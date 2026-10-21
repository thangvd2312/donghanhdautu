import { HEARTBEAT_STALE_MS, isNewWorkerAlive } from './heartbeat.service';

describe('isNewWorkerAlive (kiểm tra sau deploy)', () => {
  const now = new Date('2026-10-22T10:00:00Z');
  const since = new Date('2026-10-22T09:59:00Z').getTime();
  const row = (startedAt: string, beatAgoMs: number) => ({
    startedAt: new Date(startedAt),
    beatAt: new Date(now.getTime() - beatAgoMs),
  });

  it('không có dòng nào: chưa sống', () => {
    expect(isNewWorkerAlive(null, since, now)).toBe(false);
  });

  it('worker cũ (khởi động trước mốc reload) còn nhịp mới thì không được tính', () => {
    expect(isNewWorkerAlive(row('2026-10-22T08:00:00Z', 5_000), since, now)).toBe(false);
  });

  it('worker mới khởi động sau mốc và nhịp còn mới: sống', () => {
    expect(isNewWorkerAlive(row('2026-10-22T09:59:30Z', 5_000), since, now)).toBe(true);
  });

  it('worker mới nhưng nhịp đã quá 90 giây (chết ngay sau khi lên): không sống', () => {
    expect(isNewWorkerAlive(row('2026-10-22T09:59:30Z', HEARTBEAT_STALE_MS + 1), since, now)).toBe(false);
  });
});
