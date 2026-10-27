import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import Chip from '@mui/material/Chip'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useCallback, useEffect, useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import { listTips, listTipSources } from '../api/tips'
import AssetAvatar from '../components/AssetAvatar'
import SourceStats from '../components/tips/SourceStats'
import TipComposer from '../components/tips/TipComposer'
import { Panel } from '../components/ui'
import { changeColor, fmtPct, timeAgo } from '../lib/format'
import { DECISION_LABEL, DIRECTION_LABEL, HOT, OUTCOME_LABEL } from '../lib/tips'
import type { TipListItem, TipSourceStat } from '../lib/types'

export default function TipsPage() {
  const nav = useNavigate()
  const [items, setItems] = useState<TipListItem[] | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loadingMore, setLoadingMore] = useState(false)
  const [sources, setSources] = useState<TipSourceStat[]>([])

  useEffect(() => {
    document.title = 'Soi lời khuyên · Đồng Hành Đầu Tư'
  }, [])

  const load = useCallback(async () => {
    setError('')
    try {
      const p = await listTips()
      setItems(p.items)
      setCursor(p.nextCursor)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])
  useEffect(() => {
    void load()
    // Thống kê nguồn là phần phụ: lỗi thì chỉ ẩn khối này
    listTipSources().then(setSources, () => setSources([]))
  }, [load])

  const more = async () => {
    if (!cursor) return
    setLoadingMore(true)
    try {
      const p = await listTips(cursor)
      setItems((prev) => [...(prev ?? []), ...p.items.filter((i) => !prev?.some((x) => x.id === i.id))])
      setCursor(p.nextCursor)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <Stack spacing={2.5} sx={{ maxWidth: 760, mx: 'auto' }}>
      <Typography variant="h5" component="h1">
        Soi lời khuyên
      </Typography>
      <TipComposer onCreated={(t) => nav(`/tips/${t.id}`)} />

      <Panel title="Sổ lời khuyên" subtitle="Mọi lời khuyên bạn đã soi, quyết định của bạn và kết quả sau 30 / 90 ngày" noPadding>
        {error && (
          <Alert severity="error" sx={{ m: 2 }} action={<Button color="inherit" size="small" onClick={() => void load()}>Thử lại</Button>}>
            {error}
          </Alert>
        )}
        {!items && !error && <Skeleton variant="rounded" height={120} sx={{ m: 2 }} />}
        {items?.length === 0 && (
          <Typography color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
            Chưa soi lời khuyên nào. Lần tới nghe ai đó hô mã, dán vào ô phía trên trước khi mua.
          </Typography>
        )}
        {items?.map((t) => <TipRow key={t.id} t={t} />)}
        {cursor && (
          <Box sx={{ p: 1.5, textAlign: 'center' }}>
            <Button onClick={() => void more()} loading={loadingMore} sx={{ minHeight: 44 }}>
              Xem thêm
            </Button>
          </Box>
        )}
      </Panel>

      <SourceStats stats={sources} />
    </Stack>
  )
}

function TipRow({ t }: { t: TipListItem }) {
  const review = t.review90 ?? t.review30
  return (
    <ButtonBase
      component={RouterLink}
      to={`/tips/${t.id}`}
      sx={{ display: 'flex', width: '100%', textAlign: 'left', gap: 1.5, p: 2, borderTop: 1, borderColor: 'divider', alignItems: 'flex-start' }}
    >
      <AssetAvatar assetType={t.assetType} symbol={t.symbol} size={40} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
          <Typography sx={{ fontWeight: 700 }}>{t.displayName}</Typography>
          <Typography variant="caption" color="text.secondary">
            {DIRECTION_LABEL[t.direction]} · {timeAgo(t.createdAt)}
          </Typography>
          {t.hotLevel && (
            <Chip
              size="small"
              variant="outlined"
              label={`${t.score} · ${HOT[t.hotLevel].label}`}
              sx={{ color: HOT[t.hotLevel].color, borderColor: HOT[t.hotLevel].color, fontWeight: 700 }}
            />
          )}
        </Stack>
        {t.sourceName && (
          <Typography variant="caption" color="text.secondary" component="div" noWrap>
            {t.sourceName}
          </Typography>
        )}
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, overflowWrap: 'anywhere' }}>
          {t.excerpt}
        </Typography>
        <Stack direction="row" spacing={1} sx={{ mt: 0.75, flexWrap: 'wrap', rowGap: 0.5 }}>
          {t.decision && <Chip size="small" label={DECISION_LABEL[t.decision]} />}
          {t.boughtAt && <Chip size="small" color="warning" label="Đã mua theo" />}
          {review && <Chip size="small" variant="outlined" label={`${t.review90 ? '90' : '30'} ngày: ${OUTCOME_LABEL[review.outcome]}`} />}
          {t.status === 'extracted' && <Chip size="small" variant="outlined" label="Chưa soi xong" />}
        </Stack>
      </Box>
      {t.changeSinceCheckPct !== null && (
        <Typography className="num" variant="body2" sx={{ color: changeColor(t.changeSinceCheckPct), fontWeight: 700, flexShrink: 0 }}>
          {fmtPct(t.changeSinceCheckPct, 1)}
        </Typography>
      )}
    </ButtonBase>
  )
}
