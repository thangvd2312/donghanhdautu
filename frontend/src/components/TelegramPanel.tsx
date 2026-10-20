import Send from '@mui/icons-material/Send'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import FormControlLabel from '@mui/material/FormControlLabel'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useCallback, useEffect, useState } from 'react'
import { api, del, patch, post } from '../lib/api'
import { timeAgo } from '../lib/format'
import { Panel } from './ui'

interface TelegramStatus {
  configured: boolean
  botUsername: string | null
  kindLabels: Record<string, string>
  link: {
    username: string | null
    active: boolean
    kinds: Record<string, boolean>
    quietStart: number | null
    quietEnd: number | null
    showDetails: boolean
  } | null
  recent: { id: string; title: string; status: string; lastError: string | null; sentAt: string | null; createdAt: string }[]
}

const HOURS = Array.from({ length: 24 }, (_, h) => h)
const STATUS_LABEL: Record<string, string> = {
  sent: 'Đã gửi',
  pending: 'Đang chờ',
  sending: 'Đang gửi',
  skipped: 'Bỏ qua',
  failed: 'Lỗi',
}

/** Kết nối Telegram (người dùng chủ động), chọn loại tin, giờ yên lặng, mức chi tiết; xem tin đã gửi */
export default function TelegramPanel() {
  const [s, setS] = useState<TelegramStatus | null>(null)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [waiting, setWaiting] = useState(false)

  const load = useCallback(() => api<TelegramStatus>('/telegram').then(setS).catch((e: Error) => setError(e.message)), [])
  useEffect(() => {
    void load()
  }, [load])

  // Sau khi mở bot: kiểm tra định kỳ tới khi người dùng bấm Start (tối đa ~3 phút)
  useEffect(() => {
    if (!waiting) return
    let n = 0
    const t = setInterval(() => {
      n++
      void api<TelegramStatus>('/telegram').then((r) => {
        setS(r)
        if (r.link?.active || n > 60) setWaiting(false)
      })
    }, 3000)
    return () => clearInterval(t)
  }, [waiting])

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setError('')
    setInfo('')
    try {
      await fn()
      if (ok) setInfo(ok)
      await load()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const connect = () =>
    run(async () => {
      const { url } = await post<{ url: string }>('/telegram/link')
      window.open(url, '_blank', 'noopener')
      setWaiting(true)
    })

  if (!s) return null
  const link = s.link

  return (
    <Panel title="Nhận thông báo qua Telegram" subtitle="Tin quan trọng tới điện thoại kể cả khi không mở ứng dụng">
      {!s.configured ? (
        <Typography variant="body2" color="text.secondary">
          Máy chủ chưa bật Telegram.
        </Typography>
      ) : !link || !link.active ? (
        <Stack spacing={1.5}>
          <Typography variant="body2" color="text.secondary">
            Bấm kết nối, Telegram sẽ mở bot @{s.botUsername}; bấm <b>Start</b> là xong. Chỉ gửi những loại tin bạn chọn; mặc định
            không kèm số dư hay số liệu danh mục.
          </Typography>
          {link && !link.active && (
            <Alert severity="info">Bạn đã tắt nhận tin (hoặc chặn bot). Kết nối lại để bật.</Alert>
          )}
          <Box>
            <Button variant="contained" startIcon={<Send />} onClick={() => void connect()} disabled={waiting}>
              {waiting ? 'Đang chờ bạn bấm Start trong Telegram…' : 'Kết nối Telegram'}
            </Button>
          </Box>
        </Stack>
      ) : (
        <Stack spacing={1}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
            <Chip size="small" color="success" label={`Đã kết nối${link.username ? ` · @${link.username}` : ''}`} />
            <Box sx={{ flex: 1 }} />
            <Button size="small" onClick={() => void run(() => post('/telegram/test'), 'Đã gửi tin thử, hãy kiểm tra Telegram.')}>
              Gửi tin thử
            </Button>
            <Button size="small" color="error" onClick={() => void run(() => del('/telegram'))}>
              Ngắt kết nối
            </Button>
          </Stack>
          <Typography variant="caption" color="text.secondary">
            Loại tin gửi qua Telegram
          </Typography>
          {Object.entries(s.kindLabels).map(([k, label]) => (
            <FormControlLabel
              key={k}
              control={
                <Switch
                  size="small"
                  checked={!!link.kinds[k]}
                  onChange={(_, v) => void run(() => patch('/telegram/settings', { kinds: { [k]: v } }))}
                />
              }
              label={<Typography variant="body2">{label}</Typography>}
            />
          ))}
          <Divider />
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
            <Typography variant="body2">Giờ yên lặng</Typography>
            <TextField
              select
              size="small"
              value={link.quietStart === null ? '' : Math.floor(link.quietStart / 60)}
              onChange={(e) => {
                const v = e.target.value === '' ? null : Number(e.target.value) * 60
                void run(() =>
                  patch('/telegram/settings', { quietStart: v, quietEnd: v === null ? null : (link.quietEnd ?? 7 * 60) }),
                )
              }}
              sx={{ minWidth: 110 }}
            >
              <MenuItem value="">Không đặt</MenuItem>
              {HOURS.map((h) => (
                <MenuItem key={h} value={h}>
                  từ {h}:00
                </MenuItem>
              ))}
            </TextField>
            {link.quietStart !== null && (
              <TextField
                select
                size="small"
                value={Math.floor((link.quietEnd ?? 420) / 60)}
                onChange={(e) => void run(() => patch('/telegram/settings', { quietEnd: Number(e.target.value) * 60 }))}
                sx={{ minWidth: 110 }}
              >
                {HOURS.map((h) => (
                  <MenuItem key={h} value={h}>
                    đến {h}:00
                  </MenuItem>
                ))}
              </TextField>
            )}
          </Stack>
          <Typography variant="caption" color="text.secondary">
            Tin phát sinh trong giờ yên lặng được gửi khi hết giờ. Tối đa 10 tin mỗi giờ.
          </Typography>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={link.showDetails}
                onChange={(_, v) => void run(() => patch('/telegram/settings', { showDetails: v }))}
              />
            }
            label={
              <Box>
                <Typography variant="body2">Hiện nội dung chi tiết trong tin</Typography>
                <Typography variant="caption" color="text.secondary">
                  Tắt (mặc định): chỉ gửi tiêu đề chung và link, không lộ số liệu danh mục trên màn hình khoá.
                </Typography>
              </Box>
            }
          />
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
                    label={STATUS_LABEL[r.status] ?? r.status}
                    color={r.status === 'sent' ? 'success' : r.status === 'failed' ? 'error' : 'default'}
                    sx={{ height: 20, fontSize: 11 }}
                  />
                  <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }} title={r.lastError ?? undefined}>
                    {r.title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                    {timeAgo(r.sentAt ?? r.createdAt)}
                  </Typography>
                </Stack>
              ))}
            </>
          )}
        </Stack>
      )}
      {info && (
        <Alert severity="success" sx={{ mt: 1.5 }}>
          {info}
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mt: 1.5 }}>
          {error}
        </Alert>
      )}
    </Panel>
  )
}
