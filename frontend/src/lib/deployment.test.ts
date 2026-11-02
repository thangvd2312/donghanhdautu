import { describe, expect, it } from 'vitest'
import type { DeploymentSetup, DeployStepPreview } from './types'
import { buildDeployRequest, groupSteps, horizonFor, initialForm, money, stepAction, stepMix, stepPreset } from './deployment'

const setup = (over: Partial<NonNullable<DeploymentSetup['profile']>> = {}): DeploymentSetup => ({
  profile: {
    riskType: 'balanced',
    riskLabel: 'Cân bằng',
    horizon: 'medium',
    maxDrawdownPct: 30,
    fomoProne: false,
    emergency: 'yes',
    margin: 'never',
    ...over,
  },
  cashVnd: 0,
  holdingsTotal: 0,
  goals: [{ id: 'g1', name: 'Mua xe', targetDate: '2028-06-01', targetAmount: 5e8 }],
  etfOptions: [],
  activePlanId: null,
})

describe('kế hoạch giải ngân: form → yêu cầu', () => {
  it('chưa có hồ sơ hoặc dưới 1 triệu: chưa tính', () => {
    const s = setup()
    expect(buildDeployRequest({ ...initialForm(s), amount: 999_999 }, s)).toBeNull()
    expect(buildDeployRequest({ ...initialForm(s), amount: 5e6 }, { ...s, profile: null })).toBeNull()
  })

  it('khung thời gian điền sẵn từ hồ sơ; mục tiêu đã chọn → ngày cần tiền', () => {
    const s = setup()
    const f = { ...initialForm(s), amount: 1e8, goalId: 'g1' }
    expect(f.horizon).toBe('medium')
    expect(buildDeployRequest(f, s)).toMatchObject({ amount: 1e8, needBy: '2028-06-01', tranches: 3, etf: 'E1VFVN30' })
  })

  it('chỉ gửi câu đã hỏi: quỹ dự phòng khi khảo sát nói chưa có, margin khi có dùng; nợ khi trả lời có', () => {
    const plain = setup()
    const f = { ...initialForm(plain), amount: 1e8, monthlyExpense: 1e7, marginDebt: 5e6, debt: 3e6, hasDebt: false }
    expect(buildDeployRequest(f, plain)).toMatchObject({ emergency: null, marginDebt: 0, highInterestDebt: 0 })
    const risky = setup({ emergency: 'no', margin: 'often' })
    expect(buildDeployRequest({ ...f, hasDebt: true }, risky)).toMatchObject({
      emergency: { monthlyExpense: 1e7, saved: 0, months: 6 },
      marginDebt: 5e6,
      highInterestDebt: 3e6,
    })
  })

  it('tiền đã ghi là tiền mặt chỉ áp dụng cho giải ngân một lần', () => {
    const s = setup()
    const f = { ...initialForm(s), amount: 1e8, fromCash: true, mode: 'monthly' as const }
    expect(buildDeployRequest(f, s)!.fromCash).toBe(false)
  })
})

describe('chỉnh tỷ trọng', () => {
  const mix = { savings: 30, gold: 15, etf: 35, picks: 15, crypto: 5 }
  it('tiền gửi nhận / nhường phần chênh, tổng luôn 100, không âm', () => {
    expect(stepMix(mix, 'crypto', 5)).toEqual({ ...mix, crypto: 10, savings: 25 })
    expect(stepMix(mix, 'crypto', -10)).toEqual({ ...mix, crypto: 0, savings: 35 })
    expect(stepMix({ ...mix, savings: 0, etf: 65 }, 'gold', 5)).toEqual({ ...mix, savings: 0, etf: 65 })
    expect(stepMix(mix, 'savings', 5)).toEqual({ ...mix, savings: 35, etf: 30 })
  })
})

describe('lịch theo ngày', () => {
  it('gom các đợt cùng ngày, cộng tổng', () => {
    const s = (dueDate: string, amount: number) => ({ dueDate, amount }) as DeployStepPreview
    const g = groupSteps([s('2026-11-01', 3), s('2026-11-01', 2), s('2026-12-01', 1)])
    expect(g.map((x) => [x.date, x.total, x.steps.length])).toEqual([
      ['2026-11-01', 5, 2],
      ['2026-12-01', 1, 1],
    ])
  })
  it('khung thời gian theo ngày cần tiền (khớp backend)', () => {
    expect(horizonFor('2027-10-31', '2026-11-01')).toBe('short')
    expect(horizonFor('2027-11-01', '2026-11-01')).toBe('medium')
    expect(horizonFor('2029-11-01', '2026-11-01')).toBe('long')
  })
  it('số tiền gọn', () => {
    expect(money(100_000_000)).toBe('100 tr')
    expect(money(11_700_000)).toBe('11,7 tr')
    expect(money(1_500_000_000)).toBe('1,5 tỷ')
  })
})

describe('đợt đã lưu: nút chính và điền sẵn giao dịch', () => {
  const step = (over: Partial<DeployStepPreview>): DeployStepPreview => ({
    dueDate: '2026-11-01',
    kind: 'etf',
    assetType: 'stock',
    symbol: 'E1VFVN30',
    label: 'ETF E1VFVN30',
    amount: 11_700_000,
    tranche: 1,
    tranches: 3,
    price: 27_000,
    quantity: 433,
    hint: null,
    ...over,
  })
  it('trả nợ / quỹ dự phòng / tiền đã có sẵn: xong luôn; tiền mới gửi: ghi nạp; tự chọn: chọn mã trước', () => {
    expect(stepAction({ kind: 'debt' }, false)).toBe('done')
    expect(stepAction({ kind: 'emergency' }, false)).toBe('done')
    expect(stepAction({ kind: 'savings' }, true)).toBe('done')
    expect(stepAction({ kind: 'savings' }, false)).toBe('deposit')
    expect(stepAction({ kind: 'picks' }, false)).toBe('pick')
    expect(stepAction({ kind: 'crypto' }, false)).toBe('buy')
  })
  it('điền sẵn: ETF có mã, số lượng, giá; coin không điền giá VND; tiền gửi là nạp tiền', () => {
    expect(stepPreset(step({}), 'pf1')).toEqual({
      type: 'buy',
      assetType: 'stock',
      symbol: 'E1VFVN30',
      quantity: 433,
      price: 27_000,
      portfolioId: 'pf1',
      reason: 'plan',
      note: 'Kế hoạch giải ngân · ETF E1VFVN30 · đợt 1/3',
    })
    expect(stepPreset(step({ kind: 'crypto', assetType: 'crypto', symbol: 'BTCUSDT', quantity: 0.0006, price: 2.5e9 }))).toMatchObject({
      type: 'buy',
      assetType: 'crypto',
      symbol: 'BTCUSDT',
      quantity: 0.0006,
    })
    expect(stepPreset(step({ kind: 'crypto', assetType: 'crypto', symbol: 'BTCUSDT' }))).not.toHaveProperty('price')
    expect(stepPreset(step({ kind: 'savings', assetType: 'cash', symbol: 'VND', tranches: 1 }))).toMatchObject({
      type: 'deposit',
      amount: 11_700_000,
    })
  })
})
