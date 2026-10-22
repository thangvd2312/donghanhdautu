import type {
  ChannelSettingsRequest,
  PushStatus,
  PushSubscribeRequest,
  TelegramLinkResponse,
  TelegramStatus,
} from '../lib/types'
import { api, del, patch, post } from './client'

export const getTelegramStatus = () => api<TelegramStatus>('/telegram')
export const linkTelegram = () => post<TelegramLinkResponse>('/telegram/link')
export const testTelegram = () => post<unknown>('/telegram/test')
export const unlinkTelegram = () => del<unknown>('/telegram')
export const updateTelegramSettings = (p: ChannelSettingsRequest) => patch<unknown>('/telegram/settings', p)

export const getPushStatus = () => api<PushStatus>('/push')
export const subscribePush = (sub: PushSubscribeRequest) => post<unknown>('/push/subscribe', sub)
export const unsubscribePush = (endpoint: string) =>
  api<unknown>('/push/subscribe', { method: 'DELETE', body: JSON.stringify({ endpoint }) })
export const testPush = () => post<unknown>('/push/test')
export const updatePushSettings = (p: ChannelSettingsRequest) => patch<unknown>('/push/settings', p)
