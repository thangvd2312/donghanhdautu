import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Collapse from '@mui/material/Collapse'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { chooseGoalOption } from '../../api/goals'
import { fmtNum, fmtVndShort } from '../../lib/format'
import { money } from '../../lib/deployment'
import { bandText, deployLink, monthYear, OPTION_LABEL, trackChip, VERDICT_COLOR } from '../../lib/goals'
import { PART_SHORT } from '../../lib/deployment'
import type { Goal, GoalAssumption, GoalOption, GoalRiskChoice } from '../../lib/types'
import { ChangePill, InfoTip } from '../ui'
import { AssumptionsButton, BandCompare, ExpectedFigure, MixRows, RulesNote } from './AdviceParts'
import { CARD_SX, GoalIcon, StatusChip } from './goalUi'
import GoalMenu from './GoalMenu'

function OptionCard({ o, chosen, busy, onChoose }: { o: GoalOption; chosen: boolean; busy: boolean; onChoose: () => void }) {
  return (
    <Box
      sx={{
        p: 1.75,
        borderRadius: 2,
        border: 2,
        borderColor: chosen ? 'hero.gold' : 'divider',
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
      }}
    >
      <Typography sx={{ fontWeight: 700, fontSize: 14 }}>{OPTION_LABEL[o.key]}</Typography>
      <ExpectedFigure o={o} />
      <Typography variant="body2" className="num" color="text.secondary" sx={{ fontSize: 13 }}>
        Năm xấu: −{fmtVndShort(o.worstAmount)} · {fmtNum(o.stockPct, 0)}% cổ phiếu
      </Typography>
      <Button
        variant={chosen ? 'contained' : 'outlined'}
        size="small"
        disabled={busy || chosen}
        onClick={onChoose}
        aria-pressed={chosen}
        sx={{
          mt: 'auto',
          textTransform: 'none',
          fontWeight: 600,
          minHeight: 36,
        }}
      >
        {chosen ? 'Đang dùng' : 'Chọn cách này'}
      </Button>
    </Box>
  )
}

