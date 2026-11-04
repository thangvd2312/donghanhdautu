import { describe, expect, it } from 'vitest'
import { pathToday, project } from './goalMath'

describe('vạch lộ trình hôm nay', () => {
  it('đi tiếp từ vạch với đúng mức góp thì tới đích đúng hạn', () => {
    const v = pathToday(2e9, 1.5e7, 8, 56)!
    expect(project(v, 1.5e7, 8, 56)).toBeCloseTo(2e9, -2)
  })
  it('không tính được thì null: hết hạn, góp đã đủ tới đích', () => {
    expect(pathToday(2e9, 1.5e7, 8, 0)).toBeNull()
    expect(pathToday(1e8, 1e8, 8, 12)).toBeNull()
  })
  it('lãi 0%: đích trừ tổng góp', () => {
    expect(pathToday(1.2e9, 1e7, 0, 60)).toBeCloseTo(6e8, 0)
  })
})
