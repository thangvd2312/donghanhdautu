import { isTargetHit, macroDedupeKey, moveBucket, moveThreshold } from './alert-rules';

describe('alert rules', () => {
  it('scales the move threshold per asset type', () => {
    expect(moveThreshold('stock', 3)).toBe(3);
    expect(moveThreshold('crypto', 3)).toBe(6);
    expect(moveThreshold('gold', 3)).toBe(1.5);
    expect(moveThreshold('gold', 1)).toBe(1);
  });

  it('buckets a move by whole thresholds with the sign of the move', () => {
    expect(moveBucket(3.2, 3)).toBe(1);
    expect(moveBucket(-6.1, 3)).toBe(-2);
    expect(moveBucket(0, 3)).toBe(0);
  });

  it('detects hit targets in both directions', () => {
    expect(isTargetHit('above', 100, 100)).toBe(true);
    expect(isTargetHit('above', 99, 100)).toBe(false);
    expect(isTargetHit('below', 100, 100)).toBe(true);
    expect(isTargetHit('below', 101, 100)).toBe(false);
  });

  it('keys top-score macro news per article and the rest per topic per day', () => {
    expect(macroDedupeKey({ macroScore: 5, url: 'u', topic: 't' }, '2026-01-01')).toBe('macro:u');
    expect(macroDedupeKey({ macroScore: 4, url: 'u', topic: 't' }, '2026-01-01')).toBe('macro:2026-01-01:t');
    expect(macroDedupeKey({ macroScore: 4, url: 'u', topic: null }, '2026-01-01')).toBe('macro:2026-01-01:khac');
  });
});
