import FlagOutlined from '@mui/icons-material/FlagOutlined'
import Button from '@mui/material/Button'
import { useEffect, useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import type { Plan } from '../lib/types'
import PlanEditor from './PlanEditor'

/** "Lập kế hoạch" cho tài sản đang xem; đã có kế hoạch đang theo dõi thì mở kế hoạch đó */
export default function PlanButton({ assetType, symbol, label }: { assetType: Plan['assetType']; symbol: string; label: string }) {
  const nav = useNavigate()
  const [plan, setPlan] = useState<Plan | null | undefined>(undefined)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let alive = true
    api<Plan[]>('/plans')
      .then((list) => alive && setPlan(list.find((p) => p.status === 'active' && p.assetType === assetType && p.symbol === symbol) ?? null))
      .catch(() => alive && setPlan(null))
    return () => {
      alive = false
    }
  }, [assetType, symbol])

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
