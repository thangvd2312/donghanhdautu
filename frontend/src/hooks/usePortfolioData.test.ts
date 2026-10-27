import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPerformance, getPortfolio, listPortfolios, listTransactions } from '../api/portfolio'
import type { Performance, Portfolio, Transaction } from '../lib/types'
import { deferred, type Deferred } from '../test/deferred'
import { queryWrapper } from '../test/query'
import { usePortfolioData } from './usePortfolioData'

vi.mock('../api/portfolio', () => ({
  getPortfolio: vi.fn(),
  getPerformance: vi.fn(),
  listTransactions: vi.fn(),
  listPortfolios: vi.fn(),
}))

type Kind = 'p' | 'perf' | 'txs'
interface Call {
  kind: Kind
  id: string
  d: Deferred<unknown>
}

/** Mọi request đang chờ, theo thứ tự gửi */
let calls: Call[] = []
const track =
  (kind: Kind) =>
  (id = '') => {
    const d = deferred<unknown>()
    calls.push({ kind, id, d })
    return d.promise as never
  }

// Dữ liệu đánh dấu: so sánh để biết state đang giữ phản hồi của request nào
const portfolio = (tag: string) => ({ tag }) as unknown as Portfolio
const performance = (tag: string) => ({ tag }) as unknown as Performance
const ledger = (tag: string) => [{ id: tag }] as unknown as Transaction[]
const value = { p: portfolio, perf: performance, txs: ledger }

/** Request thứ `nth` (0 = cũ nhất) của loại `kind` cho danh mục `id` */
function call(kind: Kind, id: string, nth = 0) {
  const c = calls.filter((x) => x.kind === kind && x.id === id)[nth]
  if (!c) throw new Error(`không có request ${kind} #${nth} của danh mục "${id}"`)
  return c
}

/** Trả về cả 3 request (vị thế, hiệu suất, sổ) thứ `nth` của danh mục `id`, dữ liệu gắn nhãn `tag` */
async function answer(id: string, tag: string, nth = 0) {
  await act(async () => {
    for (const kind of ['p', 'perf', 'txs'] as const) call(kind, id, nth).d.resolve(value[kind](tag))
  })
}

async function fail(id: string, nth = 0) {
  await act(async () => {
    for (const kind of ['p', 'perf', 'txs'] as const) call(kind, id, nth).d.reject(new Error('lỗi mạng'))
  })
}

const shown = (r: { current: ReturnType<typeof usePortfolioData> }) => ({
  p: (r.current.p as unknown as { tag: string } | null)?.tag ?? null,
  perf: (r.current.perf as unknown as { tag: string } | null)?.tag ?? null,
  txs: (r.current.txs as unknown as { id: string }[] | null)?.[0]?.id ?? null,
})

beforeEach(() => {
  calls = []
  vi.mocked(getPortfolio).mockImplementation(track('p'))
  vi.mocked(getPerformance).mockImplementation(track('perf'))
  vi.mocked(listTransactions).mockImplementation(track('txs'))
  vi.mocked(listPortfolios).mockResolvedValue([])
})
afterEach(() => {
  vi.useRealTimers()
})

