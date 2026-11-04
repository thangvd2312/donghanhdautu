import Button from '@mui/material/Button'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Collapse from '@mui/material/Collapse'
import Divider from '@mui/material/Divider'
import Grid from '@mui/material/Grid'
import Paper from '@mui/material/Paper'
import Slider from '@mui/material/Slider'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { changeColor, fmtDate, fmtNum, fmtVndShort } from '../../lib/format'
import { project, requiredMonthly } from '../../lib/goalMath'
import { STATUS_LABEL, TYPE_LABEL } from '../../lib/goals'
import type { Goal } from '../../lib/types'
import { ChangePill, InfoTip, KV } from '../ui'
import { ExpectedFigure, MixRows } from './AdviceParts'
import GoalMenu from './GoalMenu'
import ProgressRing from './ProgressRing'

export default function GoalCard({ g, onEdit, onChanged }: { g: Goal; onEdit: () => void; onChanged: () => void }) {
  const [simOpen, setSimOpen] = useState(false)
  const [monthly, setMonthly] = useState(g.monthlyContribution)
  const [error, setError] = useState('')
  // Điện thoại: tỷ trọng và giả định thu gọn sau nút "Chi tiết"
  const [detail, setDetail] = useState(false)
  const p = g.progress
  // Lợi suất do máy chủ suy ra từ tỷ trọng gợi ý theo thời gian còn lại; người dùng không tự nhập
  const ret = g.expectedReturnPct
  const projected = project(p.current, monthly, ret, g.monthsLeft)
  const need = requiredMonthly(p.current, g.targetAmount, ret, g.monthsLeft)
  const advice = g.advice
  const opt = advice?.options[0]
  const warn = g.status === 'active' && !g.simulation.onTrack

  return (
    <Paper
      sx={{
        p: { xs: 2, md: 2.5 },
        pl: warn ? { xs: 2.5, md: 3 } : undefined,
        position: 'relative',
        overflow: 'hidden',
        opacity: g.status === 'active' ? 1 : 0.8,
      }}
    >
      {warn && (
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 4,
            bgcolor: 'warning.main',
          }}
        />
      )}
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <ProgressRing value={p.progressPct} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 17 }} noWrap>
            {g.name}
          </Typography>
          <Typography className="num" sx={{ fontSize: 18, fontWeight: 800, lineHeight: 1.3 }}>
            {p.isEstimate ? '≈ ' : ''}
            {fmtVndShort(p.current)}
            <Box
              component="span"
              sx={{
                color: 'text.secondary',
                fontWeight: 500,
                fontSize: 14,
                whiteSpace: 'nowrap',
              }}
            >
              {' '}
              / {fmtVndShort(g.targetAmount)}
            </Box>
          </Typography>
          <Typography variant="caption" color="text.secondary" component="div" noWrap>
            {g.status !== 'active' ? `${STATUS_LABEL[g.status]} · ` : ''}còn {g.monthsLeft} tháng · hạn {fmtDate(g.targetDate)}
          </Typography>
          {g.status === 'active' && (
            <Box sx={{ mt: 0.5 }}>
              <ChangePill small color={g.simulation.onTrack ? 'success.main' : 'warning.main'}>
                {g.simulation.onTrack ? 'Đúng hướng' : 'Chưa đủ'}
              </ChangePill>
            </Box>
          )}
        </Box>
        <GoalMenu g={g} onEdit={onEdit} onChanged={onChanged} onError={setError} />
      </Stack>
      <Box sx={{ mt: 1.5 }} />
      <Typography
        variant="caption"
        color="text.secondary"
        component="div"
        sx={{
          display: { xs: '-webkit-box', md: 'block' },
          WebkitLineClamp: 1,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {fmtNum(p.progressPct, 1)}% · từ{' '}
        {p.assets.length ? p.assets.map((a) => `${a.pct}% ${a.name.replace(/(.)USDT$/, '$1')}`).join(', ') : 'chưa gán tài sản nào'}
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

      {advice && (
        <Box sx={{ mt: 1.5, p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
          <Typography variant="body2" sx={{ fontWeight: 600, fontSize: 13.5 }}>
            {advice.summary}
          </Typography>
          {opt && (
            <Box
              sx={{
                mt: 1,
                display: { xs: detail ? 'block' : 'none', md: 'block' },
              }}
            >
              <Typography variant="subtitle2" sx={{ mb: 0.75 }}>
                Nên để tiền ở đâu
              </Typography>
              <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start' }}>
                <ExpectedFigure o={opt} big={22} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <MixRows mix={opt.mix} />
                </Box>
              </Stack>
            </Box>
          )}
        </Box>
      )}

      <Button
        size="small"
        onClick={() => setDetail((v) => !v)}
        aria-expanded={detail}
        sx={{
          display: { xs: 'inline-flex', md: 'none' },
          mt: 1,
          ml: -1,
          fontWeight: 600,
          textTransform: 'none',
        }}
      >
        {detail ? 'Thu gọn' : 'Chi tiết'}
      </Button>
      <Grid container spacing={2.5} sx={{ mt: 0.5, display: { xs: detail ? 'flex' : 'none', md: 'flex' } }}>
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
            Mô phỏng
          </Typography>
          <KV k="Góp mỗi tháng" v={fmtVndShort(g.monthlyContribution)} />
          <KV k="Dự kiến tới hạn" v={fmtVndShort(g.simulation.projected)} color={changeColor(g.simulation.projected - g.targetAmount)} />
          <KV k="Cần góp mỗi tháng để đạt" v={fmtVndShort(g.simulation.requiredMonthly)} />
        </Grid>
      </Grid>
      <Button
        variant="outlined"
        size="small"
        onClick={() => setSimOpen((v) => !v)}
        aria-expanded={simOpen}
        sx={{
          mt: 1.5,
          display: 'flex',
          fontWeight: 600,
          textTransform: 'none',
          minHeight: 36,
        }}
      >
        {simOpen ? 'Ẩn mô phỏng' : 'Thử thay đổi mức góp'}
      </Button>

      <Collapse in={simOpen} unmountOnExit>
        <Box sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
          <Typography variant="caption" color="text.secondary" component="div" sx={{ display: { xs: 'none', md: 'block' } }}>
            Mô phỏng theo lợi suất trung bình của tỷ trọng gợi ý, không phải kết quả được đảm bảo. Lợi suất thực tế có thể âm.
          </Typography>
          <Box sx={{ display: { xs: 'block', md: 'none' }, float: 'right' }}>
            <InfoTip>
              Mô phỏng theo lợi suất trung bình của tỷ trọng gợi ý, không phải kết quả được đảm bảo. Lợi suất thực tế có thể âm.
            </InfoTip>
          </Box>
          <Typography variant="body2" sx={{ mt: { md: 1.5 } }}>
            Góp mỗi tháng: <b>{fmtVndShort(monthly)}</b>
          </Typography>
          <Slider
            value={monthly}
            min={0}
            max={Math.max(g.targetAmount / 12, g.monthlyContribution * 2, 1_000_000)}
            step={500_000}
            onChange={(_, v) => setMonthly(v as number)}
          />
          <Divider sx={{ my: 1 }} />
          <KV k="Dự kiến tới hạn" v={fmtVndShort(projected)} color={changeColor(projected - g.targetAmount)} />
          <KV
            k="So với mục tiêu"
            v={`${projected >= g.targetAmount ? 'đủ, dư ' : 'thiếu '}${fmtVndShort(Math.abs(projected - g.targetAmount))}`}
          />
          <KV k={`Cần góp mỗi tháng (lợi suất ${fmtNum(ret, 1)}%/năm)`} v={fmtVndShort(need)} />
        </Box>
      </Collapse>
      {g.note && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, display: { xs: 'none', md: 'block' } }}>
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
