import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { fmtDate } from '../../lib/format'
import type { PlanDetail } from '../../lib/types'
import { Panel } from '../ui'

/** Các phiên bản kế hoạch trước mỗi lần sửa */
export default function VersionsPanel({ versions }: { versions: PlanDetail['versions'] }) {
  return (
    <Panel title="Các phiên bản trước">
      <Stack divider={<Divider flexItem />} spacing={1.5}>
        {versions.map((v) => {
          const s = v.snapshot as { thesis?: string; exitConditions?: string; targetPrice?: number; stopPrice?: number }
          return (
            <Box key={v.id}>
              <Typography variant="caption" color="text.secondary">
                Trước lần sửa ngày {fmtDate(v.createdAt)}
              </Typography>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>
                {s.thesis}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>
                {s.exitConditions}
              </Typography>
            </Box>
          )
        })}
      </Stack>
    </Panel>
  )
}
