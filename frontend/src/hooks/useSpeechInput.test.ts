import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { joinTranscripts, useSpeechInput } from './useSpeechInput'

class FakeRecognition {
  static last: FakeRecognition
  lang = ''
  continuous = false
  interimResults = false
  onstart: (() => void) | null = null
  onend: (() => void) | null = null
  onerror: ((e: { error: string }) => void) | null = null
  onresult: ((e: { results: { 0: { transcript: string } }[] }) => void) | null = null
  start = vi.fn(() => this.onstart?.())
  stop = vi.fn()
  abort = vi.fn()
  constructor() { FakeRecognition.last = this }
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('SpeechRecognition', FakeRecognition)
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('microphone lifecycle', () => {
  it('uses Vietnamese and replaces interim results instead of duplicating words', () => {
    const text = vi.fn()
    const { result, unmount } = renderHook(useSpeechInput)
    act(() => result.current.start('Tôi có', text))
    const r = FakeRecognition.last
    expect(r.lang).toBe('vi-VN')
    expect(result.current.status).toBe('listening')
    act(() => r.onresult?.({ results: [{ 0: { transcript: '100' } }] }))
    act(() => r.onresult?.({ results: [{ 0: { transcript: '100 FPT' } }] }))
    expect(text.mock.calls.map(([s]) => s)).toEqual(['Tôi có 100', 'Tôi có 100 FPT'])
    unmount()
    expect(r.abort).toHaveBeenCalledOnce()
  })
  it('denied permission returns to idle and leaves the fallback available', () => {
    const { result, unmount } = renderHook(useSpeechInput)
    act(() => result.current.start('', vi.fn()))
    act(() => FakeRecognition.last.onerror?.({ error: 'not-allowed' }))
    expect(result.current.status).toBe('idle')
    expect(result.current.error).toContain('cho phép')
    unmount()
  })
  it('stops at 60 seconds, recovers if onend is missing, and rejects late results', () => {
    const text = vi.fn()
    const { result, unmount } = renderHook(useSpeechInput)
    act(() => result.current.start('', text))
    const r = FakeRecognition.last
    const late = r.onresult!
    act(() => vi.advanceTimersByTime(60_000))
    expect(r.stop).toHaveBeenCalledOnce()
    expect(result.current.status).toBe('stopping')
    act(() => vi.advanceTimersByTime(3000))
    expect(result.current.status).toBe('idle')
    act(() => late({ results: [{ 0: { transcript: 'cũ' } }] }))
    expect(text).not.toHaveBeenCalled()
    unmount()
  })
  it('recognizes unsupported browsers without requesting a mic', () => {
    vi.stubGlobal('SpeechRecognition', undefined)
    vi.stubGlobal('webkitSpeechRecognition', undefined)
    const { result, unmount } = renderHook(useSpeechInput)
    expect(result.current.supported).toBe(false)
    unmount()
  })
  it('collapses Android cumulative results but keeps separate desktop segments', () => {
    expect(joinTranscripts(['Tôi có', 'tôi có 100 FPT', 'Tôi có 100 FPT và 50 triệu'])).toBe('Tôi có 100 FPT và 50 triệu')
    expect(joinTranscripts(['Tôi có 100 FPT', 'và 2 lượng vàng'])).toBe('Tôi có 100 FPT và 2 lượng vàng')
    expect(joinTranscripts([' ', 'BTC'])).toBe('BTC')
  })
  it('exposes when listening started and clears it on stop', () => {
    const { result, unmount } = renderHook(useSpeechInput)
    act(() => result.current.start('', vi.fn()))
    expect(result.current.startedAt).toBeTypeOf('number')
    act(() => result.current.stop())
    expect(result.current.startedAt).toBeNull()
    unmount()
  })
})
