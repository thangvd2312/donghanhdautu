import ChevronLeft from '@mui/icons-material/ChevronLeft'
import ChevronRight from '@mui/icons-material/ChevronRight'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link as RouterLink, useSearchParams } from 'react-router-dom'
import { EntryRow, MonthlySummary, TagSheet } from '../components/JournalParts'
import { api } from '../lib/api'
import { fmtDate } from '../lib/format'
import { currentMonth, EMOTION_LABEL, EMOTIONS, isMonth, monthTitle, shiftMonth } from '../lib/journal'
import type {
  JournalEmotion,
  JournalMonth,
  JournalMonthSummary,
  JournalReviewEntry,
  JournalTradeEntry,
} from '../lib/types'

const WEEKDAY = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']
const dayTitle = (d: string) => `${WEEKDAY[new Date(`${d}T00:00:00Z`).getUTCDay()]}, ${fmtDate(d)}`

/**
 * Nhật ký quyết định: mỗi lần mua / bán, xem lại hay sửa kế hoạch trong tháng, kèm cảm xúc / lý do người dùng tự gắn,
 * và tổng kết thói quen. Không phán xét, không khuyên mua / bán; tách "làm đúng kế hoạch" khỏi "lãi hay lỗ".
 * Trạng thái (tháng, bộ lọc) nằm trên URL để link từ thông báo / trang kế hoạch mở đúng chỗ.
 */
