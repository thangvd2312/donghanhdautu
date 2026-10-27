import AddIcon from '@mui/icons-material/Add'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { listGoals } from '../api/goals'
import GoalCard from '../components/goals/GoalCard'
import GoalEditor from '../components/goals/GoalEditor'
import { useResource } from '../hooks/useResource'
import { qk } from '../lib/query'
import type { Goal } from '../lib/types'

/** Mục tiêu tài chính: tiến độ từ tài sản được gán, độ lệch tỷ trọng, mô phỏng theo giả định */
export default function GoalsPage() {
  const { data, error, reload: load } = useResource(listGoals, { key: qk.goals })
  const [editing, setEditing] = useState<Goal | 'new' | null>(null)

  return (
    <Stack spacing={2.5}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Mục tiêu tài chính
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Mua nhà, quỹ dự phòng, nghỉ hưu… — đã đi được bao xa, cần góp bao nhiêu mỗi tháng.
          </Typography>
        </Box>
        <Box>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing('new')} sx={{ whiteSpace: 'nowrap', borderRadius: 99 }}>
            Thêm mục tiêu
          </Button>
        </Box>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}
      {!data && !error && <Skeleton variant="rounded" height={200} />}
      {data && !data.goals.length && (
        <Paper sx={{ p: 3 }}>
          <Typography sx={{ fontWeight: 600 }}>Chưa có mục tiêu nào</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            Ví dụ: "Quỹ dự phòng 6 tháng chi tiêu — 120 triệu trong 1 năm", gán phần tiền mặt và tiết kiệm cho nó.
            {!data.assets.length && (
              <>
                {' '}
                Bạn cần có tài sản trong{' '}
                <Link component={RouterLink} to="/portfolio">
                  danh mục
                </Link>{' '}
                để gán cho mục tiêu.
              </>
            )}
          </Typography>
        </Paper>
      )}
      {data?.goals.map((g) => (
        <GoalCard key={g.id} g={g} onEdit={() => setEditing(g)} onChanged={() => void load()} />
      ))}

      {data && (
        <GoalEditor
          open={!!editing}
          goal={editing === 'new' ? null : editing}
          assets={data.assets}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            void load()
          }}
        />
      )}
    </Stack>
  )
}
