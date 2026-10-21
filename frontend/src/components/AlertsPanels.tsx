import AddIcon from '@mui/icons-material/Add'
import DeleteOutlined from '@mui/icons-material/DeleteOutlined'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, del, patch, post } from '../lib/api'
import { useAuth } from '../lib/auth-context'
import { fmtNum, timeAgo } from '../lib/format'
import type { InvestorProfile, Notification, PriceAlert, PriceAlertListItem } from '../lib/types'
import PriceAlertDialog from './PriceAlertDialog'
import { Panel } from './ui'

const UNIT: Record<PriceAlert['assetType'], string> = { stock: '₫', crypto: 'USDT', gold: '₫/lượng' }

/** Danh sách mốc giá đã đặt (đang chờ + đã chạm trong 7 ngày) */
export function PriceAlertsPanel() {
  const [alerts, setAlerts] = useState<PriceAlertListItem[] | null>(null)
  const [open, setOpen] = useState(false)

  const load = useCallback(() => api<PriceAlertListItem[]>('/alerts/price').then(setAlerts), [])
  useEffect(() => {
    void load()
    const t = setInterval(() => void load(), 30000)
    return () => clearInterval(t)
  }, [load])

  const remove = async (id: string) => {
    await del(`/alerts/price/${id}`)
    void load()
  }

  return (
    <Panel
      title="Cảnh báo giá"
      subtitle="Báo một lần khi giá chạm mốc bạn đặt"
      noPadding
      sx={{ height: '100%' }}
      action={
        <Button size="small" startIcon={<AddIcon />} onClick={() => setOpen(true)}>
          Thêm mốc
        </Button>
      }
    >
      {alerts?.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
          Chưa có mốc nào. Ví dụ: báo khi FPT về dưới vùng giá bạn muốn mua, hoặc khi BTC vượt mốc bạn định chốt lời.
        </Typography>
      )}
      <List dense disablePadding>
        {alerts?.map((a) => {
          const name = a.assetType === 'crypto' ? a.symbol.replace(/USDT$/, '') : a.symbol
          const digits = a.assetType === 'crypto' ? 2 : 0
          const gap =
            a.currentPrice !== null ? ((a.targetPrice - a.currentPrice) / a.currentPrice) * 100 : null
          return (
            <ListItem
              key={a.id}
              divider
              secondaryAction={
                <Tooltip title="Xoá">
                  <IconButton edge="end" size="small" onClick={() => void remove(a.id)}>
                    <DeleteOutlined fontSize="small" />
                  </IconButton>
                </Tooltip>
              }
            >
              <ListItemText
                primary={
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {name}
                    </Typography>
                    <Typography variant="body2" className="num">
                      {a.direction === 'above' ? '≥' : '≤'} {fmtNum(a.targetPrice, digits)} {UNIT[a.assetType]}
                    </Typography>
                    {a.active ? (
                      <Chip size="small" variant="outlined" color="primary" label="Đang chờ" />
                    ) : (
                      <Chip size="small" color="success" label={`Đã chạm ${a.triggeredAt ? timeAgo(a.triggeredAt) : ''}`} />
                    )}
                  </Stack>
                }
                secondary={
                  <>
                    {a.currentPrice !== null && a.active && (
                      <span className="num">
                        Hiện {fmtNum(a.currentPrice, digits)} · còn cách {fmtNum(Math.abs(gap ?? 0), 1)}%
                      </span>
                    )}
                    {a.note && <span> · {a.note}</span>}
                  </>
                }
              />
            </ListItem>
          )
        })}
      </List>
      <PriceAlertDialog open={open} onClose={() => setOpen(false)} onCreated={() => void load()} />
    </Panel>
  )
}

/** Bật/tắt bản tin sáng, tổng kết phiên, tổng kết tuần, tin vĩ mô; gửi thử bản tin ngay */
export function NotificationSettingsPanel() {
  const { me, refresh } = useAuth()
  const nav = useNavigate()
  const profile = me?.profile
  const [sending, setSending] = useState<'' | 'morning' | 'closing' | 'weekly'>('')
  const [error, setError] = useState('')

  if (!profile) return null

  const toggle = async (
    key: keyof Pick<InvestorProfile, 'morningBrief' | 'closingBrief' | 'weeklyBrief' | 'macroAlerts'>,
    v: boolean,
  ) => {
    await patch('/profile/settings', { [key]: v })
    await refresh()
  }

  const sendNow = async (kind: 'morning' | 'closing' | 'weekly') => {
    setError('')
    setSending(kind)
    try {
      const n = await post<Notification>(`/alerts/brief/${kind}`)
      if (n.link) nav(n.link)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSending('')
    }
  }

  return (
    <Panel title="Thông báo chủ động" subtitle="Cố vấn tự gửi cho bạn, không cần hỏi" sx={{ height: '100%' }}>
      <Stack spacing={0.5}>
        <FormControlLabel
          control={<Switch checked={profile.morningBrief} onChange={(_, v) => void toggle('morningBrief', v)} />}
          label={<Setting title="Bản tin sáng · 8:30" desc="Thị trường, danh mục, tin cần biết trước giờ mở cửa (thứ 2–6)" />}
        />
        <FormControlLabel
          control={<Switch checked={profile.closingBrief} onChange={(_, v) => void toggle('closingBrief', v)} />}
          label={<Setting title="Tổng kết phiên · 15:10" desc="Diễn biến phiên và danh mục của bạn sau khi đóng cửa" />}
        />
        <FormControlLabel
          control={<Switch checked={profile.weeklyBrief} onChange={(_, v) => void toggle('weeklyBrief', v)} />}
          label={
            <Setting
              title="Tổng kết tuần · thứ 7, 9:00"
              desc="Lãi/lỗ trong tuần tách riêng tiền nạp, tài sản ảnh hưởng nhiều nhất, việc cần xem lại"
            />
          }
        />
        <FormControlLabel
          control={<Switch checked={profile.macroAlerts} onChange={(_, v) => void toggle('macroAlerts', v)} />}
          label={
            <Setting
              title="Tin vĩ mô & quốc tế"
              desc="Lãi suất, tỷ giá, chính sách, xung đột, thương mại toàn cầu… — tối đa 3 tin/ngày"
            />
          }
        />
      </Stack>
      <Divider sx={{ my: 1.5 }} />
      <Stack useFlexGap direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
        <Button size="small" variant="outlined" disabled={!!sending} onClick={() => void sendNow('morning')}>
          {sending === 'morning' ? 'Đang viết bản tin…' : 'Gửi thử bản tin sáng'}
        </Button>
        <Button size="small" variant="outlined" disabled={!!sending} onClick={() => void sendNow('closing')}>
          {sending === 'closing' ? 'Đang viết bản tin…' : 'Gửi thử tổng kết phiên'}
        </Button>
        <Button size="small" variant="outlined" disabled={!!sending} onClick={() => void sendNow('weekly')}>
          {sending === 'weekly' ? 'Đang viết bản tin…' : 'Gửi thử tổng kết tuần'}
        </Button>
      </Stack>
      {error && (
        <Alert severity="error" sx={{ mt: 1.5 }}>
          {error}
        </Alert>
      )}
    </Panel>
  )
}

function Setting({ title, desc }: { title: string; desc: string }) {
  return (
    <Stack sx={{ py: 0.5 }}>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {title}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {desc}
      </Typography>
    </Stack>
  )
}
