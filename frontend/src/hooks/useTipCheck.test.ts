import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { analyzeTip, decideTip, getTip, setTipAmount } from '../api/tips'
import type { TipCheck } from '../lib/types'
import { deferred, type Deferred } from '../test/deferred'
import { useTipCheck } from './useTipCheck'

vi.mock('../api/tips', () => ({
  getTip: vi.fn(),
  analyzeTip: vi.fn(),
  setTipAmount: vi.fn(),
  decideTip: vi.fn(),
}))

const tip = (id: string, tag: string, status: TipCheck['status'] = 'analyzed') =>
  ({ id, status, text: tag }) as unknown as TipCheck
type Calls = Record<'get' | 'analyze' | 'amount' | 'decide', Deferred<TipCheck>[]>
let calls: Calls
const queue = (k: keyof Calls) => () => {
  const d = deferred<TipCheck>()
  calls[k].push(d)
  return d.promise
}

beforeEach(() => {
  calls = { get: [], analyze: [], amount: [], decide: [] }
  vi.mocked(getTip).mockImplementation(queue('get'))
  vi.mocked(analyzeTip).mockImplementation(queue('analyze'))
  vi.mocked(setTipAmount).mockImplementation(queue('amount'))
  vi.mocked(decideTip).mockImplementation(queue('decide'))
})

describe('useTipCheck', () => {
  it('phiếu mới bóc tách: tự phân tích, hiện trạng thái đang soi rồi phiếu đầy đủ', async () => {
    const { result } = renderHook(() => useTipCheck('a'))
    await act(async () => calls.get[0].resolve(tip('a', 'mới', 'extracted')))
    expect(result.current.analyzing).toBe(true)
    expect(result.current.tip?.status).toBe('extracted')
    await act(async () => calls.analyze[0].resolve(tip('a', 'đầy đủ')))
    expect(result.current).toMatchObject({ analyzing: false, tip: { status: 'analyzed', text: 'đầy đủ' } })
  })

  it('đổi sang phiếu khác khi phiếu cũ chưa phân tích xong: kết quả của phiếu cũ không ghi đè', async () => {
    const { result, rerender } = renderHook(({ id }) => useTipCheck(id), { initialProps: { id: 'a' } })
    await act(async () => calls.get[0].resolve(tip('a', 'A', 'extracted')))
    rerender({ id: 'b' })
    await act(async () => calls.get[1].resolve(tip('b', 'B')))
    await act(async () => calls.analyze[0].resolve(tip('a', 'A đầy đủ')))
    expect(result.current.tip?.text).toBe('B')
    expect(result.current.analyzing).toBe(false)
  })

  it('đổi số tiền hai lần liên tiếp, phản hồi về đảo thứ tự: giữ kết quả lần sau', async () => {
    const { result } = renderHook(() => useTipCheck('a'))
    await act(async () => calls.get[0].resolve(tip('a', 'đầu')))
    let p1: Promise<unknown>, p2: Promise<unknown>
    act(() => {
      p1 = result.current.setAmount(10_000_000)
      p2 = result.current.setAmount(20_000_000)
    })
    await act(async () => {
      calls.amount[1].resolve(tip('a', '20 triệu'))
      await p2
    })
    await act(async () => {
      calls.amount[0].resolve(tip('a', '10 triệu'))
      await p1
    })
    expect(result.current.tip?.text).toBe('20 triệu')
    expect(result.current.saving).toBe(false)
  })

  it('quyết định lỗi: ném cho nơi gọi, phiếu đang hiện giữ nguyên', async () => {
    const { result } = renderHook(() => useTipCheck('a'))
    await act(async () => calls.get[0].resolve(tip('a', 'đầu')))
    let err: unknown
    await act(async () => {
      const p = result.current.decide({ decision: 'watch' }).catch((e: unknown) => (err = e))
      calls.decide[0].reject(new Error('Danh sách theo dõi tối đa 50 mã'))
      await p
    })
    expect((err as Error).message).toMatch('tối đa')
    expect(result.current).toMatchObject({ tip: { text: 'đầu' }, error: '', saving: false })
  })

  it('tải phiếu lỗi (vd phiếu của người khác): báo lỗi', async () => {
    const { result } = renderHook(() => useTipCheck('x'))
    await act(async () => calls.get[0].reject(new Error('Không tìm thấy phiếu soi')))
    expect(result.current).toMatchObject({ tip: null, error: 'Không tìm thấy phiếu soi' })
  })
})
