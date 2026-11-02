import type {
  ActiveDeployment,
  DeploymentPlanView,
  DeploymentPreview,
  DeploymentRequest,
  DeploymentSetup,
  OkResponse,
} from '../lib/types'
import { api, post } from './client'

export const getDeploymentSetup = () => api<DeploymentSetup>('/deployment/setup')
export const previewDeployment = (body: DeploymentRequest) => post<DeploymentPreview>('/deployment/preview', body)
export const saveDeployment = (body: DeploymentRequest) => post<DeploymentPlanView>('/deployment', body)
export const getActiveDeployment = () => api<ActiveDeployment>('/deployment/active')
export const markStepDone = (planId: string, stepId: string, transactionId?: string) =>
  post<DeploymentPlanView>(`/deployment/${planId}/steps/${stepId}/done`, { transactionId: transactionId ?? null })
export const skipStep = (planId: string, stepId: string, reason: string) =>
  post<DeploymentPlanView>(`/deployment/${planId}/steps/${stepId}/skip`, { reason })
export const reopenStep = (planId: string, stepId: string) =>
  post<DeploymentPlanView>(`/deployment/${planId}/steps/${stepId}/reopen`)
export const explainDeployment = (planId: string) => post<DeploymentPlanView>(`/deployment/${planId}/explain`)
export const cancelDeployment = (planId: string) => post<OkResponse>(`/deployment/${planId}/cancel`)
