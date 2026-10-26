import CheckCircleOutline from '@mui/icons-material/CheckCircleOutlineOutlined'
import HelpOutline from '@mui/icons-material/HelpOutlineOutlined'
import ReportProblemOutlined from '@mui/icons-material/ReportProblemOutlined'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useState, type ReactNode } from 'react'
import { fmtDate, fmtPct, fmtPrice } from '../../lib/format'
import { DIRECTION_LABEL, HOT, OUTCOME_LABEL } from '../../lib/tips'
import type { TipCheck, TipReviewResult } from '../../lib/types'
import { KV, Panel } from '../ui'

/** Vòng số mức nóng + từng lý do cộng điểm */
export function HotScoreCard({ tip }: { tip: TipCheck }) {
  if (tip.score === null || !tip.hotLevel) return null
  const hot = HOT[tip.hotLevel]
  const parts = tip.scoreParts.filter((p) => p.points > 0)
  const notes = tip.scoreParts.filter((p) => p.points === 0)
  return (
    <Panel>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <Box
          role="img"
          aria-label={`Mức nóng ${tip.score} trên 100, ${hot.label}`}
          sx={{
            width: 76,
            height: 76,
            borderRadius: '50%',
            flexShrink: 0,
            display: 'grid',
            placeItems: 'center',
            border: 6,
            borderColor: hot.color,
          }}
        >
          <Typography className="num" sx={{ fontWeight: 800, fontSize: 26, lineHeight: 1 }}>
            {tip.score}
          </Typography>
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary" component="div">
            Mức nóng / 100
          </Typography>
          <Typography sx={{ fontWeight: 800, fontSize: 20, color: hot.color, lineHeight: 1.3 }}>{hot.label}</Typography>
          <Typography variant="body2" color="text.secondary">
            {hot.hint}
          </Typography>
        </Box>
      </Stack>
      {(parts.length > 0 || notes.length > 0) && (
        <Stack component="ul" spacing={0.75} sx={{ listStyle: 'none', p: 0, m: 0, mt: 2 }}>
          {parts.map((p) => (
            <Stack component="li" key={p.key} direction="row" spacing={1.25} sx={{ alignItems: 'baseline' }}>
              <Typography className="num" variant="body2" sx={{ fontWeight: 700, color: hot.color, minWidth: 32 }}>
                +{p.points}
              </Typography>
              <Typography variant="body2">
                <b>{p.label}:</b> {p.detail}
              </Typography>
            </Stack>
          ))}
          {notes.map((p) => (
            <Typography component="li" key={p.key} variant="caption" color="text.secondary">
              {p.detail}
            </Typography>
          ))}
        </Stack>
      )}
      <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1.5 }}>
        Điểm tính bằng quy tắc cố định từ giá và nội dung tin, không do AI chấm.
      </Typography>
    </Panel>
  )
}

