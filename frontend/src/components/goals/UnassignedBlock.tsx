import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { assignGoalAsset } from '../../api/goals'
import { money } from '../../lib/deployment'
import type { Goal, GoalsUnassigned } from '../../lib/types'
import AssetAvatar from '../AssetAvatar'
import { CARD_SX } from './goalUi'

/** Tài sản chưa thuộc mục tiêu nào (chỉ khi có từ 2 mục tiêu đang chạy): gắn từng mã vào một mục tiêu */
export default function UnassignedBlock({ data, goals, onChanged }: { data: GoalsUnassigned; goals: Goal[]; onChanged: () => void }) {
  const [menu, setMenu] = useState<{ el: HTMLElement; key: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const choices = goals.filter((g) => g.status === 'active')

  const assign = async (g: Goal) => {
    const a = data.assets.find((x) => `${x.assetType}:${x.symbol}` === menu?.key)
    setMenu(null)
    if (!a) return
    setBusy(true)
    setError('')
    try {
      await assignGoalAsset(g.id, { assetType: a.assetType, symbol: a.symbol })
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Box component="section" aria-label="Chưa thuộc mục tiêu" sx={CARD_SX}>
      <Stack direction="row" sx={{ alignItems: 'baseline', justifyContent: 'space-between', gap: 1 }}>
        <Typography component="h2" sx={{ fontSize: 16, fontWeight: 700 }}>
          Chưa thuộc mục tiêu
        </Typography>
        <Typography className="num" sx={{ fontWeight: 700 }}>
          {data.isEstimate ? '≈ ' : ''}
          {money(data.value)}
        </Typography>
      </Stack>
      <Typography sx={{ fontSize: 13, color: 'text.secondary', display: { xs: 'none', md: 'block' } }}>
        Gắn từng mã vào một mục tiêu để tính tiến độ cho đúng. Lệnh mua sau này chọn mục tiêu ngay lúc ghi.
      </Typography>
      {data.assets.map((a) => {
        const key = `${a.assetType}:${a.symbol}`
        return (
          <Stack key={key} direction="row" sx={{ gap: 1.5, alignItems: 'center' }}>
            <AssetAvatar assetType={a.assetType} symbol={a.symbol} size={32} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography noWrap sx={{ fontSize: 14, fontWeight: 600 }}>
                {a.displayName}
              </Typography>
              <Typography className="num" sx={{ fontSize: 12, color: 'text.secondary' }}>
                {money(a.value)}
              </Typography>
            </Box>
            <Button
              size="small"
              variant="outlined"
              disabled={busy || choices.length === 0}
              onClick={(e) => setMenu({ el: e.currentTarget, key })}
              sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 600, minHeight: 36 }}
            >
              Gắn vào…
            </Button>
          </Stack>
        )
      })}
      <Menu anchorEl={menu?.el} open={!!menu} onClose={() => setMenu(null)}>
        {choices.map((g) => (
          <MenuItem key={g.id} onClick={() => void assign(g)}>
            {g.name}
          </MenuItem>
        ))}
      </Menu>
      {error && <Alert severity="error">{error}</Alert>}
    </Box>
  )
}
