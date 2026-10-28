import type { AssetType } from './common'

/** POST /holding-drafts. Authenticated; analyzes text only, never writes to the ledger.
 * 400 invalid text (1–4000 characters); 429 AI quota; 503 AI unavailable/invalid output.
 */
export interface HoldingDraftRequest {
  text: string
}

export interface HoldingDraftRow {
  assetType: AssetType | null
  symbol: string | null
  /** Shares, coins, lượng gold, or VND cash. Unknown values stay null. */
  quantity: number | null
  /** Per share / lượng in VND; per coin in USDT. Never a live quote. */
  avgCost: number | null
  sourceText: string
  warnings: string[]
}

export interface HoldingDraftResponse {
  rows: HoldingDraftRow[]
  warnings: string[]
}
