import ExpandMore from '@mui/icons-material/ExpandMore'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Collapse from '@mui/material/Collapse'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { Ref } from 'react'
import { fmtNum, fmtVnd } from '../../lib/format'
import type { RebalanceResponse } from '../../lib/types'
import { ActionRow, TargetBars } from './RebalanceParts'
import { InfoTip, KV, Panel } from '../ui'

interface RebalanceResultProps {
  res: RebalanceResponse
  /** Kết quả của lần tính trước (hiện tại tổng chưa đạt 100%) */
  stale: boolean
  loading: boolean
  /** Gắn vào khối tóm tắt để biết khi nào nó cuộn khỏi màn hình */
  headRef: Ref<HTMLDivElement>
  notesOpen: boolean
  onToggleNotes: () => void
}

/** Kết quả tái cân bằng: lệch lớn nhất, dòng tiền, cảnh báo, các bước mua / bán, tỷ trọng trước và sau, giả định */
export default function RebalanceResult({ res, stale, loading, headRef, notesOpen, onToggleNotes }: RebalanceResultProps) {
  return (
      <Stack spacing={1.5} sx={{ opacity: loading || stale ? 0.5 : 1, transition: 'opacity .15s' }} aria-busy={loading} data-testid="rb-result" data-loading={loading}>
        {stale && (
          <Typography variant="caption" color="text.secondary" role="status">
            Đây là kết quả của lần tính trước. Đưa tổng về 100% để cập nhật.
          </Typography>
        )}
        <Paper ref={headRef} sx={{ p: 2.5 }} data-testid="rb-summary">
          <Typography variant="body2" color="text.secondary">
            Lệch lớn nhất so với mục tiêu
          </Typography>
          <Typography className="num" sx={{ fontWeight: 800, fontSize: { xs: 24, sm: 28 }, lineHeight: 1.25 }} aria-live="polite" data-testid="rb-deviation">
            {fmtNum(res.maxDeviationPct.before, 1)} <Box component="span" aria-label="thành" sx={{ color: 'text.secondary' }}>→</Box> {fmtNum(res.maxDeviationPct.after, 1)}
            <Box component="span" sx={{ fontSize: 15, fontWeight: 600, ml: 0.75, color: 'text.secondary' }}>
              điểm %
            </Box>
          </Typography>
          <Box sx={{ mt: 1.5, pt: 1, borderTop: 1, borderColor: 'divider' }}>
            {res.cash.fromSales > 0 && <KV k="Tiền từ bán" v={fmtVnd(res.cash.fromSales)} />}
            <KV k="Tiền dùng để mua" v={fmtVnd(res.cash.spent)} />
            <KV k="Phí và thuế giả định" v={fmtVnd(res.cash.fees)} />
            <KV k="Tiền mặt còn lại" v={fmtVnd(res.cash.left)} />
          </Box>
        </Paper>

        {res.warnings.length > 0 && (
          <Alert severity="warning" variant="outlined" data-testid="rb-warnings">
            <Box component="ul" sx={{ m: 0, pl: 2.25 }}>
              {res.warnings.map((w) => (
                <li key={w}>
                  <Typography variant="body2">{w}</Typography>
                </li>
              ))}
            </Box>
          </Alert>
        )}

        <Panel
          title={
            <>
              Phép tính điều chỉnh
              <Box component="span" sx={{ ml: 0.75 }}>
                <InfoTip label="Giải thích phép tính">Đây là phép tính theo tỷ trọng bạn đặt, không phải lời khuyên mua hay bán mã nào. Không có giao dịch nào được tạo.</InfoTip>
              </Box>
            </>
          }
          subtitle={res.actions.length ? `${res.actions.length} bước, bán trước rồi mua` : undefined}
          noPadding
        >
          {res.actions.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2 }} data-testid="rb-no-actions">
              Với lựa chọn này không có bước mua bán nào cần tính.
            </Typography>
          ) : (
            <Box sx={{ px: 2, '& > *:not(:last-child)': { borderBottom: 1, borderColor: 'divider' } }}>
              {res.actions.map((a) => (
                <ActionRow key={`${a.side}:${a.assetType}:${a.symbol}`} a={a} />
              ))}
            </Box>
          )}
        </Panel>

        <Panel title="Tỷ trọng trước và sau" subtitle="Vạch đứng là mục tiêu bạn đặt">
          <TargetBars before={res.before.rows} after={res.after.rows} />
        </Panel>

        {res.notes.length > 0 && (
          <Box>
            <ButtonBase
              onClick={onToggleNotes}
              aria-expanded={notesOpen}
              sx={{ minHeight: 40, color: 'text.secondary', fontSize: 13, fontWeight: 600, gap: 0.5 }}
            >
              Giả định đã dùng ({res.notes.length})
              <ExpandMore sx={{ fontSize: 20, transform: notesOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
            </ButtonBase>
            <Collapse in={notesOpen} unmountOnExit>
              <Box component="ul" sx={{ m: 0, pl: 2.5, color: 'text.secondary' }} data-testid="rb-notes">
                {res.notes.map((n) => (
                  <li key={n}>
                    <Typography variant="caption" component="span">
                      {n}
                    </Typography>
                  </li>
                ))}
              </Box>
            </Collapse>
          </Box>
        )}
      </Stack>
  )
}
