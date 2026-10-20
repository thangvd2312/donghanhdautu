import { createContext, useContext } from 'react'
import type { MutableRefObject } from 'react'
import type { ActiveChat, ChatMsg } from './chat'

export interface ChatState {
  active: ActiveChat | null
  send: (text: string, conversationId: string | undefined, history: ChatMsg[]) => Promise<void>
  stop: () => void
  patchMessage: (answerId: string, f: (m: ChatMsg) => ChatMsg) => void
  /** Gọi khi server báo id cuộc trò chuyện mới, để trang cố vấn chuyển URL */
  onConversation: MutableRefObject<((id: string) => void) | null>
  onFinished: MutableRefObject<(() => void) | null>
}

export const Ctx = createContext<ChatState | null>(null)

export function useChat() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useChat phải nằm trong ChatProvider')
  return v
}
