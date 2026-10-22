import type {
  PortfolioAlertKind,
  PortfolioAlertPreview,
  PortfolioAlertPreviewRequest,
  PortfolioAlertRule,
  PortfolioAlertRuleRequest,
  PortfolioAlertSettings,
} from '../lib/types'
import { api, post, put } from './client'

export const getPortfolioAlertSettings = () => api<PortfolioAlertSettings>('/portfolio-alerts')
export const previewPortfolioAlerts = (body: PortfolioAlertPreviewRequest) =>
  post<PortfolioAlertPreview>('/portfolio-alerts/preview', body)
export const savePortfolioAlertRule = (kind: PortfolioAlertKind, body: PortfolioAlertRuleRequest) =>
  put<PortfolioAlertRule>(`/portfolio-alerts/${kind}`, body)
