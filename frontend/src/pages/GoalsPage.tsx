import AddIcon from '@mui/icons-material/Add'
import FlagOutlined from '@mui/icons-material/FlagOutlined'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { listGoals } from '../api/goals'
import ContributionSheet from '../components/goals/ContributionSheet'
import GoalCard from '../components/goals/GoalCard'
import GoalEditor from '../components/goals/GoalEditor'
import LeversSheet from '../components/goals/LeversSheet'
import ReturnGoalCard from '../components/goals/ReturnGoalCard'
import SafetyGoalCard from '../components/goals/SafetyGoalCard'
import UnassignedBlock from '../components/goals/UnassignedBlock'
import { CardLink } from '../components/home/HomeBlocks'
import { EmptyState, PageGrid, PageHeader } from '../components/page'
import { Panel } from '../components/ui'
import { useResource } from '../hooks/useResource'
import { invalidateGoalData, qk } from '../lib/query'
import type { Goal } from '../lib/types'

/** Mục tiêu tài chính (docs/DESIGN_GOALS_V3.md): tiến độ, lộ trình, tỷ trọng đích / thực, việc tiếp theo, góp tiền tháng này */
export default function GoalsPage() {
  const client = useQueryClient()
  const { data, error } = useResource(listGoals, { key: qk.goals })
  const [editing, setEditing] = useState<{ goal: Goal | null } | null>(null)
  const [levers, setLevers] = useState<Goal | null>(null)
  const [contributing, setContributing] = useState(false)

  const goals = data?.goals ?? []
  const refresh = () => void invalidateGoalData(client)

  return (
    <Stack spacing={2.5}>
      <PageHeader
        eyebrow="Tài sản"
        title="Mục tiêu"
        description="Mỗi mục tiêu có đích riêng: app theo dõi lộ trình, chia tiền góp mỗi tháng và chỉ cách tới đích sớm hơn."
        actions={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setEditing({ goal: null })}
            sx={{ whiteSpace: 'nowrap', borderRadius: 99, height: 40, ml: { xs: 'auto', md: 0 } }}
          >
            Thêm mục tiêu
          </Button>
        }
      />

      {error && <Alert severity="error">{error}</Alert>}
      {!data && !error && <Skeleton variant="rounded" height={260} />}

      <PageGrid
        aside={
          data && (
            <Panel title="Cách tính tiến độ" action={<CardLink to="/portfolio">Danh mục</CardLink>} sx={{ display: { xs: 'none', md: 'block' } }}>
              <Stack spacing={1.25}>
                <Typography variant="body2" color="text.secondary">
                  Tiến độ tính từ tài sản thuộc mục tiêu. Một mục tiêu thì cả danh mục thuộc về nó; nhiều mục tiêu thì tính theo giao dịch
                  đã gắn mục tiêu.
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Ngày dự kiến đạt tính theo lợi suất trung bình của tỷ trọng, kèm khoảng xấu / tốt. Đây là mô phỏng, không phải dự báo. Tỷ trọng do quy tắc của app tính từ dữ liệu lịch sử có nguồn, chưa được chuyên gia tài chính duyệt.
                </Typography>
              </Stack>
            </Panel>
          )
        }
      >
        {data && goals.length === 0 && (
          <EmptyState
            Icon={FlagOutlined}
            title="Chưa có mục tiêu nào"
            action={
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing({ goal: null })} sx={{ borderRadius: 99 }}>
                Thêm mục tiêu
              </Button>
            }
          >
            Chọn một mẫu để bắt đầu: mua nhà, sinh lời đều, quỹ dự phòng…
            {' '}
            <RouterLink to="/portfolio">Mở danh mục</RouterLink>
          </EmptyState>
        )}
        {data?.unassigned && <UnassignedBlock data={data.unassigned} goals={goals} onChanged={refresh} />}
        {goals.map((g) => {
          const edit = () => setEditing({ goal: g })
          if (g.kind === 'return')
            return (
              <ReturnGoalCard
                key={g.id}
                g={g}
                assumptions={data?.assumptions ?? []}
                onEdit={edit}
                onChanged={refresh}
                onContribute={() => setContributing(true)}
              />
            )
          if (g.kind === 'safety') return <SafetyGoalCard key={g.id} g={g} onEdit={edit} onChanged={refresh} />
          return (
            <GoalCard
              key={g.id}
              g={g}
              contribution={data?.contribution ?? null}
              onEdit={edit}
              onChanged={refresh}
              onLevers={() => setLevers(g)}
              onContribute={() => setContributing(true)}
            />
          )
        })}
      </PageGrid>

      {data && (
        <>
          <GoalEditor
            open={!!editing}
            goal={editing?.goal ?? null}
            portfolioTotal={data.portfolioTotal ?? 0}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null)
              refresh()
            }}
          />
          {levers && <LeversSheet open goal={levers} onClose={() => setLevers(null)} onChanged={refresh} />}
          <ContributionSheet
            open={contributing}
            onClose={() => setContributing(false)}
            goals={goals}
            contribution={data.contribution}
            onChanged={() => void invalidateGoalData(client, { portfolio: true })}
          />
        </>
      )}
    </Stack>
  )
}
