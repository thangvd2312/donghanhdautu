import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router-dom'
import { usePortfolioAlertsForm } from '../../hooks/usePortfolioAlertsForm'
import { draftError, KINDS, sameDraft } from '../../lib/portfolioAlerts'
import RuleRow from './RuleRow'
import { Panel } from '../ui'

/**
 * Cảnh báo theo tình trạng danh mục: mỗi quy tắc một dòng (bật/tắt, ngưỡng, tần suất nhắc lại) và dòng "Hiện tại"
 * xem trước theo đúng giá trị đang nhập — chưa cần lưu, không gửi thông báo.
 */
export default function PortfolioAlertsPanel({ standalone }: { standalone?: boolean }) {
  const { settings, saved, drafts, preview, previewing, loadError, rowError, saving, change, save, toggle, reset } =
    usePortfolioAlertsForm()

  return (
    <Panel
      // Trang riêng đã có tiêu đề và lời giới thiệu: khung không lặp lại
      title={standalone ? undefined : 'Cảnh báo danh mục'}
      subtitle={
        standalone
          ? undefined
          : 'Nhắc bạn xem lại khi cả danh mục vượt ngưỡng bạn đặt. Đây là lời nhắc, không phải khuyến nghị mua bán.'
      }
      noPadding
      data-testid="portfolio-alerts"
      action={
        !standalone && (
          <Link component={RouterLink} to="/portfolio-alerts" variant="body2">
            Mở trang
          </Link>
        )
      }
    >
      {loadError && (
        <Alert severity="error" sx={{ m: 2 }}>
          {loadError}
        </Alert>
      )}
      {!settings || !drafts || !saved ? (
        !loadError && (
          <Box sx={{ p: 3, display: 'grid', placeItems: 'center' }}>
            <CircularProgress size={24} />
          </Box>
        )
      ) : (
        <>
          {KINDS.map((kind) => (
            <RuleRow
              key={kind}
              kind={kind}
              draft={drafts[kind]}
              dirty={!sameDraft(kind, drafts[kind], saved[kind])}
              rule={settings.rules.find((r) => r.kind === kind)!}
              settings={settings}
              preview={preview?.items.find((i) => i.kind === kind) ?? null}
              previewing={previewing}
              error={rowError[kind] ?? (drafts[kind].targets || kind !== 'drift' ? draftError(kind, drafts[kind], settings) : null)}
              saving={saving === kind}
              onChange={(p) => change(kind, p)}
              onToggle={(v) => toggle(kind, v)}
              onSave={() => void save(kind, drafts[kind])}
              onReset={() => reset(kind)}
            />
          ))}
          <Typography variant="caption" color="text.secondary" component="p" sx={{ px: 2, py: 1.5, m: 0 }}>
            Kiểm tra mỗi 30 phút trong phiên và lúc 15:20 hằng ngày; giảm từ đỉnh chỉ kiểm tra sau phiên. Khi giá thiếu
            hoặc cũ, ứng dụng bỏ qua lượt đó thay vì báo. Thông báo luôn có trong app; gửi qua Telegram / thông báo đẩy
            khi bạn bật mục “Tình trạng danh mục” ở phần kênh nhận tin.
          </Typography>
        </>
      )}
    </Panel>
  )
}
