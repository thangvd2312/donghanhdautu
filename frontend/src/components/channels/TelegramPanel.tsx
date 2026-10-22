import Send from '@mui/icons-material/Send'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useCallback, useEffect, useState } from 'react'
import { getTelegramStatus, linkTelegram, testTelegram, unlinkTelegram, updateTelegramSettings } from '../../api/channels'
import { timeAgo } from '../../lib/format'
import type { TelegramStatus } from '../../lib/types'
import ChannelSettings from './ChannelSettings'
import { Panel } from '../ui'

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

  const load = useCallback(() => getTelegramStatus().then(setS).catch((e: Error) => setError(e.message)), [])
  useEffect(() => {
    void load()
  }, [load])

  // Sau khi mở bot: kiểm tra định kỳ tới khi người dùng bấm Start (tối đa ~3 phút)
  useEffect(() => {
    if (!waiting) return
    let n = 0
    const t = setInterval(() => {
      n++
      void getTelegramStatus().then((r) => {
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
      const { url } = await linkTelegram()
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
          <Stack useFlexGap direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
            <Chip size="small" color="success" label={`Đã kết nối${link.username ? ` · @${link.username}` : ''}`} />
            <Box sx={{ flex: 1 }} />
            <Button size="small" onClick={() => void run(() => testTelegram(), 'Đã gửi tin thử, hãy kiểm tra Telegram.')}>
              Gửi tin thử
            </Button>
            <Button size="small" color="error" onClick={() => void run(() => unlinkTelegram())}>
              Ngắt kết nối
            </Button>
          </Stack>
          <ChannelSettings
            kindLabels={s.kindLabels}
            prefs={link}
            onChange={(p) => void run(() => updateTelegramSettings(p))}
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
