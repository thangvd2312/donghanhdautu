import { describe, expect, it } from 'vitest'
import { bandKeyOf, bandText, buildGoalRequest, defaultReturnName, bandByKey, deployLink, emptyForm, GOAL_TEMPLATES, goalToRequest, isApplicable, leverPatch, linePreset, monthsLeftText, monthYear, nextActions, onTime, RETURN_BANDS, trackChip, type GoalForm } from './goals'
import type { ContributionLine, Goal, GoalContributionView, GoalLever } from './types'

const base: GoalForm = {
  kind: 'return',
  template: 'grow',
  name: '',
  target: '',
  date: '',
  capital: '100.000.000',
  band: '10-12',
  holdYears: 5,
  expense: '',
  safetyMonths: 6,
  monthly: '',
  monthlyMax: '',
  day: '5',
  note: '',
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
  it('gửi vốn, mức lãi, thời gian giữ, lịch góp; không gửi ngày / số tiền đích', () => {
    const r = buildGoalRequest(base)
    expect(r).toEqual({
      body: {
        kind: 'return',
        template: 'grow',
        name: 'Lãi đều 10–12%/năm',
        capital: 100_000_000,
        returnMinPct: 10,
        returnMaxPct: 12,
        holdYears: 5,
        monthlyContribution: 0,
        monthlyContributionMax: null,
        contributionDay: 5,
      },
    })
  })
  it('trên 12% → max null; góp theo khoảng, ngày góp và tên tự đặt', () => {
    const r = buildGoalRequest({
      ...base,
      band: '12+',
      name: 'Của tôi',
      monthly: '2.000.000',
      monthlyMax: '3.000.000',
      day: '15',
      holdYears: 10,
    })
    expect(r).toMatchObject({
      body: {
        name: 'Của tôi',
        returnMinPct: 12,
        returnMaxPct: null,
        holdYears: 10,
        monthlyContribution: 2_000_000,
        monthlyContributionMax: 3_000_000,
        contributionDay: 15,
      },
    })
  })
  it('thiếu vốn → lỗi', () => {
    expect(buildGoalRequest({ ...base, capital: '' })).toEqual({ error: 'Nhập số vốn' })
  })
})

describe('buildGoalRequest: có số tiền vào ngày', () => {
  const amount: GoalForm = {
    ...base,
    kind: 'amount',
    template: 'house',
    name: 'Mua nhà',
    target: '2.000.000.000',
    date: '2030-01-01',
    monthly: '10.000.000',
  }
  it('gửi mẫu, đích, ngày; không có phân bổ hay lợi suất tự nhập', () => {
    const r = buildGoalRequest(amount)
    expect(r).toMatchObject({
      body: {
        kind: 'amount',
        template: 'house',
        name: 'Mua nhà',
        targetAmount: 2e9,
        targetDate: '2030-01-01',
        monthlyContribution: 1e7,
        monthlyContributionMax: null,
        contributionDay: 5,
      },
    })
    for (const k of ['allocations', 'targetAllocation', 'expectedReturnPct']) expect('body' in r && r.body).not.toHaveProperty(k)
  })
  it('kiểm tra tên, số tiền, ngày', () => {
    expect(buildGoalRequest({ ...amount, name: ' ' })).toEqual({ error: 'Đặt tên mục tiêu' })
    expect(buildGoalRequest({ ...amount, target: '' })).toEqual({ error: 'Nhập số tiền mục tiêu' })
    expect(buildGoalRequest({ ...amount, date: '' })).toEqual({ error: 'Chọn ngày đích' })
  })
  it('mức góp cao nhất phải từ mức thấp trở lên; ngày góp ngoài 1–28 về mặc định', () => {
    expect(buildGoalRequest({ ...amount, monthlyMax: '5.000.000' })).toEqual({ error: 'Mức góp cao nhất phải từ mức thấp nhất trở lên' })
    expect(buildGoalRequest({ ...amount, day: '31' })).toMatchObject({ body: { contributionDay: 5 } })
    expect(buildGoalRequest({ ...amount, monthlyMax: '10.000.000' })).toMatchObject({ body: { monthlyContributionMax: null } })
  })
})

