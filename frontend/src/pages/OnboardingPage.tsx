import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Container from '@mui/material/Container'
import Divider from '@mui/material/Divider'
import LinearProgress from '@mui/material/LinearProgress'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Step from '@mui/material/Step'
import StepLabel from '@mui/material/StepLabel'
import Stepper from '@mui/material/Stepper'
import Typography from '@mui/material/Typography'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { HERO_SX } from '../components/home/HomeBlocks'
import HoldingForm from '../components/portfolio/HoldingForm'
import { Logo } from '../components/ui'
import { getQuiz, submitQuiz } from '../api/auth'
import { getPortfolio } from '../api/portfolio'
import { useAuth } from '../lib/auth-context'
import { safeNext, skipOnboarding } from '../lib/nav'
import { track } from '../lib/track'
import { fmtVndShort } from '../lib/format'
import { RISK_LABEL, type InvestorProfile, type Portfolio, type QuizQuestion } from '../lib/types'

const RISK_DESC: Record<string, string> = {
  conservative:
    'Bạn ưu tiên giữ tiền hơn kiếm lời nhanh. Cố vấn hướng tới tài sản ít biến động và cảnh báo sớm khi rủi ro tăng.',
  balanced:
    'Bạn chấp nhận biến động vừa phải để tăng trưởng đều. Cố vấn giúp giữ danh mục cân đối cổ phiếu, vàng, tiền gửi.',
  growth:
    'Bạn chịu biến động lớn để đổi lấy tăng trưởng dài hạn. Cố vấn tập trung vào chất lượng doanh nghiệp và định giá.',
  aggressive:
    'Bạn chịu rủi ro cao. Cố vấn nhắc kỷ luật: tỷ trọng tối đa mỗi mã, điểm cắt lỗ, không dùng tiền sinh hoạt.',
}

const STEPS = ['Khảo sát khẩu vị', 'Kết quả', 'Tài sản đang có']

