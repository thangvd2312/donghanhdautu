import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { getEvents } from '../../api/events'
import { dateLine, displayDate, fmtDay, keyLine, relDay, todayVN } from '../../lib/events'
import type { CalendarEvent } from '../../lib/types'
import AssetAvatar from '../AssetAvatar'
import { KindChip } from './EventCards'
import { CardLink } from '../home/HomeBlocks'
import { ChangePill, Panel } from '../ui'

/** Tối đa 3 sự kiện sắp tới, mã đang giữ trước. Không có gì để hiện hoặc lỗi thì ẩn cả khối để trang chủ gọn */
export default function UpcomingEvents() {
  const [items, setItems] = useState<CalendarEvent[]>([])

  useEffect(() => {
    let off = false
    getEvents('month')
      .then((d) => {
        if (off) return
        const t = todayVN()
        const up = d.items.filter((e) => e.upcoming)
        // Mã đang giữ trước, rồi theo ngày gần nhất
        setItems(
          [...up]
            .sort((a, b) => Number(b.held) - Number(a.held) || displayDate(a, t).localeCompare(displayDate(b, t)))
            .slice(0, 3),
        )
      })
      .catch(() => {})
    return () => {
      off = true
    }
  }, [])

  if (items.length === 0) return null
  const today = todayVN()
  return (
    <Panel
      title="Sự kiện sắp tới"
      subtitle="Mã bạn giữ và theo dõi"
      noPadding
      action={<CardLink to="/events">Lịch</CardLink>}
    >
      <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />}>
        {items.map((e) => (
          <Stack
            key={e.key}
            component={RouterLink}
            to={`/events?focus=${encodeURIComponent(e.key)}`}
            direction="row"
            spacing={1.5}
            sx={{ px: 2, py: 1.25, minHeight: 64, alignItems: 'center', color: 'inherit', textDecoration: 'none' }}
          >
            <AssetAvatar assetType="stock" symbol={e.symbol} size={36} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                <Typography sx={{ fontWeight: 800, fontSize: 15 }}>{e.symbol}</Typography>
                <KindChip kind={e.kind} />
              </Stack>
              <Typography variant="body2" className="num" sx={{ fontWeight: 500 }} noWrap>
                {keyLine(e, today)}
              </Typography>
              <Typography variant="caption" color="text.secondary" className="num" component="div">
                {dateLine(e, today) || fmtDay(displayDate(e, today), today)}
              </Typography>
            </Box>
            <ChangePill color="warning.main" small>
              {relDay(displayDate(e, today), today)}
            </ChangePill>
          </Stack>
        ))}
      </Stack>
    </Panel>
  )
}
