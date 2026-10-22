import type { AdvisorChatRequest, AdvisorStreamEvent } from '../lib/types'
import { streamPost } from './stream'

/** Hỏi cố vấn: trả lời về từng đoạn qua Server-Sent Events */
export const streamAdvisorChat = (
  body: AdvisorChatRequest,
  onEvent: (e: AdvisorStreamEvent) => void,
  signal?: AbortSignal,
) => streamPost<AdvisorStreamEvent>('/advisor/chat', body, onEvent, signal)
