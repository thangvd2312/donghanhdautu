import AddIcon from '@mui/icons-material/Add'
import EventOutlined from '@mui/icons-material/EventOutlined'
import FlagOutlined from '@mui/icons-material/FlagOutlined'
import TrendingUp from '@mui/icons-material/TrendingUp'
import ButtonBase from '@mui/material/ButtonBase'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Box from '@mui/material/Box'
import LinearProgress from '@mui/material/LinearProgress'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useState, type ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { listGoals } from '../api/goals'
import GoalCard from '../components/goals/GoalCard'
import GoalEditor from '../components/goals/GoalEditor'
import ReturnGoalCard from '../components/goals/ReturnGoalCard'
import { EmptyState, PageGrid, PageHeader } from '../components/page'
import { CardLink, HERO_SX } from '../components/home/HomeBlocks'
import { InfoTip, Panel } from '../components/ui'
import { fmtNum, fmtVndShort } from '../lib/format'
import { useResource } from '../hooks/useResource'
import { qk } from '../lib/query'
import type { Goal, GoalKind } from '../lib/types'

/** Mục tiêu tài chính: tiến độ từ tài sản được gán, độ lệch tỷ trọng, mô phỏng theo giả định */
export default function GoalsPage() {
  const { data, error, reload: load } = useResource(listGoals, { key: qk.goals })
  const [editing, setEditing] = useState<{
    goal: Goal | null
    kind: GoalKind | null
  } | null>(null)

  const goals = data?.goals ?? []
  const active = goals.filter((g) => g.status === 'active' && g.kind !== 'return')
  const activeReturn = goals.filter((g) => g.status === 'active' && g.kind === 'return')
  const returnCapital = activeReturn.reduce((t, g) => t + (g.returnTarget?.capital ?? 0), 0)
  const sumCurrent = active.reduce((t, g) => t + g.progress.current, 0)
  const sumTarget = active.reduce((t, g) => t + g.targetAmount, 0)
  const pct = sumTarget > 0 ? Math.min(100, (sumCurrent / sumTarget) * 100) : 0

  return (
    <Stack spacing={2.5}>
      <PageHeader
        eyebrow="Tài sản"
        title="Mục tiêu tài chính"
        description="Sinh lời đều mỗi năm trên số vốn, hoặc có số tiền vào một ngày: app gợi ý chia tiền và cần góp bao nhiêu."
        actions={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setEditing({ goal: null, kind: null })}
            sx={{
              whiteSpace: 'nowrap',
              borderRadius: 99,
              width: { xs: '100%', md: 'auto' },
            }}
          >
            Thêm mục tiêu
          </Button>
        }
      />

      {error && <Alert severity="error">{error}</Alert>}
      {!data && !error && <Skeleton variant="rounded" height={200} />}

      {active.length > 0 && (
        <Paper
          sx={{
            ...HERO_SX,
            border: 'none',
            borderRadius: '20px',
            p: { xs: 2, md: 2.5 },
          }}
        >
          <Stack
            direction="row"
            sx={{
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 2,
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: 13, color: 'hero.muted' }}>
                Đã có cho {active.length} mục tiêu
                <Box component="span" sx={{ ml: 0.75, '& button': { color: 'hero.muted' } }}>
                  <InfoTip>Tiến độ = giá trị hiện tại của phần tài sản đã gán so với số tiền cần đạt.</InfoTip>
                </Box>
              </Typography>
              <Typography
                className="num"
                sx={{
                  fontSize: { xs: 30, sm: 36 },
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                  lineHeight: 1.15,
                }}
              >
                {fmtVndShort(sumCurrent)}
                <Box component="span" sx={{ fontSize: 16, fontWeight: 500, color: 'hero.muted' }}>
                  {' '}
                  / {fmtVndShort(sumTarget)}
                </Box>
              </Typography>
            </Box>
            <Typography className="num" sx={{ fontSize: 22, fontWeight: 700, color: 'hero.gold' }}>
              {fmtNum(pct, 1)}%
            </Typography>
          </Stack>
          <LinearProgress
            variant="determinate"
            value={pct}
            aria-label="Tiến độ chung"
            sx={{
              mt: 1.75,
              height: 8,
              borderRadius: 4,
              bgcolor: 'hero.chip',
              '& .MuiLinearProgress-bar': {
                bgcolor: 'hero.gold',
                borderRadius: 4,
              },
            }}
          />
          {activeReturn.length > 0 && (
            <Typography sx={{ mt: 1.25, fontSize: 13, color: 'hero.muted' }}>
              + {activeReturn.length} mục tiêu sinh lời · vốn {fmtVndShort(returnCapital)}
            </Typography>
          )}
        </Paper>
      )}
      {active.length === 0 && activeReturn.length > 0 && (
        <Paper
          sx={{
            ...HERO_SX,
            border: 'none',
            borderRadius: '20px',
            p: { xs: 2, md: 2.5 },
          }}
        >
          <Typography sx={{ fontSize: 13, color: 'hero.muted' }}>{activeReturn.length} mục tiêu sinh lời đều</Typography>
          <Typography
            className="num"
            sx={{
              fontSize: { xs: 30, sm: 36 },
              fontWeight: 700,
              letterSpacing: '-0.02em',
              lineHeight: 1.15,
            }}
          >
            {fmtVndShort(returnCapital)}
            <Box component="span" sx={{ fontSize: 16, fontWeight: 500, color: 'hero.muted' }}>
              {' '}
              tổng vốn
            </Box>
          </Typography>
        </Paper>
      )}

      <PageGrid
        aside={
          data && (
            <Panel
              title="Cách tính tiến độ"
              action={<CardLink to="/portfolio">Danh mục</CardLink>}
              sx={{ display: { xs: 'none', md: 'block' } }}
            >
              <Stack spacing={1.25}>
                <Typography variant="body2" color="text.secondary">
                  Mỗi mục tiêu được gán một số tài sản trong danh mục; tiến độ là giá trị hiện tại của phần đã gán so với số tiền cần đạt.
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Mở "Thử thay đổi mức góp" ở từng mục tiêu để xem kết quả theo mức góp và lợi suất giả định. Đây là mô phỏng, không phải dự
                  báo.
                </Typography>
              </Stack>
            </Panel>
          )
        }
      >
        {data && !data.goals.length && (
          <EmptyState Icon={FlagOutlined} title="Chưa có mục tiêu nào">
            Chọn một kiểu để bắt đầu.
            {!data.assets.length && (
              <>
                {' '}
                Cần có tài sản trong{' '}
                <Link component={RouterLink} to="/portfolio">
                  danh mục
                </Link>
                .
              </>
            )}
          </EmptyState>
        )}
        {data && !data.goals.length && (
          <Box
            sx={{
              display: 'grid',
              gap: 1.5,
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
            }}
          >
            <KindTile
              icon={<TrendingUp />}
              title="Sinh lời đều mỗi năm"
              sub="VD: 100 triệu, muốn lãi 10–12%/năm"
              onClick={() => setEditing({ goal: null, kind: 'return' })}
            />
            <KindTile
              icon={<EventOutlined />}
              title="Có số tiền vào ngày"
              sub="VD: mua nhà 2 tỷ năm 2030"
              onClick={() => setEditing({ goal: null, kind: 'amount' })}
            />
          </Box>
        )}
        {goals.map((g) =>
          g.kind === 'return' ? (
            <ReturnGoalCard
              key={g.id}
              g={g}
              assumptions={data?.assumptions ?? []}
              onEdit={() => setEditing({ goal: g, kind: g.kind })}
              onChanged={() => void load()}
            />
          ) : (
            <GoalCard key={g.id} g={g} onEdit={() => setEditing({ goal: g, kind: g.kind })} onChanged={() => void load()} />
          ),
        )}
      </PageGrid>

      {data && (
        <GoalEditor
          open={!!editing}
          goal={editing?.goal ?? null}
          initialKind={editing?.kind ?? null}
          assets={data.assets}
          portfolioTotal={data.portfolioTotal ?? 0}
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

function KindTile({ icon, title, sub, onClick }: { icon: ReactNode; title: string; sub: string; onClick: () => void }) {
  return (
    <ButtonBase
      onClick={onClick}
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: 1.5,
        textAlign: 'left',
        p: 2,
        borderRadius: 2,
        border: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <Box
        sx={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          bgcolor: 'rgba(var(--mui-palette-primary-mainChannel) / 0.08)',
          color: 'primary.main',
          flexShrink: 0,
        }}
      >
        {icon}
      </Box>
      <Box>
        <Typography sx={{ fontWeight: 700 }}>{title}</Typography>
        <Typography variant="body2" color="text.secondary">
          {sub}
        </Typography>
      </Box>
    </ButtonBase>
  )
}
