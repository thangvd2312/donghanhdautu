import EditNoteOutlined from '@mui/icons-material/EditNoteOutlined'
import FactCheckOutlined from '@mui/icons-material/FactCheckOutlined'
import FlagOutlined from '@mui/icons-material/FlagOutlined'
import SavingsOutlined from '@mui/icons-material/SavingsOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { type ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { fmtNum, fmtPct, fmtPrice } from '../../lib/format'
import { EMOTION_LABEL, REASON_LABEL } from '../../lib/journal'
import { TX_LABEL } from '../../lib/tx'
import type { JournalEmotion, JournalEntry, JournalPlanRef, JournalReason, JournalReviewEntry, JournalTradeEntry, PlanDecision, PlanLevelCheck } from '../../lib/types'
import AssetAvatar from '../AssetAvatar'

const DECISION: Record<PlanDecision, string> = { keep: 'Giữ nguyên', adjust: 'Điều chỉnh', close: 'Kết thúc' }

/** Giá giao dịch so với mốc kế hoạch, bằng lời trung tính (mô tả, không chấm điểm) */
function levelText(e: JournalTradeEntry): string | null {
  if (!e.levelCheck) return null
  const sell = e.type === 'sell'
  const map: Record<PlanLevelCheck, string> = {
    at_or_above_target: sell ? 'Giá bán đã tới mốc chốt lời của kế hoạch' : 'Giá mua từ mốc chốt lời của kế hoạch trở lên',
    at_or_below_stop: sell ? 'Giá bán đã về mốc cắt lỗ của kế hoạch' : 'Giá mua từ mốc cắt lỗ của kế hoạch trở xuống',
    within: sell ? 'Giá bán nằm giữa hai mốc của kế hoạch' : 'Giá mua nằm giữa hai mốc của kế hoạch',
    no_levels: 'Kế hoạch chưa đặt mốc giá',
  }
  return map[e.levelCheck]
}

// ---------- Tổng kết tháng ----------

export function EntryRow({ e, onTag }: { e: JournalEntry; onTag: (e: JournalTradeEntry | JournalReviewEntry) => void }) {
  if (e.kind === 'plan_edit') {
    return (
      <Row icon={<EditNoteOutlined color="action" />}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          Sửa nội dung{' '}
          <Link component={RouterLink} to={`/plans/${e.plan.id}`} underline="hover">
            kế hoạch {e.plan.displayName}
          </Link>
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Bản trước được lưu để so
        </Typography>
      </Row>
    )
  }
  if (e.kind === 'review') {
    return (
      <Row
        icon={<FactCheckOutlined color="action" />}
        action={<TagButton tagged={!!(e.emotion || e.reason)} onClick={() => onTag(e)} />}
      >
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          Xem lại{' '}
          <Link component={RouterLink} to={`/plans/${e.plan.id}`} underline="hover">
            kế hoạch {e.plan.displayName}
          </Link>
          : {DECISION[e.decision].toLowerCase()}
        </Typography>
        {e.note && (
          <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>
            {e.note}
          </Typography>
        )}
        <Tags emotion={e.emotion} reason={e.reason} />
      </Row>
    )
  }
  const asset = e.assetType && e.assetType !== 'cash' && e.symbol
  const value =
    e.quantity !== null && e.price !== null
      ? `${fmtNum(e.quantity, e.assetType === 'stock' ? 0 : 4)} × ${fmtPrice(e.price, e.currency)}`
      : fmtPrice(e.amount, e.currency)
  const level = levelText(e)
  return (
    <Row
      icon={asset ? <AssetAvatar assetType={e.assetType!} symbol={e.symbol!} size={32} /> : <SavingsOutlined color="action" />}
      action={<TagButton tagged={!!(e.emotion || e.reason || e.plan)} onClick={() => onTag(e)} />}
    >
      <Stack
        direction="row"
        useFlexGap
        sx={{ justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 1 }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 0 }}>
          {TX_LABEL[e.type]} {e.displayName ?? ''}
        </Typography>
        <Typography variant="body2" className="num" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
          {value}
        </Typography>
      </Stack>
      {e.note && (
        <Typography variant="body2" color="text.secondary">
          {e.note}
        </Typography>
      )}
      <Tags emotion={e.emotion} reason={e.reason} plan={e.plan} />
      {(level || e.beforePlan || e.priceSincePct !== null) && (
        <Typography variant="caption" color="text.secondary" component="div">
          {[level, e.beforePlan && 'Lệnh trước ngày lập kế hoạch', e.priceSincePct !== null && `Giá đến nay ${fmtPct(e.priceSincePct, 1)}`]
            .filter(Boolean)
            .join(' · ')}
        </Typography>
      )}
      {!e.plan && !e.emotion && !e.reason && (
        <Typography variant="caption" color="text.secondary" component="div">
          Chưa có nhãn
        </Typography>
      )}
    </Row>
  )
}

function Row({ icon, action, children }: { icon: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <Stack direction="row" spacing={1.5} sx={{ px: 2, py: 1.25, alignItems: 'flex-start' }}>
      <Box sx={{ width: 32, height: 32, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{icon}</Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>{children}</Box>
      {action}
    </Stack>
  )
}

function Tags({ emotion, reason, plan }: { emotion: JournalEmotion | null; reason: JournalReason | null; plan?: JournalPlanRef | null }) {
  if (!emotion && !reason && !plan) return null
  return (
    <Stack direction="row" useFlexGap spacing={0.5} sx={{ flexWrap: 'wrap', mt: 0.5 }}>
      {emotion && <Chip size="small" label={EMOTION_LABEL[emotion]} />}
      {reason && <Chip size="small" variant="outlined" label={REASON_LABEL[reason]} />}
      {plan && <Chip size="small" variant="outlined" icon={<FlagOutlined />} label={`Kế hoạch ${plan.displayName}`} />}
    </Stack>
  )
}

function TagButton({ tagged, onClick }: { tagged: boolean; onClick: () => void }) {
  return (
    <Button size="small" onClick={onClick} sx={{ minHeight: 32, flexShrink: 0, borderRadius: 99, px: 1.25 }}>
      {tagged ? 'Sửa nhãn' : 'Gắn nhãn'}
    </Button>
  )
}

// ---------- Gắn nhãn sau ----------
