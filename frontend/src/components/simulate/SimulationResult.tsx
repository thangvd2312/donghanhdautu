import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { Ref } from 'react'
import { fmtVnd } from '../../lib/format'
import { describeScenario, type ShockState } from '../../lib/simulate'
import type { SimulateResponse } from '../../lib/types'
import { CompositionBars, HoldingImpactRow } from './SimulateParts'
import { Panel } from '../ui'
import DeltaLine from './DeltaLine'

const TOP_N = 6

interface SimulationResultProps {
  res: SimulateResponse
  shocks: ShockState
  /** Đang tính lại: kết quả cũ mờ đi */
  loading: boolean
  /** Gắn vào khối tổng để biết khi nào nó cuộn khỏi màn hình (hiện thanh tóm tắt dính) */
  headRef: Ref<HTMLDivElement>
  /** Hiện đủ danh sách tài sản thay vì top 6 (giữ ở trang để không mất khi kịch bản bị xoá rồi chọn lại) */
  showAll: boolean
  onToggleShowAll: () => void
}

/** Kết quả mô phỏng: tổng trước / sau, cơ cấu, tài sản bị ảnh hưởng nhiều nhất, cảnh báo thiếu giá, ghi chú */
export default function SimulationResult({ res, shocks, loading, headRef, showAll, onToggleShowAll }: SimulationResultProps) {
  const top = showAll ? res.holdings : res.holdings.slice(0, TOP_N)
  // Câu "chỉ là mô phỏng…" đã có ở chân trang, không lặp lại từ ghi chú của máy chủ
  const notes = res.notes.filter((n) => !/dự báo/i.test(n))
  return (
    <Stack spacing={1.5} sx={{ opacity: loading ? 0.5 : 1, transition: 'opacity .15s' }} aria-busy={loading} data-testid="sim-result" data-loading={loading}>
      <Paper ref={headRef} sx={{ p: 2.5 }} data-testid="sim-total">
        <Typography variant="body2" color="text.secondary">
          Hiện tại
        </Typography>
        <Typography className="num" sx={{ fontWeight: 600, fontSize: 18, lineHeight: 1.3 }}>
          {fmtVnd(res.before.total)}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
          Sau kịch bản
        </Typography>
        <Typography className="num" sx={{ fontWeight: 800, fontSize: { xs: 28, sm: 32 }, lineHeight: 1.2 }} aria-live="polite">
          {fmtVnd(res.after.total)}
        </Typography>
        <Box sx={{ mt: 0.5 }}>
          <DeltaLine r={res} big />
        </Box>
        <Typography variant="body2" sx={{ mt: 1.5 }} data-testid="sim-sentence">
          {describeScenario(shocks, res.delta)}
        </Typography>
      </Paper>

      <Panel title="Cơ cấu danh mục trước và sau" subtitle="Tỷ trọng từng nhóm trên tổng tài sản">
        <CompositionBars before={res.before} after={res.after} />
      </Panel>

      <Panel title="Tài sản bị ảnh hưởng nhiều nhất" subtitle={`${res.holdings.length} khoản, sắp theo mức thay đổi`} noPadding>
        <Box sx={{ px: 2, '& > *:not(:last-child)': { borderBottom: 1, borderColor: 'divider' } }}>
          {top.map((h) => (
            <HoldingImpactRow key={`${h.assetType}:${h.symbol}`} h={h} />
          ))}
        </Box>
        {res.holdings.length > TOP_N && (
          <Button fullWidth onClick={onToggleShowAll} sx={{ minHeight: 44, borderTop: 1, borderColor: 'divider', borderRadius: 0 }}>
            {showAll ? 'Thu gọn' : `Xem tất cả ${res.holdings.length} khoản`}
          </Button>
        )}
      </Panel>

      {res.missing.length > 0 && (
        <Alert severity="info" variant="outlined" data-testid="sim-missing">
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            Một số tài sản chưa có giá mới
          </Typography>
          <Typography variant="body2">
            Giá cũ hoặc thiếu giá: các mã này được tính theo giá đang hiển thị ở Danh mục, nên kết quả chỉ mang tính tham khảo.
          </Typography>
          <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
            {res.missing.map((m) => (
              <li key={`${m.assetType}:${m.symbol}`}>
                <Typography variant="body2">
                  <b>{m.symbol}</b>: {m.reason}
                </Typography>
              </li>
            ))}
          </Box>
        </Alert>
      )}

      {notes.length > 0 && (
        <Box component="ul" sx={{ m: 0, pl: 2.5, color: 'text.secondary' }} data-testid="sim-notes">
          {notes.map((n) => (
            <li key={n}>
              <Typography variant="caption" component="span">
                {n}
              </Typography>
            </li>
          ))}
        </Box>
      )}
    </Stack>
  )
}
