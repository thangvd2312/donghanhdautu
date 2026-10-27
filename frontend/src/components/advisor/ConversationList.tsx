import CurrencyBitcoin from '@mui/icons-material/CurrencyBitcoin'
import DateRangeOutlined from '@mui/icons-material/DateRangeOutlined'
import DeleteOutlined from '@mui/icons-material/DeleteOutlined'
import WbSunnyOutlined from '@mui/icons-material/WbSunnyOutlined'
import WbTwilight from '@mui/icons-material/WbTwilight'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import ListSubheader from '@mui/material/ListSubheader'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Typography from '@mui/material/Typography'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { BRIEF_LABEL, groupBriefs, groupChats, vnTime, type ConversationGroup } from '../../lib/conversations'
import { timeAgo } from '../../lib/format'
import type { AdvisorConversationList, AdvisorConversationSummary, ConversationBriefKind } from '../../lib/types'

const BRIEF_ICON: Record<ConversationBriefKind, ReactNode> = {
  crypto: <CurrencyBitcoin fontSize="small" sx={{ color: 'warning.main' }} />,
  morning: <WbSunnyOutlined fontSize="small" sx={{ color: 'warning.main' }} />,
  closing: <WbTwilight fontSize="small" sx={{ color: 'info.main' }} />,
  weekly: <DateRangeOutlined fontSize="small" sx={{ color: 'primary.main' }} />,
}

type TabKey = 'chats' | 'briefs'

interface ConversationListProps {
  convs: AdvisorConversationList
  activeId: string | undefined
  /** Chọn một cuộc trò chuyện (đóng ngăn lịch sử trên điện thoại) */
  onSelect: () => void
  onRemove: (id: string) => void
}

/**
 * Danh sách cuộc trò chuyện: cột trái trên desktop, ngăn kéo "Lịch sử" trên điện thoại.
 * Hai tab: câu người dùng tự hỏi và bản tin tự động (bản tin coin mỗi giờ nhiều, để chung sẽ lấn hết).
 */
export default function ConversationList({ convs, activeId, onSelect, onRemove }: ConversationListProps) {
  const [tab, setTab] = useState<TabKey>('chats')
  // Mở một cuộc trò chuyện (vd từ thông báo bản tin): chuyển sang tab chứa nó, một lần mỗi cuộc —
  // danh sách tải lại sau đó không kéo người dùng khỏi tab họ vừa tự chọn
  const synced = useRef<string>(undefined)
  useEffect(() => {
    if (!activeId || synced.current === activeId) return
    const inBriefs = convs.briefs.some((c) => c.id === activeId)
    if (!inBriefs && !convs.chats.some((c) => c.id === activeId)) return
    synced.current = activeId
    setTab(inBriefs ? 'briefs' : 'chats')
  }, [activeId, convs])

  const groups = useMemo(
    () => (tab === 'chats' ? groupChats(convs.chats) : groupBriefs(convs.briefs)),
    [tab, convs],
  )

  return (
    <>
      <Tabs
        value={tab}
        onChange={(_, v: TabKey) => setTab(v)}
        variant="fullWidth"
        sx={{ minHeight: 40, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}
      >
        <Tab value="chats" label="Trò chuyện" sx={{ minHeight: 40, py: 0 }} />
        <Tab value="briefs" label="Bản tin" sx={{ minHeight: 40, py: 0 }} />
      </Tabs>
      <List dense sx={{ flex: 1, overflowY: 'auto', py: 0 }}>
        {groups.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
            {tab === 'chats'
              ? 'Chưa có câu hỏi nào. Bấm "Cuộc trò chuyện mới" để hỏi cố vấn.'
              : 'Chưa có bản tin. Bản tin sáng, tổng kết phiên và bản tin coin sẽ hiện ở đây.'}
          </Typography>
        )}
        {groups.map((g: ConversationGroup) => (
          <li key={g.label}>
            <ul style={{ padding: 0 }}>
              <ListSubheader
                sx={{ lineHeight: '32px', fontSize: 12, fontWeight: 600, color: 'text.secondary', bgcolor: 'background.paper' }}
              >
                {g.label}
              </ListSubheader>
              {g.items.map((c) => (
                <Row key={c.id} c={c} selected={c.id === activeId} onSelect={onSelect} onRemove={onRemove} />
              ))}
            </ul>
          </li>
        ))}
      </List>
    </>
  )
}

function Row({
  c,
  selected,
  onSelect,
  onRemove,
}: {
  c: AdvisorConversationSummary
  selected: boolean
  onSelect: () => void
  onRemove: (id: string) => void
}) {
  return (
    <ListItemButton
      selected={selected}
      component={RouterLink}
      to={`/advisor/${c.id}`}
      onClick={() => onSelect()}
      sx={{ mx: 0.75, borderRadius: 1, alignItems: 'flex-start', '&:hover .del': { opacity: 1 } }}
    >
      {c.brief && (
        <Box sx={{ mr: 1.25, mt: 0.75, display: 'flex' }} title={BRIEF_LABEL[c.brief]}>
          {BRIEF_ICON[c.brief]}
        </Box>
      )}
      {c.brief ? (
        <ListItemText
          primary={c.headline ?? c.title}
          secondary={`${vnTime(c.createdAt)} · ${BRIEF_LABEL[c.brief]}`}
          slotProps={{
            primary: {
              variant: 'body2',
              sx: { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' },
            },
          }}
        />
      ) : (
        <ListItemText
          primary={c.title}
          secondary={timeAgo(c.updatedAt)}
          slotProps={{ primary: { noWrap: true, variant: 'body2' } }}
        />
      )}
      <IconButton
        className="del"
        size="small"
        aria-label="Xoá cuộc trò chuyện"
        sx={{ opacity: { xs: 1, md: 0 }, ml: 0.5, mt: 0.25 }}
        onClick={(e) => {
          e.preventDefault()
          onRemove(c.id)
        }}
      >
        <DeleteOutlined fontSize="small" />
      </IconButton>
    </ListItemButton>
  )
}
