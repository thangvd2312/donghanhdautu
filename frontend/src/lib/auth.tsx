import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Ctx } from './auth-context'
import { getMe, login as apiLogin, loginWithGoogle as apiLoginWithGoogle, register as apiRegister } from '../api/auth'
import { getToken, setToken } from '../api/client'
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
      setMe(await getMe())
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
    const { token } = await apiLogin(email, password)
    setToken(token)
    await refresh()
  }

  const register = async (name: string, email: string, password: string) => {
    const { token } = await apiRegister(name, email, password)
    setToken(token)
    await refresh()
  }

  const loginWithGoogle = async (credential: string) => {
    const { token } = await apiLoginWithGoogle(credential)
    setToken(token)
    await refresh()
  }

  const logout = () => {
    setToken(null)
    setMe(null)
  }

  return <Ctx.Provider value={{ me, loading, login, register, loginWithGoogle, logout, refresh }}>{children}</Ctx.Provider>
}