export default function JournalPage() {
  const [params, setParams] = useSearchParams()
  const thisMonth = currentMonth()
  const month = isMonth(params.get('month')) && params.get('month')! <= thisMonth ? params.get('month')! : thisMonth
  const emotion = (EMOTIONS as string[]).includes(params.get('emotion') ?? '') ? (params.get('emotion') as JournalEmotion) : null
  const planId = params.get('plan') ?? ''

  const [data, setData] = useState<JournalMonth | null>(null)
  const [summary, setSummary] = useState<JournalMonthSummary | null>(null)
  const [error, setError] = useState('')
  const [tagging, setTagging] = useState<JournalTradeEntry | JournalReviewEntry | null>(null)

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    setParams(next, { replace: true })
  }

  const loadEntries = useCallback(() => {
    const q = new URLSearchParams({ month })
    if (emotion) q.set('emotion', emotion)
    if (planId) q.set('planId', planId)
    return api<JournalMonth>(`/journal?${q}`)
      .then((d) => {
        setData(d)
        setError('')
      })
      .catch((e: Error) => setError(e.message))
  }, [month, emotion, planId])

  const loadSummary = useCallback(
    () =>
      api<JournalMonthSummary>(`/journal/summary?month=${month}`)
        .then(setSummary)
        .catch(() => setSummary(null)),
    [month],
  )

  useEffect(() => {
    setData(null)
    void loadEntries()
  }, [loadEntries])
  useEffect(() => {
    setSummary(null)
    void loadSummary()
  }, [loadSummary])

  // Nhóm theo ngày, giữ thứ tự mới nhất trước
  const days = useMemo(() => {
    const out: { date: string; entries: JournalMonth['entries'] }[] = []
    for (const e of data?.entries ?? []) {
      const last = out[out.length - 1]
      if (last && last.date === e.date) last.entries.push(e)
      else out.push({ date: e.date, entries: [e] })
    }
    return out
  }, [data])

  const filtered = !!emotion || !!planId
  const planName = data?.plans.find((p) => p.id === planId)?.displayName

  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          Nhật ký quyết định
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Mỗi lần mua, bán hay xem lại kế hoạch: vì sao, và lúc đó bạn thấy thế nào. Không có đúng sai, chỉ để bạn tự nhận ra
          thói quen của mình.
        </Typography>
      </Box>

      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'center' }}>
        <IconButton aria-label="Tháng trước" onClick={() => set({ month: shiftMonth(month, -1) })} sx={{ width: 44, height: 44 }}>
          <ChevronLeft />
        </IconButton>
        <Typography sx={{ fontWeight: 700, minWidth: 140, textAlign: 'center' }} aria-live="polite">
          {monthTitle(month)}
        </Typography>
        <IconButton
          aria-label="Tháng sau"
          disabled={month >= thisMonth}
          onClick={() => set({ month: shiftMonth(month, 1) === thisMonth ? null : shiftMonth(month, 1) })}
          sx={{ width: 44, height: 44 }}
        >
          <ChevronRight />
        </IconButton>
      </Stack>

      {summary ? <MonthlySummary s={summary} /> : <Skeleton variant="rounded" height={260} />}

      <Stack spacing={1.5}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' } }}>
          <Box sx={{ flex: 1, minWidth: 0 }} role="group" aria-label="Lọc theo cảm xúc">
            <Box
              sx={{
                display: 'flex',
                gap: 1,
                overflowX: 'auto',
                scrollbarWidth: 'none',
                '&::-webkit-scrollbar': { display: 'none' },
                '& > *': { flexShrink: 0 },
                // Điện thoại: hàng cuộn tràn ra đúng bằng lề trang (12px) để thấy còn chip phía sau
                mx: { xs: -1.5, sm: 0 },
                px: { xs: 1.5, sm: 0 },
              }}
            >
              <Chip
                label="Mọi cảm xúc"
                clickable
                aria-pressed={!emotion}
                color={!emotion ? 'primary' : 'default'}
                variant={!emotion ? 'filled' : 'outlined'}
                onClick={() => set({ emotion: null })}
              />
              {EMOTIONS.map((e) => (
                <Chip
                  key={e}
                  label={EMOTION_LABEL[e]}
                  clickable
                  aria-pressed={emotion === e}
                  color={emotion === e ? 'primary' : 'default'}
                  variant={emotion === e ? 'filled' : 'outlined'}
                  onClick={() => set({ emotion: emotion === e ? null : e })}
                />
              ))}
            </Box>
          </Box>
          {data && data.plans.length > 0 && (
            <TextField
              select
              size="small"
              label="Kế hoạch"
              value={data.plans.some((p) => p.id === planId) ? planId : ''}
              onChange={(e) => set({ plan: e.target.value || null })}
              sx={{ minWidth: { sm: 200 } }}
            >
              <MenuItem value="">Mọi kế hoạch</MenuItem>
              {data.plans.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.displayName}
                  {p.status === 'closed' ? ' (đã kết thúc)' : ''}
                </MenuItem>
              ))}
            </TextField>
          )}
        </Stack>

        {error && <Alert severity="error">{error}</Alert>}
        {!data && !error && <Skeleton variant="rounded" height={240} />}
        {data && (
          <Paper data-testid="journal-timeline">
            {days.length === 0 ? (
              <Box sx={{ p: 3 }}>
                <Typography sx={{ fontWeight: 600 }}>
                  {filtered
                    ? `Không có quyết định nào${emotion ? ` lúc “${EMOTION_LABEL[emotion]}”` : ''}${planName ? ` của kế hoạch ${planName}` : ''} trong ${monthTitle(month).toLowerCase()}.`
                    : `Chưa có quyết định nào trong ${monthTitle(month).toLowerCase()}.`}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  Khi ghi lệnh mua / bán trong sổ giao dịch hoặc xem lại một kế hoạch, bạn có thể gắn cảm xúc và lý do. Nhật ký chỉ
                  lấy từ những gì bạn tự ghi, không suy ra từ các cuộc trò chuyện với cố vấn.
                </Typography>
                <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap' }} useFlexGap>
                  {filtered && (
                    <Button variant="outlined" onClick={() => set({ emotion: null, plan: null })} sx={{ borderRadius: 99 }}>
                      Bỏ lọc
                    </Button>
                  )}
                  <Button variant="contained" component={RouterLink} to="/portfolio" sx={{ borderRadius: 99 }}>
                    Mở sổ giao dịch
                  </Button>
                </Stack>
              </Box>
            ) : (
              <Stack divider={<Divider flexItem />}>
                {days.map((d) => (
                  <Box key={d.date} component="section" aria-label={dayTitle(d.date)}>
                    <Typography
                      variant="caption"
                      component="h2"
                      sx={{ px: 2, pt: 1.25, fontWeight: 700, color: 'text.secondary', display: 'block' }}
                    >
                      {dayTitle(d.date)}
                    </Typography>
                    <Stack divider={<Divider flexItem sx={{ ml: 8 }} />}>
                      {d.entries.map((e) => (
                        <EntryRow key={`${e.kind}:${e.id}`} e={e} onTag={setTagging} />
                      ))}
                    </Stack>
                  </Box>
                ))}
              </Stack>
            )}
            {data.truncated && (
              <Typography variant="caption" color="text.secondary" component="p" sx={{ px: 2, py: 1 }}>
                Tháng này có quá nhiều mục, chỉ hiện những mục mới nhất. Lọc theo cảm xúc hoặc kế hoạch để xem kỹ hơn.
              </Typography>
            )}
          </Paper>
        )}
      </Stack>

      <TagSheet
        entry={tagging}
        plans={data?.plans ?? []}
        onClose={() => setTagging(null)}
        onSaved={() => {
          void loadEntries()
          void loadSummary()
        }}
      />
    </Stack>
  )
}
