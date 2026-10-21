import HistoryOutlined from '@mui/icons-material/HistoryOutlined'
import AddIcon from '@mui/icons-material/Add'
import ArrowDownward from '@mui/icons-material/ArrowDownward'
import ArrowUpward from '@mui/icons-material/ArrowUpward'
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined'
import DeleteOutlined from '@mui/icons-material/DeleteOutlined'
import FlagOutlined from '@mui/icons-material/FlagOutlined'
import StopCircleOutlined from '@mui/icons-material/StopCircleOutlined'
import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import FormControlLabel from '@mui/material/FormControlLabel'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import DialogTitle from '@mui/material/DialogTitle'
import Grid from '@mui/material/Grid'
import IconButton from '@mui/material/IconButton'
import LinearProgress from '@mui/material/LinearProgress'
import Link from '@mui/material/Link'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Drawer from '@mui/material/Drawer'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { useCallback, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Link as RouterLink, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import remarkGfm from 'remark-gfm'
import { api, del, post } from '../lib/api'
import { type ChatMsg as Msg } from '../lib/chat'
import { useChat } from '../lib/chat-context'
import { timeAgo } from '../lib/format'
import type { AdvisorConversation, AdvisorConversationSummary, AdvisorFeedbackReason, AdvisorStatus, Verification } from '../lib/types'
import { useIsMobile } from '../lib/useIsMobile'

const SUGGESTIONS = [
  'Nhận xét danh mục hiện tại của tôi và cho tôi lời khuyên',
  'Thị trường hôm nay thế nào? Có gì tôi cần chú ý?',
  'Trong rổ VN30, cổ phiếu ngân hàng nào đáng đầu tư dài hạn nhất lúc này? Vì sao?',
  'Giá vàng SJC đang chênh thế giới bao nhiêu, có nên mua vàng lúc này không?',
  'Tôi có 100 triệu nhàn rỗi, nên phân bổ thế nào cho hợp với tôi?',
  'Bạn bè trong nhóm đang hô một mã, làm sao để biết có nên theo không?',
]

export default function AdvisorPage() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()
  const chat = useChat()
  const mobile = useIsMobile()
  const [historyOpen, setHistoryOpen] = useState(false)
  const [convs, setConvs] = useState<AdvisorConversationSummary[]>([])
  const [loaded, setLoaded] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [removing, setRemoving] = useState<string | null>(null)
  const idRef = useRef(id)
  idRef.current = id

  const active = chat.active
  // Đang xem đúng cuộc trò chuyện của luồng chat chung (kể cả lúc server chưa trả id cho cuộc mới)
  const showingActive =
    !!active && (active.conversationId === id || (!id && active.busy && active.conversationId === undefined))
  const messages = showingActive ? active.messages : loaded
  const busyElsewhere = !!active?.busy && !showingActive
  const busyHere = !!active?.busy && showingActive

  const loadConvs = useCallback(() => api<AdvisorConversationSummary[]>('/advisor/conversations').then(setConvs), [])

  useEffect(() => {
    void loadConvs()
    api<AdvisorStatus>('/advisor/status').then((s) => setEnabled(s.enabled))
  }, [loadConvs])

  // Nối callback của luồng chat chung với trang đang mở; gỡ ra khi rời trang
  useEffect(() => {
    chat.onConversation.current = (cid) => {
      void loadConvs()
      if (!idRef.current) nav(`/advisor/${cid}`, { replace: true })
    }
    chat.onFinished.current = () => void loadConvs()
    return () => {
      chat.onConversation.current = null
      chat.onFinished.current = null
    }
  }, [chat.onConversation, chat.onFinished, loadConvs, nav])

  // Quay lại trang cố vấn trong lúc câu trả lời còn chạy: mở thẳng cuộc trò chuyện đó
  useEffect(() => {
    if (!id && active?.busy && active.conversationId) nav(`/advisor/${active.conversationId}`, { replace: true })
  }, [id, active?.busy, active?.conversationId, nav])

  useEffect(() => {
    if (!id) {
      setLoaded([])
      return
    }
    if (showingActive) return
    api<AdvisorConversation>(`/advisor/conversations/${id}`)
      .then((c) => setLoaded(c.messages))
      .catch(() => nav('/advisor'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Chỉ tự cuộn theo chữ đang sinh khi người dùng đang ở cuối khung chat.
  // Cuộn lên để đọc thì giữ nguyên vị trí, hiện nút "Xuống cuối".
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickRef = useRef(true)
  const [atBottom, setAtBottom] = useState(true)

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
    stickRef.current = true
    setAtBottom(true)
  }, [])

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    stickRef.current = near
    setAtBottom(near)
  }

  useEffect(() => {
    if (stickRef.current) scrollToBottom()
  }, [messages, scrollToBottom])

  // Mở cuộc trò chuyện khác: luôn xuống cuối
  useEffect(() => {
    stickRef.current = true
  }, [id])

  const markFeedback = useCallback(
    (answerId: string, reason: AdvisorFeedbackReason) => {
      const f = (m: Msg) => (m.id === answerId ? { ...m, feedback: reason } : m)
      setLoaded((ms) => ms.map(f))
      chat.patchMessage(answerId, f)
    },
    [chat],
  )

  const send = useCallback(
    (text: string) => {
      if (!text.trim() || active?.busy) return
      setInput('')
      stickRef.current = true
      void chat.send(text, id, messages)
    },
    [active?.busy, chat, id, messages],
  )

  // Câu hỏi truyền qua ?q= từ các trang khác (cổ phiếu, thông báo, danh mục)
  useEffect(() => {
    const q = params.get('q')
    if (!q || id) return
    setParams({}, { replace: true })
    // Đang có câu trả lời khác chạy thì để câu hỏi sẵn trong ô nhập, không gửi chồng
    if (active?.busy) setInput(q)
    else send(q)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, id])

  const confirmRemove = async () => {
    if (!removing) return
    await del(`/advisor/conversations/${removing}`)
    if (removing === id) nav('/advisor')
    setRemoving(null)
    void loadConvs()
  }

  const conversationList = (
          <List dense sx={{ flex: 1, overflowY: 'auto', py: 0.5 }}>
            {convs.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                Chưa có cuộc trò chuyện nào.
              </Typography>
            )}
            {convs.map((c) => (
              <ListItemButton
                key={c.id}
                selected={c.id === id}
                component={RouterLink}
                to={`/advisor/${c.id}`}
                onClick={() => setHistoryOpen(false)}
                sx={{ mx: 0.75, borderRadius: 1, '&:hover .del': { opacity: 1 } }}
              >
                <ListItemText
                  primary={c.title}
                  secondary={timeAgo(c.updatedAt)}
                  slotProps={{ primary: { noWrap: true, variant: 'body2' } }}
                />
                <IconButton
                  className="del"
                  size="small"
                  sx={{ opacity: { xs: 1, md: 0 }, ml: 0.5 }}
                  onClick={(e) => {
                    e.preventDefault()
                    setRemoving(c.id)
                  }}
                >
                  <DeleteOutlined fontSize="small" />
                </IconButton>
              </ListItemButton>
            ))}
          </List>
  )

  return (
    <Grid
      container
      spacing={2.5}
      sx={{
        // Điện thoại: khung chat vừa màn hình (trừ thanh trên, thanh đáy, vùng an toàn) để ô nhập luôn hiện
        height: {
          xs: 'calc(100dvh - 148px - env(safe-area-inset-top) - env(safe-area-inset-bottom))',
          md: 'calc(100vh - 170px)',
        },
        minHeight: { md: 540 },
      }}
    >
      <Grid size={{ xs: 12, md: 3 }} sx={{ display: { xs: 'none', md: 'block' }, height: '100%' }}>
        <Paper sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
            <Button fullWidth variant="contained" startIcon={<AddIcon />} onClick={() => nav('/advisor')}>
              Cuộc trò chuyện mới
            </Button>
          </Box>
          {conversationList}
        </Paper>
      </Grid>

      <Grid size={{ xs: 12, md: 9 }} sx={{ height: '100%' }}>
        <Paper sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: { md: 540 } }}>
          {mobile && (
            <Stack
              direction="row"
              spacing={1}
              sx={{ px: 1, py: 0.5, borderBottom: 1, borderColor: 'divider', alignItems: 'center' }}
            >
              <Button size="small" startIcon={<HistoryOutlined />} onClick={() => setHistoryOpen(true)}>
                Lịch sử
              </Button>
              <Box sx={{ flex: 1 }} />
              <Button size="small" startIcon={<AddIcon />} onClick={() => nav('/advisor')}>
                Mới
              </Button>
            </Stack>
          )}
          <Box sx={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {!atBottom && messages.length > 0 && (
              <Button
                size="small"
                variant="contained"
                color="inherit"
                startIcon={<ArrowDownward fontSize="small" />}
                onClick={() => scrollToBottom(true)}
                sx={{
                  position: 'absolute',
                  bottom: 12,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  zIndex: 2,
                  bgcolor: 'background.paper',
                  border: 1,
                  borderColor: 'divider',
                  boxShadow: 2,
                }}
              >
                {busyHere ? 'Đang trả lời · xuống cuối' : 'Xuống cuối'}
              </Button>
            )}
            <Box ref={scrollRef} onScroll={onScroll} sx={{ flex: 1, overflowY: 'auto', p: { xs: 2, sm: 3 } }}>
              <Box sx={{ maxWidth: 820, mx: 'auto' }}>
                {!enabled && (
                  <Alert severity="warning" sx={{ mb: 2 }}>
                    Cố vấn chưa được bật: cần cấu hình <code>LLM_API_KEY</code> trong <code>backend/.env</code> rồi khởi
                    động lại backend.
                  </Alert>
                )}
                {busyElsewhere && active?.conversationId && (
                  <Alert severity="info" sx={{ mb: 2 }}>
                    Cố vấn đang trả lời ở{' '}
                    <Link component={RouterLink} to={`/advisor/${active.conversationId}`}>
                      một cuộc trò chuyện khác
                    </Link>
                    . Đợi trả lời xong rồi hỏi tiếp nhé.
                  </Alert>
                )}
                {messages.length === 0 ? (
                  <Box sx={{ py: { xs: 2, md: 6 } }}>
                    <Typography variant="h5">Hỏi cố vấn của bạn</Typography>
                    <Typography color="text.secondary" sx={{ mt: 1, maxWidth: 620 }}>
                      Cố vấn đọc hồ sơ, danh mục của bạn và dữ liệu thị trường thật; mọi nhận định đều kèm nguồn. Không
                      hô mã, không hứa lãi — chỉ giúp bạn quyết định tỉnh táo hơn.
                    </Typography>
                    <Grid container spacing={1.5} sx={{ mt: 3 }}>
                      {SUGGESTIONS.map((s) => (
                        <Grid key={s} size={{ xs: 12, sm: 6 }}>
                          <Button
                            fullWidth
                            variant="outlined"
                            color="inherit"
                            disabled={!!active?.busy}
                            onClick={() => send(s)}
                            sx={{
                              justifyContent: 'flex-start',
                              textAlign: 'left',
                              fontWeight: 400,
                              py: 1.5,
                              borderColor: 'divider',
                              height: '100%',
                            }}
                          >
                            {s}
                          </Button>
                        </Grid>
                      ))}
                    </Grid>
                  </Box>
                ) : (
                  <Stack spacing={3}>
                    {messages.map((m, i) => (
                      <Message key={i} m={m} conversationId={id} onFeedback={markFeedback} />
                    ))}
                  </Stack>
                )}
              </Box>
            </Box>
          </Box>
          <Box
            component="form"
            onSubmit={(e) => {
              e.preventDefault()
              send(input)
            }}
            sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}
          >
            <Stack direction="row" spacing={1} sx={{ maxWidth: 820, mx: 'auto', alignItems: 'flex-end' }}>
              <TextField
                fullWidth
                multiline
                maxRows={6}
                size="small"
                placeholder="VD: Có nên mua thêm HPG lúc này không?"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    send(input)
                  }
                }}
              />
              {busyHere ? (
                <Tooltip title="Dừng trả lời">
                  <IconButton color="primary" onClick={chat.stop}>
                    <StopCircleOutlined />
                  </IconButton>
                </Tooltip>
              ) : (
                <Button
                  type="submit"
                  variant="contained"
                  disabled={!input.trim() || busyElsewhere}
                  sx={{ minWidth: 44, px: 1.5, height: 40 }}
                  aria-label="Gửi"
                >
                  <ArrowUpward fontSize="small" />
                </Button>
              )}
            </Stack>
          </Box>
        </Paper>
      </Grid>

      <Drawer
        anchor="bottom"
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        slotProps={{
          paper: { sx: { maxHeight: '75vh', borderTopLeftRadius: 16, borderTopRightRadius: 16, pb: 'env(safe-area-inset-bottom)' } },
        }}
      >
        <Typography variant="subtitle2" sx={{ px: 2, pt: 2, pb: 1 }}>
          Cuộc trò chuyện
        </Typography>
        {conversationList}
      </Drawer>

      <Dialog open={!!removing} onClose={() => setRemoving(null)}>
        <DialogTitle>Xoá cuộc trò chuyện này?</DialogTitle>
        <DialogActions>
          <Button onClick={() => setRemoving(null)}>Huỷ</Button>
          <Button color="error" variant="contained" onClick={() => void confirmRemove()}>
            Xoá
          </Button>
        </DialogActions>
      </Dialog>
    </Grid>
  )
}

