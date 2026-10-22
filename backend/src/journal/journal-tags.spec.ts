import { BadRequestException, NotFoundException } from '@nestjs/common';
import { journalColumns } from './journal-tags';

const plans = [
  { id: 'p-fpt', userId: 'u1', assetType: 'stock', symbol: 'FPT' },
  { id: 'p-other', userId: 'u2', assetType: 'stock', symbol: 'FPT' },
];
/** DB giả: chỉ cần tìm kế hoạch theo id + userId */
const db = {
  investmentPlan: {
    findFirst: ({ where }: { where: { id: string; userId: string } }) =>
      Promise.resolve(plans.find((p) => p.id === where.id && p.userId === where.userId) ?? null),
  },
} as unknown as Parameters<typeof journalColumns>[0];

const buyFpt = { type: 'buy', assetType: 'stock', symbol: 'FPT' };

describe('cột nhật ký của giao dịch', () => {
  it('giao dịch mới: chỉ ghi các trường được gửi', async () => {
    expect(await journalColumns(db, 'u1', buyFpt, {})).toEqual({});
    expect(await journalColumns(db, 'u1', buyFpt, { emotion: 'fomo', reason: 'tip', planId: 'p-fpt' })).toEqual({
      emotion: 'fomo',
      reason: 'tip',
      planId: 'p-fpt',
    });
  });

  it('null là xoá nhãn / gỡ kế hoạch', async () => {
    const current = { reason: 'plan', emotion: 'calm', planId: 'p-fpt' };
    expect(
      await journalColumns(db, 'u1', { ...buyFpt, current }, { reason: null, emotion: null, planId: null }),
    ).toEqual({
      reason: null,
      emotion: null,
      planId: null,
    });
  });

  it('kế hoạch của người khác coi như không có', async () => {
    await expect(journalColumns(db, 'u1', buyFpt, { planId: 'p-other' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('kế hoạch phải cùng tài sản', async () => {
    await expect(
      journalColumns(db, 'u1', { type: 'buy', assetType: 'stock', symbol: 'HPG' }, { planId: 'p-fpt' }),
    ).rejects.toThrow('Kế hoạch này dành cho tài sản khác với giao dịch');
  });

  it('nạp / rút nhận nhãn nhưng không gắn được kế hoạch', async () => {
    const withdraw = { type: 'withdraw', assetType: null, symbol: null };
    expect(await journalColumns(db, 'u1', withdraw, { emotion: 'fear' })).toEqual({ emotion: 'fear' });
    await expect(journalColumns(db, 'u1', withdraw, { planId: 'p-fpt' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('loại không nhận nhãn (cổ tức, phí, đầu kỳ…): từ chối nhãn, đổi sang loại này thì xoá nhãn cũ', async () => {
    const dividend = { type: 'dividend', assetType: 'stock', symbol: 'FPT' };
    await expect(journalColumns(db, 'u1', dividend, { emotion: 'calm' })).rejects.toBeInstanceOf(BadRequestException);
    expect(await journalColumns(db, 'u1', dividend, {})).toEqual({});
    expect(
      await journalColumns(db, 'u1', { ...dividend, current: { reason: 'plan', emotion: null, planId: 'p-fpt' } }, {}),
    ).toEqual({ reason: null, emotion: null, planId: null });
  });

  it('sửa mà không gửi planId: giữ liên kết khi còn đúng tài sản, gỡ khi đã đổi tài sản / loại', async () => {
    const current = { reason: null, emotion: null, planId: 'p-fpt' };
    expect(await journalColumns(db, 'u1', { ...buyFpt, current }, {})).toEqual({});
    expect(await journalColumns(db, 'u1', { type: 'buy', assetType: 'stock', symbol: 'HPG', current }, {})).toEqual({
      planId: null,
    });
    expect(await journalColumns(db, 'u1', { type: 'deposit', assetType: null, symbol: null, current }, {})).toEqual({
      planId: null,
    });
  });
});
