import { ConfigService } from '@nestjs/config';
import { AppRuntime, declareAppRole, parseAppRole } from './app-role';

const runtime = (value?: string) => new AppRuntime({ get: () => value } as unknown as ConfigService);

describe('vai trò tiến trình (APP_ROLE)', () => {
  const saved = process.env.APP_ROLE;
  afterEach(() => {
    if (saved === undefined) delete process.env.APP_ROLE;
    else process.env.APP_ROLE = saved;
  });

  it('không đặt hoặc rỗng thì là web để chạy local như trước', () => {
    expect(parseAppRole(undefined)).toBe('web');
    expect(parseAppRole('')).toBe('web');
    expect(runtime().role).toBe('web');
  });

  it('nhận web và worker, không phân biệt hoa thường / khoảng trắng', () => {
    expect(parseAppRole('worker')).toBe('worker');
    expect(parseAppRole(' Worker ')).toBe('worker');
    expect(parseAppRole('web')).toBe('web');
  });

  it('giá trị lạ thì lỗi ngay thay vì đoán', () => {
    expect(() => parseAppRole('scheduler')).toThrow(/APP_ROLE/);
  });

  it('web poll bảng giá realtime, worker thì không', () => {
    expect(runtime('web')).toMatchObject({ isWorker: false, pollsRealtimeMarket: true });
    expect(runtime('worker')).toMatchObject({ isWorker: true, pollsRealtimeMarket: false });
  });

  it('điểm vào khai báo vai trò, ghi đè giá trị dùng chung trong môi trường', () => {
    process.env.APP_ROLE = 'web';
    declareAppRole('worker');
    expect(parseAppRole(process.env.APP_ROLE)).toBe('worker');
  });
});