function Message({
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

/** Hiển thị markdown của cố vấn bằng typography của theme */
function Markdown({ text }: { text: string }) {
  return (
    <Box
      sx={(t) => ({
        fontSize: 14.5,
        lineHeight: 1.7,
        color: 'text.primary',
        '& h1, & h2, & h3': { fontWeight: 700, lineHeight: 1.3, mt: 2.5, mb: 1 },
        '& h1': { fontSize: 20 },
        '& h2': { fontSize: 18 },
        '& h3': { fontSize: 16 },
        '& > :first-of-type': { mt: 0 },
        '& p': { my: 1 },
        '& ul, & ol': { pl: 3, my: 1 },
        '& li': { my: 0.5 },
        '& strong': { fontWeight: 700 },
        '& a': { color: 'primary.main' },
        '& hr': { border: 0, borderTop: 1, borderColor: 'divider', my: 2 },
        '& blockquote': { borderLeft: 3, borderColor: 'primary.main', pl: 2, ml: 0, color: 'text.secondary' },
        '& code': { fontSize: 13, px: 0.5, borderRadius: 0.5, bgcolor: 'action.hover' },
        '& table': {
          display: 'block',
          overflowX: 'auto',
          borderCollapse: 'collapse',
          my: 1.5,
          fontSize: 13.5,
          fontVariantNumeric: 'tabular-nums',
        },
        '& th, & td': { border: `1px solid ${t.vars?.palette.divider}`, px: 1.25, py: 0.75, textAlign: 'left' },
        '& th': { bgcolor: 'action.hover', fontWeight: 600 },
      })}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{ a: (props) => <a {...props} target="_blank" rel="noreferrer" /> }}
      >
        {text}
      </ReactMarkdown>
    </Box>
  )
}

const FEEDBACK_REASONS: [AdvisorFeedbackReason, string][] = [
  ['wrong_number', 'Số liệu sai'],
  ['wrong_source', 'Trích sai nguồn / nguồn không đáng tin'],
  ['outdated', 'Thông tin đã cũ'],
  ['bad_advice', 'Lời khuyên không phù hợp với tôi'],
  ['other', 'Lý do khác'],
]

/** Nút "Báo sai" dưới mỗi câu trả lời: phản hồi được lưu lại để bổ sung bộ câu hỏi chấm điểm cố vấn */
function FeedbackButton({
  conversationId,
  answerId,
  sent,
  onSent,
}: {
  conversationId: string
  answerId: string
  sent?: AdvisorFeedbackReason
  onSent: (reason: AdvisorFeedbackReason) => void
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<AdvisorFeedbackReason>('wrong_number')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    setSaving(true)
    setError('')
    try {
      await post('/advisor/feedback', { conversationId, answerId, reason, note: note.trim() || undefined })
      onSent(reason)
      setOpen(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Stack direction="row" sx={{ mt: 1 }}>
        <Button
          size="small"
          color="inherit"
          startIcon={<FlagOutlined sx={{ fontSize: 16 }} />}
          onClick={() => {
            if (sent) setReason(sent)
            setOpen(true)
          }}
          sx={{ color: 'text.secondary', fontWeight: 400, px: 1 }}
        >
          {sent ? 'Đã báo sai — cảm ơn bạn' : 'Báo sai'}
        </Button>
      </Stack>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Câu trả lời này có vấn đề gì?</DialogTitle>
        <DialogContent>
          <RadioGroup value={reason} onChange={(e) => setReason(e.target.value as AdvisorFeedbackReason)}>
            {FEEDBACK_REASONS.map(([v, label]) => (
              <FormControlLabel key={v} value={v} control={<Radio size="small" />} label={label} />
            ))}
          </RadioGroup>
          <TextField
            label="Chi tiết (không bắt buộc)"
            placeholder="Ví dụ: lãi suất tái cấp vốn hiện là 4,5% chứ không phải 6%"
            multiline
            minRows={3}
            fullWidth
            value={note}
            onChange={(e) => setNote(e.target.value)}
            slotProps={{ htmlInput: { maxLength: 2000 } }}
            sx={{ mt: 2 }}
          />
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Huỷ</Button>
          <Button variant="contained" onClick={submit} disabled={saving}>
            Gửi
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

const ISSUE_LABEL: Record<string, string> = {
  misattribution: 'Gán sai nguồn',
  number_mismatch: 'Số liệu lệch nguồn',
  unsupported: 'Chưa có nguồn xác nhận',
}

/** Kết quả tự động đối chiếu câu trả lời với dữ liệu cố vấn đã dùng */
function VerificationBox({ v }: { v: Verification }) {
  if (v.status === 'skipped') return null
  if (v.status === 'verified') {
    return (
      <Chip
        size="small"
        variant="outlined"
        color="success"
        icon={<CheckCircleOutlined sx={{ fontSize: 16 }} />}
        label="Đã đối chiếu với nguồn dữ liệu: không phát hiện sai lệch"
        sx={{ mt: 1.5 }}
      />
    )
  }
  const fixed = v.issues.some((i) => i.type !== 'unsupported')
  return (
    <Alert severity="warning" variant="outlined" sx={{ mt: 1.5 }}>
      <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
        Đối chiếu nguồn phát hiện {v.issues.length} điểm cần lưu ý
        {fixed ? ' — cố vấn đã đính chính bên trên' : ''}
      </Typography>
      <Stack spacing={1}>
        {v.issues.map((i, n) => (
          <Box key={n}>
            <Typography variant="caption" sx={{ fontWeight: 600 }}>
              {ISSUE_LABEL[i.type] ?? i.type}
            </Typography>
            <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
              "{i.quote}"
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {i.explanation}
              {i.correction ? ` Đúng là: ${i.correction}` : ''}
            </Typography>
          </Box>
        ))}
      </Stack>
    </Alert>
  )
}
