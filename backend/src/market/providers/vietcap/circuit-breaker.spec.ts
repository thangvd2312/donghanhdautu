import { CircuitBreaker, CircuitOpenError } from './circuit-breaker';
import type { BreakerTransition } from './circuit-breaker';

const options = { failureThreshold: 3, baseCooldownMs: 1000, maxCooldownMs: 5000 };

function setup() {
  const transitions: string[] = [];
  const breaker = new CircuitBreaker('iq', options, (t: BreakerTransition) => transitions.push(`${t.from}>${t.to}`));
  const fail = (n: number) => {
    for (let i = 0; i < n; i++) {
      breaker.acquire();
      breaker.recordFailure();
    }
  };
  return { breaker, transitions, fail };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('CircuitBreaker', () => {
  it('đóng cho tới khi đủ số lỗi liên tiếp; một lần thành công làm chuỗi lỗi về 0', () => {
    const { breaker, fail, transitions } = setup();
    fail(2);
    breaker.acquire();
    breaker.recordSuccess();
    fail(2);
    expect(breaker.current).toBe('closed');
    fail(1);
    expect(breaker.current).toBe('open');
    expect(transitions).toEqual(['closed>open']);
  });

  it('mở thì chặn ngay bằng CircuitOpenError kèm thời gian còn lại', () => {
    const { breaker, fail } = setup();
    fail(3);
    jest.advanceTimersByTime(400);
    expect(() => breaker.acquire()).toThrow(CircuitOpenError);
    try {
      breaker.acquire();
    } catch (e) {
      expect((e as CircuitOpenError).retryInMs).toBe(600);
    }
  });

  it('half-open: chỉ một request thăm dò, request khác vẫn bị chặn; thăm dò thành công thì đóng', () => {
    const { breaker, fail, transitions } = setup();
    fail(3);
    jest.advanceTimersByTime(1000);
    breaker.acquire(); // thăm dò
    expect(breaker.current).toBe('half-open');
    expect(() => breaker.acquire()).toThrow(CircuitOpenError);
    breaker.recordSuccess();
    expect(breaker.current).toBe('closed');
    expect(() => breaker.acquire()).not.toThrow();
    expect(transitions).toEqual(['closed>open', 'open>half-open', 'half-open>closed']);
  });

  it('thăm dò hỏng: thời gian chờ gấp đôi, tối đa maxCooldownMs, đóng lại thì về mức cơ bản', () => {
    const { breaker, fail } = setup();
    fail(3); // chờ 1000
    const cooldowns: number[] = [];
    for (let i = 0; i < 5; i++) {
      let retryIn = 0;
      try {
        breaker.acquire();
      } catch (e) {
        retryIn = (e as CircuitOpenError).retryInMs;
      }
      cooldowns.push(retryIn);
      jest.advanceTimersByTime(retryIn || 1000);
      breaker.acquire();
      breaker.recordFailure();
    }
    // sau mỗi lần thăm dò hỏng: 2000, 4000, 5000, 5000, ...
    expect(cooldowns.slice(1)).toEqual([2000, 4000, 5000, 5000]);

    jest.advanceTimersByTime(5000);
    breaker.acquire();
    breaker.recordSuccess();
    fail(3);
    expect(() => breaker.acquire()).toThrow(CircuitOpenError);
    expect(() => breaker.acquire()).toThrow('thử lại sau 1s');
  });
});
