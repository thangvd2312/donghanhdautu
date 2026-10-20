import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { GoogleLogin, GoogleOAuthProvider } from '@react-oauth/google'
import { useEffect, useState, type FormEvent } from 'react'
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom'
import { Logo } from '../components/ui'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth-context'
import { safeNext } from '../lib/nav'

export default function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { login, register, loginWithGoogle } = useAuth()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  // Chuyển qua lại đăng nhập / đăng ký vẫn giữ đích cần quay lại
  const keepNext = next === '/' ? '' : `?next=${encodeURIComponent(next)}`
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // undefined: đang tải · null: máy chủ chưa cấu hình Google · 'error': mạng lỗi sau vài lần thử
  const [googleClientId, setGoogleClientId] = useState<string | null | undefined | 'error'>(undefined)
  const [googleTry, setGoogleTry] = useState(0)

  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = (attempt: number) =>
      api<{ googleClientId: string | null }>('/auth/config')
        .then((c) => alive && setGoogleClientId(c.googleClientId))
        .catch(() => {
          if (!alive) return
          // Mạng chập chờn (4G, vừa mở app): thử lại thay vì ẩn hẳn nút Google
          if (attempt < 3) timer = setTimeout(() => void load(attempt + 1), 1000 * (attempt + 1))
          else setGoogleClientId('error')
        })
    setGoogleClientId(undefined)
    void load(0)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [googleTry])

  const run = async (fn: () => Promise<void>) => {
    setError('')
    setBusy(true)
    try {
      await fn()
      nav(next, { replace: true })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void run(() => (mode === 'login' ? login(email, password) : register(name, email, password)))
  }

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
      <Box
        sx={{
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          justifyContent: 'space-between',
          p: 6,
          bgcolor: 'primary.dark',
          color: '#fff',
        }}
      >
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Box sx={{ color: '#fff', '& rect': { fill: 'rgba(255,255,255,.15)' } }}>
            <Logo size={36} />
          </Box>
          <Typography variant="h6" sx={{ color: '#fff' }}>
            Đồng Hành Đầu Tư
          </Typography>
        </Stack>
        <Box sx={{ maxWidth: 460 }}>
          <Typography variant="h4" sx={{ color: '#fff', lineHeight: 1.25 }}>
            Bảng giá cổ phiếu, vàng, crypto — và một cố vấn biết rõ danh mục của bạn.
          </Typography>
          <Stack spacing={1.5} sx={{ mt: 4, opacity: 0.85 }}>
            <Typography>Giá realtime HOSE, HNX, UPCoM, SJC, DOJI, PNJ, Binance trong một màn hình.</Typography>
            <Typography>Phân tích có số liệu và nguồn dẫn, tách bạch đầu tư dài hạn và lướt sóng.</Typography>
            <Typography>Báo cho bạn khi tài sản đang giữ biến động mạnh hoặc có tin quan trọng.</Typography>
          </Stack>
        </Box>
        <Typography variant="caption" sx={{ opacity: 0.6 }}>
          Phân tích mang tính tham khảo, không phải khuyến nghị đầu tư được cấp phép.
        </Typography>
      </Box>

      <Box sx={{ display: 'grid', placeItems: 'center', p: 3 }}>
        <Paper sx={{ width: '100%', maxWidth: 420, p: { xs: 3, sm: 4 } }}>
          <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', mb: 3, display: { md: 'none' } }}>
            <Logo size={28} />
            <Typography sx={{ fontWeight: 700 }}>Đồng Hành Đầu Tư</Typography>
          </Stack>
          <Typography variant="h5">{mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 3 }}>
            {mode === 'login' ? 'Chào mừng bạn quay lại.' : 'Mất khoảng 2 phút, gồm cả bài khảo sát khẩu vị rủi ro.'}
          </Typography>

          {googleClientId !== null && (
            <>
              {googleClientId === undefined ? (
                <Skeleton variant="rounded" height={44} sx={{ borderRadius: 1 }} />
              ) : googleClientId === 'error' ? (
                <Button fullWidth variant="outlined" onClick={() => setGoogleTry((n) => n + 1)}>
                  Không tải được đăng nhập Google — thử lại
                </Button>
              ) : (
                <GoogleOAuthProvider clientId={googleClientId} locale="vi">
                  <Box sx={{ display: 'flex', justifyContent: 'center', minHeight: 44 }}>
                    <GoogleLogin
                      text={mode === 'login' ? 'signin_with' : 'signup_with'}
                      // Nút Google có bề rộng cố định (200–400px): co theo màn hình điện thoại để không tràn ngang
                      width={Math.min(340, Math.max(200, window.innerWidth - 104))}
                      // Tự hiện hộp chọn tài khoản Google (One Tap) khi mở trang
                      useOneTap
                      onSuccess={(r) => r.credential && void run(() => loginWithGoogle(r.credential!))}
                      onError={() => setError('Đăng nhập Google thất bại, thử lại nhé')}
                    />
                  </Box>
                </GoogleOAuthProvider>
              )}
              <Divider sx={{ my: 3 }}>
                <Typography variant="caption" color="text.secondary">
                  hoặc dùng email
                </Typography>
              </Divider>
            </>
          )}

          <Stack component="form" spacing={2} onSubmit={submit}>
            {mode === 'register' && (
              <TextField label="Tên của bạn" value={name} onChange={(e) => setName(e.target.value)} required fullWidth />
            )}
            <TextField
              label="Email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              fullWidth
            />
            <TextField
              label="Mật khẩu"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              helperText={mode === 'register' ? 'Ít nhất 8 ký tự' : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              fullWidth
              slotProps={{ htmlInput: { minLength: mode === 'register' ? 8 : undefined } }}
            />
            {error && <Alert severity="error">{error}</Alert>}
            <Button type="submit" variant="contained" size="large" disabled={busy}>
              {busy ? 'Đang xử lý…' : mode === 'login' ? 'Đăng nhập' : 'Đăng ký'}
            </Button>
          </Stack>

          <Typography variant="body2" color="text.secondary" sx={{ mt: 3, textAlign: 'center' }}>
            {mode === 'login' ? 'Chưa có tài khoản? ' : 'Đã có tài khoản? '}
            <Link
              component={RouterLink}
              to={`${mode === 'login' ? '/register' : '/login'}${keepNext}`}
              sx={{ display: 'inline-block', py: 1 }}
            >
              {mode === 'login' ? 'Đăng ký' : 'Đăng nhập'}
            </Link>
          </Typography>
          <Typography variant="body2" sx={{ mt: 1, textAlign: 'center' }}>
            <Link component={RouterLink} to="/demo">
              Xem thử với danh mục mẫu, không cần đăng ký →
            </Link>
          </Typography>
        </Paper>
      </Box>
    </Box>
  )
}
