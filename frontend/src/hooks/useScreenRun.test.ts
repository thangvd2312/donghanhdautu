import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runScreen } from '../api/screener'
import type { ScreenFilter, ScreenResult, ScreenRunRequest, ScreenSort } from '../lib/types'
import { abortError, deferred, type Deferred } from '../test/deferred'
import { useScreenRun } from './useScreenRun'

vi.mock('../api/screener', () => ({ runScreen: vi.fn() }))

interface Call {
  body: ScreenRunRequest
  signal?: AbortSignal
  d: Deferred<ScreenResult>
}

let calls: Call[] = []
/** Request đã gửi mà vẫn trả về sau khi bị huỷ (phản hồi đã trên đường về): giả lập kết thúc muộn */
let ignoreAbort = false

const F1: ScreenFilter[] = [{ key: 'marketCap', min: 1000 }]
const F2: ScreenFilter[] = [{ key: 'price', max: 50 }]
const CAP: ScreenSort = { key: 'marketCap', dir: 'desc' }
const PRICE: ScreenSort = { key: 'price', dir: 'asc' }

/** Một trang 20 mã gắn nhãn `tag`, tổng 60 mã (còn trang sau) */
const pageOf = (tag: string, page: number): ScreenResult => ({
  items: Array.from({ length: 20 }, (_, i) => ({
    symbol: `${tag}${(page - 1) * 20 + i}`,
    name: null,
    exchange: 'HOSE',
    price: null,
    changePct: null,
    values: {},
    watched: false,
    held: false,
  })),
  total: 60,
  universe: 1600,
  universeNote: '',
  missingNote: null,
  postFiltered: false,
  source: 'Vietcap',
  asOf: '2026-10-26T00:00:00.000Z',
})

const last = () => calls[calls.length - 1]

/** Chờ hết 300 ms trì hoãn rồi trả trang 1 của bộ lọc hiện tại */
async function runFirstPage(tag: string) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300)
  })
  expect(last().body.page).toBe(1)
  await act(async () => last().d.resolve(pageOf(tag, 1)))
}

type Props = { filters: ScreenFilter[]; sort: ScreenSort }
const setup = (props: Props) => renderHook(({ filters, sort }: Props) => useScreenRun(filters, sort), { initialProps: props })
const symbols = (r: { current: ReturnType<typeof useScreenRun> }) => r.current.res?.items.map((i) => i.symbol) ?? []

beforeEach(() => {
  calls = []
  ignoreAbort = false
  vi.useFakeTimers()
  vi.mocked(runScreen).mockImplementation((body, signal) => {
    const d = deferred<ScreenResult>()
    signal?.addEventListener('abort', () => {
      if (!ignoreAbort) d.reject(abortError())
    })
    calls.push({ body, signal, d })
    return d.promise
  })
})
afterEach(() => {
  vi.useRealTimers()
})

describe('useScreenRun — đổi bộ lọc khi đang tải thêm (REV-02)', () => {
  it('đổi điều kiện lọc khi đang tải trang tiếp: kết quả mới đúng và "Tải thêm" dùng được', async () => {
    const { result, rerender } = setup({ filters: F1, sort: CAP })
    await runFirstPage('A')
    act(() => result.current.loadMore())
    expect(result.current.loadingMore).toBe(true)

    rerender({ filters: F2, sort: CAP })
    await runFirstPage('B')
    expect(result.current).toMatchObject({ loading: false, loadingMore: false, exhausted: false, moreFailed: false })
    expect(symbols(result).every((s) => s.startsWith('B'))).toBe(true)

    act(() => result.current.loadMore())
    expect(last().body).toMatchObject({ filters: F2, page: 2 })
    await act(async () => last().d.resolve(pageOf('B', 2)))
    expect(result.current.loadingMore).toBe(false)
    expect(symbols(result)).toHaveLength(40)
    expect(symbols(result).every((s) => s.startsWith('B'))).toBe(true)
  })

  it('đổi sắp xếp khi đang tải trang tiếp: không kẹt nút, không trộn kết quả cũ', async () => {
    const { result, rerender } = setup({ filters: F1, sort: CAP })
    await runFirstPage('A')
    act(() => result.current.loadMore())

    rerender({ filters: F1, sort: PRICE })
    await runFirstPage('P')
    expect(result.current.loadingMore).toBe(false)
    expect(symbols(result).every((s) => s.startsWith('P'))).toBe(true)
  })

  it('xoá hết điều kiện rồi thêm lại khi đang tải trang tiếp: trạng thái phân trang khởi tạo lại', async () => {
    const { result, rerender } = setup({ filters: F1, sort: CAP })
    await runFirstPage('A')
    act(() => result.current.loadMore())

    rerender({ filters: [], sort: CAP })
    expect(result.current.res).toBeNull()
    expect(result.current.loadingMore).toBe(false)

    rerender({ filters: F1, sort: CAP })
    await runFirstPage('C')
    expect(result.current).toMatchObject({ loading: false, loadingMore: false, exhausted: false })
    act(() => result.current.loadMore())
    expect(last().body.page).toBe(2)
  })

  it('trang tiếp của bộ lọc cũ về muộn: không ghép vào kết quả mới, không tắt trạng thái tải của request mới', async () => {
    ignoreAbort = true
    const { result, rerender } = setup({ filters: F1, sort: CAP })
    await runFirstPage('A')
    act(() => result.current.loadMore())
    const oldMore = last()

    rerender({ filters: F2, sort: CAP })
    await runFirstPage('B')
    act(() => result.current.loadMore())
    expect(result.current.loadingMore).toBe(true)

    await act(async () => oldMore.d.resolve(pageOf('A', 2)))
    expect(result.current.loadingMore).toBe(true)
    expect(symbols(result).every((s) => s.startsWith('B'))).toBe(true)
    expect(symbols(result)).toHaveLength(20)
  })

  it('không nạp thêm trong lúc bộ lọc mới đang chạy (tránh ghép trang của bộ lọc cũ)', async () => {
    const { result, rerender } = setup({ filters: F1, sort: CAP })
    await runFirstPage('A')
    rerender({ filters: F2, sort: CAP })
    const before = calls.length
    act(() => result.current.loadMore())
    expect(calls.length).toBe(before)
    expect(result.current.loadingMore).toBe(false)
  })

  it('lỗi mạng thật khi tải thêm: hiện thử lại; huỷ chủ động thì không báo lỗi', async () => {
    const { result, rerender } = setup({ filters: F1, sort: CAP })
    await runFirstPage('A')

    act(() => result.current.loadMore())
    await act(async () => last().d.reject(new Error('Failed to fetch')))
    expect(result.current).toMatchObject({ moreFailed: true, loadingMore: false })

    act(() => result.current.loadMore())
    expect(result.current.moreFailed).toBe(false)
    rerender({ filters: F2, sort: CAP })
    await runFirstPage('B')
    expect(result.current).toMatchObject({ moreFailed: false, loadingMore: false })
  })

  it('gỡ màn hình khi đang tải thêm: huỷ request', async () => {
    const { result, unmount } = setup({ filters: F1, sort: CAP })
    await runFirstPage('A')
    act(() => result.current.loadMore())
    const more = last()
    unmount()
    expect(more.signal?.aborted).toBe(true)
  })
})