/** Lời khuyên nói gì + thiếu gì + tin gốc */
export function ClaimsCard({ tip }: { tip: TipCheck }) {
  const [showText, setShowText] = useState(false)
  const c = tip.claims
  const missing = tip.report?.missing ?? []
  return (
    <Panel title="Lời khuyên nói gì" subtitle={tip.sourceName ? `Nguồn: ${tip.sourceName}` : undefined}>
      <KV k="Hướng" v={DIRECTION_LABEL[c.direction]} />
      <KV k="Giá mục tiêu" v={c.targetPrice !== null ? fmtPrice(c.targetPrice, tip.currency) : 'Không nêu'} />
      <KV k="Cắt lỗ" v={c.stopPrice !== null ? fmtPrice(c.stopPrice, tip.currency) : 'Không nêu'} />
      <KV k="Thời hạn" v={c.horizonDays ? `${c.horizonDays} ngày` : 'Không nêu'} />
      {c.reasons.length > 0 && (
        <Box sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Lý do tin đưa ra
          </Typography>
          <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
            {c.reasons.map((r) => (
              <Typography component="li" variant="body2" key={r}>
                {r}
              </Typography>
            ))}
          </Box>
        </Box>
      )}
      {c.promises.length > 0 && (
        <Typography variant="body2" sx={{ mt: 1 }}>
          <Box component="span" sx={{ color: 'error.main', fontWeight: 600 }}>
            Lời hứa:{' '}
          </Box>
          {c.promises.map((p) => `"${p}"`).join(', ')}
        </Typography>
      )}
      {missing.length > 0 && (
        <Alert severity="warning" icon={<ReportProblemOutlined fontSize="inherit" />} sx={{ mt: 1.5 }}>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            Lời khuyên thiếu
          </Typography>
          <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
            {missing.map((m) => (
              <Typography component="li" variant="body2" key={m}>
                {m}
              </Typography>
            ))}
          </Box>
        </Alert>
      )}
      <Link component="button" type="button" variant="body2" onClick={() => setShowText((v) => !v)} sx={{ mt: 1.5, minHeight: 44 }}>
        {showText ? 'Ẩn tin gốc' : 'Xem tin gốc'}
      </Link>
      <Collapse in={showText}>
        <Typography
          variant="body2"
          sx={{ whiteSpace: 'pre-wrap', bgcolor: 'action.hover', borderRadius: 1, p: 1.5, overflowWrap: 'anywhere' }}
        >
          {tip.text}
        </Typography>
      </Collapse>
    </Panel>
  )
}

