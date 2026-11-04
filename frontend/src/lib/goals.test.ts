import { describe, expect, it } from 'vitest'
import { bandKeyOf, bandText, buildGoalRequest, defaultReturnName, bandByKey, deployLink, RETURN_BANDS, type GoalForm } from './goals'

const base: GoalForm = {
  kind: 'return',
  name: '',
  target: '',
  date: '',
  capital: '100.000.000',
  band: '10-12',
  holdYears: 5,
  monthly: '',
  note: '',
  alloc: {},
  mix: { stock: '', crypto: '', gold: '', cash: '' },
}

describe('mức lãi mong muốn', () => {
  it('chip → min / max', () => {
    expect(RETURN_BANDS.map((b) => [b.min, b.max])).toEqual([
      [6, 8],
      [8, 10],
      [10, 12],
      [12, null],
    ])
  })
  it('đọc lại mức đã lưu', () => {
    expect(bandKeyOf(8, 10)).toBe('8-10')
    expect(bandKeyOf(12, null)).toBe('12+')
    expect(bandKeyOf(9, 11)).toBe('8-10')
  })
  it('nhãn và tên gợi ý', () => {
    expect(bandText(10, 12)).toBe('10–12%/năm')
    expect(bandText(12, null)).toBe('Trên 12%/năm')
    expect(defaultReturnName(bandByKey('10-12'))).toBe('Lãi đều 10–12%/năm')
  })
})

describe('buildGoalRequest: sinh lời đều', () => {
  it('gửi vốn, mức lãi, thời gian giữ; không gửi ngày / số tiền đích; phân bổ rỗng', () => {
    const r = buildGoalRequest(base)
    expect(r).toEqual({
      body: {
        kind: 'return',
        name: 'Lãi đều 10–12%/năm',
        capital: 100_000_000,
        returnMinPct: 10,
        returnMaxPct: 12,
        holdYears: 5,
        monthlyContribution: 0,
        allocations: [],
      },
    })
  })
  it('trên 12% → max null; góp thêm và tên tự đặt', () => {
    const r = buildGoalRequest({
      ...base,
      band: '12+',
      name: 'Của tôi',
      monthly: '2.000.000',
      holdYears: 10,
    })
    expect(r).toMatchObject({
      body: {
        name: 'Của tôi',
        returnMinPct: 12,
        returnMaxPct: null,
        holdYears: 10,
        monthlyContribution: 2_000_000,
      },
    })
  })
  it('thiếu vốn → lỗi', () => {
    expect(buildGoalRequest({ ...base, capital: '' })).toEqual({
      error: 'Nhập số vốn',
    })
  })
})

describe('buildGoalRequest: có số tiền vào ngày', () => {
  const amount: GoalForm = {
    ...base,
    kind: 'amount',
    name: 'Mua nhà',
    target: '2.000.000.000',
    date: '2030-01-01',
    monthly: '10.000.000',
  }
  it('không gửi lợi suất giả định', () => {
    const r = buildGoalRequest(amount)
    expect(r).toMatchObject({
      body: {
        kind: 'amount',
        name: 'Mua nhà',
        targetAmount: 2e9,
        targetDate: '2030-01-01',
        monthlyContribution: 1e7,
        targetAllocation: null,
        allocations: [],
      },
    })
    expect('body' in r && r.body).not.toHaveProperty('expectedReturnPct')
  })
  it('kiểm tra tên, số tiền, ngày, tổng tỷ trọng', () => {
    expect(buildGoalRequest({ ...amount, name: ' ' })).toEqual({
      error: 'Đặt tên mục tiêu',
    })
    expect(buildGoalRequest({ ...amount, target: '' })).toEqual({
      error: 'Nhập số tiền mục tiêu',
    })
    expect(buildGoalRequest({ ...amount, date: '' })).toEqual({
      error: 'Chọn ngày đích',
    })
    expect(
      buildGoalRequest({
        ...amount,
        mix: { stock: '50', crypto: '', gold: '', cash: '' },
      }),
    ).toEqual({
      error: 'Tổng tỷ trọng mong muốn phải là 100% (hiện 50%)',
    })
  })
  it('gom tài sản gán', () => {
    const r = buildGoalRequest({
      ...amount,
      alloc: { 'stock:VNM': '50', 'gold:SJC': '0' },
    })
    expect(r).toMatchObject({
      body: { allocations: [{ assetType: 'stock', symbol: 'VNM', pct: 50 }] },
    })
  })
})

describe('liên kết lập kế hoạch giải ngân', () => {
  it('số tiền, tỷ trọng 5 phần, mục tiêu', () => {
    expect(deployLink(100_000_000, { savings: 50, gold: 10, etf: 30, picks: 10, crypto: 0 }, 'g1')).toBe(
      '/deployment?new=1&amount=100000000&mix=50-10-30-10-0&goal=g1',
    )
  })
})