describe('buildGoalRequest: quỹ dự phòng', () => {
  const safety: GoalForm = { ...base, kind: 'safety', template: 'emergency', name: '', expense: '10.000.000', safetyMonths: 6, monthly: '3.000.000' }
  it('gửi chi tiêu và số tháng, không gửi số tiền đích (server tự tính)', () => {
    const r = buildGoalRequest(safety)
    expect(r).toMatchObject({
      body: { kind: 'safety', template: 'emergency', name: 'Quỹ dự phòng', monthlyExpense: 1e7, safetyMonths: 6, monthlyContribution: 3e6 },
    })
    expect('body' in r && r.body).not.toHaveProperty('targetAmount')
  })
  it('thiếu chi tiêu → lỗi', () => {
    expect(buildGoalRequest({ ...safety, expense: '' })).toEqual({ error: 'Nhập chi tiêu thiết yếu mỗi tháng' })
  })
})

describe('mẫu và form', () => {
  it('lưới mẫu: sinh lời, nhà, xe, con học, hưu trí, quỹ dự phòng', () => {
    expect(GOAL_TEMPLATES.map((t) => [t.template, t.kind])).toEqual([
      ['grow', 'return'],
      ['house', 'amount'],
      ['car', 'amount'],
      ['education', 'amount'],
      ['retirement', 'return'],
      ['emergency', 'safety'],
    ])
  })
  it('form mới điền tên mẫu và số vốn = danh mục', () => {
    const f = emptyForm(GOAL_TEMPLATES[1], 250_000_000)
    expect(f).toMatchObject({ kind: 'amount', template: 'house', name: 'Mua nhà', capital: '250000000', day: '5' })
  })
  it('PUT từ mục tiêu giữ nguyên các trường, chỉ đổi phần cần đổi', () => {
    const g = {
      kind: 'amount',
      template: 'house',
      name: 'Mua nhà',
      targetAmount: 2e9,
      targetDate: '2030-06-01',
      monthlyContribution: 1.5e7,
      monthlyContributionMax: null,
      contributionDay: 5,
      note: null,
      returnTarget: null,
    } as unknown as Goal
    expect(goalToRequest(g, { monthlyContribution: 2e7 })).toEqual({
      kind: 'amount',
      template: 'house',
      name: 'Mua nhà',
      targetAmount: 2e9,
      targetDate: '2030-06-01',
      monthlyContribution: 2e7,
      monthlyContributionMax: null,
      contributionDay: 5,
    })
  })
})

describe('chip trạng thái lộ trình', () => {
  const g = (over: Record<string, unknown>) => ({ kind: 'amount', status: 'active', track: { status: 'on_track', delayMonths: 0 }, ...over }) as unknown as Goal
  it('theo trạng thái và số tháng chậm', () => {
    expect(trackChip(g({ track: { status: 'behind', delayMonths: 9 } }))).toEqual({ label: 'Chậm 9 tháng', tone: 'warn' })
    expect(trackChip(g({ track: { status: 'in_range', delayMonths: 2 } }))).toEqual({ label: 'Trong dự kiến', tone: 'info' })
    expect(trackChip(g({}))).toEqual({ label: 'Đúng kế hoạch', tone: 'ok' })
    expect(trackChip(g({ track: { status: 'reached', delayMonths: null } }))).toEqual({ label: 'Đã đạt', tone: 'ok' })
    expect(trackChip(g({ kind: 'safety', track: { status: 'reached', delayMonths: null } }))).toEqual({ label: 'Đã đủ', tone: 'ok' })
  })
  it('mục tiêu đã đạt / tạm dừng thắng trạng thái lộ trình', () => {
    expect(trackChip(g({ status: 'paused' }))?.label).toBe('Tạm dừng')
    expect(trackChip(g({ status: 'achieved' }))?.label).toBe('Đã đạt')
  })
  it('còn bao lâu, ngày dạng tháng/năm', () => {
    expect(monthsLeftText(55)).toBe('còn 4 năm 7 tháng')
    expect(monthsLeftText(24)).toBe('còn 2 năm')
    expect(monthsLeftText(5)).toBe('còn 5 tháng')
    expect(monthYear('2031-03-01')).toBe('03/2031')
  })
})

describe('liên kết lập kế hoạch giải ngân', () => {
  it('số tiền, tỷ trọng 5 phần, mục tiêu', () => {
    expect(deployLink(100_000_000, { savings: 50, gold: 10, etf: 30, picks: 10, crypto: 0 }, 'g1')).toBe(
      '/deployment?new=1&amount=100000000&mix=50-10-30-10-0&goal=g1',
    )
  })
})

