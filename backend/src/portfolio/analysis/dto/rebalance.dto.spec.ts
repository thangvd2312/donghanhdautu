import { ValidationPipe } from '@nestjs/common';
import { RebalanceDto } from './rebalance.dto';

const pipe = new ValidationPipe({ whitelist: true, transform: true });
const run = (body: unknown) => pipe.transform(body, { type: 'body', metatype: RebalanceDto });
const ok = {
  portfolioId: null,
  targets: [
    { assetType: 'stock', symbol: 'FPT', pct: 60 },
    { assetType: 'cash', symbol: 'VND', pct: 40 },
  ],
  newMoney: 1_000_000,
  mode: 'buy_only',
  lots: 'board',
  fees: { cryptoPct: 0.2 },
};

describe('RebalanceDto (ValidationPipe như main.ts)', () => {
  it('nhận yêu cầu hợp lệ, bỏ trường lạ', async () => {
    const dto = (await run({ ...ok, x: 1 })) as RebalanceDto;
    expect(dto.targets).toHaveLength(2);
    expect(dto.fees).toEqual({ cryptoPct: 0.2 });
    expect(dto).not.toHaveProperty('x');
  });
  it.each([
    ['không có targets', { ...ok, targets: [] }],
    ['loại tài sản lạ', { ...ok, targets: [{ assetType: 'bond', symbol: 'X', pct: 100 }] }],
    ['pct âm', { ...ok, targets: [{ assetType: 'stock', symbol: 'FPT', pct: -1 }] }],
    ['pct > 100', { ...ok, targets: [{ assetType: 'stock', symbol: 'FPT', pct: 101 }] }],
    ['newMoney âm', { ...ok, newMoney: -1 }],
    ['newMoney không phải số', { ...ok, newMoney: '1' }],
    ['mode lạ', { ...ok, mode: 'sell_all' }],
    ['lots lạ', { ...ok, lots: 'x' }],
    ['phí âm', { ...ok, fees: { stockBuyPct: -0.1 } }],
  ])('%s → 400', async (_n, body) => {
    await expect(run(body)).rejects.toMatchObject({ status: 400 });
  });
});
