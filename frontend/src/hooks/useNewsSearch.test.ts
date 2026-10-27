import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { searchNews, type NewsQuery } from '../api/news'
import type { NewsFilters } from '../lib/news'
import type { NewsSearchResult } from '../lib/types'
import { abortError, deferred, type Deferred } from '../test/deferred'
import { useNewsSearch } from './useNewsSearch'

vi.mock('../api/news', () => ({ searchNews: vi.fn() }))

interface Call {
  p: NewsQuery
  signal?: AbortSignal
  d: Deferred<NewsSearchResult>
}
let calls: Call[] = []

const F = (q: string): NewsFilters => ({ q, kind: 'stock', category: null, source: null, days: null })

const page = (tag: string, offset: number, total: number, n = 20): NewsSearchResult => ({
  items: Array.from({ length: n }, (_, i) => ({
    title: `${tag}${offset + i}`,
    url: `https://x/${tag}${offset + i}`,
    summary: '',
    source: 'CafeF',
    category: 'Vĩ mô',
    publishedAt: '2026-10-27T01:00:00Z',
    kind: 'stock' as const,
    tickers: [],
  })),
  total,
  offset,
  featured: null,
  facets: { kind: [], category: [], source: [] },
  engine: 'opensearch',
})

const titles = (r: { current: ReturnType<typeof useNewsSearch> }) => r.current.res?.items.map((i) => i.title) ?? []

beforeEach(() => {
  calls = []
  vi.mocked(searchNews).mockImplementation((p, signal) => {
    const d = deferred<NewsSearchResult>()
    calls.push({ p, signal, d })
    signal?.addEventListener('abort', () => d.reject(abortError()))
    return d.promise
  })
})

describe('useNewsSearch', () => {
  it('keeps the previous result and its filters while the next filters load, then switches', async () => {
    const { result, rerender } = renderHook(({ f }) => useNewsSearch(f), { initialProps: { f: F('') } })
    await act(async () => calls[0].d.resolve(page('all', 0, 100)))
    expect(result.current.resFilters?.q).toBe('')

    rerender({ f: F('vcb') })
    expect(result.current.loading).toBe(true)
    expect(result.current.resFilters?.q).toBe('')
    expect(titles(result)[0]).toBe('all0')

    await act(async () => calls[1].d.resolve(page('vcb', 0, 3, 3)))
    expect(result.current.resFilters?.q).toBe('vcb')
    expect(titles(result)).toEqual(['vcb0', 'vcb1', 'vcb2'])
    expect(result.current.hasMore).toBe(false)
  })

  it('ignores a late response of superseded filters', async () => {
    const { result, rerender } = renderHook(({ f }) => useNewsSearch(f), { initialProps: { f: F('a') } })
    rerender({ f: F('b') })
    expect(calls[0].signal?.aborted).toBe(true)
    await act(async () => calls[1].d.resolve(page('b', 0, 1, 1)))
    expect(titles(result)).toEqual(['b0'])
  })

  it('loads the next page from the current offset and drops a load-more of old filters', async () => {
    const { result, rerender } = renderHook(({ f }) => useNewsSearch(f), { initialProps: { f: F('') } })
    await act(async () => calls[0].d.resolve(page('p', 0, 30)))
    expect(result.current.hasMore).toBe(true)

    act(() => result.current.loadMore())
    expect(calls[1].p.offset).toBe(20)
    await act(async () => calls[1].d.resolve(page('p', 20, 30, 10)))
    expect(titles(result)).toHaveLength(30)
    expect(result.current.hasMore).toBe(false)

    rerender({ f: F('x') })
    await act(async () => calls[2].d.resolve(page('x', 0, 40)))
    act(() => result.current.loadMore())
    rerender({ f: F('y') })
    expect(calls[3].signal?.aborted).toBe(true)
    await act(async () => calls[4].d.resolve(page('y', 0, 2, 2)))
    expect(titles(result)).toEqual(['y0', 'y1'])
  })
})
