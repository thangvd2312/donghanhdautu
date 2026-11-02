import { appValidationPipe } from '../../common/validation';
import { DeploymentDto } from './deployment.dto';

const pipe = appValidationPipe();
const run = (body: unknown) => pipe.transform(body, { type: 'body', metatype: DeploymentDto });
const ok = {
  amount: 100_000_000,
  mode: 'one_time',
  horizon: 'long',
  needBy: '2030-01-01',
  fromCash: false,
  tranches: 3,
  etf: 'E1VFVN30',
  mix: { savings: 30, gold: 15, etf: 35, picks: 15, crypto: 5 },
  emergency: { monthlyExpense: 10_000_000, saved: 0, months: 6 },
  highInterestDebt: 0,
  marginDebt: null,
};

describe('DeploymentDto (ValidationPipe như main.ts)', () => {
  it('nhận yêu cầu hợp lệ, bỏ trường lạ', async () => {
    const dto = (await run({ ...ok, x: 1 })) as DeploymentDto;
    expect(dto.mix).toEqual(ok.mix);
    expect(dto.emergency).toEqual(ok.emergency);
    expect(dto).not.toHaveProperty('x');
    await expect(run({ amount: 5_000_000, mode: 'monthly', horizon: 'medium' })).resolves.toBeTruthy();
  });

  it.each([
    ['dưới 1 triệu', { ...ok, amount: 999_999 }],
    ['số tiền là chữ', { ...ok, amount: '100' }],
    ['mode lạ', { ...ok, mode: 'weekly' }],
    ['khung thời gian lạ', { ...ok, horizon: 'forever' }],
    ['ngày không có thật', { ...ok, needBy: '2030-02-31' }],
    ['số đợt lạ', { ...ok, tranches: 2 }],
    ['ETF lạ', { ...ok, etf: 'VNM' }],
    ['tỷ trọng lẻ', { ...ok, mix: { ...ok.mix, etf: 35.5 } }],
    ['tỷ trọng âm', { ...ok, mix: { ...ok.mix, crypto: -5 } }],
    ['thiếu một phần tỷ trọng', { ...ok, mix: { savings: 100 } }],
    ['quỹ dự phòng 2 tháng', { ...ok, emergency: { ...ok.emergency, months: 2 } }],
    ['nợ âm', { ...ok, marginDebt: -1 }],
  ])('%s → 400', async (_n, body) => {
    await expect(run(body)).rejects.toMatchObject({ status: 400 });
  });
});
