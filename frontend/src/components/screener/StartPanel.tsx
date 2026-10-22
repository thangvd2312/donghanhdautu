import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { PRESETS } from '../../lib/screener'
import type { SavedScreen, ScreenCriterion } from '../../lib/types'
import { PresetCard, SavedList } from './ScreenerParts'

const SECTION_TITLE = { fontWeight: 700, fontSize: 15 } as const

interface StartPanelProps {
  criteriaReady: boolean
  /** null = đang tải */
  saved: SavedScreen[] | null
  savedFailed: boolean
  critMap: Record<string, ScreenCriterion>
  savedId: string | null
  onPreset: (id: string) => void
  onPicker: () => void
  onRetry: () => void
  onOpenSaved: (s: SavedScreen) => void
  onRenameSaved: (s: SavedScreen) => void
  onDeleteSaved: (s: SavedScreen) => void
}

/** Màn hình khi chưa chọn điều kiện nào: bộ lọc mẫu, tự chọn điều kiện, bộ lọc đã lưu */
export default function StartPanel({
  criteriaReady,
  saved,
  savedFailed,
  critMap,
  savedId,
  onPreset,
  onPicker,
  onRetry,
  onOpenSaved,
  onRenameSaved,
  onDeleteSaved,
}: StartPanelProps) {
  const savedSection = !!saved?.length && (
    <Stack spacing={1}>
      <Typography component="h2" sx={SECTION_TITLE}>
        Bộ lọc đã lưu
      </Typography>
      <SavedList
        items={saved}
        crits={critMap}
        activeId={savedId}
        onOpen={onOpenSaved}
        onRename={onRenameSaved}
        onDelete={onDeleteSaved}
      />
    </Stack>
  )

  return (
    <Stack spacing={2}>
      <Stack spacing={1}>
        <Typography component="h2" sx={SECTION_TITLE}>
          Bắt đầu nhanh
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Chọn một bộ lọc mẫu để xem ngay, sau đó chỉnh lại theo ý bạn.
        </Typography>
        <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' } }}>
          {PRESETS.map((p) => (
            <PresetCard key={p.id} title={p.title} desc={p.desc} onClick={() => onPreset(p.id)} />
          ))}
        </Box>
        <Button variant="outlined" size="large" onClick={onPicker} disabled={!criteriaReady} sx={{ minHeight: 48 }}>
          Tự chọn điều kiện
        </Button>
      </Stack>
      {saved === null && !savedFailed ? <Skeleton variant="rounded" height={64} /> : savedSection}
      {savedFailed && (
        <Alert severity="warning" variant="outlined" action={<Button size="small" color="inherit" onClick={onRetry}>Thử lại</Button>}>
          Chưa tải được các bộ lọc đã lưu.
        </Alert>
      )}
    </Stack>
  )
}
