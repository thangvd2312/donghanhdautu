import AddIcon from '@mui/icons-material/Add'
import RemoveIcon from '@mui/icons-material/Remove'
import TuneOutlined from '@mui/icons-material/TuneOutlined'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { Ref } from 'react'
import { fmtNum, fmtVnd } from '../../lib/format'
import { dayLabel, groupSteps, MIX_STEP, money, PART_COLOR, PART_SHORT, PARTS, stepMix } from '../../lib/deployment'
import type { DeployMix, DeploymentPreview, DeployRationale } from '../../lib/types'
import { Panel } from '../ui'

/** Thanh ngang xếp chồng theo 5 phần (100%) */
function MixBar({ mix, label }: { mix: DeployMix; label: string }) {
  const text = PARTS.filter((p) => mix[p] > 0)
    .map((p) => `${PART_SHORT[p]} ${fmtNum(mix[p], 1)}%`)
    .join(', ')
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      <Typography variant="caption" color="text.secondary" sx={{ width: 64, flexShrink: 0 }}>
        {label}
      </Typography>
      <Stack
        direction="row"
        role="img"
        aria-label={`${label}: ${text}`}
        sx={{
          flex: 1,
          height: 14,
          borderRadius: '7px',
          overflow: 'hidden',
          bgcolor: 'action.hover',
          gap: '2px',
        }}
      >
        {PARTS.filter((p) => mix[p] > 0).map((p) => (
          <Box key={p} title={`${PART_SHORT[p]}: ${fmtNum(mix[p], 1)}%`} sx={{ width: `${mix[p]}%`, bgcolor: PART_COLOR[p] }} />
        ))}
      </Stack>
    </Stack>
  )
}

const Dot = ({ color }: { color: string }) => (
  <Box
    aria-hidden
    sx={{
      width: 10,
      height: 10,
      borderRadius: '3px',
      bgcolor: color,
      flexShrink: 0,
    }}
  />
)

