import CompareArrowsOutlined from '@mui/icons-material/CompareArrowsOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useEffect, useState } from 'react'
import { listWatchlist } from '../../api/watchlist'
import { MAX_COMPARE } from '../../lib/compare'
import AssetAvatar from '../AssetAvatar'
import { SuggestChips } from './CompareParts'
import { Panel } from '../ui'

/** 0–1 mã: giải thích ngắn + nút lớn mở chọn mã + gợi ý nhanh */
export default function ComparePrompt({
  symbols,
  onAdd,
  onOpen,
  snapshotNames,
}: {
  symbols: string[]
  onAdd: (s: string) => void
  onOpen: () => void
  snapshotNames?: { symbol: string; name: string; valueBn: number }[]
}) {
  const [watch, setWatch] = useState<string[]>([])
  useEffect(() => {
    let alive = true
    listWatchlist()
      .then((l) => alive && setWatch(l.filter((w) => w.assetType === 'stock').map((w) => w.symbol)))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  const picked = symbols[0]
  const fromWatch = watch.filter((s) => !symbols.includes(s)).slice(0, 8)
  const popular = (snapshotNames ?? [])
    .slice()
    .sort((a, b) => b.valueBn - a.valueBn)
    .map((s) => s.symbol)
    .filter((s) => !symbols.includes(s) && !fromWatch.includes(s))
    .slice(0, 8)
  const name = snapshotNames?.find((s) => s.symbol === picked)?.name
  return (
    <Panel>
      <Stack spacing={2} sx={{ alignItems: 'stretch' }}>
        {picked ? (
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <AssetAvatar assetType="stock" symbol={picked} size={44} />
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontWeight: 800, fontSize: 20, lineHeight: 1.2 }}>{picked}</Typography>
              {name && (
                <Typography variant="caption" color="text.secondary" noWrap component="div">
                  {name}
                </Typography>
              )}
            </Box>
          </Stack>
        ) : (
          <Box sx={{ color: 'primary.main' }}>
            <CompareArrowsOutlined sx={{ fontSize: 40 }} />
          </Box>
        )}
        <Typography sx={{ fontWeight: 600 }}>
          {picked ? `Chọn thêm ít nhất 1 mã để so sánh với ${picked}.` : 'Chọn ít nhất 2 mã để so sánh.'}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Bạn có thể so sánh tối đa {MAX_COMPARE} mã: diễn biến giá cùng mốc, thay đổi giá theo kỳ, P/E, P/B, tăng trưởng và cổ tức. Chỉ là số liệu để
          đối chiếu, không phải khuyến nghị.
        </Typography>
        <Button variant="contained" size="large" onClick={onOpen} startIcon={<CompareArrowsOutlined />} sx={{ borderRadius: 99, minHeight: 52 }}>
          Thêm mã để so sánh
        </Button>
        <SuggestChips label="Trong danh sách theo dõi của bạn" symbols={fromWatch} onAdd={onAdd} />
        <SuggestChips label="Mã giao dịch nhiều hôm nay" symbols={popular} onAdd={onAdd} />
      </Stack>
    </Panel>
  )
}
