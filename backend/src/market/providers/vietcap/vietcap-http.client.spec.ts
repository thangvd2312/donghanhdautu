import { DEFAULT_HTTP_OPTIONS } from './vietcap.config';
import type { VietcapHttpOptions } from './vietcap.config';
import { VietcapHttpClient } from './vietcap-http.client';

const reply = (status: number, body: unknown = {}) =>
  Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) } as Response);

const options: VietcapHttpOptions = { ...DEFAULT_HTTP_OPTIONS, maxAttempts: 3, retryBaseDelayMs: 100 };

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('VietcapHttpClient', () => {
  it('GET gắn header trình duyệt, POST gửi JSON; đọc phản hồi JSON', async () => {
    const fetch = jest.spyOn(global, 'fetch').mockImplementation(() => reply(200, { ok: 1 }));
    const client = new VietcapHttpClient(options);

    await expect(client.get('iq', '/company/FPT')).resolves.toEqual({ ok: 1 });
    await client.post('trading', '/price/symbols/getList', { symbols: ['FPT'] });

    const [getUrl, getInit] = fetch.mock.calls[0];
    expect(getUrl).toBe('https://iq.vietcap.com.vn/api/iq-insight-service/v1/company/FPT');
    expect(getInit).toMatchObject({ method: 'GET', headers: { Origin: 'https://trading.vietcap.com.vn' } });
    const [postUrl, postInit] = fetch.mock.calls[1];
    expect(postUrl).toBe('https://trading.vietcap.com.vn/api/price/symbols/getList');
    expect(postInit).toMatchObject({ method: 'POST', body: '{"symbols":["FPT"]}' });
  });

  it('429 / 5xx thì thử lại với thời gian chờ tăng gấp đôi, rồi thành công', async () => {
    jest.useFakeTimers();
    const fetch = jest
      .spyOn(global, 'fetch')
      .mockImplementationOnce(() => reply(429))
      .mockImplementationOnce(() => reply(503))
      .mockImplementationOnce(() => reply(200, { v: 3 }));
    const result = new VietcapHttpClient(options).get('iq', '/x');

    await jest.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(100);
    expect(fetch).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(200);
    await expect(result).resolves.toEqual({ v: 3 });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('hết số lần thử thì ném lỗi cuối cùng, giữ thông điệp "Vietcap <status> <url>"', async () => {
    jest.useFakeTimers();
    const fetch = jest.spyOn(global, 'fetch').mockImplementation(() => reply(500));
    const result = new VietcapHttpClient(options).get('iq', '/x');
    const assertion = expect(result).rejects.toThrow('Vietcap 500 https://iq.vietcap.com.vn');

    await jest.advanceTimersByTimeAsync(1000);
    await assertion;
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('attempts theo từng lần gọi: attempts = 1 thì không thử lại dù gặp 503', async () => {
    const fetch = jest.spyOn(global, 'fetch').mockImplementation(() => reply(503));
    await expect(new VietcapHttpClient(options).post('trading', '/x', {}, { attempts: 1 })).rejects.toThrow('503');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('timeoutMs theo từng lần gọi được đưa vào tín hiệu hết giờ, mặc định lấy từ options', async () => {
    const timeout = jest.spyOn(AbortSignal, 'timeout');
    jest.spyOn(global, 'fetch').mockImplementation(() => reply(200));
    const client = new VietcapHttpClient({ ...options, timeoutMs: 15_000 });

    await client.get('trading', '/x', { timeoutMs: 5_000 });
    await client.get('trading', '/x');
    expect(timeout.mock.calls).toEqual([[5_000], [15_000]]);
  });

  it('4xx khác 429 không thử lại', async () => {
    const fetch = jest.spyOn(global, 'fetch').mockImplementation(() => reply(404));
    await expect(new VietcapHttpClient(options).get('iq', '/x')).rejects.toThrow('404');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('đứt mạng / hết giờ được thử lại', async () => {
    jest.useFakeTimers();
    const fetch = jest
      .spyOn(global, 'fetch')
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockImplementationOnce(() => reply(200, { v: 1 }));
    const result = new VietcapHttpClient(options).get('trading', '/x');

    await jest.advanceTimersByTimeAsync(100);
    await expect(result).resolves.toEqual({ v: 1 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('request vượt giới hạn tốc độ của máy chủ được xếp hàng chứ không bị bỏ', async () => {
    jest.useFakeTimers();
    const slow: VietcapHttpOptions = {
      ...options,
      limits: { ...options.limits, iq: { ratePerSec: 1, maxConcurrent: 4 } },
    };
    const fetch = jest.spyOn(global, 'fetch').mockImplementation(() => reply(200));
    const client = new VietcapHttpClient(slow);
    const all = Promise.all([client.get('iq', '/a'), client.get('iq', '/b'), client.get('iq', '/c')]);

    await jest.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(2000);
    await all;
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('cached: trong TTL dùng lại kết quả, hết TTL thì tải lại', async () => {
    jest.useFakeTimers();
    const client = new VietcapHttpClient(options);
    const load = jest.fn().mockResolvedValueOnce('một').mockResolvedValueOnce('hai');

    await expect(client.cached('k', 1000, load)).resolves.toBe('một');
    await expect(client.cached('k', 1000, load)).resolves.toBe('một');
    jest.setSystemTime(Date.now() + 1001);
    await expect(client.cached('k', 1000, load)).resolves.toBe('hai');
    expect(load).toHaveBeenCalledTimes(2);
  });
});
