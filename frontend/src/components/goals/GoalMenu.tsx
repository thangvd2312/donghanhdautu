import MoreVert from '@mui/icons-material/MoreVert'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import { useState } from 'react'
import { deleteGoal, setGoalStatus } from '../../api/goals'
import type { Goal } from '../../lib/types'

/** Menu ⋮ của một mục tiêu: sửa, đánh dấu đã đạt, tạm dừng / tiếp tục, xoá */
export default function GoalMenu({
  g,
  onEdit,
  onChanged,
  onError,
}: {
  g: Goal
  onEdit: () => void
  onChanged: () => void
  onError: (m: string) => void
}) {
  const [menu, setMenu] = useState<HTMLElement | null>(null)
  const close = () => setMenu(null)

  const setStatus = async (status: Goal['status']) => {
    onError('')
    try {
      await setGoalStatus(g.id, status)
      onChanged()
    } catch (e) {
      onError((e as Error).message)
    }
  }
  const remove = async () => {
    if (!confirm(`Xoá mục tiêu "${g.name}"? Sổ giao dịch và tài sản không bị ảnh hưởng.`)) return
    try {
      await deleteGoal(g.id)
      onChanged()
    } catch (e) {
      onError((e as Error).message)
    }
  }

  return (
    <>
      <IconButton aria-label="Tuỳ chọn mục tiêu" onClick={(e) => setMenu(e.currentTarget)} sx={{ alignSelf: 'flex-start' }}>
        <MoreVert />
      </IconButton>
      <Menu anchorEl={menu} open={!!menu} onClose={close}>
        <MenuItem
          onClick={() => {
            close()
            onEdit()
          }}
        >
          Sửa
        </MenuItem>
        {g.status !== 'achieved' && g.progress.progressPct >= 100 && (
          <MenuItem
            onClick={() => {
              close()
              void setStatus('achieved')
            }}
          >
            Đánh dấu đã đạt
          </MenuItem>
        )}
        <MenuItem
          onClick={() => {
            close()
            void setStatus(g.status === 'active' ? 'paused' : 'active')
          }}
        >
          {g.status === 'active' ? 'Tạm dừng' : 'Tiếp tục'}
        </MenuItem>
        <MenuItem
          sx={{ color: 'error.main' }}
          onClick={() => {
            close()
            void remove()
          }}
        >
          Xoá
        </MenuItem>
      </Menu>
    </>
  )
}
