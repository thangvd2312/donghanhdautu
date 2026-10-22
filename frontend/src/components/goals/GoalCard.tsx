import MoreVert from '@mui/icons-material/MoreVert'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Collapse from '@mui/material/Collapse'
import Divider from '@mui/material/Divider'
import Grid from '@mui/material/Grid'
import IconButton from '@mui/material/IconButton'
import Link from '@mui/material/Link'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Slider from '@mui/material/Slider'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { deleteGoal, setGoalStatus } from '../../api/goals'
import { changeColor, fmtDate, fmtNum, fmtVndShort } from '../../lib/format'
import { project, requiredMonthly } from '../../lib/goalMath'
import { STATUS_LABEL, TYPE_LABEL } from '../../lib/goals'
import type { Goal } from '../../lib/types'
import { KV } from '../ui'
import ProgressRing from './ProgressRing'

export default function GoalCard({ g, onEdit, onChanged }: { g: Goal; onEdit: () => void; onChanged: () => void }) {
  const [simOpen, setSimOpen] = useState(false)
  const [menu, setMenu] = useState<HTMLElement | null>(null)
  const [monthly, setMonthly] = useState(g.monthlyContribution)
  const [ret, setRet] = useState(g.expectedReturnPct)
  const [error, setError] = useState('')
  const p = g.progress
  const projected = project(p.current, monthly, ret, g.monthsLeft)
  const need = requiredMonthly(p.current, g.targetAmount, ret, g.monthsLeft)

  const setStatus = async (status: Goal['status']) => {
    setError('')
    try {
      await setGoalStatus(g.id, status)
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const remove = async () => {
    if (!confirm(`Xoá mục tiêu "${g.name}"? Sổ giao dịch và tài sản không bị ảnh hưởng.`)) return
    await deleteGoal(g.id)
    onChanged()
  }

  return (
    <Paper sx={{ p: 2.5, opacity: g.status === 'active' ? 1 : 0.8 }}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <ProgressRing value={p.progressPct} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 17 }} noWrap>
            {g.name}
          </Typography>
          <Typography className="num" sx={{ fontSize: 18, fontWeight: 800, lineHeight: 1.3 }}>
            {p.isEstimate ? '≈ ' : ''}
            {fmtVndShort(p.current)}
            <Box component="span" sx={{ color: 'text.secondary', fontWeight: 500, fontSize: 14, whiteSpace: 'nowrap' }}>
              {' '}
              / {fmtVndShort(g.targetAmount)}
            </Box>
          </Typography>
          <Typography variant="caption" color="text.secondary" component="div" noWrap>
            {g.status !== 'active' ? `${STATUS_LABEL[g.status]} · ` : ''}còn {g.monthsLeft} tháng · hạn {fmtDate(g.targetDate)}
          </Typography>
          {g.status === 'active' && (
            <Typography variant="caption" sx={{ color: g.simulation.onTrack ? 'success.main' : 'warning.main', fontWeight: 600 }}>
              {g.simulation.onTrack ? '● Đúng hướng' : '● Chưa đủ'} theo giả định
            </Typography>
          )}
        </Box>
        <IconButton aria-label="Tuỳ chọn mục tiêu" onClick={(e) => setMenu(e.currentTarget)} sx={{ alignSelf: 'flex-start' }}>
          <MoreVert />
        </IconButton>
        <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)}>
          <MenuItem
            onClick={() => {
              setMenu(null)
              onEdit()
            }}
          >
            Sửa
          </MenuItem>
          {g.status !== 'achieved' && p.progressPct >= 100 && (
            <MenuItem
              onClick={() => {
                setMenu(null)
                void setStatus('achieved')
              }}
            >
              Đánh dấu đã đạt
            </MenuItem>
          )}
          <MenuItem
            onClick={() => {
              setMenu(null)
              void setStatus(g.status === 'active' ? 'paused' : 'active')
            }}
          >
            {g.status === 'active' ? 'Tạm dừng' : 'Tiếp tục'}
          </MenuItem>
          <MenuItem
            sx={{ color: 'error.main' }}
            onClick={() => {
              setMenu(null)
              void remove()
            }}
          >
            Xoá
          </MenuItem>
        </Menu>
      </Stack>
      <Box sx={{ mt: 1.5 }} />
      <Typography variant="caption" color="text.secondary">
        {fmtNum(p.progressPct, 1)}% · từ{' '}
        {p.assets.length ? p.assets.map((a) => `${a.pct}% ${a.name.replace(/USDT$/, '')}`).join(', ') : 'chưa gán tài sản nào'}
      </Typography>
      {p.isEstimate && (
        <Typography variant="caption" color="warning.main" component="div">
          Có tài sản thiếu giá thị trường, đang tạm tính theo giá vốn.
        </Typography>
      )}
      {p.missingAssets.length > 0 && (
        <Typography variant="caption" color="warning.main" component="div">
          {p.missingAssets.join(', ')} đã gán nhưng không còn trong danh mục.
        </Typography>
      )}

      <Grid container spacing={2.5} sx={{ mt: 0.5 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
            Tỷ trọng hiện tại / mong muốn
          </Typography>
          {p.deviation ? (
            p.deviation.map((d) => (
              <KV
                key={d.assetType}
                k={TYPE_LABEL[d.assetType]}
                v={`${fmtNum(d.actual, 0)}% / ${fmtNum(d.target, 0)}% (${d.diff > 0 ? '+' : ''}${fmtNum(d.diff, 0)} điểm)`}
                color={Math.abs(d.diff) >= 10 ? 'warning.main' : undefined}
              />
            ))
          ) : (
            <Typography variant="body2" color="text.secondary">
              Chưa đặt tỷ trọng mong muốn.
            </Typography>
          )}
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
            Theo giả định của bạn
          </Typography>
          <KV k="Góp mỗi tháng" v={fmtVndShort(g.monthlyContribution)} />
          <KV k="Lợi suất năm giả định" v={`${fmtNum(g.expectedReturnPct, 1)}%`} />
          <KV k="Dự kiến tới hạn" v={fmtVndShort(g.simulation.projected)} color={changeColor(g.simulation.projected - g.targetAmount)} />
          <KV k="Cần góp mỗi tháng để đạt" v={fmtVndShort(g.simulation.requiredMonthly)} />
          <Link component="button" variant="body2" onClick={() => setSimOpen((v) => !v)} sx={{ mt: 0.5 }}>
            {simOpen ? 'Ẩn mô phỏng' : 'Thử thay đổi mức góp / lợi suất'}
          </Link>
        </Grid>
      </Grid>

      <Collapse in={simOpen} unmountOnExit>
        <Box sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Mô phỏng với giả định do bạn chọn, không phải kết quả được đảm bảo. Lợi suất thực tế có thể âm.
          </Typography>
          <Typography variant="body2" sx={{ mt: 1.5 }}>
            Góp mỗi tháng: <b>{fmtVndShort(monthly)}</b>
          </Typography>
          <Slider
            value={monthly}
            min={0}
            max={Math.max(g.targetAmount / 12, g.monthlyContribution * 2, 1_000_000)}
            step={500_000}
            onChange={(_, v) => setMonthly(v as number)}
          />
          <Typography variant="body2">
            Lợi suất năm giả định: <b>{fmtNum(ret, 1)}%</b>
          </Typography>
          <Slider value={ret} min={-10} max={20} step={0.5} onChange={(_, v) => setRet(v as number)} />
          <Divider sx={{ my: 1 }} />
          <KV k="Dự kiến tới hạn" v={fmtVndShort(projected)} color={changeColor(projected - g.targetAmount)} />
          <KV k="So với mục tiêu" v={`${projected >= g.targetAmount ? 'đủ, dư ' : 'thiếu '}${fmtVndShort(Math.abs(projected - g.targetAmount))}`} />
          <KV k={`Cần góp mỗi tháng (lợi suất ${fmtNum(ret, 1)}%)`} v={fmtVndShort(need)} />
        </Box>
      </Collapse>
      {g.note && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
          {g.note}
        </Typography>
      )}
      {error && (
        <Alert severity="error" sx={{ mt: 1.5 }}>
          {error}
        </Alert>
      )}
    </Paper>
  )
}
