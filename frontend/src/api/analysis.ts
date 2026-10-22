import type { RebalanceRequest, RebalanceResponse, SimulateRequest, SimulateResponse } from '../lib/types'
import { post } from './client'

export const simulatePortfolio = (body: SimulateRequest) => post<SimulateResponse>('/portfolio/simulate', body)
export const rebalancePortfolio = (body: RebalanceRequest) => post<RebalanceResponse>('/portfolio/rebalance', body)
