import { appValidationPipe } from '../../common/validation';
import { GoalDto } from './goal.dto';

const pipe = appValidationPipe();
const run = (body: unknown) => pipe.transform(body, { type: 'body', metatype: GoalDto });

const amount = {
  name: 'Mua nhà',
  template: 'house',
  targetAmount: 2e9,
  targetDate: '2030-06-01',
  monthlyContribution: 15e6,
};
const safety = { name: 'Quỹ dự phòng', template: 'emergency', monthlyExpense: 10e6, safetyMonths: 6 };
const ret = { name: 'Lãi đều', template: 'grow', capital: 100e6, returnMinPct: 10, holdYears: 5 };

describe('GoalDto (ValidationPipe như main.ts)', () => {
  it('nhận từng kiểu mục tiêu với các trường của kiểu đó', async () => {
    await expect(run(amount)).resolves.toBeTruthy();
    await expect(run(safety)).resolves.toBeTruthy();
    await expect(run(ret)).resolves.toBeTruthy();
    await expect(run({ ...amount, monthlyContributionMax: 30e6, contributionDay: 28 })).resolves.toBeTruthy();
  });

  it('mức ưu tiên và các trường cũ bị bỏ, không nhận từ người dùng', async () => {
    const dto = (await run({
      ...amount,
      priority: 1,
      expectedReturnPct: 9,
      allocations: [],
      targetAllocation: { stock: 100 },
    })) as GoalDto;
    expect(dto).not.toHaveProperty('priority');
    expect(dto).not.toHaveProperty('allocations');
    expect(dto).not.toHaveProperty('expectedReturnPct');
    expect(dto).not.toHaveProperty('targetAllocation');
  });

  it.each([
    ['amount thiếu số tiền đích', { ...amount, targetAmount: undefined }],
    ['amount thiếu ngày đích', { ...amount, targetDate: undefined }],
    ['safety thiếu chi tiêu tháng', { ...safety, monthlyExpense: undefined }],
    ['safety 2 tháng', { ...safety, safetyMonths: 2 }],
    ['safety 13 tháng', { ...safety, safetyMonths: 13 }],
    ['safety ngày đích không có thật', { ...safety, targetDate: '2030-02-31' }],
    ['return thiếu số vốn', { ...ret, capital: undefined }],
    ['ngày góp 0', { ...amount, contributionDay: 0 }],
    ['ngày góp 29', { ...amount, contributionDay: 29 }],
    ['mẫu lạ', { ...amount, template: 'yacht' }],
    ['kiểu lạ', { ...amount, kind: 'bond' }],
    ['góp âm', { ...amount, monthlyContribution: -1 }],
  ])('%s → 400', async (_n, body) => {
    await expect(run(body)).rejects.toMatchObject({ status: 400 });
  });

  it('safety có thể bỏ ngày đích', async () => {
    await expect(run({ ...safety, targetDate: null })).resolves.toBeTruthy();
  });
});
