import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { streamPost } from './api'

export interface VerificationIssue {
  type: 'misattribution' | 'number_mismatch' | 'unsupported'
  quote: string
  evidenceQuote: string
  explanation: string
  correction: string
}

export interface Verification {
  status: 'verified' | 'issues' | 'skipped'
  issues: VerificationIssue[]
  discarded: number
  checkedAt: string
  reason?: string
}

export interface ChatMsg {
  /** id câu trả lời (chỉ có ở tin của cố vấn sau khi lưu xong) */
  id?: string
  role: 'user' | 'assistant'
  text: string
  tools: string[]
  sources: { title: string; url: string }[]
  verifying?: boolean
  verification?: Verification
  /** Lý do người dùng đã báo sai, nếu có */
  feedback?: string
  thinking?: string
  error?: string
  streaming?: boolean
}

type ChatEvent =
  | { type: 'conversation'; id: string; title: string }
  | { type: 'thinking'; text: string }
  | { type: 'text'; text: string }
  | { type: 'tool'; label: string }
  | { type: 'sources'; items: { title: string; url: string }[] }
  | { type: 'verifying' }
  | ({ type: 'verification' } & Verification)
  | { type: 'done'; answerId: string | null }
  | { type: 'error'; message: string }

interface ActiveChat {
  /** undefined cho tới khi server tạo xong cuộc trò chuyện mới */
  conversationId?: string
  /** Lịch sử đã có trước lượt hỏi này + lượt đang stream */
  messages: ChatMsg[]
  busy: boolean
}

interface ChatState {
  active: ActiveChat | null
  send: (text: string, conversationId: string | undefined, history: ChatMsg[]) => Promise<void>
  stop: () => void
  patchMessage: (answerId: string, f: (m: ChatMsg) => ChatMsg) => void
  /** Gọi khi server báo id cuộc trò chuyện mới, để trang cố vấn chuyển URL */
  onConversation: React.MutableRefObject<((id: string) => void) | null>
  onFinished: React.MutableRefObject<(() => void) | null>
}

const Ctx = createContext<ChatState | null>(null)

/**
 * Luồng chat sống ở cấp app chứ không gắn với trang cố vấn: rời trang trong lúc đang trả lời
 * thì câu trả lời vẫn chạy tiếp và quay lại vẫn thấy. Chỉ cho phép một luồng tại một thời điểm —
 * trước đây mỗi lần rời trang để lại một kết nối SSE treo, đủ 6 cái là trình duyệt (giới hạn
 * 6 kết nối HTTP/1.1 mỗi host) không gửi được request nào khác cho tới khi F5.
 */
export function ChatProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<ActiveChat | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const busyRef = useRef(false)
  const onConversation = useRef<((id: string) => void) | null>(null)
  const onFinished = useRef<(() => void) | null>(null)

  const send = useCallback(async (text: string, conversationId: string | undefined, history: ChatMsg[]) => {
    text = text.trim()
    if (!text || busyRef.current) return
    busyRef.current = true
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setActive({
      conversationId,
      busy: true,
      messages: [
        ...history,
        { role: 'user', text, tools: [], sources: [] },
        { role: 'assistant', text: '', tools: [], sources: [], thinking: '', streaming: true },
      ],
    })
    const patchLast = (f: (m: ChatMsg) => ChatMsg) =>
      setActive((a) => (a ? { ...a, messages: [...a.messages.slice(0, -1), f(a.messages[a.messages.length - 1])] } : a))

    try {
      await streamPost<ChatEvent>(
        '/advisor/chat',
        { conversationId, message: text },
        (e) => {
          switch (e.type) {
            case 'conversation':
              setActive((a) => (a ? { ...a, conversationId: e.id } : a))
              onConversation.current?.(e.id)
              break
            case 'thinking':
              patchLast((m) => ({ ...m, thinking: (m.thinking ?? '') + e.text }))
              break
            case 'text':
              patchLast((m) => ({ ...m, text: m.text + e.text }))
              break
            case 'tool':
              patchLast((m) => ({ ...m, tools: [...m.tools, e.label] }))
              break
            case 'sources':
              patchLast((m) => {
                const seen = new Set(m.sources.map((s) => s.url))
                return { ...m, sources: [...m.sources, ...e.items.filter((s) => !seen.has(s.url))] }
              })
              break
            case 'verifying':
              patchLast((m) => ({ ...m, verifying: true }))
              break
            case 'verification': {
              const { type: _t, ...v } = e
              void _t
              patchLast((m) => ({ ...m, verifying: false, verification: v }))
              break
            }
            case 'done':
              if (e.answerId) patchLast((m) => ({ ...m, id: e.answerId ?? undefined }))
              break
            case 'error':
              patchLast((m) => ({ ...m, error: e.message }))
              break
          }
        },
        ctrl.signal,
      )
    } catch (err) {
      if (!ctrl.signal.aborted) patchLast((m) => ({ ...m, error: (err as Error).message }))
    } finally {
      patchLast((m) => ({ ...m, streaming: false, verifying: false }))
      setActive((a) => (a ? { ...a, busy: false } : a))
      busyRef.current = false
      abortRef.current = null
      onFinished.current?.()
    }
  }, [])

  const stop = useCallback(() => abortRef.current?.abort(), [])

  /** Cập nhật một tin của luồng đang hiển thị (vd đánh dấu đã báo sai) */
  const patchMessage = useCallback((answerId: string, f: (m: ChatMsg) => ChatMsg) => {
    setActive((a) => (a ? { ...a, messages: a.messages.map((m) => (m.id === answerId ? f(m) : m)) } : a))
  }, [])

  return <Ctx.Provider value={{ active, send, stop, patchMessage, onConversation, onFinished }}>{children}</Ctx.Provider>
}

export function useChat() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useChat phải nằm trong ChatProvider')
  return v
}
