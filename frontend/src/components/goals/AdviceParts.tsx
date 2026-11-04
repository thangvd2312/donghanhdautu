import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { fmtNum, fmtVndShort } from '../../lib/format'
import { PARTS, PART_COLOR, PART_SHORT } from '../../lib/deployment'
import type { DeployMix, GoalAssumption, GoalBandCompare, GoalOption } from '../../lib/types'
import { DialogHeader } from '../ui'
import { useIsMobile } from '../../lib/useIsMobile'

/** Các phần có tiền, mỗi phần một dòng: tên, thanh mỏng, số tiền (nếu có) và % */
export function MixRows({ mix, amounts }: { mix: DeployMix; amounts?: DeployMix }) {
  return (
    <Stack spacing={1}>
      {PARTS.filter((p) => mix[p] > 0).map((p) => (
        <Box
          key={p}
          role="img"
          aria-label={`${PART_SHORT[p]}: ${fmtNum(mix[p], 0)}%${amounts ? `, ${fmtVndShort(amounts[p])}` : ''}`}
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '66px 1fr auto', md: '84px 1fr auto' },
            gap: 1,
            alignItems: 'center',
          }}
        >
          <Typography variant="body2" noWrap sx={{ fontSize: 13 }}>
            {PART_SHORT[p]}
          </Typography>
          <Box
            sx={{
              height: 6,
              borderRadius: 99,
              bgcolor: 'action.hover',
              overflow: 'hidden',
            }}
          >
            <Box
              sx={{
                width: `${Math.min(mix[p], 100)}%`,
                height: '100%',
                borderRadius: 99,
                bgcolor: PART_COLOR[p],
              }}
            />
          </Box>
          <Typography
            variant="body2"
            className="num"
            sx={{
              fontSize: 13,
              textAlign: 'right',
              minWidth: { xs: 84, md: 104 },
            }}
            noWrap
          >
            {amounts && (
              <Box component="b" sx={{ mr: 0.75 }}>
                {fmtVndShort(amounts[p])}
              </Box>
            )}
            <Box component="span" sx={{ color: 'text.secondary' }}>
              {fmtNum(mix[p], 0)}%
            </Box>
          </Typography>
        </Box>
      ))}
    </Stack>
  )
}

/** Lợi suất trung bình lớn, dải thấp–cao nhỏ */
export function ExpectedFigure({ o, big = 26 }: { o: GoalOption; big?: number }) {
  return (
    <Box>
      <Typography
        className="num"
        component="div"
        sx={{
          fontSize: big,
          fontWeight: 800,
          lineHeight: 1.1,
          letterSpacing: '-0.02em',
        }}
      >
        {fmtNum(o.expected.mid, 1)}%
        <Box component="span" sx={{ fontSize: 13, fontWeight: 500, color: 'text.secondary' }}>
          /năm
        </Box>
      </Typography>
      <Typography className="num" variant="caption" color="text.secondary" component="div">
        {fmtNum(o.expected.low, 1)}–{fmtNum(o.expected.high, 1)}%
      </Typography>
    </Box>
  )
}

