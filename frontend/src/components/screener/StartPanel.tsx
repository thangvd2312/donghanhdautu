import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import { PageGrid } from '../page'
import { Panel } from '../ui'
import { PRESETS } from '../../lib/screener'
import type { SavedScreen, ScreenCriterion } from '../../lib/types'
import { PresetCard, SavedList } from './ScreenerParts'

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
    <Panel title="Bộ lọc đã lưu">
      <SavedList
        items={saved}
        crits={critMap}
        activeId={savedId}
        onOpen={onOpenSaved}
        onRename={onRenameSaved}
        onDelete={onDeleteSaved}
      />
    </Panel>
  )
  const savedLoading = saved === null && !savedFailed
  const aside =
    savedLoading || savedSection || savedFailed ? (
      <>
        {savedLoading ? <Skeleton variant="rounded" height={64} /> : savedSection}
        {savedFailed && (
          <Alert severity="warning" variant="outlined" action={<Button size="small" color="inherit" onClick={onRetry}>Thử lại</Button>}>
            Chưa tải được các bộ lọc đã lưu.
          </Alert>
        )}
      </>
    ) : undefined

  return (
    <PageGrid aside={aside}>
      <Panel title="Bắt đầu nhanh" subtitle="Chọn một bộ lọc mẫu để xem ngay, sau đó chỉnh lại theo ý bạn.">
        <Stack spacing={1.5}>
          <Box sx={{ display: 'grid', gap: 1.25, gridTemplateColumns: { xs: '1fr', md: 'repeat(auto-fill, minmax(280px, 1fr))' } }}>
            {PRESETS.map((p) => (
              <PresetCard key={p.id} title={p.title} desc={p.desc} onClick={() => onPreset(p.id)} />
            ))}
          </Box>
          <Button variant="outlined" size="large" onClick={onPicker} disabled={!criteriaReady} sx={{ minHeight: 48, borderRadius: 99 }}>
            Tự chọn điều kiện
          </Button>
        </Stack>
      </Panel>
    </PageGrid>
  )
}
