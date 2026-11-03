import ForumOutlined from '@mui/icons-material/ForumOutlined'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import LinearProgress from '@mui/material/LinearProgress'
import Link from '@mui/material/Link'
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
import { PageGrid, PageHeader, StatTiles } from '../components/page'
import { Panel } from '../components/ui'
import { changeColor, fmtDate, fmtPct, fmtPrice } from '../lib/format'
import { HOT } from '../lib/tips'

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

  const hot = tip.hotLevel ? HOT[tip.hotLevel] : null

  return (
    <Stack spacing={2.5}>
      <Link component={RouterLink} to="/tips" variant="body2" underline="hover" sx={{ alignSelf: 'flex-start' }}>
        ← Sổ lời khuyên
      </Link>
      <PageHeader
        eyebrow="Hành động"
        titleOnMobile
        title={
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <AssetAvatar assetType={tip.assetType} symbol={tip.symbol} size={44} />
            <Box component="span" sx={{ minWidth: 0 }}>
              <Link component={RouterLink} to={tip.link} underline="hover" color="inherit">
                {tip.displayName}
              </Link>
            </Box>
          </Stack>
        }
        description={
          <>
            Soi {fmtDate(tip.createdAt)}
            {tip.priceAtCheck !== null && ` · giá lúc soi ${fmtPrice(tip.priceAtCheck, tip.currency)}`}
          </>
        }
        actions={tip.boughtAt ? <Chip size="small" color="warning" label="Đã mua theo" /> : undefined}
      />

      {done && (
        <StatTiles
          items={[
            { label: 'Mức nóng', value: tip.score ?? '—', hint: hot?.label, color: hot?.color },
            { label: 'Giá lúc soi', value: fmtPrice(tip.priceAtCheck, tip.currency) },
            { label: 'Giá hiện tại', value: fmtPrice(tip.price.value, tip.currency) },
            {
              label: 'Thay đổi từ lúc soi',
              value: tip.changeSinceCheckPct === null ? '—' : fmtPct(tip.changeSinceCheckPct, 1),
              color: tip.changeSinceCheckPct === null ? undefined : changeColor(tip.changeSinceCheckPct),
            },
          ]}
        />
      )}

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
        <Panel role="status" aria-live="polite" title={`Đang soi ${tip.displayName}…`}>
          <LinearProgress sx={{ mb: 1.5, borderRadius: '4px' }} />
          {STEPS.map((s, i) => (
            <Typography key={s} variant="body2" color={i <= step ? 'text.primary' : 'text.disabled'} sx={{ py: 0.25 }}>
              {i < step ? '✓' : i === step ? '•' : '○'} {s}
            </Typography>
          ))}
          <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>
            Thường mất 15–60 giây. Có thể rời trang, phiếu vẫn được lưu trong Sổ lời khuyên.
          </Typography>
        </Panel>
      )}
      {!analyzing && !done && error && (
        <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => void reload()}>Soi lại</Button>}>
          {error}
        </Alert>
      )}

      {/* Cột phụ: lời khuyên nói gì + mức nóng (đối tượng được soi); cột chính: dữ liệu, tác động riêng, cố vấn, quyết định */}
      <PageGrid
        asideFirst
        aside={
          <>
            {done && <HotScoreCard tip={tip} />}
            <ClaimsCard tip={tip} />
          </>
        }
      >
        {done && (
          <>
            <PersonalImpact tip={tip} saving={saving} onAmount={setAmount} />
            <DataCard tip={tip} />
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
      </PageGrid>
    </Stack>
  )
}
