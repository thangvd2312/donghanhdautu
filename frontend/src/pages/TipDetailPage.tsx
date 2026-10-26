import ForumOutlined from '@mui/icons-material/ForumOutlined'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import LinearProgress from '@mui/material/LinearProgress'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useEffect, useState } from 'react'
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom'
import { createTip, openTipConversation } from '../api/tips'
import AssetAvatar from '../components/AssetAvatar'
import DecisionBar from '../components/tips/DecisionBar'
import PersonalImpact from '../components/tips/PersonalImpact'
import { AdvisorCard, ClaimsCard, DataCard, HotScoreCard, ReviewCard } from '../components/tips/TipReport'
import { useTipCheck } from '../hooks/useTipCheck'
import { fmtDate, fmtPrice } from '../lib/format'

const STEPS = ['Đọc lời khuyên', 'Lấy giá, chỉ báo và báo cáo tài chính', 'Đọc tin 14 ngày qua', 'Cố vấn đối chiếu với dữ liệu']

export default function TipDetailPage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { tip, error, analyzing, saving, reload, setAmount, decide } = useTipCheck(id)
  const [step, setStep] = useState(0)
  const [opening, setOpening] = useState(false)
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    document.title = `Soi lời khuyên${tip ? ` ${tip.displayName}` : ''} · Đồng Hành Đầu Tư`
  }, [tip])
  // Phân tích mất 15–60 giây: báo từng bước để người dùng biết app đang làm gì
  useEffect(() => {
    if (!analyzing) return setStep(0)
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 6000)
    return () => clearInterval(t)
  }, [analyzing])

  if (error && !tip)
    return (
      <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => void reload()}>Thử lại</Button>}>
        {error}
      </Alert>
    )
  if (!tip) return <Skeleton variant="rounded" height={400} />

  const others = tip.claims.candidates.filter((c) => !(c.assetType === tip.assetType && c.symbol === tip.symbol))
  const soiOther = async (symbol: string, assetType: 'stock' | 'crypto') => {
    setActionError('')
    try {
      const t = await createTip({ text: tip.text, sourceName: tip.sourceName ?? undefined, sourceKind: tip.sourceKind ?? undefined, symbol, assetType })
      nav(`/tips/${t.id}`)
    } catch (e) {
      setActionError((e as Error).message)
    }
  }
  const askAdvisor = async () => {
    setOpening(true)
    setActionError('')
    try {
      const { conversationId } = await openTipConversation(tip.id)
      nav(`/advisor/${conversationId}`)
    } catch (e) {
      setActionError((e as Error).message)
      setOpening(false)
    }
  }
  const done = tip.status === 'analyzed'

  return (
    <Stack spacing={2} sx={{ maxWidth: 760, mx: 'auto' }}>
      <Box>
        <Link component={RouterLink} to="/tips" variant="body2" underline="hover">
          ← Sổ lời khuyên
        </Link>
        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', mt: 1 }}>
          <AssetAvatar assetType={tip.assetType} symbol={tip.symbol} size={44} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography component="h1" sx={{ fontWeight: 800, fontSize: 22, lineHeight: 1.2 }} noWrap>
              <Link component={RouterLink} to={tip.link} underline="hover" color="inherit">
                {tip.displayName}
              </Link>
            </Typography>
            <Typography variant="caption" color="text.secondary" component="div" noWrap>
              Soi {fmtDate(tip.createdAt)}
              {tip.priceAtCheck !== null && ` · giá lúc soi ${fmtPrice(tip.priceAtCheck, tip.currency)}`}
            </Typography>
          </Box>
          {tip.boughtAt && <Chip size="small" color="warning" label="Đã mua theo" />}
        </Stack>
      </Box>

      {others.length > 0 && (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Tin còn nhắc:
          </Typography>
          {others.map((c) => (
            <Chip key={`${c.assetType}:${c.symbol}`} label={`Soi ${c.displayName}`} clickable onClick={() => void soiOther(c.symbol, c.assetType)} sx={{ minHeight: 36 }} />
          ))}
        </Stack>
      )}
      {actionError && (
        <Alert severity="error" onClose={() => setActionError('')}>
          {actionError}
        </Alert>
      )}

      {analyzing && (
        <Paper sx={{ p: 2 }} role="status" aria-live="polite">
          <Typography sx={{ fontWeight: 700, mb: 1 }}>Đang soi {tip.displayName}…</Typography>
          <LinearProgress sx={{ mb: 1.5, borderRadius: 1 }} />
          {STEPS.map((s, i) => (
            <Typography key={s} variant="body2" color={i <= step ? 'text.primary' : 'text.disabled'} sx={{ py: 0.25 }}>
              {i < step ? '✓' : i === step ? '•' : '○'} {s}
            </Typography>
          ))}
          <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>
            Thường mất 15–60 giây. Có thể rời trang, phiếu vẫn được lưu trong Sổ lời khuyên.
          </Typography>
        </Paper>
      )}
      {!analyzing && !done && error && (
        <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => void reload()}>Soi lại</Button>}>
          {error}
        </Alert>
      )}

      {done && <HotScoreCard tip={tip} />}
      <ClaimsCard tip={tip} />
      {done && (
        <>
          <DataCard tip={tip} />
          <PersonalImpact tip={tip} saving={saving} onAmount={setAmount} />
          <AdvisorCard
            tip={tip}
            action={
              <Button size="small" startIcon={<ForumOutlined />} disabled={opening} onClick={() => void askAdvisor()} sx={{ minHeight: 36 }}>
                Hỏi tiếp
              </Button>
            }
          />
          {tip.report && !tip.report.verdict && !tip.report.questions.length && (
            <Button variant="outlined" startIcon={<ForumOutlined />} disabled={opening} onClick={() => void askAdvisor()} sx={{ minHeight: 44 }}>
              Hỏi tiếp cố vấn
            </Button>
          )}
          <ReviewCard tip={tip} />
          <DecisionBar tip={tip} saving={saving} decide={decide} />
        </>
      )}
    </Stack>
  )
}
