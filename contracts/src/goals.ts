/** Mục tiêu tài chính (/goals) */

import type { AssetType } from './common'

export type GoalAssetType = AssetType

export interface Goal {
  id: string
  name: string
  targetAmount: number
  targetDate: string
  monthlyContribution: number
  expectedReturnPct: number
  targetAllocation: Partial<Record<GoalAssetType, number>> | null
  status: 'active' | 'paused' | 'achieved'
  note: string | null
  allocations: { assetType: GoalAssetType; symbol: string; pct: number }[]
  progress: {
    current: number
    progressPct: number
    assets: { assetType: string; symbol: string; pct: number; name: string; value: number; held: boolean }[]
    actualAllocation: Record<string, number>
    deviation: { assetType: GoalAssetType; target: number; actual: number; diff: number }[] | null
    isEstimate: boolean
    missingAssets: string[]
  }
  monthsLeft: number
  simulation: { projected: number; onTrack: boolean; requiredMonthly: number }
  updatedAt: string
}

/** Tài sản đang giữ có thể gắn vào mục tiêu */
export interface GoalAsset {
  assetType: GoalAssetType
  symbol: string
  displayName: string
  value: number
  usedPct: number
}

/** GET /goals */
export interface GoalsResponse {
  goals: Goal[]
  assets: GoalAsset[]
}

export type GoalStatus = Goal['status']

export interface GoalAllocationRequest {
  assetType: GoalAssetType
  symbol: string
  /** Phần trăm của tài sản này dành cho mục tiêu, 0–100 */
  pct: number
}

/** POST /goals và PUT /goals/:id */
export interface GoalRequest {
  name: string
  targetAmount: number
  /** YYYY-MM-DD, phải ở tương lai */
  targetDate: string
  monthlyContribution?: number
  expectedReturnPct?: number
  targetAllocation?: Partial<Record<GoalAssetType, number>> | null
  note?: string
  allocations: GoalAllocationRequest[]
}

/** POST /goals/:id/status */
export interface GoalStatusRequest {
  status: GoalStatus
}

/** POST /goals và PUT /goals/:id */
export interface GoalIdResponse {
  id: string
}

/** POST /goals/:id/status */
export interface GoalStatusResponse {
  id: string
  status: GoalStatus
}
