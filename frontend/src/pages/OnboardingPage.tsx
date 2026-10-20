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
import { useNavigate } from 'react-router-dom'
import HoldingForm from '../components/HoldingForm'
import { Logo } from '../components/ui'
import { api, put } from '../lib/api'
import { useAuth } from '../lib/auth-context'
import { fmtVndShort } from '../lib/format'
import { RISK_LABEL, type InvestorProfile, type Portfolio, type QuizQuestion } from '../lib/types'

const RISK_DESC: Record<string, string> = {
  conservative:
    'Bạn ưu tiên giữ tiền hơn là kiếm lời nhanh. Cố vấn sẽ hướng bạn tới tài sản ít biến động, cổ phiếu cơ bản vững, và cảnh báo sớm khi rủi ro tăng.',
  balanced:
    'Bạn chấp nhận biến động vừa phải để tài sản tăng trưởng đều. Cố vấn sẽ giúp giữ danh mục cân đối giữa cổ phiếu, vàng và tiền gửi.',
  growth:
    'Bạn sẵn sàng chịu biến động lớn để đổi lấy tăng trưởng dài hạn. Cố vấn sẽ tập trung vào chất lượng doanh nghiệp và định giá hợp lý.',
  aggressive:
    'Bạn chịu rủi ro cao. Cố vấn sẽ đặc biệt nhắc kỷ luật: tỷ trọng tối đa mỗi mã, điểm cắt lỗ, và không dùng tiền cần cho cuộc sống.',
}

const STEPS = ['Khảo sát khẩu vị', 'Kết quả', 'Tài sản đang có']

export default function OnboardingPage() {
  const { me, refresh } = useAuth()
  const nav = useNavigate()
  const [quiz, setQuiz] = useState<QuizQuestion[]>([])
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [profile, setProfile] = useState<InvestorProfile | null>(null)
  const [stage, setStage] = useState(0)
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api<QuizQuestion[]>('/profile/quiz').then(setQuiz)
  }, [])

  const loadPortfolio = () => api<Portfolio>('/portfolio').then(setPortfolio)

  const choose = async (qid: string, value: string) => {
    const next = { ...answers, [qid]: value }
    setAnswers(next)
    if (step < quiz.length - 1) {
      setStep(step + 1)
      return
    }
    try {
      setProfile(await put<InvestorProfile>('/profile', { answers: next }))
      await loadPortfolio()
      setStage(1)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const finish = async () => {
    await refresh()
    nav('/')
  }

  const q = quiz[step]

  return (
    <Box sx={{ minHeight: '100vh', py: { xs: 3, md: 6 } }}>
      <Container maxWidth="md">
        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', mb: 4 }}>
          <Logo size={28} />
          <Typography sx={{ fontWeight: 700 }}>Đồng Hành Đầu Tư</Typography>
        </Stack>
        <Stepper activeStep={stage} alternativeLabel sx={{ mb: 4 }}>
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
                  Chào {me?.name}. Trả lời thật lòng — không có đáp án đúng sai, chỉ có lời khuyên hợp hay không hợp với
                  bạn.
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
                <Typography variant="h6" sx={{ mt: 3 }}>
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
                {step > 0 && (
                  <Button sx={{ mt: 2 }} onClick={() => setStep(step - 1)}>
                    Câu trước
                  </Button>
                )}
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
          <Paper sx={{ p: { xs: 2.5, sm: 4 } }}>
            <Typography variant="overline" color="text.secondary">
              Kiểu nhà đầu tư của bạn
            </Typography>
            <Stack direction="row" spacing={2} sx={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
              <Typography variant="h4" color="primary">
                {RISK_LABEL[profile.riskType]}
              </Typography>
              <Chip size="small" label={`Điểm chịu rủi ro ${profile.riskScore}/100`} />
            </Stack>
            <Typography sx={{ mt: 2 }}>{RISK_DESC[profile.riskType]}</Typography>
            {profile.fomoProne && (
              <Alert severity="warning" sx={{ mt: 2 }}>
                Bạn có xu hướng mua theo đám đông. Cố vấn sẽ chủ động hỏi lại lý do mỗi khi bạn định mua một mã đang tăng
                nóng — không phải làm khó bạn, mà để giữ tiền cho bạn.
              </Alert>
            )}
            <Stack direction="row" sx={{ mt: 3, justifyContent: 'flex-end' }}>
              <Button variant="contained" onClick={() => setStage(2)}>
                Tiếp tục
              </Button>
            </Stack>
          </Paper>
        )}

        {stage === 2 && (
          <Paper sx={{ p: { xs: 2.5, sm: 4 } }}>
            <Typography variant="h6">Bạn đang nắm giữ những gì?</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 3 }}>
              Nhập cổ phiếu, vàng, coin và tiền mặt. Cố vấn dựa vào đây để nhận xét danh mục và báo khi có biến động. Có
              thể bỏ qua và nhập sau ở trang Danh mục.
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
              <Button variant="contained" onClick={() => void finish()}>
                {portfolio?.holdings.length ? 'Hoàn tất' : 'Bỏ qua, nhập sau'}
              </Button>
            </Stack>
          </Paper>
        )}
      </Container>
    </Box>
  )
}
