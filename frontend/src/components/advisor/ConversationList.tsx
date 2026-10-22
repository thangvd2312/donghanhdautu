import DeleteOutlined from '@mui/icons-material/DeleteOutlined'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router-dom'
import { timeAgo } from '../../lib/format'
import type { AdvisorConversationSummary } from '../../lib/types'

interface ConversationListProps {
  convs: AdvisorConversationSummary[]
  activeId: string | undefined
  /** Chọn một cuộc trò chuyện (đóng ngăn lịch sử trên điện thoại) */
  onSelect: () => void
  onRemove: (id: string) => void
}

/** Danh sách cuộc trò chuyện: cột trái trên desktop, ngăn kéo "Lịch sử" trên điện thoại */
export default function ConversationList({ convs, activeId, onSelect, onRemove }: ConversationListProps) {
  return (
    <List dense sx={{ flex: 1, overflowY: 'auto', py: 0.5 }}>
      {convs.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
          Chưa có cuộc trò chuyện nào.
        </Typography>
      )}
      {convs.map((c) => (
        <ListItemButton
          key={c.id}
          selected={c.id === activeId}
          component={RouterLink}
          to={`/advisor/${c.id}`}
          onClick={() => onSelect()}
          sx={{ mx: 0.75, borderRadius: 1, '&:hover .del': { opacity: 1 } }}
        >
          <ListItemText
            primary={c.title}
            secondary={timeAgo(c.updatedAt)}
            slotProps={{ primary: { noWrap: true, variant: 'body2' } }}
          />
          <IconButton
            className="del"
            size="small"
            sx={{ opacity: { xs: 1, md: 0 }, ml: 0.5 }}
            onClick={(e) => {
              e.preventDefault()
              onRemove(c.id)
            }}
          >
            <DeleteOutlined fontSize="small" />
          </IconButton>
        </ListItemButton>
      ))}
    </List>
  )
}
