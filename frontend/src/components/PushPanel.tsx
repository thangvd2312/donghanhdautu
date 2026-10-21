import InstallMobileOutlined from '@mui/icons-material/InstallMobileOutlined'
import NotificationsActiveOutlined from '@mui/icons-material/NotificationsActiveOutlined'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useCallback, useEffect, useState } from 'react'
import { api, patch, post } from '../lib/api'
import { timeAgo } from '../lib/format'
import type { PushStatus } from '../lib/types'
import ChannelSettings from './ChannelSettings'
import { Panel } from './ui'

/** Sự kiện cài app của Chrome/Edge (không có trong kiểu DOM chuẩn) */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent)
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

function keyToBytes(base64: string) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

/** Cài app lên màn hình (PWA) và bật thông báo trình duyệt cho thiết bị đang dùng */
export default function PushPanel() {
  const [s, setS] = useState<PushStatus | null>(null)
  const [endpoint, setEndpoint] = useState<string | null>(null)
  const [installEvt, setInstallEvt] = useState<InstallPromptEvent | null>(null)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const st = await api<PushStatus>('/push').catch((e: Error) => {
      setError(e.message)
      return null
    })
    setS(st)
    if (supported()) {
      const reg = await navigator.serviceWorker.getRegistration()
      const sub = await reg?.pushManager.getSubscription()
      setEndpoint(sub?.endpoint ?? null)
    }
  }, [])

  useEffect(() => {
    void load()
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setInstallEvt(e as InstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [load])

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setError('')
    setInfo('')
    setBusy(true)
    try {
      await fn()
      if (ok) setInfo(ok)
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const enable = () =>
    run(async () => {
      if (!s?.publicKey) throw new Error('Máy chủ chưa sẵn sàng gửi thông báo')
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') {
        throw new Error('Trình duyệt đang chặn thông báo của trang này. Mở cài đặt trang (biểu tượng ổ khoá) để cho phép rồi thử lại.')
      }
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('/sw.js'))
      await navigator.serviceWorker.ready
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(s.publicKey) }))
      await post('/push/subscribe', sub.toJSON())
    }, 'Đã bật thông báo trên thiết bị này.')

  const disable = () =>
    run(async () => {
      const reg = await navigator.serviceWorker.getRegistration()
      const sub = await reg?.pushManager.getSubscription()
      if (sub) {
        await api('/push/subscribe', { method: 'DELETE', body: JSON.stringify({ endpoint: sub.endpoint }) })
        await sub.unsubscribe()
      }
    })

  const install = async () => {
    if (!installEvt) return
    await installEvt.prompt()
    await installEvt.userChoice
    setInstallEvt(null)
  }

  if (!s) return null
  const thisDeviceOn = !!endpoint && s.devices.some((d) => d.endpoint === endpoint)
  const iosNeedsInstall = isIos() && !isStandalone()

  return (
    <Panel title="Thông báo trên điện thoại / máy tính" subtitle="Cài app lên màn hình và nhận thông báo kể cả khi không mở">
      <Stack spacing={1.5}>
        {installEvt && (
          <Box>
            <Button variant="outlined" startIcon={<InstallMobileOutlined />} onClick={() => void install()}>
              Cài ứng dụng lên máy
            </Button>
          </Box>
        )}
        {iosNeedsInstall ? (
          <Alert severity="info">
            Trên iPhone / iPad: bấm nút <b>Chia sẻ</b> của Safari → <b>Thêm vào MH chính</b>, rồi mở app từ màn hình chính và
            bật thông báo tại đây (cần iOS 16.4 trở lên).
          </Alert>
        ) : !supported() ? (
          <Typography variant="body2" color="text.secondary">
            Trình duyệt này không hỗ trợ thông báo đẩy. Hãy dùng Chrome, Edge, Firefox hoặc Safari bản mới.
          </Typography>
        ) : (
          <Stack useFlexGap direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
            {thisDeviceOn ? (
              <>
                <Chip size="small" color="success" label="Đã bật trên thiết bị này" />
                <Box sx={{ flex: 1 }} />
                <Button size="small" disabled={busy} onClick={() => void run(() => post('/push/test'), 'Đã gửi thông báo thử.')}>
                  Gửi thử
                </Button>
                <Button size="small" color="error" disabled={busy} onClick={() => void disable()}>
                  Tắt trên thiết bị này
                </Button>
              </>
            ) : (
              <Button variant="contained" startIcon={<NotificationsActiveOutlined />} disabled={busy} onClick={() => void enable()}>
                Bật thông báo trên thiết bị này
              </Button>
            )}
          </Stack>
        )}
        {s.devices.length > 0 && (
          <Typography variant="caption" color="text.secondary">
            Đang bật trên {s.devices.length} thiết bị.
          </Typography>
        )}
        {s.devices.length > 0 && (
          <>
            <Divider />
            <ChannelSettings
              kindLabels={s.kindLabels}
              prefs={s.settings}
              onChange={(p) => void run(() => patch('/push/settings', p))}
            />
          </>
        )}
        {s.recent.length > 0 && (
          <>
            <Divider />
            <Typography variant="caption" color="text.secondary">
              Gần đây
            </Typography>
            {s.recent.slice(0, 5).map((r) => (
              <Stack key={r.id} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Chip
                  size="small"
                  variant="outlined"
                  label={{ sent: 'Đã gửi', pending: 'Đang chờ', sending: 'Đang gửi', skipped: 'Bỏ qua', failed: 'Lỗi' }[r.status] ?? r.status}
                  color={r.status === 'sent' ? 'success' : r.status === 'failed' ? 'error' : 'default'}
                  sx={{ height: 20, fontSize: 11 }}
                />
                <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }}>
                  {r.title}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                  {timeAgo(r.sentAt ?? r.createdAt)}
                </Typography>
              </Stack>
            ))}
          </>
        )}
        {info && <Alert severity="success">{info}</Alert>}
        {error && <Alert severity="error">{error}</Alert>}
      </Stack>
    </Panel>
  )
}
