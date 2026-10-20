import AddIcon from '@mui/icons-material/Add'
import CheckIcon from '@mui/icons-material/Check'
import DeleteOutlined from '@mui/icons-material/DeleteOutlined'
import SettingsOutlined from '@mui/icons-material/SettingsOutlined'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { api, del, post } from '../lib/api'
import { fmtVndShort } from '../lib/format'
import { useIsMobile } from '../lib/useIsMobile'
import { InfoTip } from './ui'
import type { PortfolioAccount } from '../lib/types'

/** Chọn xem gộp hoặc từng danh mục; thêm / đổi tên / xoá danh mục */
export default function PortfolioSwitcher({
  accounts,
  value,
  onChange,
  onChanged,
}: {
  accounts: PortfolioAccount[]
  /** '' = tất cả */
  value: string
  onChange: (id: string) => void
  onChanged: () => void
}) {
  const mobile = useIsMobile()
  const [adding, setAdding] = useState(false)
  const [managing, setManaging] = useState(false)
  const [name, setName] = useState('')
  const [names, setNames] = useState<Record<string, string>>({})
  const [error, setError] = useState('')

  const create = async () => {
    setError('')
    try {
      const p = await post<{ id: string }>('/portfolio/portfolios', { name })
      setAdding(false)
      setName('')
      onChanged()
      onChange(p.id)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const rename = async (id: string) => {
    setError('')
    try {
      await api(`/portfolio/portfolios/${id}`, { method: 'PATCH', body: JSON.stringify({ name: names[id] }) })
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const remove = async (id: string) => {
    setError('')
    try {
      await del(`/portfolio/portfolios/${id}`)
      if (value === id) onChange('')
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      {/* Điện thoại: các danh mục cuộn ngang trên một dòng, nút thêm / cài đặt luôn nằm cuối dòng */}
      <Stack
        useFlexGap
        direction="row"
        spacing={1}
        sx={{
          flex: 1,
          minWidth: 0,
          alignItems: 'center',
          flexWrap: { xs: 'nowrap', md: 'wrap' },
          rowGap: 1,
          overflowX: { xs: 'auto', md: 'visible' },
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
          '& > *': { flexShrink: 0 },
          // Mép phải mờ dần để thấy còn danh mục khi cuộn ngang
          maskImage: { xs: 'linear-gradient(to right, #000 calc(100% - 24px), transparent)', md: 'none' },
        }}
      >
        {accounts.length > 1 && (
          <Chip label="Tất cả" color={value === '' ? 'primary' : 'default'} onClick={() => onChange('')} />
        )}
        {accounts.map((a) => (
          <Chip
            key={a.id}
            label={`${a.name} · ${fmtVndShort(a.totalValue)}`}
            color={value === a.id || (accounts.length === 1 && value === '') ? 'primary' : 'default'}
            variant={value === a.id ? 'filled' : 'outlined'}
            onClick={() => onChange(accounts.length === 1 ? '' : a.id)}
          />
        ))}
        {!mobile && (
          <Button size="small" startIcon={<AddIcon />} onClick={() => setAdding(true)}>
            Thêm danh mục
          </Button>
        )}
      </Stack>
      <Stack direction="row" sx={{ flexShrink: 0, alignItems: 'center' }}>
        {mobile && (
          <Tooltip title="Thêm danh mục">
            <IconButton color="primary" aria-label="Thêm danh mục" onClick={() => setAdding(true)}>
              <AddIcon />
            </IconButton>
          </Tooltip>
        )}
        {accounts.length > 0 && (
          <Tooltip title="Đổi tên / xoá danh mục">
            <IconButton
              aria-label="Đổi tên / xoá danh mục"
              onClick={() => {
                setNames(Object.fromEntries(accounts.map((a) => [a.id, a.name])))
                setManaging(true)
              }}
            >
              <SettingsOutlined fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Stack>

      <Dialog open={adding} onClose={() => setAdding(false)} fullWidth maxWidth="xs">
        <DialogTitle>Thêm danh mục</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            size="small"
            label="Tên danh mục"
            placeholder="VD: TK SSI, Ví Binance, Vàng cất nhà"
            helperText="Mỗi danh mục có sổ giao dịch và tiền mặt riêng"
            value={name}
            onChange={(e) => setName(e.target.value)}
            sx={{ mt: 1 }}
          />
          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAdding(false)}>Huỷ</Button>
          <Button variant="contained" disabled={!name.trim()} onClick={() => void create()}>
            Tạo
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={managing} onClose={() => setManaging(false)} fullWidth maxWidth="sm">
        <DialogTitle>Quản lý danh mục</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 1 }}>
            {accounts.map((a) => (
              <Stack key={a.id} direction="row" spacing={0.5} sx={{ alignItems: 'flex-start' }}>
                <TextField
                  size="small"
                  fullWidth
                  value={names[a.id] ?? a.name}
                  onChange={(e) => setNames((m) => ({ ...m, [a.id]: e.target.value }))}
                  helperText={`${a.transactionCount} giao dịch${a.isDefault ? ' · danh mục chính' : ''}`}
                />
                <Tooltip title="Lưu tên">
                  <span>
                    <IconButton
                      color="primary"
                      aria-label="Lưu tên"
                      disabled={!names[a.id]?.trim() || names[a.id] === a.name}
                      onClick={() => void rename(a.id)}
                    >
                      <CheckIcon />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title={a.isDefault ? 'Không xoá được danh mục chính' : 'Xoá danh mục'}>
                  <span>
                    <IconButton color="error" aria-label="Xoá danh mục" disabled={a.isDefault} onClick={() => void remove(a.id)}>
                      <DeleteOutlined />
                    </IconButton>
                  </span>
                </Tooltip>
              </Stack>
            ))}
            <Typography variant="caption" color="text.secondary">
              Chỉ xoá được danh mục trống.{' '}
              <InfoTip label="Chuyển tiền giữa hai danh mục">
                Chuyển tiền giữa hai danh mục: ghi "Rút tiền" ở bên chuyển và "Nạp tiền" ở bên nhận. Khi xem gộp, hai giao dịch
                triệt tiêu nên không bị tính là vốn mới.
              </InfoTip>
            </Typography>
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setManaging(false)}>Đóng</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}
