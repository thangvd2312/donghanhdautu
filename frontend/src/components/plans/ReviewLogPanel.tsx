import MenuBookOutlined from '@mui/icons-material/MenuBookOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router-dom'
import { fmtDate, fmtPct, fmtPrice } from '../../lib/format'
import { EMOTION_LABEL, REASON_LABEL } from '../../lib/journal'
import { DECISION } from '../../lib/plans'
import type { PlanDetail } from '../../lib/types'
import { Panel } from '../ui'

/** Các lần xem lại kế hoạch đã ghi (quyết định, ghi chú, cảm xúc / lý do, giá lúc đó) */
export default function ReviewLogPanel({ p }: { p: PlanDetail }) {
  return (
    <Panel
      title="Nhật ký xem lại"
      action={
        <Button
          size="small"
          startIcon={<MenuBookOutlined />}
          component={RouterLink}
          to={`/journal?plan=${p.id}`}
          sx={{ borderRadius: 99, minHeight: 32 }}
        >
          Xem trong nhật ký
        </Button>
      }
    >
      {p.reviews.length ? (
        <Stack divider={<Divider flexItem />} spacing={1.5}>
          {p.reviews.map((r) => (
            <Box key={r.id}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {DECISION[r.decision]}
              </Typography>
              {r.note && <Typography variant="body2">{r.note}</Typography>}
              {(r.emotion || r.reason) && (
                <Typography variant="caption" component="div" sx={{ color: 'text.secondary' }}>
                  {[r.emotion && `Cảm xúc: ${EMOTION_LABEL[r.emotion]}`, r.reason && `Lý do: ${REASON_LABEL[r.reason]}`]
                    .filter(Boolean)
                    .join(' · ')}
                </Typography>
              )}
              <Typography variant="caption" color="text.secondary">
                {fmtDate(r.createdAt)}
                {r.priceAtReview !== null && ` · giá lúc đó ${fmtPrice(r.priceAtReview, p.currency)}`}
                {r.pnlPctAtReview !== null && ` · lãi/lỗ ${fmtPct(r.pnlPctAtReview, 1)}`}
              </Typography>
            </Box>
          ))}
        </Stack>
      ) : (
        <Typography variant="body2" color="text.secondary">
          Chưa có lần xem lại nào.
        </Typography>
      )}
    </Panel>
  )
}