/** Chỉnh tay 5 phần theo bước 5 điểm; tiền gửi là phần "còn lại" */
function MixEditor({ mix, suggested, onChange }: { mix: DeployMix; suggested: DeployMix; onChange: (m: DeployMix | null) => void }) {
  return (
    <Box data-testid="dp-mix-editor" sx={{ mt: 1.5, p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
      {PARTS.map((p) => (
        <Stack key={p} direction="row" spacing={1} sx={{ alignItems: 'center', py: 0.25 }}>
          <Dot color={PART_COLOR[p]} />
          <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
            {PART_SHORT[p]}
            {mix[p] !== suggested[p] && (
              <Typography component="span" variant="caption" color="text.secondary">
                {' '}
                (gợi ý {suggested[p]}%)
              </Typography>
            )}
          </Typography>
          <IconButton
            aria-label={`Giảm ${PART_SHORT[p]}`}
            onClick={() => onChange(stepMix(mix, p, -MIX_STEP))}
            disabled={mix[p] === 0}
            sx={{ width: 40, height: 40 }}
          >
            <RemoveIcon fontSize="small" />
          </IconButton>
          <Typography className="num" sx={{ width: 44, textAlign: 'center', fontWeight: 700 }}>
            {mix[p]}%
          </Typography>
          <IconButton
            aria-label={`Tăng ${PART_SHORT[p]}`}
            onClick={() => onChange(stepMix(mix, p, MIX_STEP))}
            disabled={p === 'savings' ? mix.etf === 0 : mix.savings === 0}
            sx={{ width: 40, height: 40 }}
          >
            <AddIcon fontSize="small" />
          </IconButton>
        </Stack>
      ))}
      <Stack
        direction="row"
        sx={{
          alignItems: 'center',
          justifyContent: 'space-between',
          mt: 0.5,
          gap: 1,
        }}
      >
        <Typography variant="caption" color="text.secondary">
          Tăng phần nào thì tiền gửi giảm tương ứng (tăng tiền gửi thì ETF giảm).
        </Typography>
        <Button size="small" onClick={() => onChange(null)} sx={{ flexShrink: 0, minHeight: 36 }}>
          Về gợi ý
        </Button>
      </Stack>
    </Box>
  )
}

interface DeployResultProps {
  res: Omit<DeploymentPreview, 'steps'> & {
    steps?: DeploymentPreview['steps']
  }
  stale?: boolean
  /** Có thì hiện nút chỉnh tỷ trọng (màn lập kế hoạch); kế hoạch đã lưu chỉ xem */
  edit?: {
    editing: boolean
    onToggle: () => void
    onMix: (m: DeployMix | null) => void
  }
  headRef?: Ref<HTMLDivElement>
  /** Lời giải thích của AI (kế hoạch đã lưu): thay câu mẫu của quy tắc ở từng phần */
  rationale?: DeployRationale | null
}

/** Kết quả lập kế hoạch: tỷ trọng, lớp an toàn, từng phần mua gì, kịch bản xấu, lịch (khi có `steps`), ghi chú */
export default function DeployResult({ res, stale = false, edit, headRef, rationale }: DeployResultProps) {
  const today = res.startDate
  const days = res.steps ? groupSteps(res.steps) : []
  const hasCurrent = res.current.total > 0
  const afterMix = Object.fromEntries(res.parts.map((p) => [p.part, p.afterPct])) as Partial<DeployMix>
  const currentMix = Object.fromEntries(res.parts.map((p) => [p.part, p.currentPct])) as Partial<DeployMix>
  const fill = (m: Partial<DeployMix>): DeployMix => ({
    savings: 0,
    gold: 0,
    etf: 0,
    picks: 0,
    crypto: 0,
    ...m,
  })
  const wc = res.worstCase

  return (
    <Stack spacing={1.5} sx={{ opacity: stale ? 0.55 : 1, transition: 'opacity .2s' }} data-testid="dp-result">
      <Paper ref={headRef} sx={{ p: 2 }}>
        <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.6 }}>
          Kế hoạch tham khảo · kiểu {res.profile.planLabel}
        </Typography>
        <Typography
          sx={{
            fontWeight: 800,
            fontSize: { xs: 20, sm: 22 },
            lineHeight: 1.3,
          }}
        >
          {res.mode === 'monthly' ? `${money(res.amount)} mỗi tháng` : `Giải ngân ${money(res.amount)}`}
        </Typography>
        <Stack spacing={1} sx={{ mt: 1.5 }}>
          {hasCurrent && <MixBar mix={fill(currentMix)} label="Hiện tại" />}
          <MixBar mix={res.mix} label="Mục tiêu" />
          {hasCurrent && <MixBar mix={fill(afterMix)} label="Sau khi mua" />}
        </Stack>
        <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', columnGap: 1.5, rowGap: 0.5, mt: 1.25 }}>
          {PARTS.filter((p) => res.mix[p] > 0).map((p) => (
            <Stack key={p} direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
              <Dot color={PART_COLOR[p]} />
              <Typography variant="body2">
                {PART_SHORT[p]} <b className="num">{res.mix[p]}%</b>
              </Typography>
            </Stack>
          ))}
        </Stack>
        {edit && (
          <Button
            size="small"
            variant={edit.editing ? 'contained' : 'outlined'}
            startIcon={<TuneOutlined />}
            onClick={edit.onToggle}
            sx={{ mt: 1.5, borderRadius: 99, minHeight: 36 }}
          >
            {edit.editing ? 'Xong' : 'Chỉnh tỷ trọng'}
          </Button>
        )}
        {edit?.editing && <MixEditor mix={res.mix} suggested={res.suggestedMix} onChange={edit.onMix} />}
        {res.warnings.map((w) => (
          <Alert key={w} severity="warning" variant="outlined" sx={{ mt: 1.5 }}>
            {w}
          </Alert>
        ))}
      </Paper>

      {res.safety.length > 0 && (
        <Panel title="Làm trước khi đầu tư">
          <Stack spacing={1.25}>
            {res.safety.map((s) => (
              <Box key={s.kind}>
                <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: 15 }}>
                    {s.kind === 'emergency_fund' ? 'Quỹ dự phòng' : s.kind === 'margin_debt' ? 'Trả nợ margin' : 'Trả nợ lãi cao'}
                  </Typography>
                  <Typography className="num" sx={{ fontWeight: 700 }}>
                    {fmtVnd(s.amount)}
                  </Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  {s.text}
                  {s.amount < s.need ? ` Kế hoạch này mới dùng được ${fmtVnd(s.amount)} trên ${fmtVnd(s.need)} cần.` : ''}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Panel>
      )}

      <Panel title="Chia vào đâu, mua gì" noPadding>
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {res.parts.map((p, i) => (
            <Box
              component="li"
              key={p.part}
              sx={{
                px: 2,
                py: 1.5,
                borderTop: i ? 1 : 0,
                borderColor: 'divider',
              }}
              data-testid={`dp-part-${p.part}`}
            >
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Dot color={PART_COLOR[p.part]} />
                <Typography sx={{ fontWeight: 700, flex: 1, minWidth: 0 }}>
                  {p.label}{' '}
                  <Typography component="span" color="text.secondary" className="num" sx={{ fontWeight: 600 }}>
                    {p.targetPct}%
                  </Typography>
                </Typography>
                <Typography className="num" sx={{ fontWeight: 800 }}>
                  {p.amount > 0 ? money(p.amount) : '—'}
                </Typography>
              </Stack>
              <Box sx={{ pl: 2.25, mt: 0.5 }}>
                <Typography variant="body2">
                  <b>Mua:</b> {p.instrument}
                </Typography>
                <Typography variant="body2">
                  <b>Cách mua:</b> {p.how}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                  {rationale?.parts[p.part] ?? p.why}
                </Typography>
                {p.note && (
                  <Typography variant="body2" sx={{ mt: 0.25, color: 'warning.main' }}>
                    {p.note}
                  </Typography>
                )}
              </Box>
            </Box>
          ))}
        </Box>
      </Panel>

      <Panel title="Nếu thị trường xấu như năm 2022">
        <Alert severity={wc.ok && wc.afterDropPct <= wc.limitPct ? 'success' : 'warning'} variant="outlined" data-testid="dp-worst">
          Giả định cổ phiếu và ETF {wc.shocks.etf}%, vàng {wc.shocks.gold}%, crypto {wc.shocks.crypto}%, tiền gửi giữ nguyên: tỷ trọng này
          giảm khoảng <b>{fmtNum(wc.dropPct, 1)}%</b>
          {wc.ok ? `, trong mức ${wc.limitPct}% bạn nói chịu được.` : `, quá mức ${wc.limitPct}% bạn nói chịu được.`}
          {wc.afterTotal > 0 &&
            ` Danh mục thực tế sau khi mua đủ (${money(wc.afterTotal)}) sẽ mất khoảng ${money(wc.afterDropVnd)} (${fmtNum(wc.afterDropPct, 1)}%)` +
              (wc.afterDropPct > wc.limitPct ? ', quá mức bạn chịu được: xem cảnh báo ở đầu kế hoạch.' : '.')}
        </Alert>
        {res.adjustments.length > 0 ? (
          <Box sx={{ mt: 1.5 }}>
            <Typography sx={{ fontWeight: 700, fontSize: 14, mb: 0.5 }}>Vì sao tỷ trọng này</Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
              {res.adjustments.map((a) => (
                <Typography component="li" variant="body2" key={a.rule} sx={{ mb: 0.5 }}>
                  {a.text}
                </Typography>
              ))}
            </Box>
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
            Theo đúng bảng tỷ trọng của kiểu {res.profile.planLabel}; không cần điều chỉnh thêm theo hồ sơ của bạn.
          </Typography>
        )}
      </Panel>

      {days.length > 0 && (
        <Panel
          title="Lịch mua"
          subtitle={`Xem lại kế hoạch ngày ${dayLabel(res.nextReviewAt, today)} hoặc khi một phần lệch mục tiêu quá 5 điểm.`}
          noPadding
        >
          {days.map((d, i) => (
            <Box
              key={d.date}
              sx={{
                px: 2,
                py: 1.5,
                borderTop: i ? 1 : 0,
                borderColor: 'divider',
              }}
              data-testid="dp-day"
            >
              <Stack direction="row" sx={{ justifyContent: 'space-between', mb: 0.75 }}>
                <Typography sx={{ fontWeight: 700 }}>
                  Đợt {i + 1} · {dayLabel(d.date, today)}
                </Typography>
                <Typography className="num" sx={{ fontWeight: 700 }}>
                  {money(d.total)}
                </Typography>
              </Stack>
              <Stack spacing={0.75}>
                {d.steps.map((s, j) => (
                  <Stack key={j} direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
                    <Box sx={{ pt: 0.75 }}>
                      <Dot color={s.kind === 'debt' ? '#9ca3af' : s.kind === 'emergency' ? PART_COLOR.savings : PART_COLOR[s.kind]} />
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {s.label}
                        {s.tranches > 1 && (
                          <Typography component="span" variant="caption" color="text.secondary">
                            {' '}
                            · đợt {s.tranche}/{s.tranches}
                          </Typography>
                        )}
                      </Typography>
                      {s.hint && (
                        <Typography variant="caption" color="text.secondary" component="div">
                          {s.hint}
                        </Typography>
                      )}
                    </Box>
                    <Typography variant="body2" className="num" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {fmtVnd(s.amount)}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            </Box>
          ))}
        </Panel>
      )}

      <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
        {res.notes.map((n) => (
          <Typography component="li" variant="caption" color="text.secondary" key={n}>
            {n}
          </Typography>
        ))}
      </Box>
    </Stack>
  )
}
