const TOKEN_KEY = 'dautu_token'

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Trình duyệt chặn storage: phiên chỉ tồn tại tới khi tải lại trang
  }
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken()
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  })
  if (res.status === 401) {
    setToken(null)
    if (!location.pathname.startsWith('/login') && !location.pathname.startsWith('/register')) {
      location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`
    }
  }
  if (!res.ok) {
    let msg = res.statusText
    try {
      const body = await res.json()
      msg = Array.isArray(body.message) ? body.message.join(', ') : (body.message ?? msg)
    } catch {
      /* body không phải JSON */
    }
    throw new ApiError(res.status, msg)
  }
  return (await res.json()) as T
}

export const post = <T,>(path: string, body?: unknown) =>
  api<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })
export const put = <T,>(path: string, body: unknown) => api<T>(path, { method: 'PUT', body: JSON.stringify(body) })
export const patch = <T,>(path: string, body: unknown) =>
  api<T>(path, { method: 'PATCH', body: JSON.stringify(body) })
export const del = <T,>(path: string) => api<T>(path, { method: 'DELETE' })
