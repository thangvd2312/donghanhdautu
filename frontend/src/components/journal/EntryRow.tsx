import SavingsOutlined from '@mui/icons-material/SavingsOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { type ReactNode } from 'react'
import { fmtNum, fmtPct, fmtPrice } from '../../lib/format'
import { EMOTION_LABEL, REASON_LABEL } from '../../lib/journal'
import { TX_LABEL } from '../../lib/tx'
import type { JournalEmotion, JournalEntry, JournalReason, JournalTradeEntry } from '../../lib/types'
import AssetAvatar from '../AssetAvatar'

/** Điện thoại: ghi chú dài chỉ hiện một dòng */
const CLAMP1 = { display: '-webkit-box', WebkitLineClamp: { xs: 1, md: 'none' }, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as const

// ---------- Tổng kết tháng ----------

export function EntryRow({ e, onTag }: { e: JournalEntry; onTag: (e: JournalTradeEntry) => void }) {
  const asset = e.assetType && e.assetType !== 'cash' && e.symbol
  const value =
    e.quantity !== null && e.price !== null
      ? `${fmtNum(e.quantity, e.assetType === 'stock' ? 0 : 4)} × ${fmtPrice(e.price, e.currency)}`
      : fmtPrice(e.amount, e.currency)
  return (
    <Row
      icon={asset ? <AssetAvatar assetType={e.assetType!} symbol={e.symbol!} size={32} /> : <SavingsOutlined color="action" />}
      action={<TagButton tagged={!!(e.emotion || e.reason)} onClick={() => onTag(e)} />}
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
        <Typography variant="body2" color="text.secondary" sx={CLAMP1}>
          {e.note}
        </Typography>
      )}
      <Tags emotion={e.emotion} reason={e.reason} />
      {e.priceSincePct !== null && (
        <Typography variant="caption" color="text.secondary" component="div" sx={{ display: { xs: 'none', md: 'block' } }}>
          Giá đến nay {fmtPct(e.priceSincePct, 1)}
        </Typography>
      )}
      {!e.emotion && !e.reason && (
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

function Tags({ emotion, reason }: { emotion: JournalEmotion | null; reason: JournalReason | null }) {
  if (!emotion && !reason) return null
  return (
    <Stack direction="row" useFlexGap spacing={0.5} sx={{ flexWrap: 'wrap', mt: 0.5 }}>
      {emotion && <Chip size="small" label={EMOTION_LABEL[emotion]} />}
      {reason && <Chip size="small" variant="outlined" label={REASON_LABEL[reason]} />}
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
