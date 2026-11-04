import { BadRequestException } from '@nestjs/common';
import { journalColumns } from './journal-tags';

const buyFpt = { type: 'buy' };

describe('cột nhật ký của giao dịch', () => {
  it('giao dịch mới: chỉ ghi các trường được gửi', () => {
    expect(journalColumns(buyFpt, {})).toEqual({});
    expect(journalColumns(buyFpt, { emotion: 'fomo', reason: 'tip' })).toEqual({ emotion: 'fomo', reason: 'tip' });
  });

  it('null là xoá nhãn', () => {
    const current = { reason: 'plan', emotion: 'calm' };
    expect(journalColumns({ ...buyFpt, current }, { reason: null, emotion: null })).toEqual({
      reason: null,
      emotion: null,
    });
  });

  it('nạp / rút nhận nhãn', () => {
    expect(journalColumns({ type: 'withdraw' }, { emotion: 'fear' })).toEqual({ emotion: 'fear' });
  });

  it('loại không nhận nhãn (cổ tức, phí, đầu kỳ…): từ chối nhãn, đổi sang loại này thì xoá nhãn cũ', () => {
    const dividend = { type: 'dividend' };
    expect(() => journalColumns(dividend, { emotion: 'calm' })).toThrow(BadRequestException);
    expect(journalColumns(dividend, {})).toEqual({});
    expect(journalColumns({ ...dividend, current: { reason: 'plan', emotion: null } }, {})).toEqual({
      reason: null,
      emotion: null,
    });
  });
});
