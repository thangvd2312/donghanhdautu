import { useEffect, useRef, useState } from 'react'

interface Recognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  onstart: (() => void) | null
  onend: (() => void) | null
  onerror: ((event: { error: string }) => void) | null
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null
  start(): void
  stop(): void
  abort(): void
}
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition
  webkitSpeechRecognition?: new () => Recognition
}

function constructor() {
  if (typeof window === 'undefined') return undefined
  const w = window as SpeechWindow
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

const ERRORS: Record<string, string> = {
  'not-allowed': 'Chưa được phép dùng mic. Hãy cho phép trong trình duyệt hoặc gõ nội dung bên dưới.',
  'service-not-allowed': 'Trình duyệt không cho phép nhận giọng nói. Bạn có thể gõ nội dung bên dưới.',
  'audio-capture': 'Không tìm thấy mic. Kiểm tra thiết bị hoặc gõ nội dung.',
  'no-speech': 'Chưa nghe thấy lời nói. Bấm mic để thử lại.',
  network: 'Dịch vụ nhận giọng nói chưa kết nối được. Nội dung đã nhận vẫn được giữ để bạn sửa.',
  'language-not-supported': 'Trình duyệt chưa hỗ trợ nhận tiếng Việt. Bạn có thể gõ nội dung.',
}

/** Android Chrome (continuous) repeats earlier speech inside each new result; keep only the longest version. */
export function joinTranscripts(parts: string[]) {
  const out: string[] = []
  for (const raw of parts) {
    const t = raw.trim()
    if (!t) continue
    const last = out[out.length - 1]
    if (last && t.toLowerCase().startsWith(last.toLowerCase())) out[out.length - 1] = t
    else out.push(t)
  }
  return out.join(' ')
}

/** User-initiated recording only. Abort on unmount; ignore late callbacks from previous sessions. */
export function useSpeechInput() {
  const [status, setStatus] = useState<'idle' | 'starting' | 'listening' | 'stopping'>('idle')
  const [error, setError] = useState('')
  /** When the mic actually started listening, for the elapsed-time display */
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const active = useRef<Recognition | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const dispose = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setStartedAt(null)
    const r = active.current
    active.current = null
    if (r) {
      r.onstart = r.onend = r.onerror = r.onresult = null
      r.abort()
    }
  }
  useEffect(() => dispose, [])

  const start = (baseText: string, onText: (text: string) => void) => {
    if (active.current) return
    const Speech = constructor()
    if (!Speech) return setError('Trình duyệt này chưa hỗ trợ mic. Hãy gõ hoặc dán nội dung.')
    setError('')
    const r = new Speech()
    active.current = r
    r.lang = 'vi-VN'
    r.continuous = true
    r.interimResults = true
    r.onstart = () => {
      if (active.current !== r) return
      setStatus('listening')
      setStartedAt(Date.now())
    }
    r.onresult = ({ results }) => {
      if (active.current !== r) return
      const spoken = joinTranscripts(Array.from(results, (result) => result[0].transcript))
      const next = [baseText.trim(), spoken].filter(Boolean).join(' ')
      onText(next.slice(0, 4000))
      if (next.length >= 4000) {
        setError('Đã đạt giới hạn 4.000 ký tự. Hãy phân tích phần này trước.')
        stop()
      }
    }
    r.onerror = ({ error: code }) => {
      if (active.current !== r) return
      if (code !== 'aborted') setError(ERRORS[code] ?? 'Chưa nhận được giọng nói. Bạn có thể thử lại hoặc gõ nội dung.')
      dispose()
      setStatus('idle')
    }
    r.onend = () => {
      if (active.current !== r) return
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
      active.current = null
      setStartedAt(null)
      setStatus('idle')
    }
    try {
      setStatus('starting')
      r.start()
      timer.current = setTimeout(() => stop(), 60_000)
    } catch {
      dispose()
      setStatus('idle')
      setError('Không bật được mic. Hãy kiểm tra quyền truy cập hoặc gõ nội dung.')
    }
  }

  const stop = () => {
    const r = active.current
    if (!r) return
    if (timer.current) clearTimeout(timer.current)
    setStatus('stopping')
    setStartedAt(null)
    try { r.stop() } catch { dispose(); setStatus('idle'); return }
    // Some engines omit onend after losing the connection.
    timer.current = setTimeout(() => { dispose(); setStatus('idle') }, 3000)
  }

  return { supported: !!constructor(), status, error, startedAt, start, stop }
}