export default function OnboardingPage() {
  const { me, refresh } = useAuth()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const [quiz, setQuiz] = useState<QuizQuestion[]>([])
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [profile, setProfile] = useState<InvestorProfile | null>(null)
  const [stage, setStage] = useState(0)
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getQuiz().then(setQuiz)
  }, [])

  const loadPortfolio = () => getPortfolio().then(setPortfolio)

  const choose = async (qid: string, value: string) => {
    const nextAnswers = { ...answers, [qid]: value }
    setAnswers(nextAnswers)
    if (step < quiz.length - 1) {
      setStep(step + 1)
      return
    }
    try {
      setProfile(await submitQuiz(nextAnswers))
      await loadPortfolio()
      setStage(1)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const finish = async () => {
    await refresh()
    nav(next, { replace: true })
  }

  /** Chưa muốn làm khảo sát: vào app luôn; cố vấn sẽ nói rõ là chưa biết khẩu vị rủi ro của bạn */
  const later = () => {
    skipOnboarding()
    track('onboarding_skipped')
    nav(next, { replace: true })
  }

  const q = quiz[step]

  return (
    <Box sx={{ minHeight: '100vh', py: { xs: 3, md: 6 } }}>
      <Container maxWidth="md" sx={{ maxWidth: { md: 760 } }}>
        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', mb: { xs: 2, md: 4 } }}>
          <Logo size={28} />
          <Typography sx={{ fontWeight: 700 }}>Đồng Hành Đầu Tư</Typography>
        </Stack>
        <Stepper activeStep={stage} alternativeLabel sx={{ mb: { xs: 2.5, md: 4 }, '& .MuiStepLabel-label': { fontSize: { xs: 12, md: 14 } } }}>
          {STEPS.map((s) => (
            <Step key={s}>
              <StepLabel>{s}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {stage === 0 && (
          <Paper sx={{ p: { xs: 2.5, sm: 4 } }}>
            {!q ? (
              <LinearProgress />
            ) : (
              <>
                <Typography variant="body2" color="text.secondary">
                  Chào {me?.name}. Trả lời thật lòng, không có đáp án sai.
                </Typography>
                <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mt: 3 }}>
                  <LinearProgress
                    variant="determinate"
                    value={(step / quiz.length) * 100}
                    sx={{ flex: 1, height: 6, borderRadius: 3 }}
                  />
                  <Typography variant="caption" color="text.secondary" className="num">
                    {step + 1}/{quiz.length}
                  </Typography>
                </Stack>
                <Typography component="h1" sx={{ mt: 3, fontSize: { xs: 18, md: 22 }, fontWeight: 700, lineHeight: 1.35, letterSpacing: '-0.01em' }}>
                  {q.question}
                </Typography>
                {q.hint && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {q.hint}
                  </Typography>
                )}
                <Stack spacing={1.25} sx={{ mt: 2.5 }}>
                  {q.options.map((o) => {
                    const selected = answers[q.id] === o.value
                    return (
                      <Button
                        key={o.value}
                        variant="outlined"
                        color={selected ? 'primary' : 'inherit'}
                        onClick={() => void choose(q.id, o.value)}
                        sx={{
                          justifyContent: 'flex-start',
                          textAlign: 'left',
                          py: 1.5,
                          px: 2,
                          minHeight: 52,
                          borderRadius: '12px',
                          fontWeight: 500,
                          borderColor: selected ? undefined : 'divider',
                          bgcolor: selected ? 'action.selected' : undefined,
                        }}
                      >
                        {o.label}
                      </Button>
                    )
                  })}
                </Stack>
                <Stack direction="row" sx={{ mt: 2, justifyContent: 'space-between' }}>
                  {step > 0 ? <Button onClick={() => setStep(step - 1)}>Câu trước</Button> : <span />}
                  {!me?.onboarded && (
                    <Button color="inherit" onClick={later}>
                      Để sau
                    </Button>
                  )}
                </Stack>
                {error && (
                  <Alert severity="error" sx={{ mt: 2 }}>
                    {error}
                  </Alert>
                )}
              </>
            )}
          </Paper>
        )}

        {stage === 1 && profile && (
          <Paper sx={{ ...HERO_SX, border: 'none', borderRadius: '20px', p: { xs: 2.5, sm: 4 } }}>
            <Typography sx={{ fontSize: 13, color: 'hero.muted' }}>Kiểu nhà đầu tư của bạn</Typography>
            <Stack useFlexGap direction="row" spacing={2} sx={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
              <Typography component="h1" sx={{ color: 'hero.gold', fontSize: { xs: 28, md: 34 }, fontWeight: 700, letterSpacing: '-0.02em' }}>
                {RISK_LABEL[profile.riskType]}
              </Typography>
              <Chip size="small" label={`Điểm chịu rủi ro ${profile.riskScore}/100`} sx={{ bgcolor: 'rgba(255,255,255,0.12)', color: 'hero.ink' }} />
            </Stack>
            <Typography sx={{ mt: 2, color: 'hero.ink' }}>{RISK_DESC[profile.riskType]}</Typography>
            {profile.fomoProne && (
              <Alert severity="warning" variant="outlined" sx={{ mt: 2, color: 'hero.ink', '& .MuiAlert-icon': { color: 'hero.gold' } }}>
                Bạn hay mua theo đám đông. Cố vấn sẽ hỏi lại lý do khi bạn mua mã đang tăng nóng.
              </Alert>
            )}
            <Stack direction="row" sx={{ mt: 3, justifyContent: 'flex-end' }}>
              <Button
                variant="contained"
                onClick={() => setStage(2)}
                sx={{ borderRadius: 99, px: 3, bgcolor: 'hero.gold', color: 'hero.bg', '&:hover': { bgcolor: 'hero.gold', opacity: 0.9 } }}
              >
                Tiếp tục
              </Button>
            </Stack>
          </Paper>
        )}

        {stage === 2 && (
          <Paper sx={{ p: { xs: 2.5, sm: 4 } }}>
            <Typography component="h1" sx={{ fontSize: 20, fontWeight: 700 }}>
              Bạn đang nắm giữ những gì?
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 3 }}>
              Nhập cổ phiếu, vàng, coin, tiền mặt. Bỏ qua và nhập sau cũng được.
            </Typography>
            <HoldingForm onDone={() => void loadPortfolio()} />
            {portfolio && portfolio.holdings.length > 0 && (
              <>
                <Divider sx={{ my: 3 }} />
                <Stack spacing={1}>
                  {portfolio.holdings.map((h) => (
                    <Stack key={h.id} direction="row" sx={{ justifyContent: 'space-between' }}>
                      <Typography variant="body2">
                        <b>{h.displayName}</b>{' '}
                        <Typography component="span" variant="body2" color="text.secondary">
                          · {h.typeLabel}
                        </Typography>
                      </Typography>
                      <Typography variant="body2" className="num">
                        {fmtVndShort(h.marketValue ?? h.costValue)}
                      </Typography>
                    </Stack>
                  ))}
                  <Stack direction="row" sx={{ justifyContent: 'space-between', pt: 1 }}>
                    <Typography variant="subtitle2">Tổng</Typography>
                    <Typography variant="subtitle2" className="num">
                      {portfolio.totalIsEstimate ? '≈ ' : ''}
                      {fmtVndShort(portfolio.totalValue)}
                    </Typography>
                  </Stack>
                </Stack>
              </>
            )}
            <Stack direction="row" spacing={1} sx={{ mt: 3, justifyContent: 'flex-end' }}>
              <Button onClick={() => setStage(1)}>Quay lại</Button>
              <Button variant="contained" onClick={() => void finish()} sx={{ borderRadius: 99, px: 3 }}>
                {portfolio?.holdings.length ? 'Hoàn tất' : 'Bỏ qua, nhập sau'}
              </Button>
            </Stack>
          </Paper>
        )}
      </Container>
    </Box>
  )
}
