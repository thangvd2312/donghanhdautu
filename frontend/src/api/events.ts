import type { EventRange, EventsResponse, ReminderSettings, ReminderSettingsPatch } from '../lib/types'
import { api, patch } from './client'

export const getEvents = (range: EventRange) => api<EventsResponse>(`/events?range=${range}`)
export const updateReminders = (body: ReminderSettingsPatch) => patch<ReminderSettings>('/events/reminders', body)
