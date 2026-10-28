import { describe, expect, it } from 'vitest'
import { blankHoldingDraft, editHoldingDraft, holdingDraftCsv, holdingDraftError, holdingRowError, parseDraftNum } from './holdingDrafts'

const row = () => editHoldingDraft({ assetType: 'stock', symbol: 'FPT', quantity: 100, avgCost: 100000, sourceText: 'riêng tư', warnings: [] })
describe('voice holding import', () => {
  it('creates opening balances with correct units, no raw transcript in ledger', () => {
    const csv = holdingDraftCsv([row(), { ...row(), assetType: 'crypto', symbol: 'BTC', quantity: '0,05', avgCost: '60000' }, { ...row(), assetType: 'gold', symbol: 'SJC', quantity: '0,2', avgCost: '80.000.000' }, { ...row(), assetType: 'cash', symbol: 'VND', quantity: '50.000.000', avgCost: '' }], '2026-10-28')
    expect(csv).toContain('"opening","stock","FPT","100","100000","VND"')
    expect(csv).toContain('"crypto","BTC","0.05","60000","USDT"')
    expect(csv).toContain('"gold","SJC","0.2","80000000","VND"')
    expect(csv).toContain('"cash","VND","50000000","1","VND"')
    expect(csv).not.toContain('riêng tư')
  })
  it('does not turn unknown quantity/cost into zero', () => {
    const r = editHoldingDraft({ ...row(), quantity: null, avgCost: null })
    expect(r.quantity).toBe('')
    expect(r.avgCost).toBe('')
    expect(holdingDraftError([r])).toBeTruthy()
    expect(() => holdingDraftCsv([r], '2026-10-28')).toThrow()
  })
  it('requires corrected type, currency and finite positive values', () => {
    for (const change of [{ assetType: null }, { symbol: '' }, { quantity: '-1' }, { quantity: 'Infinity' }, { avgCost: '0' }, { assetType: 'cash' as const, symbol: 'USD' }]) {
      expect(holdingDraftError([{ ...row(), ...change }])).toBeTruthy()
    }
  })
  it('creates identical payloads for a retry', () => {
    expect(holdingDraftCsv([row()], '2026-10-28')).toBe(holdingDraftCsv([row()], '2026-10-28'))
  })
  it('shows AI numbers in Vietnamese format and reads them back exactly', () => {
    for (const n of [100, 100000, 50000000, 0.05, 1.234, 2.125, 60000.5, 0.2]) {
      expect(parseDraftNum(editHoldingDraft({ ...row(), quantity: n, avgCost: n } as never).quantity)).toBe(n)
    }
    expect(editHoldingDraft({ ...row(), quantity: 50000000, avgCost: 1.234 } as never)).toMatchObject({ quantity: '50.000.000', avgCost: '1,234' })
  })
  it('parses what users type without guessing mixed separators wrong', () => {
    const cases: [string, number][] = [['100.000', 100000], ['1.234.567', 1234567], ['0.05', 0.05], ['0,05', 0.05], ['1.234,5', 1234.5],
      ['1,234.5', 1234.5], ['1,000,000', 1000000], ['12.5', 12.5], [' 50 000 000 ', 50000000]]
    for (const [input, value] of cases) expect(parseDraftNum(input)).toBe(value)
    for (const input of ['', 'abc', '1.2.3', '1,2,3.4,5', '-1', '1e9']) expect(parseDraftNum(input)).toBeNaN()
  })
  it('flags an added blank row and an unknown gold product', () => {
    expect(holdingRowError(blankHoldingDraft())).toBeTruthy()
    const gold = { ...row(), assetType: 'gold' as const, symbol: 'SJC', quantity: '1', avgCost: '80.000.000' }
    expect(holdingRowError(gold, ['SJC'])).toBeNull()
    expect(holdingRowError(gold, ['NHAN'])).toContain('vàng')
  })
})
