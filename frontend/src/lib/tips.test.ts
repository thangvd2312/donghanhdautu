import { describe, expect, it } from 'vitest'
import { amountError, practiceLink, practiceQuantity, tipTextError } from './tips'

describe('soi lời khuyên: logic giao diện', () => {
  it('kiểm tra tin dán vào', () => {
    expect(tipTextError('')).toMatch('Dán')
    expect(tipTextError('  HPG ')).toMatch('ngắn')
    expect(tipTextError('HPG múc ngay')).toBe('')
    expect(tipTextError('x'.repeat(4001))).toMatch('dài')
  })

  it('kiểm tra số tiền giả định', () => {
    expect(amountError(NaN)).toMatch('Nhập')
    expect(amountError(50_000)).toMatch('100.000')
    expect(amountError(10_000_000)).toBe('')
  })

  it('lệnh ảo: cổ phiếu làm tròn xuống lô 100 (ít nhất 1 lô); coin quy USDT ra VND', () => {
    expect(practiceQuantity('stock', 10_000_000, 20_900, null)).toBe(400)
    expect(practiceQuantity('stock', 1_000_000, 20_900, null)).toBe(100)
    expect(practiceQuantity('crypto', 2_600_000, 100, 26_000)).toBe(1)
    expect(practiceQuantity('crypto', 1_000_000, 60_000, 26_000)).toBe(0.0006)
    expect(practiceQuantity('crypto', 1_000_000, 100, null)).toBeNull()
    expect(practiceQuantity('stock', null, 20_900, null)).toBeNull()
    expect(practiceQuantity('stock', 1_000_000, null, null)).toBeNull()
  })

  it('đường dẫn lệnh ảo', () => {
    expect(practiceLink('stock', 'HPG', 400)).toBe('/practice?buy=HPG&type=stock&qty=400')
    expect(practiceLink('crypto', 'SOL', null)).toBe('/practice?buy=SOL&type=crypto')
  })
})
