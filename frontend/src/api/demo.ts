import type { DemoResponse } from '../lib/types'
import { api } from './client'

export const getDemo = () => api<DemoResponse>('/demo')
