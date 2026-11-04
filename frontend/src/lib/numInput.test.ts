import { describe, expect, it } from 'vitest'
import { parseNum } from './num'
import { formatNumInput, formatNumInputAt, normalizeNumInput, parseNumInput } from './numInput'

/** Gõ từng ký tự vào cuối ô, như người dùng */
const type = (keys: string, decimals: number, start = '') => [...keys].reduce((v, k) => formatNumInput(v + k, v, decimals), start)

describe('NumberField formatting', () => {
  it('groups thousands while typing VND amounts', () => {
    expect(type('381967716', 0)).toBe('381.967.716')
    expect(parseNum(type('381967716', 0))).toBe(381967716)
    expect(type('1000', 0)).toBe('1.000')
  })

  it('ignores decimal separators and letters for integer-only fields', () => {
    expect(type('12,5', 0)).toBe('125')
    expect(type('1a2b3', 0)).toBe('123')
  })

  it('treats a typed "." as the decimal mark when decimals are allowed', () => {
    expect(type('0.05', 8)).toBe('0,05')
    expect(type('1500.25', 2)).toBe('1.500,25')
    expect(parseNum('1.500,25')).toBe(1500.25)
    expect(parseNumInput('0,05')).toBe(0.05)
  })

  it('keeps typing after the formatter inserted a grouping dot', () => {
    // "1.500" đang hiển thị, gõ thêm "0" → 15.000 chứ không phải 1,5000
    expect(type('15000', 8)).toBe('15.000')
    expect(parseNum('15.000')).toBe(15000)
  })

  it('limits decimals and strips leading zeros', () => {
    expect(type('1,23456', 2)).toBe('1,23')
    expect(type('00012', 0)).toBe('12')
    expect(type(',5', 2)).toBe('0,5')
  })

  it('keeps a pasted grouped number as thousands and a pasted "0.05" as decimal', () => {
    expect(formatNumInput('1.500.000', '', 8)).toBe('1.500.000')
    expect(formatNumInput('0.05', '', 8)).toBe('0,05')
    expect(formatNumInput('2.000.000 ₫', '', 0)).toBe('2.000.000')
  })

  it('deletes the digit before a grouping dot on backspace', () => {
    // "1.500" với con trỏ sau dấu chấm, Backspace xoá dấu chấm → còn "1500" và con trỏ ở 1
    const r = formatNumInputAt('1500', '1.500', 1, 0)
    expect(r.value).toBe('500')
    expect(r.caret).toBe(0)
  })

  it('keeps the caret next to the same digit after regrouping', () => {
    // "1.000" con trỏ sau "1", gõ "2" → "12000" → "12.000", con trỏ sau "12"
    const r = formatNumInputAt('12.000', '1.000', 2, 0)
    expect(r.value).toBe('12.000')
    expect(r.caret).toBe(2)
  })

  it('normalizes stored values for display', () => {
    expect(normalizeNumInput('381967716', 0)).toBe('381.967.716')
    expect(normalizeNumInput('0.05', 8)).toBe('0,05')
    expect(normalizeNumInput('1500.5', 2)).toBe('1.500,5')
    expect(normalizeNumInput('1.500', 2)).toBe('1.500')
    expect(normalizeNumInput('', 0)).toBe('')
  })
})

describe('parseNum', () => {
  it('reads both grouping styles and decimals', () => {
    expect(parseNum('1.000.000')).toBe(1000000)
    expect(parseNum('1,000,000')).toBe(1000000)
    expect(parseNum('0.05')).toBe(0.05)
    expect(parseNum('0,05')).toBe(0.05)
    expect(parseNum('1.234.567,89')).toBe(1234567.89)
  })

  it('does not read "0,050" as fifty', () => {
    expect(parseNum('0,050')).toBe(0.05)
  })
})