/** Thẻ mục tiêu "Sinh lời đều mỗi năm": kết luận, cách chia vốn, kết quả sau N năm, so với danh mục hiện tại */
export default function ReturnGoalCard({
  g,
  assumptions,
  onEdit,
  onChanged,
  onContribute,
}: {
  g: Goal
  assumptions: GoalAssumption[]
  onEdit: () => void
  onChanged: () => void
  onContribute: () => void
}) {
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const rt = g.returnTarget
  const advice = g.advice
  if (!rt) return null

  const options = advice?.options ?? []
  const two = options.length === 2
  const selected = options.find((o) => o.key === advice?.chosen) ?? (options.length === 1 ? options[0] : null)
  const choose = async (key: GoalRiskChoice) => {
    setBusy(true)
    setError('')
    try {
      await chooseGoalOption(g.id, key)
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const cur = advice?.current

  const chip = trackChip(g)
  const t = g.track
  const drift = t.drift
  const sentence = !advice
    ? 'Làm khảo sát khẩu vị rủi ro để nhận gợi ý chia vốn.'
    : selected
      ? `Phương án đang theo: ${selected.key === 'target' ? 'đạt mức mong muốn' : 'trong mức rủi ro của bạn'}, năm xấu −${fmtNum(selected.worstPct, 0)}%.`
      : 'Chưa chọn phương án: mở chi tiết để chọn một cách chia vốn.'

  return (
    <Box component="article" sx={{ ...CARD_SX, gap: 1.5, opacity: g.status === 'active' ? 1 : 0.8 }}>
      <Stack direction="row" sx={{ gap: 1.5, alignItems: 'flex-start' }}>
        <GoalIcon template={g.template} kind={g.kind} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" sx={{ gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography component="h2" sx={{ fontSize: 16, fontWeight: 700 }}>
              {g.name}
            </Typography>
            {chip && <StatusChip chip={chip} display={{ xs: 'inline-block', md: 'none' }} />}
          </Stack>
          <Typography className="num" sx={{ fontSize: 13, color: 'text.secondary' }}>
            Vốn {money(rt.capital)}
            {g.monthlyContribution > 0 ? ` · góp ${money(g.monthlyContribution)}${g.monthlyContributionMax ? `–${money(g.monthlyContributionMax)}` : ''}/tháng` : ''} · từ{' '}
            {monthYear(g.startedAt)}
          </Typography>
          <Typography className="num" sx={{ fontSize: 12, color: 'text.secondary', display: { xs: 'none', md: 'block' } }}>
            Mong muốn {bandText(rt.minPct, rt.maxPct)} · giữ {rt.holdYears} năm
          </Typography>
        </Box>
        {chip && <StatusChip chip={chip} display={{ xs: 'none', md: 'inline-block' }} />}
        <GoalMenu g={g} onEdit={onEdit} onChanged={onChanged} onError={setError} />
      </Stack>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1 }}>
        {[
          ['Góp đúng lịch', t.contributions.expected > 0 ? `${t.contributions.done}/${t.contributions.expected} tháng` : 'Tháng đầu'],
          ['Lệch tỷ trọng', drift ? `${fmtNum(Math.abs(drift.points), 0)} điểm %` : '—'],
          ['Mua có lý do', t.reasonedBuys.total > 0 ? `${t.reasonedBuys.withReason}/${t.reasonedBuys.total} lần` : '—'],
        ].map(([k, v]) => (
          <Box key={k} sx={{ bgcolor: 'action.hover', borderRadius: '12px', px: 1.25, py: 1 }}>
            <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{k}</Typography>
            <Typography className="num" sx={{ fontSize: 15, fontWeight: 700 }}>
              {v}
            </Typography>
          </Box>
        ))}
      </Box>
      <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
        {sentence}
        {drift && Math.abs(drift.points) >= 5 ? ` ${PART_SHORT[drift.part]} đang lệch đích ${fmtNum(Math.abs(drift.points), 0)} điểm %.` : ''}
      </Typography>

      <Stack direction="row" sx={{ gap: 1 }}>
        <Button
          variant="outlined"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          sx={{ flex: 1, borderRadius: 99, height: 44, textTransform: 'none', fontWeight: 600 }}
        >
          {open ? 'Thu gọn' : 'Chi tiết'}
        </Button>
        {g.status === 'active' && (
          <Button variant="contained" onClick={onContribute} sx={{ flex: 1, borderRadius: 99, height: 44, textTransform: 'none', fontWeight: 600 }}>
            Góp tháng này
          </Button>
        )}
      </Stack>

      <Collapse in={open} unmountOnExit>
      {advice && (
        <>
          <Box sx={{ position: 'relative', mt: 1.5, pl: 1.75 }}>
            <Box
              aria-hidden
              sx={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: 4,
                borderRadius: 2,
                bgcolor: VERDICT_COLOR[advice.verdict],
              }}
            />
            <Typography sx={{ fontSize: 14.5, fontWeight: 600 }}>{advice.summary}</Typography>
          </Box>

          {two && (
            <>
              <Box
                sx={{
                  mt: 1.5,
                  display: 'grid',
                  gap: 1.5,
                  gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                }}
              >
                {options.map((o) => (
                  <OptionCard key={o.key} o={o} chosen={advice.chosen === o.key} busy={busy} onChoose={() => void choose(o.key)} />
                ))}
              </Box>
              {!advice.chosen && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Chọn một cách để app lập kế hoạch
                </Typography>
              )}
            </>
          )}

          {selected && (
            <>
              {!two && (
                <Stack direction="row" spacing={2} sx={{ mt: 1.5, alignItems: 'flex-end' }}>
                  <ExpectedFigure o={selected} />
                  <Typography variant="body2" className="num" color="text.secondary" sx={{ pb: 0.25, fontSize: 13 }}>
                    Năm xấu: −{fmtVndShort(selected.worstAmount)} · {fmtNum(selected.stockPct, 0)}% cổ phiếu
                  </Typography>
                </Stack>
              )}
              <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>
                Chia {fmtVndShort(rt.capital)}
              </Typography>
              <MixRows mix={selected.mix} amounts={selected.amounts} />

              <Typography variant="subtitle2" sx={{ mt: 2, mb: 0.75 }}>
                Sau {rt.holdYears} năm
              </Typography>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 1,
                }}
              >
                {(
                  [
                    ['Xấu', selected.projection.low, 'error.main'],
                    ['Trung bình', selected.projection.mid, 'text.primary'],
                    ['Tốt', selected.projection.high, 'success.main'],
                  ] as const
                ).map(([k, v, c]) => (
                  <Box
                    key={k}
                    sx={{
                      p: 1,
                      borderRadius: 1.5,
                      bgcolor: 'action.hover',
                      textAlign: 'center',
                    }}
                  >
                    <Typography variant="caption" color="text.secondary">
                      {k}
                    </Typography>
                    <Typography
                      className="num"
                      sx={{
                        fontWeight: 700,
                        fontSize: { xs: 14, md: 16 },
                        color: c,
                      }}
                    >
                      {fmtVndShort(v)}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </>
          )}

          {cur && (
            <Stack
              direction="row"
              spacing={1}
              sx={{
                mt: 2,
                alignItems: 'center',
                flexWrap: 'wrap',
                rowGap: 0.5,
              }}
            >
              <Typography variant="body2" sx={{ fontSize: 13.5 }}>
                Danh mục hiện tại:{' '}
                {cur.expectedMid === null ? (
                  'chưa tính được'
                ) : (
                  <>
                    đang kỳ vọng ≈ <b className="num">{fmtNum(cur.expectedMid, 1)}%/năm</b>
                  </>
                )}
              </Typography>
              {cur.gapPct !== null && (
                <ChangePill small color={cur.gapPct >= 0 ? 'success.main' : 'warning.main'}>
                  {cur.gapPct > 0 ? '+' : cur.gapPct < 0 ? '−' : ''}
                  {fmtNum(Math.abs(cur.gapPct), 1)} điểm
                </ChangePill>
              )}
              <InfoTip>
                Tính trên phần cổ phiếu, vàng và tiền gửi của danh mục. Crypto không tính lợi suất kỳ vọng
                {cur.cryptoPct > 0 ? ` (đang chiếm ${fmtNum(cur.cryptoPct, 0)}% danh mục)` : ''}. Số âm = thiếu so với mục tiêu.
              </InfoTip>
            </Stack>
          )}

          {advice.notes.length > 0 && (
            <>
              <Box sx={{ display: { xs: 'none', md: 'block' }, mt: 1.5 }}>
                {advice.notes.map((n) => (
                  <Typography key={n} variant="caption" color="text.secondary" component="div">
                    {n}
                  </Typography>
                ))}
              </Box>
            </>
          )}
        </>
      )}

      <Stack direction="row" spacing={1} sx={{ mt: 2, alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
        {selected && (
          <Button
            variant="contained"
            component={RouterLink}
            to={deployLink(rt.capital, selected.mix, g.id)}
            sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 600 }}
          >
            Lập kế hoạch giải ngân
          </Button>
        )}
        <Button variant="outlined" component={RouterLink} to="/rebalance" sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 600 }}>
          Tái cân bằng
        </Button>
        <Box sx={{ flex: 1 }} />
        {advice && advice.notes.length > 0 && (
          <Box sx={{ display: { xs: 'inline-flex', md: 'none' } }}>
            <InfoTip label="Ghi chú">{advice.notes.join('\n')}</InfoTip>
          </Box>
        )}
        <AssumptionsButton assumptions={assumptions} />
      </Stack>
      {advice?.compare && advice.compare.length > 0 && (
        <Box sx={{ mt: 1.5 }}>
          <BandCompare rows={advice.compare} />
        </Box>
      )}
      <Box sx={{ mt: 1 }}>
        <RulesNote />
      </Box>
      </Collapse>
      {error && <Alert severity="error">{error}</Alert>}
    </Box>
  )
}
