import type { HomeFeed, HomeToday, ReviewPoint } from '../lib/types'
import { api } from './client'

export const getHomeToday = () => api<HomeToday>('/home/today')
export const getHomeReview = () => api<ReviewPoint[]>('/home/review')
export const getHomeFeed = () => api<HomeFeed>('/home/feed')
