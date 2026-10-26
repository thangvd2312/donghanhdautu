import { toTransactionRevision } from './transactions.presenter';

describe('toTransactionRevision', () => {
  it('bản trước khi sửa chỉ gồm trường giao dịch, không lộ cột nội bộ', () => {
    const r = toTransactionRevision({
      id: 'rev1',
      transactionId: 'tx1',
      action: 'update',
      before: {
        id: 'tx1',
        userId: 'u1',
        portfolioId: 'pf_u1',
        importBatchId: 'b1',
        planId: 'p1',
        date: '2026-10-01T00:00:00.000Z',
        type: 'buy',
        symbol: 'FPT',
        quantity: '100',
        price: '95000',
        fee: '0',
      },
      createdAt: new Date('2026-10-02T00:00:00Z'),
    });
    expect(r.before).toEqual({
      date: '2026-10-01T00:00:00.000Z',
      type: 'buy',
      symbol: 'FPT',
      quantity: '100',
      price: '95000',
      fee: '0',
    });
  });
});
