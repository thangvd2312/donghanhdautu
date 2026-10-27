import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { getAdvisorStatus, listConversations } from '../api/advisor'
import { qk } from '../lib/query'
import type { AdvisorConversationList } from '../lib/types'

const EMPTY: AdvisorConversationList = { chats: [], briefs: [] }

/** Danh sách cuộc trò chuyện của cố vấn + cố vấn đã được bật (có khoá LLM) hay chưa; `reload` tải lại danh sách */
export function useAdvisorConversations() {
  const client = useQueryClient()
  const convs = useQuery({ queryKey: qk.conversations, queryFn: listConversations })
  const status = useQuery({ queryKey: ['advisor', 'status'], queryFn: getAdvisorStatus, staleTime: 5 * 60_000 })
  const reload = useCallback(() => client.invalidateQueries({ queryKey: qk.conversations }), [client])
  return { convs: convs.data ?? EMPTY, enabled: status.data?.enabled ?? true, reload }
}
