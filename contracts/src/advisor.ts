/** Cố vấn AI (/advisor) */

import type { SourceLink } from './common'

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
  /** Số lỗi model kiểm tra đưa ra nhưng bị loại vì không trích được nguyên văn (chống bịa lỗi) */
  discarded: number
  checkedAt: string
  reason?: string
}

/** GET /advisor/status */
export interface AdvisorStatus {
  enabled: boolean
}

/** GET /advisor/conversations */
export interface AdvisorConversationSummary {
  id: string
  title: string
  updatedAt: string
}

/** Một lượt hiển thị của cuộc trò chuyện: lượt hỏi của người dùng, hoặc khối trả lời của cố vấn */
export interface AdvisorMessage {
  /** id câu trả lời (chỉ có ở tin của cố vấn) */
  id?: string
  role: 'user' | 'assistant'
  text: string
  tools: string[]
  sources: SourceLink[]
  verification?: Verification
  /** Lý do người dùng đã báo sai, nếu có */
  feedback?: AdvisorFeedbackReason
}

/** GET /advisor/conversations/:id */
export interface AdvisorConversation {
  id: string
  title: string
  messages: AdvisorMessage[]
}

export type AdvisorFeedbackReason = 'wrong_number' | 'wrong_source' | 'outdated' | 'bad_advice' | 'other'

/** POST /advisor/feedback */
export interface AdvisorFeedbackRequest {
  conversationId: string
  answerId: string
  reason: AdvisorFeedbackReason
  note?: string
}

/** POST /advisor/chat */
export interface AdvisorChatRequest {
  conversationId?: string
  message: string
}

/** Sự kiện Server-Sent Events của POST /advisor/chat, mỗi sự kiện một dòng `data: <JSON>` */
export type AdvisorStreamEvent =
  | { type: 'conversation'; id: string; title: string }
  | { type: 'thinking'; text: string }
  | { type: 'text'; text: string }
  | { type: 'tool'; label: string }
  | { type: 'sources'; items: SourceLink[] }
  | { type: 'verifying' }
  | ({ type: 'verification' } & Verification)
  | { type: 'done'; answerId: string | null }
  | { type: 'error'; message: string }
