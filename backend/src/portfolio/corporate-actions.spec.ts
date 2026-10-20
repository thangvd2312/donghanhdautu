import { Prisma } from '@prisma/client';
import type { CorporateEvent } from '../market/providers/vietcap.provider';
import { actionKey, missingActions } from './corporate-actions';
import { computeLedger, LedgerError } from './ledger';
import type { LedgerTx } from './ledger';

const D = (v: number) => new Prisma.Decimal(v);
let n = 0;
function tx(p: Partial<LedgerTx> & { q?: number; px?: number; amt?: number; taxv?: number }): LedgerTx {
  n++;
  return {
    id: `t${n}`,
    type: p.type ?? 'buy',
    date: p.date ?? '2026-09-01',
    createdAt: new Date(2026, 0, 1, 0, 0, n),
    assetType: p.assetType ?? 'stock',
    symbol: p.symbol === undefined ? 'FPT' : p.symbol,
    quantity: p.q !== undefined ? D(p.q) : null,
    price: p.px !== undefined ? D(p.px) : null,
    amount: p.amt !== undefined ? D(p.amt) : null,
    fee: D(0),
    tax: D(p.taxv ?? 0),
    currency: 'VND',
    fxRate: null,
    note: null,
    portfolioId: p.portfolioId ?? 'pf1',
  };
}

const bonus10: CorporateEvent = {
  symbol: 'FPT',
  kind: 'stock',
  title: 'Phát hành cổ phiếu - Cổ phiếu thưởng tỉ lệ 10.0%',
  exDate: '2026-09-21',
  recordDate: '2026-09-22',
  payoutDate: null,
  ratio: 0.1,
  valuePerShare: null,
};
const cash1000: CorporateEvent = {
  symbol: 'FPT',
  kind: 'cash',
  title: 'Trả cổ tức bằng tiền mặt - 1,000 VND',
  exDate: '2026-05-28',
  recordDate: '2026-05-29',
  payoutDate: '2026-06-10',
  ratio: null,
  valuePerShare: 1000,
};

describe('sổ giao dịch — nhận cổ phiếu thưởng / chia tách', () => {
  it('tăng số lượng, giữ nguyên tổng giá vốn và số VND đã bỏ ra, không phát sinh tiền', () => {
    const l = computeLedger([
      tx({ type: 'deposit', symbol: null, assetType: null, amt: 10_000_000 }),
      tx({ q: 100, px: 70_000 }),
      tx({ type: 'bonus', q: 10, date: '2026-09-21' }),
    ]);
    const p = l.positions[0];
    expect(p.quantity.toNumber()).toBe(110);
    expect(p.costBasis.toNumber()).toBe(7_000_000);
    expect(p.costBasisVnd?.toNumber()).toBe(7_000_000);
    expect(l.cash.VND.toNumber()).toBe(3_000_000);
    expect(l.contributions.VND.vndKnown.toNumber()).toBe(10_000_000);
  });

  it('bán sau khi nhận thưởng: giá vốn bình quân đã giảm', () => {
    const l = computeLedger([
      tx({ q: 100, px: 66_000 }),
      tx({ type: 'bonus', q: 10, date: '2026-09-21' }),
      tx({ type: 'sell', q: 110, px: 66_000, date: '2026-09-25' }),
    ]);
    // Bỏ ra 6,6tr, bán 110 cổ phiếu × 66.000 = 7,26tr → lãi 660.000 nhờ cổ phiếu thưởng
    expect(l.positions[0].realized.toNumber()).toBe(660_000);
  });

  it('chặn nhận thưởng khi chưa nắm giữ mã đó', () => {
    expect(() => computeLedger([tx({ type: 'bonus', q: 10, date: '2026-09-21' })])).toThrow(LedgerError);
  });
});

