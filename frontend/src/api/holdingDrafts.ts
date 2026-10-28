import type { HoldingDraftRequest, HoldingDraftResponse } from '../lib/types'
import { post } from './client'

export const analyzeHoldings = (body: HoldingDraftRequest) => post<HoldingDraftResponse>('/holding-drafts', body)