/** Dữ liệu nói gì: chỉ số thô (luôn có) + các ý AI đã đối chiếu số + điều chưa kiểm chứng được + tin tức */
export function DataCard({ tip, onRetry }: { tip: TipCheck; onRetry?: () => void }) {
  const r = tip.report
  if (!r) return null
  return (
    <Panel title="Dữ liệu nói gì" subtitle={`Giá lúc soi theo ${tip.priceSource ?? 'nguồn giá'}`}>
      {r.facts.length > 0 && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)' }, gap: 1.5, mb: 2 }}>
          {r.facts.map((f) => (
            <Box key={f.label} sx={{ minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary" component="div">
                {f.label}
              </Typography>
              <Typography className="num" variant="body2" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>
                {f.value}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
      {r.ai !== 'ok' && (
        <Alert
          severity={r.ai === 'off' ? 'info' : 'warning'}
          sx={{ mb: 1.5 }}
          action={
            r.ai !== 'off' && onRetry ? (
              <Link component="button" type="button" onClick={onRetry} color="inherit" sx={{ minHeight: 44 }}>
                Soi lại
              </Link>
            ) : undefined
          }
        >
          {r.ai === 'off' ? 'Cố vấn AI đang tắt: phiếu chỉ có số liệu và mức nóng.' : r.aiMessage}
        </Alert>
      )}
      {r.dataSays.length > 0 && (
        <Stack component="ul" spacing={1.25} sx={{ listStyle: 'none', p: 0, m: 0 }}>
          {r.dataSays.map((d) => (
            <Stack component="li" key={d.point} direction="row" spacing={1}>
              <CheckCircleOutline fontSize="small" sx={{ color: 'primary.main', mt: '2px' }} />
              <Box>
                <Typography variant="body2">{d.point}</Typography>
                <Typography variant="caption" color="text.secondary">
                  Nguồn: {d.source}
                </Typography>
              </Box>
            </Stack>
          ))}
        </Stack>
      )}
      {r.unverifiable.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            Chưa kiểm chứng được
          </Typography>
          <Stack component="ul" spacing={0.75} sx={{ listStyle: 'none', p: 0, m: 0, mt: 0.5 }}>
            {r.unverifiable.map((u) => (
              <Stack component="li" key={u} direction="row" spacing={1}>
                <HelpOutline fontSize="small" sx={{ color: 'text.secondary', mt: '2px' }} />
                <Typography variant="body2">{u}</Typography>
              </Stack>
            ))}
          </Stack>
        </Box>
      )}
      {r.news.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            Tin 14 ngày qua
          </Typography>
          {r.news.slice(0, 5).map((n) => (
            <Link key={n.url} href={n.url} target="_blank" rel="noopener noreferrer" variant="body2" sx={{ display: 'block', py: 0.75 }}>
              {n.title}
              <Typography component="span" variant="caption" color="text.secondary">
                {' '}
                · {fmtDate(n.publishedAt)}
              </Typography>
            </Link>
          ))}
        </Box>
      )}
      {r.droppedPoints > 0 && (
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1.5 }}>
          Đã bỏ {r.droppedPoints} ý có con số không khớp dữ liệu nguồn.
        </Typography>
      )}
    </Panel>
  )
}

/** Cố vấn nói: tổng kết điềm tĩnh + câu hỏi tự trả lời trước khi hành động */
export function AdvisorCard({ tip, action }: { tip: TipCheck; action?: ReactNode }) {
  const r = tip.report
  if (!r || (!r.verdict && !r.questions.length)) return null
  return (
    <Panel title="Cố vấn nói" action={action}>
      {r.verdict && <Typography variant="body2">{r.verdict}</Typography>}
      {r.questions.length > 0 && (
        <Box sx={{ mt: 1.5 }}>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            Tự hỏi trước khi hành động
          </Typography>
          <Box component="ol" sx={{ m: 0, pl: 2.5 }}>
            {r.questions.map((q) => (
              <Typography component="li" variant="body2" key={q} sx={{ mt: 0.5 }}>
                {q}
              </Typography>
            ))}
          </Box>
        </Box>
      )}
    </Panel>
  )
}

function ReviewRow({ label, r, tip }: { label: string; r: TipReviewResult; tip: TipCheck }) {
  const color = r.outcome === 'right' ? 'success.main' : r.outcome === 'wrong' ? 'error.main' : 'text.secondary'
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', py: 0.75, flexWrap: 'wrap', rowGap: 0.5 }}>
      <Typography variant="body2" sx={{ fontWeight: 700, minWidth: 72 }}>
        {label}
      </Typography>
      <Chip size="small" label={OUTCOME_LABEL[r.outcome]} sx={{ color, fontWeight: 700 }} variant="outlined" />
      <Typography variant="body2" className="num">
        {fmtPct(r.changePct)} ({fmtPrice(r.price, tip.currency)})
        {r.benchmarkChangePct !== null && ` · ${tip.benchmark === 'BTC' ? 'BTC' : 'VN-Index'} ${fmtPct(r.benchmarkChangePct)}`}
      </Typography>
    </Stack>
  )
}

/** Kết quả chấm lại sau 30 / 90 ngày; chưa tới hạn thì nói khi nào có */
export function ReviewCard({ tip }: { tip: TipCheck }) {
  if (tip.status !== 'analyzed') return null
  const due = (days: number) => fmtDate(new Date(new Date(tip.createdAt).getTime() + days * 86_400_000).toISOString())
  return (
    <Panel title="Sau khi soi" subtitle="App tự chấm lại lời khuyên, so với giá lúc soi">
      {tip.boughtAt && (
        <Alert severity="info" sx={{ mb: 1 }}>
          Bạn đã mua {tip.displayName} ngày {fmtDate(tip.boughtAt)}, sau khi soi.
        </Alert>
      )}
      {tip.review30 ? <ReviewRow label="30 ngày" r={tip.review30} tip={tip} /> : <KV k="30 ngày" v={`Chấm ngày ${due(30)}`} />}
      {tip.review90 ? <ReviewRow label="90 ngày" r={tip.review90} tip={tip} /> : <KV k="90 ngày" v={`Chấm ngày ${due(90)}`} />}
      {tip.changeSinceCheckPct !== null && (
        <KV k="Từ lúc soi tới giờ" v={<span className="num">{fmtPct(tip.changeSinceCheckPct)}</span>} />
      )}
    </Panel>
  )
}
