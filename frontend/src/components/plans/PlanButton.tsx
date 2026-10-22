import FlagOutlined from '@mui/icons-material/FlagOutlined'
import Button from '@mui/material/Button'
import { useEffect, useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import { listPlans } from '../../api/plans'
import type { Plan } from '../../lib/types'
import PlanEditor from './PlanEditor'
import { QuickAction } from '../ui'

/** "Lập kế hoạch" cho tài sản đang xem; đã có kế hoạch đang theo dõi thì mở kế hoạch đó */
export default function PlanButton({
  assetType,
  symbol,
  label,
  tile,
}: {
  assetType: Plan['assetType']
  symbol: string
  label: string
  /** Hiển thị dạng ô hành động nhanh (icon + nhãn) */
  tile?: boolean
}) {
  const nav = useNavigate()
  const [plan, setPlan] = useState<Plan | null | undefined>(undefined)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let alive = true
    listPlans()
      .then((list) => alive && setPlan(list.find((p) => p.status === 'active' && p.assetType === assetType && p.symbol === symbol) ?? null))
      .catch(() => alive && setPlan(null))
    return () => {
      alive = false
    }
  }, [assetType, symbol])

  if (tile)
    return (
      <>
        <QuickAction
          icon={<FlagOutlined />}
          label={plan ? 'Kế hoạch' : 'Lập kế hoạch'}
          active={!!plan}
          disabled={plan === undefined}
          to={plan ? `/plans/${plan.id}` : undefined}
          onClick={plan ? undefined : () => setOpen(true)}
        />
        <PlanEditor open={open} fixed={{ assetType, symbol, label }} onClose={() => setOpen(false)} onSaved={(p) => nav(`/plans/${p.id}`)} />
      </>
    )
  if (plan === undefined) return null
  if (plan) {
    return (
      <Button variant="outlined" color="inherit" startIcon={<FlagOutlined />} component={RouterLink} to={`/plans/${plan.id}`}>
        Xem kế hoạch
      </Button>
    )
  }
  return (
    <>
      <Button variant="outlined" color="inherit" startIcon={<FlagOutlined />} onClick={() => setOpen(true)}>
        Lập kế hoạch
      </Button>
      <PlanEditor
        open={open}
        fixed={{ assetType, symbol, label }}
        onClose={() => setOpen(false)}
        onSaved={(p) => nav(`/plans/${p.id}`)}
      />
    </>
  )
}