describe('việc tiếp theo của mục tiêu', () => {
  const goal = { status: 'active', monthlyContribution: 15e6, contributionDay: 5, id: 'g1', track: { drift: null } } as unknown as Goal
  const today = new Date(2026, 10, 4)
  it('góp tháng này trước ngày góp', () => {
    expect(nextActions(goal, null, today)).toEqual(['Góp 15 tr trước 05/11'])
  })
  it('tháng đã xong hoặc bỏ qua thì không nhắc góp', () => {
    expect(nextActions(goal, { status: 'done', perGoal: [] } as unknown as GoalContributionView, today)).toEqual([])
  })
  it('lệch tỷ trọng từ 5 điểm % mới nhắc', () => {
    const g = (points: number) => ({ ...goal, monthlyContribution: 0, track: { drift: { part: 'etf', points } } }) as unknown as Goal
    expect(nextActions(g(4.9), null, today)).toEqual([])
    expect(nextActions(g(-6), null, today)).toEqual(['ETF đang thấp hơn đích 6 điểm %'])
  })
})

describe('điền sẵn giao dịch từ dòng góp tiền', () => {
  const line = (over: Partial<ContributionLine>): ContributionLine => ({ part: 'etf', label: 'ETF E1VFVN30', assetType: 'stock', symbol: 'E1VFVN30', amount: 5e6, reason: '', ...over })
  it('mua: mã, mục tiêu', () => {
    expect(linePreset(line({}), 'g1')).toMatchObject({ type: 'buy', assetType: 'stock', symbol: 'E1VFVN30', goalId: 'g1' })
  })
  it('tiền gửi = nạp tiền mặt theo số tiền', () => {
    expect(linePreset(line({ part: 'savings', assetType: 'cash', symbol: 'VND' }), 'g1')).toMatchObject({ type: 'deposit', amount: 5e6, goalId: 'g1' })
  })
  it('phần tự chọn chưa có mã: chọn mã sau', () => {
    expect(linePreset(line({ part: 'picks', symbol: null }), 'g1')).toMatchObject({ type: 'buy', assetType: 'stock', symbol: undefined })
  })
})

describe('cách tới đích sớm hơn: áp dụng', () => {
  const lever = (over: Partial<GoalLever>): GoalLever => ({ key: 'contribute_more', title: '', summary: '', cost: '', reachDate: null, extraMonthly: 5e6, variants: [], newTargetAmount: null, newMix: null, worst: null, locked: false, lockedReason: null, ...over })
  const amountGoal = { kind: 'amount', monthlyContribution: 15e6, monthlyContributionMax: 20e6 } as unknown as Goal
  it('góp thêm: cộng vào mức thấp và mức cao', () => {
    expect(leverPatch(lever({}), amountGoal, 0)).toEqual({ monthlyContribution: 20e6, monthlyContributionMax: 25e6 })
    const v = [{ label: '+2 tr', extraMonthly: 2e6, reachDate: null }]
    expect(leverPatch(lever({ variants: v }), amountGoal, 0)).toEqual({ monthlyContribution: 17e6, monthlyContributionMax: 22e6 })
  })
  it('lùi ngày và hạ đích', () => {
    expect(leverPatch(lever({ key: 'push_date', reachDate: '2031-03-01' }), amountGoal, 0)).toEqual({ targetDate: '2031-03-01' })
    expect(leverPatch(lever({ key: 'lower_target', newTargetAmount: 1.7e9 }), amountGoal, 0)).toEqual({ targetAmount: 1.7e9 })
  })
  it('cách bị khoá không áp dụng; tăng rủi ro chỉ áp dụng cho kiểu sinh lời', () => {
    expect(isApplicable(lever({ locked: true }), amountGoal)).toBe(false)
    expect(isApplicable(lever({ key: 'raise_risk' }), amountGoal)).toBe(false)
    expect(isApplicable(lever({ key: 'raise_risk' }), { kind: 'return' } as Goal)).toBe(true)
  })
  it('kịp ngày đích so theo tháng', () => {
    expect(onTime('2030-06-30', '2030-06-01')).toBe(true)
    expect(onTime('2030-07-01', '2030-06-01')).toBe(false)
    expect(onTime(null, '2030-06-01')).toBe(false)
  })
})
