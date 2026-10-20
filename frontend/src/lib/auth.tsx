import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Ctx } from './auth-context'
import { api, getToken, post, setToken } from './api'
import type { Me } from './types'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setMe(null)
      setLoading(false)
      return
    }
    try {
      setMe(await api<Me>('/auth/me'))
    } catch {
      setMe(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const login = async (email: string, password: string) => {
    const { token } = await post<{ token: string }>('/auth/login', { email, password })
    setToken(token)
    await refresh()
  }

  const register = async (name: string, email: string, password: string) => {
    const { token } = await post<{ token: string }>('/auth/register', { name, email, password })
    setToken(token)
    await refresh()
  }

  const loginWithGoogle = async (credential: string) => {
    const { token } = await post<{ token: string }>('/auth/google', { credential })
    setToken(token)
    await refresh()
  }

  const logout = () => {
    setToken(null)
    setMe(null)
  }

  return <Ctx.Provider value={{ me, loading, login, register, loginWithGoogle, logout, refresh }}>{children}</Ctx.Provider>
}