describe('sự kiện quyền chưa ghi vào sổ', () => {
  it('gợi ý số cổ phiếu thưởng theo số đang giữ trước ngày GDKHQ, làm tròn xuống', () => {
    const r = missingActions([tx({ q: 155, px: 70_000, date: '2026-09-01' })], [bonus10], '2026-10-20');
    expect(r).toEqual([
      expect.objectContaining({
        key: actionKey('pf1', 'FPT', 'stock', '2026-09-21'),
        heldQty: 155,
        suggestion: { type: 'bonus', date: '2026-09-21', symbol: 'FPT', quantity: 15 },
      }),
    ]);
  });

  it('mua từ ngày GDKHQ không được hưởng; đã ghi thì không nhắc', () => {
    expect(missingActions([tx({ q: 100, px: 70_000, date: '2026-09-21' })], [bonus10], '2026-10-20')).toEqual([]);
    const recorded = [tx({ q: 100, px: 70_000 }), tx({ type: 'bonus', q: 10, date: '2026-09-23' })];
    expect(missingActions(recorded, [bonus10], '2026-10-20')).toEqual([]);
  });

  it('bán hết trước ngày GDKHQ thì không nhắc', () => {
    const txs = [tx({ q: 100, px: 70_000 }), tx({ type: 'sell', q: 100, px: 72_000, date: '2026-09-10' })];
    expect(missingActions(txs, [bonus10], '2026-10-20')).toEqual([]);
  });

  it('cổ tức tiền mặt: nhắc sau ngày trả, số tiền trước thuế và thuế 5%', () => {
    const txs = [tx({ q: 200, px: 70_000, date: '2026-05-01' })];
    expect(missingActions(txs, [cash1000], '2026-06-05')).toEqual([]);
    expect(missingActions(txs, [cash1000], '2026-06-12')).toEqual([
      expect.objectContaining({
        kind: 'cash',
        suggestion: { type: 'dividend', date: '2026-06-10', symbol: 'FPT', amount: 200_000, tax: 10_000 },
      }),
    ]);
  });

  it('cổ tức đã ghi (cùng mã, hoặc không ghi mã nhưng đúng số tiền) thì không nhắc', () => {
    const base = [tx({ q: 200, px: 70_000, date: '2026-05-01' })];
    const withSymbol = [...base, tx({ type: 'dividend', amt: 200_000, taxv: 10_000, date: '2026-06-10' })];
    const noSymbol = [
      ...base,
      tx({ type: 'dividend', symbol: null, assetType: null, amt: 190_000, date: '2026-06-11' }),
    ];
    expect(missingActions(withSymbol, [cash1000], '2026-06-20')).toEqual([]);
    expect(missingActions(noSymbol, [cash1000], '2026-06-20')).toEqual([]);
  });

  it('mỗi danh mục tính riêng; gợi ý đã bỏ qua không hiện lại', () => {
    const txs = [tx({ q: 100, px: 70_000, portfolioId: 'pf1' }), tx({ q: 50, px: 70_000, portfolioId: 'pf2' })];
    const r = missingActions(txs, [bonus10], '2026-10-20');
    expect(r.map((a) => [a.portfolioId, a.suggestion])).toEqual([
      ['pf1', { type: 'bonus', date: '2026-09-21', symbol: 'FPT', quantity: 10 }],
      ['pf2', { type: 'bonus', date: '2026-09-21', symbol: 'FPT', quantity: 5 }],
    ]);
    const dismissed = new Set([actionKey('pf2', 'FPT', 'stock', '2026-09-21')]);
    expect(missingActions(txs, [bonus10], '2026-10-20', dismissed).map((a) => a.portfolioId)).toEqual(['pf1']);
  });

  it('sự kiện tương lai hoặc quá 2 năm thì bỏ', () => {
    const txs = [tx({ q: 100, px: 70_000, date: '2023-01-01' })];
    expect(missingActions(txs, [{ ...bonus10, exDate: '2026-11-30' }], '2026-10-20')).toEqual([]);
    expect(missingActions(txs, [{ ...bonus10, exDate: '2024-06-12' }], '2026-10-20')).toEqual([]);
  });
});
