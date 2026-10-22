import type { AuthConfig, AuthToken, InvestorProfile, Me, ProfileSettingsRequest, QuizQuestion } from '../lib/types'
import { api, patch, post, put } from './client'

export const getMe = () => api<Me>('/auth/me')
export const login = (email: string, password: string) => post<AuthToken>('/auth/login', { email, password })
export const register = (name: string, email: string, password: string) =>
  post<AuthToken>('/auth/register', { name, email, password })
export const loginWithGoogle = (credential: string) => post<AuthToken>('/auth/google', { credential })
export const getAuthConfig = () => api<AuthConfig>('/auth/config')

export const getQuiz = () => api<QuizQuestion[]>('/profile/quiz')
export const submitQuiz = (answers: Record<string, string>) => put<InvestorProfile>('/profile', { answers })
export const updateProfileSettings = (body: ProfileSettingsRequest) => patch<unknown>('/profile/settings', body)
