import { EventRateLimiter } from './event-rate-limiter';

describe('EventRateLimiter', () => {
  it('allows 30 hits per minute per key, then limits until the window passes', () => {
    const limiter = new EventRateLimiter();
    for (let i = 0; i < 30; i++) expect(limiter.limited('a', 1000)).toBe(false);
    expect(limiter.limited('a', 1000)).toBe(true);
    expect(limiter.limited('b', 1000)).toBe(false);
    expect(limiter.limited('a', 1000 + 60_001)).toBe(false);
  });
});
