import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useEffect, useState } from 'react'
import { chooseGoalOption, getGoalLevers, updateGoal } from '../../api/goals'
import { money } from '../../lib/deployment'
import { fmtNum } from '../../lib/format'
import { bandText, goalToRequest, isApplicable, leverPatch, monthYear, onTime } from '../../lib/goals'
import type { Goal, GoalLever, GoalLeversResponse } from '../../lib/types'
import GoalSheet from './GoalSheet'

function LeverCard({
  l,
  g,
  selected,
  variant,
  onSelect,
  onVariant,
  target,
}: {
  l: GoalLever
  g: Goal
  selected: boolean
  variant: number
  onSelect: () => void
  onVariant: (i: number) => void
  target: string
}) {
  const usable = isApplicable(l, g)
  const reach = l.key === 'contribute_more' && l.variants[variant] ? l.variants[variant].reachDate : l.reachDate
  const ok = onTime(reach, target)
  return (
    <Box
      sx={{
        border: 2,
        borderColor: selected ? 'hero.gold' : 'divider',
        borderRadius: '16px',
        opacity: l.locked ? 0.6 : 1,
      }}
    >
      <ButtonBase
        onClick={onSelect}
        disabled={!usable}
        aria-pressed={selected}
        sx={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'stretch', textAlign: 'left', gap: 0.5, px: 1.75, py: 1.5, borderRadius: '14px' }}
      >
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline', gap: 1 }}>
          <Typography sx={{ fontSize: 15, fontWeight: 700 }}>{l.title}</Typography>
          {reach && (
            <Typography className="num" sx={{ fontSize: 13, fontWeight: 700, color: ok ? 'success.main' : 'text.primary', whiteSpace: 'nowrap' }}>
              {monthYear(reach)}
              {ok ? ' ✓' : ''}
            </Typography>
          )}
        </Stack>
        {l.locked && l.lockedReason ? (
          <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>{l.lockedReason}</Typography>
        ) : (
          <Typography className="num" sx={{ fontSize: 13, color: 'text.secondary' }}>
            {l.summary} <b style={{ color: 'inherit', fontWeight: 700 }}>Cái giá:</b> {l.cost}
          </Typography>
        )}
        {!usable && !l.locked && l.key === 'raise_risk' && (
          <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Chỉ để tham khảo: tự chuyển tỷ trọng khi góp tiền, app không đổi hộ.</Typography>
        )}
      </ButtonBase>
      {l.key === 'contribute_more' && !l.locked && l.variants.length > 1 && (
        <Stack direction="row" useFlexGap sx={{ gap: 0.75, flexWrap: 'wrap', px: 1.75, pb: 1.5 }}>
          {l.variants.map((v, i) => (
            <Chip
              key={v.label}
              size="small"
              label={`${v.label}${v.reachDate ? ` · ${monthYear(v.reachDate)}` : ''}`}
              clickable
              color={selected && variant === i ? 'primary' : 'default'}
              variant={selected && variant === i ? 'filled' : 'outlined'}
              onClick={() => {
                onSelect()
                onVariant(i)
              }}
              sx={{ height: 32 }}
            />
          ))}
        </Stack>
      )}
    </Box>
  )
}

/** Sheet "Tới đích sớm hơn" (artboard 5 của mockup): bốn cách kèm cái giá, chọn một rồi áp dụng */
export default function LeversSheet({ open, onClose, goal, onChanged }: { open: boolean; onClose: () => void; goal: Goal; onChanged: () => void }) {
  const [data, setData] = useState<GoalLeversResponse | null>(null)
  const [error, setError] = useState('')
  const [pick, setPick] = useState<GoalLever['key'] | null>(null)
  const [variant, setVariant] = useState(0)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setData(null)
    setError('')
    setPick(null)
    setVariant(0)
    let live = true
    getGoalLevers(goal.id)
      .then((r) => live && setData(r))
      .catch((e: unknown) => live && setError((e as Error).message))
    return () => {
      live = false
    }
  }, [open, goal.id])

  const chosen = data?.levers.find((l) => l.key === pick) ?? null
  const apply = async () => {
    if (!chosen) return
    setBusy(true)
    setError('')
    try {
      if (chosen.key === 'raise_risk') await chooseGoalOption(goal.id, 'target')
      else {
        const patch = leverPatch(chosen, goal, variant)
        if (!patch) throw new Error('Cách này chưa áp dụng tự động được')
        await updateGoal(goal.id, goalToRequest(goal, patch))
      }
      onChanged()
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const rt = goal.returnTarget
  const mid = goal.expectedReturn?.mid
  const hero =
    goal.kind === 'return' && rt
      ? [
          ['Vốn', money(rt.capital)],
          ['Mong muốn', bandText(rt.minPct, rt.maxPct).replace('/năm', '')],
          ['Giữ', `${rt.holdYears} năm`],
        ]
      : [
          ['Đích', money(goal.targetAmount)],
          ['Mong muốn', monthYear(goal.targetDate)],
          ['Dự kiến', data?.reachDate ? monthYear(data.reachDate) : '—'],
        ]
  const late = data && data.delayMonths != null && data.delayMonths > 0

  return (
    <GoalSheet
      open={open}
      onClose={onClose}
      title={`${goal.name}: tới đích sớm hơn`}
      footer={
        <Stack sx={{ gap: 1 }}>
          <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
            Tính theo lợi suất trung bình của tỷ trọng{mid != null ? ` (≈ ${fmtNum(mid, 1)}%/năm, giả định có nguồn trong bảng)` : ''}. Năm xấu có thể trễ thêm; năm tốt có thể sớm hơn.
          </Typography>
          <Button
            variant="contained"
            disabled={busy || !chosen}
            onClick={() => void apply()}
            sx={{ borderRadius: 99, height: 48, textTransform: 'none', fontWeight: 600, fontSize: 15 }}
          >
            {busy ? 'Đang lưu…' : 'Áp dụng cách đã chọn'}
          </Button>
        </Stack>
      }
    >
      <Stack sx={{ gap: 1.5, pt: 0.5 }}>
        <Box sx={{ bgcolor: 'hero.bg', color: 'hero.ink', borderRadius: '16px', px: 1.75, py: 1.5, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1 }}>
          {hero.map(([k, v], i) => (
            <Box key={k}>
              <Typography sx={{ fontSize: 12, color: 'hero.muted' }}>{k}</Typography>
              <Typography className="num" sx={{ fontSize: 15, fontWeight: 700, color: i === 2 && late ? 'hero.gold' : 'inherit' }}>
                {v}
              </Typography>
            </Box>
          ))}
        </Box>
        {!data && !error && <Skeleton variant="rounded" height={220} />}
        {error && <Alert severity="error">{error}</Alert>}
        {data && data.levers.length === 0 && (
          <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>Mục tiêu này đang đúng hướng, chưa cần đổi gì.</Typography>
        )}
        {data && data.levers.length > 0 && (
          <>
            <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>Không có cách nhanh mà không đổi lại gì. Chọn một cách:</Typography>
            {data.levers.map((l) => (
              <LeverCard
                key={l.key}
                l={l}
                g={goal}
                selected={pick === l.key}
                variant={variant}
                onSelect={() => setPick(l.key)}
                onVariant={setVariant}
                target={data.targetDate}
              />
            ))}
          </>
        )}
      </Stack>
    </GoalSheet>
  )
}