describe('usePortfolioData — phản hồi về không theo thứ tự (REV-01)', () => {
  it('A → B, B trả trước A: vị thế, hiệu suất và sổ cuối cùng đều thuộc B', async () => {
    const { result, rerender } = renderHook(({ id }) => usePortfolioData(id), { initialProps: { id: 'A' }, wrapper: queryWrapper() })
    rerender({ id: 'B' })
    await answer('B', 'B')
    await answer('A', 'A')
    expect(shown(result)).toEqual({ p: 'B', perf: 'B', txs: 'B' })
  })

  it('A → B → A: quay lại A dùng chung request A đang chờ, B về sau không ghi đè A', async () => {
    const { result, rerender } = renderHook(({ id }) => usePortfolioData(id), { initialProps: { id: 'A' }, wrapper: queryWrapper() })
    rerender({ id: 'B' })
    rerender({ id: 'A' })
    expect(calls.filter((c) => c.kind === 'p' && c.id === 'A')).toHaveLength(1)
    await answer('A', 'A')
    await answer('B', 'B')
    expect(shown(result)).toEqual({ p: 'A', perf: 'A', txs: 'A' })
  })

  it('quay lại danh mục đã xem: hiện ngay dữ liệu đã cache, không chờ tải lại', async () => {
    const { result, rerender } = renderHook(({ id }) => usePortfolioData(id), { initialProps: { id: 'A' }, wrapper: queryWrapper() })
    await answer('A', 'A')
    rerender({ id: 'B' })
    await answer('B', 'B')
    rerender({ id: 'A' })
    expect(shown(result)).toEqual({ p: 'A', perf: 'A', txs: 'A' })
  })

  it('lỗi của danh mục cũ về muộn không xoá dữ liệu danh mục mới', async () => {
    const { result, rerender } = renderHook(({ id }) => usePortfolioData(id), { initialProps: { id: 'A' }, wrapper: queryWrapper() })
    rerender({ id: 'B' })
    await answer('B', 'B')
    await fail('A')
    expect(shown(result)).toEqual({ p: 'B', perf: 'B', txs: 'B' })
  })

  it('khi B chưa tải xong, không lần hiển thị nào trình bày dữ liệu A dưới nhãn B', async () => {
    const renders: { id: string; p: unknown; perf: unknown; txs: unknown }[] = []
    const { rerender } = renderHook(
      ({ id }) => {
        const r = usePortfolioData(id)
        renders.push({ id, p: r.p, perf: r.perf, txs: r.txs })
        return r
      },
      { initialProps: { id: 'A' }, wrapper: queryWrapper() },
    )
    await answer('A', 'A')
    rerender({ id: 'B' })
    const underB = renders.filter((r) => r.id === 'B')
    expect(underB.length).toBeGreaterThan(0)
    for (const r of underB) expect(r).toMatchObject({ p: null, perf: null, txs: null })
  })

  it('request tự tải lại (15 giây) gửi trước khi ghi giao dịch không ghi đè dữ liệu sau khi ghi', async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => usePortfolioData('A'), { wrapper: queryWrapper() })
    await answer('A', 'đầu')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000)
    })
    // Request tự tải lại (#1) đang chờ thì người dùng ghi giao dịch → tải lại (#2)
    act(() => result.current.changed())
    await act(async () => {
      call('p', 'A', 2).d.resolve(portfolio('sau khi ghi'))
      call('perf', 'A', 2).d.resolve(performance('sau khi ghi'))
    })
    await act(async () => {
      call('p', 'A', 1).d.resolve(portfolio('trước khi ghi'))
      call('perf', 'A', 1).d.resolve(performance('trước khi ghi'))
    })
    expect(shown(result)).toMatchObject({ p: 'sau khi ghi', perf: 'sau khi ghi' })
  })

  it('hai lần tải lại sổ liên tiếp về đảo thứ tự: giữ sổ của lần mới nhất', async () => {
    const { result } = renderHook(() => usePortfolioData('A'), { wrapper: queryWrapper() })
    await answer('A', 'đầu')
    act(() => result.current.changed())
    act(() => result.current.changed())
    await act(async () => {
      call('txs', 'A', 2).d.resolve(ledger('lần 2'))
    })
    await act(async () => {
      call('txs', 'A', 1).d.resolve(ledger('lần 1'))
    })
    expect(shown(result).txs).toBe('lần 2')
  })

  it('lỗi khi tải lại không xoá sổ đang hiển thị', async () => {
    const { result } = renderHook(() => usePortfolioData('A'), { wrapper: queryWrapper() })
    await answer('A', 'đầu')
    act(() => result.current.changed())
    await act(async () => {
      call('txs', 'A', 1).d.reject(new Error('lỗi mạng'))
    })
    expect(shown(result).txs).toBe('đầu')
  })
})
