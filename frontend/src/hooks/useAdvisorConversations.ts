import { useCallback, useEffect, useState } from 'react'
import { getAdvisorStatus, listConversations } from '../api/advisor'
import type { AdvisorConversationSummary } from '../lib/types'

/** Danh sách cuộc trò chuyện của cố vấn + cố vấn đã được bật (có khoá LLM) hay chưa; `reload` tải lại danh sách */
export function useAdvisorConversations() {
  const [convs, setConvs] = useState<AdvisorConversationSummary[]>([])
  const [enabled, setEnabled] = useState(true)

  const reload = useCallback(() => listConversations().then(setConvs), [])

  useEffect(() => {
    void reload()
    getAdvisorStatus().then((s) => setEnabled(s.enabled))
  }, [reload])

  return { convs, enabled, reload }
}
