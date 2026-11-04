import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { fmtNum, fmtVndShort } from '../../lib/format'
import { PARTS, PART_COLOR, PART_SHORT } from '../../lib/deployment'
import type { DeployMix, GoalAssumption, GoalOption } from '../../lib/types'
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
