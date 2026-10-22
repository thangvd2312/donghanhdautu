import { OnDemandGate, ON_DEMAND_MS, ON_DEMAND_RETRY_MS } from './on-demand-gate';

describe('OnDemandGate', () => {
  function setup() {
    const success: Record<string, string | null> = { gold: null };
    const warnings: string[] = [];
    const gate = new OnDemandGate(
      (k) => success[k] ?? null,
      (m) => warnings.push(m),
    );
    return { gate, success, warnings };
  }

  it('waits out the full interval after a load that produced a new success', async () => {
    const { gate, success } = setup();
    const load = jest.fn(() => {
      success.gold = String(Date.now());
      return Promise.resolve();
    });
    await gate.run('gold', 1000, load, ['gold']);
    await gate.run('gold', 1000 + ON_DEMAND_MS.gold - 1, load, ['gold']);
    expect(load).toHaveBeenCalledTimes(1);
    await gate.run('gold', 1000 + ON_DEMAND_MS.gold, load, ['gold']);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('retries after 30 seconds when the source did not produce a new success', async () => {
    const { gate } = setup();
    const load = jest.fn(() => Promise.resolve());
    await gate.run('gold', 0, load, ['gold']);
    await gate.run('gold', ON_DEMAND_RETRY_MS - 1, load, ['gold']);
    expect(load).toHaveBeenCalledTimes(1);
    await gate.run('gold', ON_DEMAND_RETRY_MS, load, ['gold']);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('logs a failed load and still retries after 30 seconds', async () => {
    const { gate, warnings } = setup();
    const load = jest.fn(() => Promise.reject(new Error('boom')));
    await gate.run('gold', 0, load, ['gold']);
    expect(warnings).toEqual(['Lấy gold theo yêu cầu lỗi: boom']);
    await gate.run('gold', ON_DEMAND_RETRY_MS, load, ['gold']);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
