import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined'
import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import LinearProgress from '@mui/material/LinearProgress'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { ChatMsg as Msg } from '../../lib/chat'
import type { AdvisorFeedbackReason } from '../../lib/types'
import FeedbackButton from './FeedbackButton'
import Markdown from './Markdown'
import VerificationBox from './VerificationBox'

/** Một tin trong cuộc trò chuyện: câu hỏi của người dùng, hoặc câu trả lời (công cụ đã dùng, suy luận, nguồn, đối chiếu, phản hồi) */
export default function Message({
  m,
  conversationId,
  onFeedback,
}: {
  m: Msg
  conversationId?: string
  onFeedback: (answerId: string, reason: AdvisorFeedbackReason) => void
}) {
  if (m.role === 'user') {
    return (
      <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>
        <Box
          sx={{
            maxWidth: '85%',
            px: 2,
            py: 1.25,
            borderRadius: 2,
            borderBottomRightRadius: 4,
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            whiteSpace: 'pre-wrap',
          }}
        >
          <Typography variant="body2">{m.text}</Typography>
        </Box>
      </Stack>
    )
  }
  const waiting = m.streaming && !m.text
  return (
    <Box>
      {m.tools.length > 0 && (
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75, mb: 1.5 }}>
          {m.tools.map((t, i) => (
            <Chip
              key={i}
              size="small"
              variant="outlined"
              icon={<CheckCircleOutlined sx={{ fontSize: 16 }} />}
              label={t}
              sx={{ color: 'text.secondary' }}
            />
          ))}
        </Stack>
      )}
      {m.thinking && (
        <Accordion disableGutters elevation={0} sx={{ mb: 1.5, '&:before': { display: 'none' } }}>
          <AccordionSummary sx={{ minHeight: 36, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
            <Typography variant="caption" color="text.secondary">
              Cách cố vấn suy luận
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>
              {m.thinking}
            </Typography>
          </AccordionDetails>
        </Accordion>
      )}
      {waiting && (
        <Box sx={{ maxWidth: 320 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Đang xem dữ liệu và phân tích…
          </Typography>
          <LinearProgress />
        </Box>
      )}
      {m.text && <Markdown text={m.text} />}
      {m.sources.length > 0 && !m.streaming && (
        <Accordion disableGutters elevation={0} sx={{ mt: 1.5, '&:before': { display: 'none' } }}>
          <AccordionSummary sx={{ minHeight: 36, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
            <Typography variant="caption" color="text.secondary">
              {m.sources.length} nguồn web đã tham khảo
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={0.5}>
              {m.sources.map((s) => (
                <Link key={s.url} href={s.url} target="_blank" rel="noreferrer" variant="caption">
                  {s.title}
                </Link>
              ))}
            </Stack>
          </AccordionDetails>
        </Accordion>
      )}
      {m.verifying && (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 1.5 }}>
          <LinearProgress sx={{ width: 120 }} />
          <Typography variant="caption" color="text.secondary">
            Đang đối chiếu câu trả lời với nguồn dữ liệu…
          </Typography>
        </Stack>
      )}
      {m.verification && <VerificationBox v={m.verification} />}
      {m.error && (
        <Alert severity="error" sx={{ mt: 1.5 }}>
          {m.error}
        </Alert>
      )}
      {m.id && conversationId && !m.streaming && (
        <FeedbackButton
          conversationId={conversationId}
          answerId={m.id}
          sent={m.feedback}
          onSent={(r) => onFeedback(m.id!, r)}
        />
      )}
    </Box>
  )
}
