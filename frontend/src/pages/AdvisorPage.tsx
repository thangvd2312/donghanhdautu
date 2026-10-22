import AddIcon from '@mui/icons-material/Add'
import ArrowDownward from '@mui/icons-material/ArrowDownward'
import HistoryOutlined from '@mui/icons-material/HistoryOutlined'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogTitle from '@mui/material/DialogTitle'
import Drawer from '@mui/material/Drawer'
import Grid from '@mui/material/Grid'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link as RouterLink, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { deleteConversation, getConversation } from '../api/advisor'
import AdvisorWelcome from '../components/advisor/AdvisorWelcome'
import Composer from '../components/advisor/Composer'
import ConversationList from '../components/advisor/ConversationList'
import Message from '../components/advisor/Message'
import { useAdvisorConversations } from '../hooks/useAdvisorConversations'
import { useChatScroll } from '../hooks/useChatScroll'
import { type ChatMsg as Msg } from '../lib/chat'
import { useChat } from '../lib/chat-context'
import type { AdvisorFeedbackReason } from '../lib/types'
import { useIsMobile } from '../lib/useIsMobile'

export default function AdvisorPage() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()
  const chat = useChat()
  const mobile = useIsMobile()
  const [historyOpen, setHistoryOpen] = useState(false)
  const { convs, enabled, reload: loadConvs } = useAdvisorConversations()
  const [loaded, setLoaded] = useState<Msg[]>([])
  const [input, setInput] = useState('')
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
    getConversation(id)
      .then((c) => setLoaded(c.messages))
      .catch(() => nav('/advisor'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const { scrollRef, stickRef, atBottom, scrollToBottom, onScroll } = useChatScroll(messages, id)

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
    [active?.busy, chat, id, messages, stickRef],
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
    await deleteConversation(removing)
    if (removing === id) nav('/advisor')
    setRemoving(null)
    void loadConvs()
  }

  const conversationList = (
    <ConversationList convs={convs} activeId={id} onSelect={() => setHistoryOpen(false)} onRemove={setRemoving} />
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
                  <AdvisorWelcome busy={!!active?.busy} onPick={send} />
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
          <Composer
            value={input}
            onChange={setInput}
            onSend={send}
            onStop={chat.stop}
            busyHere={busyHere}
            busyElsewhere={busyElsewhere}
          />
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

