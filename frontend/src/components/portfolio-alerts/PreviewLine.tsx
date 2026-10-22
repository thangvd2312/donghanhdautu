import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { shortDate } from '../../lib/portfolioAlerts'
import type { PortfolioAlertPreviewItem } from '../../lib/types'

/** "Hiện tại: FPT chiếm 42% (ngưỡng 30%) → sẽ báo" */
export default function PreviewLine({
  preview,
  previewing,
  enabled,
}: {
  preview: PortfolioAlertPreviewItem | null
  previewing: boolean
  enabled: boolean
}) {
  if (!preview) {
    return (
      <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>
        {previewing ? 'Đang xem trước…' : 'Chưa xem trước được'}
      </Typography>
    )
  }
  const firing = preview.status === 'firing'
  const outcome =
    preview.status === 'skipped'
      ? null
      : !firing
        ? 'chưa tới ngưỡng'
        : !enabled
          ? 'bật để nhận nhắc'
          : preview.wouldNotify
            ? 'sẽ báo'
            : preview.nextAllowedAt
              ? `đã báo gần đây, nhắc lại từ ${shortDate(preview.nextAllowedAt)}`
              : 'sẽ báo'
  const tone = preview.status === 'skipped' ? 'text.secondary' : firing ? 'warning.main' : 'success.main'
  return (
    <Box
      data-testid="palert-preview"
      data-status={preview.status}
      sx={{
        mt: 1.25,
        pl: 1.25,
        py: 0.5,
        borderLeft: 3,
        borderColor: tone,
        opacity: previewing ? 0.6 : 1,
        transition: 'opacity .2s',
      }}
    >
      <Typography variant="body2" className="num" sx={{ lineHeight: 1.45 }}>
        <Box component="span" sx={{ color: 'text.secondary' }}>
          {preview.status === 'skipped' ? 'Chưa kiểm tra: ' : 'Hiện tại: '}
        </Box>
        {preview.headline}
        {outcome && (
          <Box component="span" sx={{ color: tone, fontWeight: 600 }}>
            {' '}
            → {outcome}
          </Box>
        )}
      </Typography>
      {preview.reason && (
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.25 }}>
          {preview.reason}
        </Typography>
      )}
    </Box>
  )
}
