import AddIcon from '@mui/icons-material/Add'
import FlagOutlined from '@mui/icons-material/FlagOutlined'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Link from '@mui/material/Link'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { listGoals } from '../api/goals'
import GoalCard from '../components/goals/GoalCard'
import GoalEditor from '../components/goals/GoalEditor'
import { EmptyState, PageGrid, PageHeader, StatTiles } from '../components/page'
import { Panel } from '../components/ui'
import { fmtVndShort } from '../lib/format'
import { useResource } from '../hooks/useResource'
import { qk } from '../lib/query'
import type { Goal } from '../lib/types'

/** Mục tiêu tài chính: tiến độ từ tài sản được gán, độ lệch tỷ trọng, mô phỏng theo giả định */
export default function GoalsPage() {
  const { data, error, reload: load } = useResource(listGoals, { key: qk.goals })
  const [editing, setEditing] = useState<Goal | 'new' | null>(null)

  const goals = data?.goals ?? []
  const active = goals.filter((g) => g.status === 'active')
  const sumCurrent = active.reduce((t, g) => t + g.progress.current, 0)
  const sumTarget = active.reduce((t, g) => t + g.targetAmount, 0)

  return (
    <Stack spacing={2.5}>
      <PageHeader
        eyebrow="Tài sản"
        title="Mục tiêu tài chính"
        description="Mua nhà, quỹ dự phòng, nghỉ hưu… — đã đi được bao xa, cần góp bao nhiêu mỗi tháng."
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing('new')} sx={{ whiteSpace: 'nowrap', borderRadius: 99, width: { xs: '100%', md: 'auto' } }}>
            Thêm mục tiêu
          </Button>
        }
      />

      {error && <Alert severity="error">{error}</Alert>}
      {!data && !error && <Skeleton variant="rounded" height={200} />}

      {active.length > 0 && (
        <StatTiles
          items={[
            { label: 'Mục tiêu đang theo', value: active.length },
            { label: 'Đã có', value: fmtVndShort(sumCurrent), hint: 'từ tài sản đã gán' },
            { label: 'Cần đạt', value: fmtVndShort(sumTarget) },
            { label: 'Tiến độ chung', value: sumTarget > 0 ? `${Math.min(100, Math.round((sumCurrent / sumTarget) * 100))}%` : '—' },
          ]}
        />
      )}

      <PageGrid
        aside={
          data && (
            <Panel title="Cách tính tiến độ">
              <Stack spacing={1.25}>
                <Typography variant="body2" color="text.secondary">
                  Mỗi mục tiêu được gán một số tài sản trong danh mục; tiến độ là giá trị hiện tại của phần đã gán so với số tiền cần đạt.
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Mở "Thử thay đổi mức góp" ở từng mục tiêu để xem kết quả theo mức góp và lợi suất giả định. Đây là mô phỏng, không phải dự báo.
                </Typography>
                <Link component={RouterLink} to="/portfolio" variant="body2" sx={{ fontWeight: 600 }}>
                  Xem danh mục
                </Link>
              </Stack>
            </Panel>
          )
        }
      >
        {data && !data.goals.length && (
          <EmptyState
            Icon={FlagOutlined}
            title="Chưa có mục tiêu nào"
          >
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
          </EmptyState>
        )}
        {goals.map((g) => (
          <GoalCard key={g.id} g={g} onEdit={() => setEditing(g)} onChanged={() => void load()} />
        ))}
      </PageGrid>

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
