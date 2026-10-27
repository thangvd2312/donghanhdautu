import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Ctx } from './auth-context'
import { getMe, login as apiLogin, loginWithGoogle as apiLoginWithGoogle, register as apiRegister } from '../api/auth'
import { ApiError, getCachedMe, getToken, setCachedMe, setToken } from '../api/client'
import { queryClient } from './query'
import type { Me } from './types'

/** Đã đăng nhập ở lần mở trước: dùng thông tin đã lưu để hiện app ngay, /auth/me kiểm tra lại ngầm */
const initialMe = () => (getToken() ? getCachedMe<Me>() : null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(initialMe)
  // Chỉ chặn màn hình khi có token mà chưa có thông tin đã lưu (lần đầu sau khi cập nhật app)
  const [loading, setLoading] = useState(() => !!getToken() && !initialMe())

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setMe(null)
      setLoading(false)
      return
    }
    try {
      const fresh = await getMe()
      setMe(fresh)
      setCachedMe(fresh)
    } catch (e) {
      // Hết phiên thì đăng xuất; lỗi mạng thì giữ thông tin đã lưu (nếu có) thay vì đẩy về trang đăng nhập
      if (e instanceof ApiError && e.status === 401) {
        setCachedMe(null)
        setMe(null)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Đổi người dùng: bỏ dữ liệu đã cache của phiên trước
  const startSession = async (token: string) => {
    setToken(token)
    queryClient.clear()
    await refresh()
  }

  const login = async (email: string, password: string) => {
    const { token } = await apiLogin(email, password)
    await startSession(token)
  }

  const register = async (name: string, email: string, password: string) => {
    const { token } = await apiRegister(name, email, password)
    await startSession(token)
  }

  const loginWithGoogle = async (credential: string) => {
    const { token } = await apiLoginWithGoogle(credential)
    await startSession(token)
  }

  const logout = () => {
    setToken(null)
    queryClient.clear()
    setMe(null)
  }

  return <Ctx.Provider value={{ me, loading, login, register, loginWithGoogle, logout, refresh }}>{children}</Ctx.Provider>
}