/** Bảng giả định lợi suất: phần, thấp / TB / cao, năm xấu, nguồn */
export function AssumptionsButton({ assumptions }: { assumptions: GoalAssumption[] }) {
  const [open, setOpen] = useState(false)
  const mobile = useIsMobile()
  if (!assumptions.length) return null
  return (
    <>
      <Button size="small" onClick={() => setOpen(true)} sx={{ textTransform: 'none', fontWeight: 600, ml: -1 }}>
        Giả định
      </Button>
      <Dialog fullScreen={mobile} open={open} onClose={() => setOpen(false)} fullWidth maxWidth="md">
        <DialogHeader onClose={() => setOpen(false)}>Giả định lợi suất</DialogHeader>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Trung bình mỗi năm khi giữ từ 5 năm, trước thuế và phí. Một năm cụ thể có thể khác rất xa.
          </Typography>
          <Box sx={{ overflowX: 'auto' }}>
            <Box
              component="table"
              sx={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 13,
                '& th, & td': {
                  py: 0.75,
                  px: 1,
                  textAlign: 'left',
                  borderBottom: 1,
                  borderColor: 'divider',
                  verticalAlign: 'top',
                },
                '& th': { color: 'text.secondary', fontWeight: 600 },
              }}
            >
              <thead>
                <tr>
                  <th>Phần</th>
                  <th>Thấp</th>
                  <th>TB</th>
                  <th>Cao</th>
                  <th>Năm xấu</th>
                  <th>Nguồn</th>
                </tr>
              </thead>
              <tbody>
                {assumptions.map((a) => (
                  <tr key={a.part}>
                    <td>{a.label}</td>
                    {a.range ? (
                      <>
                        <td className="num">{fmtNum(a.range.low, 0)}%</td>
                        <td className="num">{fmtNum(a.range.mid, 0)}%</td>
                        <td className="num">{fmtNum(a.range.high, 0)}%</td>
                      </>
                    ) : (
                      <td colSpan={3}>không tính</td>
                    )}
                    <td className="num">−{fmtNum(a.worstPct, 0)}%</td>
                    <td style={{ minWidth: 200 }}>{a.source}</td>
                  </tr>
                ))}
              </tbody>
            </Box>
          </Box>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Câu nói rõ nguồn gốc tỷ trọng: quy tắc của app, chưa có chuyên gia duyệt */
export const RULES_NOTE = 'Tỷ trọng do quy tắc của app tính từ dữ liệu lịch sử có nguồn, chưa được chuyên gia tài chính duyệt. Chỉ để tham khảo.'

export function RulesNote() {
  return (
    <Typography variant="caption" color="text.secondary" component="p" sx={{ m: 0 }}>
      {RULES_NOTE}
    </Typography>
  )
}

const bandLabel = (r: GoalBandCompare) => (r.maxPct === null ? `Trên ${r.minPct}%` : `${r.minPct}–${r.maxPct}%`)

/**
 * Bảng "Vì sao ra tỷ lệ này": 4 mức lãi mong muốn cạnh nhau (cổ phiếu, kỳ vọng, năm xấu) để thấy đánh đổi lãi – rủi ro.
 * Bấm một dòng để chọn mức đó (nếu có `onPick`).
 */
export function BandCompare({ rows, onPick }: { rows: GoalBandCompare[]; onPick?: (r: GoalBandCompare) => void }) {
  const grid = { display: 'grid', gridTemplateColumns: '58px minmax(0, 0.8fr) minmax(0, 1fr) minmax(0, 1.5fr)', gap: 1, alignItems: 'center' }
  return (
    <Box>
      <Typography sx={{ fontSize: 13, fontWeight: 600 }}>Vì sao ra tỷ lệ này</Typography>
      <Typography variant="caption" color="text.secondary" component="p" sx={{ m: 0, mb: 0.75 }}>
        Muốn lãi cao hơn thì phải để nhiều tiền vào cổ phiếu hơn, và năm xấu mất nhiều hơn.
      </Typography>
      <Box sx={{ ...grid, px: 1, fontSize: 12, color: 'text.secondary' }}>
        <span>Mức lãi</span>
        <span>Cổ phiếu</span>
        <span>Kỳ vọng</span>
        <span style={{ textAlign: 'right' }}>Năm xấu</span>
      </Box>
      <Stack spacing={0.5} sx={{ mt: 0.5 }}>
        {rows.map((r) => (
          <ButtonBase
            key={r.minPct}
            disabled={!onPick || r.selected}
            onClick={() => onPick?.(r)}
            aria-pressed={r.selected}
            sx={{
              ...grid,
              width: '100%',
              textAlign: 'left',
              px: 1,
              py: 0.75,
              borderRadius: '8px',
              fontSize: 13,
              bgcolor: r.selected ? 'rgba(var(--mui-palette-primary-mainChannel) / 0.08)' : 'transparent',
              outline: r.selected ? 1 : 0,
              outlineColor: 'primary.main',
            }}
          >
            <Box component="span" sx={{ fontWeight: r.selected ? 700 : 500 }}>
              {bandLabel(r)}
            </Box>
            {r.reachable ? (
              <>
                <span className="num">{r.stockPct}%</span>
                <span className="num">≈ {fmtNum(r.expectedMid, 1)}%</span>
              </>
            ) : (
              <Box component="span" sx={{ gridColumn: 'span 2', color: 'text.secondary' }}>
                Không đạt (tối đa ≈ {fmtNum(r.expectedMid, 1)}%)
              </Box>
            )}
            <Box component="span" className="num" sx={{ textAlign: 'right', whiteSpace: 'nowrap', color: r.overRisk ? 'error.main' : 'text.primary' }}>
              {r.worstAmount > 0 ? `−${fmtVndShort(r.worstAmount)}` : '0'}
              {r.overRisk ? ' ⚠' : ''}
            </Box>
          </ButtonBase>
        ))}
      </Stack>
      {rows.some((r) => r.overRisk) && (
        <Typography variant="caption" color="error.main" component="p" sx={{ m: 0, mt: 0.5 }}>
          ⚠ Năm xấu vượt mức lỗ bạn đã khai chịu được.
        </Typography>
      )}
    </Box>
  )
}
