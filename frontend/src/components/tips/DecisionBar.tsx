import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getTipPlanDraft } from '../../api/tips'
import { fmtPrice } from '../../lib/format'
import { useMarket } from '../../lib/market-context'
import { DECISION_LABEL, practiceLink, practiceQuantity } from '../../lib/tips'
import type { PlanRequest, TipCheck, TipDecisionRequest } from '../../lib/types'
import PlanEditor from '../plans/PlanEditor'
import Sheet from '../Sheet'
import { BOTTOM_NAV_HEIGHT } from '../layout/navConfig'

const DROPS = [5, 10, 15, 20]
/** 4 nút chia đều một hàng, chữ không xuống dòng (màn 375px: mỗi nút ~78px) */
const btn = { flex: 1, minWidth: 0, minHeight: 44, px: 0.5, fontSize: 14, whiteSpace: 'nowrap' } as const

/**
 * Thanh quyết định dính đáy màn hình: Bỏ qua · Theo dõi · Viết kế hoạch trước · Thử bằng tiền ảo.
 * Không có nút mua: app không đặt lệnh và không ghi sổ giao dịch thay người dùng.
 */
export default function DecisionBar({
  tip,
  saving,
  decide,
}: {
  tip: TipCheck
  saving: boolean
  decide: (body: TipDecisionRequest) => Promise<TipCheck>
}) {
  const nav = useNavigate()
  const { snapshot } = useMarket()
  const [watchOpen, setWatchOpen] = useState(false)
  const [drop, setDrop] = useState(10)
  const [draft, setDraft] = useState<Partial<PlanRequest> | null>(null)
  const [toast, setToast] = useState('')
  const [error, setError] = useState('')

  const act = async (body: TipDecisionRequest, done: string) => {
    setError('')
    try {
      await decide(body)
      setToast(done)
      return true
    } catch (e) {
      setError((e as Error).message)
      return false
    }
  }
  const openPlan = async () => {
    setError('')
    try {
      setDraft(await getTipPlanDraft(tip.id))
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const practice = async () => {
    const qty = practiceQuantity(tip.assetType, tip.personal?.amountVnd ?? null, tip.priceAtCheck, snapshot?.usdt?.mid ?? null)
    if (await act({ decision: 'practice' }, '')) nav(practiceLink(tip.assetType, tip.displayName, qty))
  }
  const dropPrice = tip.priceAtCheck !== null ? tip.priceAtCheck * (1 - drop / 100) : null

  return (
    <>
      <Paper
        elevation={6}
        sx={{
          position: 'sticky',
          bottom: { xs: `calc(${BOTTOM_NAV_HEIGHT + 8}px + env(safe-area-inset-bottom))`, md: 16 },
          zIndex: 2,
          p: 1.25,
          borderRadius: 3,
        }}
      >
        <Typography variant="caption" color="text.secondary" component="div" sx={{ px: 0.5, mb: 0.75 }}>
          {tip.decision ? `Bạn đã chọn: ${DECISION_LABEL[tip.decision]}. Có thể đổi lại.` : 'Bạn quyết định thế nào?'}
        </Typography>
        <Stack direction="row" spacing={0.75}>
          <Button
            variant={tip.decision === 'ignore' ? 'contained' : 'outlined'}
            color="inherit"
            sx={btn}
            disabled={saving}
            onClick={() => void act({ decision: 'ignore' }, 'Đã ghi: bỏ qua lời khuyên này')}
          >
            Bỏ qua
          </Button>
          <Button variant={tip.decision === 'watch' ? 'contained' : 'outlined'} sx={btn} disabled={saving} onClick={() => setWatchOpen(true)}>
            Theo dõi
          </Button>
          <Button
            variant={tip.decision === 'plan' ? 'contained' : 'outlined'}
            sx={btn}
            aria-label="Viết kế hoạch trước khi mua"
            disabled={saving}
            onClick={() => void openPlan()}
          >
            Kế hoạch
          </Button>
          <Button
            variant={tip.decision === 'practice' ? 'contained' : 'outlined'}
            sx={btn}
            aria-label="Thử bằng tiền ảo"
            disabled={saving}
            onClick={() => void practice()}
          >
            Tiền ảo
          </Button>
        </Stack>
        {error && (
          <Alert severity="error" sx={{ mt: 1 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}
      </Paper>

      <Sheet open={watchOpen} onClose={() => setWatchOpen(false)} label={`Theo dõi ${tip.displayName}`}>
        <Typography variant="body2" sx={{ mb: 1.5 }}>
          Thêm {tip.displayName} vào danh sách theo dõi và báo cho bạn khi giá giảm so với lúc soi — thường là lúc
          bình tĩnh hơn để xem lại.
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Báo khi giảm
        </Typography>
        <ToggleButtonGroup exclusive fullWidth value={drop} onChange={(_, v: number | null) => v && setDrop(v)} sx={{ mt: 0.5, mb: 1 }}>
          {DROPS.map((d) => (
            <ToggleButton key={d} value={d} sx={{ minHeight: 44 }}>
              {d}%
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        {dropPrice !== null && (
          <Typography variant="body2" className="num" sx={{ mb: 2 }}>
            Mốc báo: khoảng {fmtPrice(dropPrice, tip.currency)}
          </Typography>
        )}
        <Button
          fullWidth
          variant="contained"
          disabled={saving}
          sx={{ minHeight: 48 }}
          onClick={async () => {
            if (await act({ decision: 'watch', dropPct: drop }, `Đã theo dõi ${tip.displayName} và đặt cảnh báo giá`)) setWatchOpen(false)
          }}
        >
          Theo dõi và đặt cảnh báo
        </Button>
      </Sheet>

      <PlanEditor
        open={!!draft}
        onClose={() => setDraft(null)}
        fixed={{ assetType: tip.assetType, symbol: tip.symbol, label: tip.displayName }}
        initial={draft}
        onSaved={(plan) => {
          setDraft(null)
          void act({ decision: 'plan', planId: plan.id }, 'Đã lưu kế hoạch và gắn với phiếu soi')
        }}
      />

      <Snackbar
        open={!!toast}
        autoHideDuration={3000}
        onClose={() => setToast('')}
        message={toast}
        sx={{ bottom: { xs: `calc(${BOTTOM_NAV_HEIGHT + 12}px + env(safe-area-inset-bottom))`, md: 24 } }}
      />
    </>
  )
}
