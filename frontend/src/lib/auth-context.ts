import { createContext, useContext } from 'react'
import type { Me } from './types'

export interface AuthState {
  me: Me | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  loginWithGoogle: (credential: string) => Promise<void>
  logout: () => void
  refresh: () => Promise<void>
}

export const Ctx = createContext<AuthState | null>(null)

export function useAuth() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth phải nằm trong AuthProvider')
  return v
}
