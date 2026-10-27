import { describe, expect, it } from 'vitest'
import { dayLabel, filtersFromParams, filtersToParams, foldTerms, groupByDay } from './news'
import type { NewsHit } from './types'

const NOW = Date.parse('2026-10-27T05:00:00Z') // 12:00 giờ VN, thứ Ba

const hit = (title: string, publishedAt: string): NewsHit => ({
  title,
  url: `https://x/${title}`,
  summary: '',
  source: 'CafeF',
  category: 'Vĩ mô',
  publishedAt,
  kind: 'stock',
  lang: 'vi',
  tickers: [],
})

describe('news filters on the URL', () => {
  it('defaults to stock news; kind=all means every kind', () => {
    expect(filtersFromParams(new URLSearchParams())).toEqual({
      q: '',
      kind: 'stock',
      category: null,
      source: null,
      days: null,
    })
    expect(filtersFromParams(new URLSearchParams('kind=all')).kind).toBeNull()
    expect(filtersFromParams(new URLSearchParams('kind=coin&days=7&cat=Coin&src=Coin68&q=btc'))).toEqual({
      q: 'btc',
      kind: 'coin',
      category: 'Coin',
      source: 'Coin68',
      days: 7,
    })
  })

  it('ignores unknown kind and day values', () => {
    const f = filtersFromParams(new URLSearchParams('kind=forex&days=3'))
    expect(f.kind).toBe('stock')
    expect(f.days).toBeNull()
  })

  it('round-trips and leaves defaults off the URL', () => {
    expect(filtersToParams({ q: '  ', kind: 'stock', category: null, source: null, days: null })).toEqual({})
    const f = { q: 'lãi suất', kind: null, category: 'Vĩ mô', source: 'CafeF', days: 30 }
    expect(filtersFromParams(new URLSearchParams(filtersToParams(f)))).toEqual(f)
  })
})

describe('foldTerms', () => {
  it('removes accents and short terms', () => {
    expect(foldTerms('VCB, Đồng "a"')).toEqual(['vcb', 'dong'])
  })
})

describe('day groups (Vietnam time)', () => {
  it('labels today, yesterday and older days with weekday and dd/mm', () => {
    expect(dayLabel('2026-10-26T17:30:00Z', NOW)).toBe('Hôm nay') // 00:30 ngày 27 giờ VN
    expect(dayLabel('2026-10-26T16:30:00Z', NOW)).toBe('Hôm qua') // 23:30 ngày 26 giờ VN
    expect(dayLabel('2026-10-24T03:00:00Z', NOW)).toMatch(/, 24\/10$/)
  })

  it('never repeats a day group even when items are not sorted by date', () => {
    const groups = groupByDay(
      [hit('a', '2026-10-27T04:00:00Z'), hit('b', '2026-10-24T03:00:00Z'), hit('c', '2026-10-27T02:00:00Z')],
      NOW,
    )
    expect(groups.map((g) => [g.label, g.items.map((i) => i.title)])).toEqual([
      ['Hôm nay', ['a', 'c']],
      [expect.stringMatching(/24\/10$/), ['b']],
    ])
  })
})
