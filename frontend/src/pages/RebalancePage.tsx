import AddRounded from '@mui/icons-material/AddRounded'
import BalanceOutlined from '@mui/icons-material/BalanceOutlined'
import CheckCircle from '@mui/icons-material/CheckCircle'
import ExpandMore from '@mui/icons-material/ExpandMore'
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link as RouterLink, useSearchParams } from 'react-router-dom'
import SearchDialog from '../components/SearchDialog'
import { ActionRow, FeesEditor, Segmented, TargetBars, TargetRow } from '../components/RebalanceParts'
import { InfoTip, KV, Panel } from '../components/ui'
import { api, ApiError, post } from '../lib/api'
import { fmtDate, fmtNum, fmtVnd } from '../lib/format'
import {
  buildRequest,
  buildRows,
  CASH_KEY,
  DEFAULT_FEES,
  keepCurrent,
  MAX_ROWS,
  moneyText,
  parseFees,
  parseMoneyText,
  rowKey,
  splitEvenly,
  sumPct,
  type FeeText,
} from '../lib/rebalance'
import { useIsMobile } from '../lib/useIsMobile'
import type { Portfolio, PortfolioAccount, RebalanceLots, RebalanceMode, RebalanceResponse } from '../lib/types'

const STICKY_TOP = { xs: 'calc(52px + env(safe-area-inset-top))', md: 56 }
const MONEY_CHIPS = [
  { label: '+5tr', v: 5e6 },
  { label: '+10tr', v: 10e6 },
  { label: '+50tr', v: 50e6 },
]
const pctFmt = (n: number) => fmtNum(n, Number.isInteger(n) ? 0 : 2)

/**
 * Tái cân bằng: bạn đặt tỷ trọng mong muốn (và tiền bổ sung nếu có), công cụ tính cần mua / bán bao nhiêu để tiến gần mục tiêu đó.
 * Chỉ là phép tính theo lựa chọn của bạn: không khuyến nghị mã nào, không tạo giao dịch, không ghi vào sổ.
 */
export default function RebalancePage() {
  const [params, setParams] = useSearchParams()
  const mobile = useIsMobile()
  const pf = params.get('p') ?? ''
  const [accounts, setAccounts] = useState<PortfolioAccount[]>([])
  const [held, setHeld] = useState<Portfolio | null | undefined>(undefined)
  const [heldFailed, setHeldFailed] = useState(false)
  const [added, setAdded] = useState<string[]>([])
  const [targets, setTargets] = useState<Record<string, number>>({})
  const [touched, setTouched] = useState(false)
  const [money, setMoney] = useState(0)
  const [mode, setMode] = useState<RebalanceMode>('buy_only')
  const [lots, setLots] = useState<RebalanceLots>('board')
  const [fees, setFees] = useState<FeeText>({ ...DEFAULT_FEES })
  const [picking, setPicking] = useState(false)
  const [res, setRes] = useState<RebalanceResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<{ bad: boolean; message: string; gone?: boolean } | null>(null)
  const [retry, setRetry] = useState(0)
  const [retryHeld, setRetryHeld] = useState(0)
  const [notesOpen, setNotesOpen] = useState(false)
  const [headVisible, setHeadVisible] = useState(false)
  const headRef = useRef<HTMLDivElement | null>(null)
  const resultRef = useRef<HTMLDivElement | null>(null)
  const seq = useRef(0)

  useEffect(() => {
    document.title = 'Tái cân bằng · Đồng Hành Đầu Tư'
    api<PortfolioAccount[]>('/portfolio/portfolios').then(setAccounts).catch(() => {})
  }, [])

  useEffect(() => {
    let off = false
    setHeldFailed(false)
    api<Portfolio>(`/portfolio${pf ? `?portfolioId=${encodeURIComponent(pf)}` : ''}`)
      .then((p) => !off && setHeld(p))
      .catch(() => {
        if (!off) {
          setHeld(null)
          setHeldFailed(true)
        }
      })
    return () => {
      off = true
    }
  }, [pf, retryHeld])

  // Danh mục (mới) tải xong: bắt đầu từ "giữ như hiện tại", bỏ mã đã thêm và kết quả cũ
  useEffect(() => {
    if (!held) return
    seq.current++
    setAdded([])
    setTargets(keepCurrent(buildRows(held, [])))
    setTouched(false)
    setRes(null)
    setError(null)
    setLoading(false)
  }, [held])

  const rows = useMemo(() => buildRows(held, added), [held, added])
  const sum = sumPct(targets, rows)
  const diff = Math.round((100 - sum) * 100) / 100
  const sumOk = Math.abs(diff) < 0.005
  const cashPct = targets[CASH_KEY] ?? 0
  const hasHoldings = !!held && held.holdings.length > 0
  const feeBody = parseFees(fees)
  const canRun = touched && sumOk && !!feeBody && (hasHoldings || money > 0) && rows.length > 0 && !!held

  const edit = (fn: () => void) => {
    fn()
    setTouched(true)
  }
  const setTarget = (key: string, v: number) => edit(() => setTargets((t) => ({ ...t, [key]: v })))

  const bodyKey = canRun && feeBody ?JSON.stringify(buildRequest(rows, targets, pf, money, mode, lots, feeBody)) : ''
  useEffect(() => {
    if (!bodyKey) {
      seq.current++
      setLoading(false)
      return
    }
    const mine = ++seq.current
    setLoading(true)
    const t = setTimeout(() => {
      post<RebalanceResponse>('/portfolio/rebalance', JSON.parse(bodyKey))
        .then((r) => {
          if (mine !== seq.current) return
          setRes(r)
          setError(null)
        })
        .catch((e: unknown) => {
          if (mine !== seq.current) return
          setError({ bad: e instanceof ApiError && (e.status === 400 || e.status === 404), message: (e as Error).message, gone: e instanceof ApiError && e.status === 404 })
        })
        .finally(() => mine === seq.current && setLoading(false))
    }, 450)
    return () => clearTimeout(t)
  }, [bodyKey, retry])

  const hasRes = res !== null
  useEffect(() => {
    const el = headRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setHeadVisible(e.isIntersecting))
    io.observe(el)
    return () => io.disconnect()
  }, [hasRes])

  const addStock = (symbol: string) => {
    const s = symbol.toUpperCase()
    if (rows.some((r) => r.key === rowKey('stock', s)) || rows.length >= MAX_ROWS) return
    edit(() => {
      setAdded((a) => [...a, s])
      setTargets((t) => ({ ...t, [rowKey('stock', s)]: 0 }))
    })
  }
  const removeStock = (symbol: string) =>
    edit(() => {
      setAdded((a) => a.filter((x) => x !== symbol))
      setTargets((t) => {
        const n = { ...t }
        delete n[rowKey('stock', symbol)]
        return n
      })
    })
  const fixWithCash = () => setTarget(CASH_KEY, Math.round((cashPct + diff) * 100) / 100)
  const canFixWithCash = !sumOk && cashPct + diff >= 0

  const scrollToResult = () =>
    resultRef.current?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })

  const retryBtn = (
    <Button size="small" color="inherit" onClick={() => setRetry((n) => n + 1)} sx={{ minHeight: 36 }}>
      Thử lại
    </Button>
  )
  const stale = hasRes && !canRun
  const portfolioLink = pf ? `/portfolio?p=${encodeURIComponent(pf)}` : '/portfolio'

  return (
    <Stack spacing={1.5} sx={{ maxWidth: 760, mx: 'auto' }}>
      <Box sx={{ display: { xs: 'none', md: 'block' } }}>
        <Typography component="h1" sx={{ fontWeight: 800, fontSize: 26, lineHeight: 1.25 }}>
          Tái cân bằng
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary">
        Đặt tỷ trọng bạn muốn cho từng tài sản, xem cần mua hoặc bán bao nhiêu để tiến gần mục tiêu. Chỉ là tính toán, không tạo giao dịch.
      </Typography>

      {accounts.length > 1 && (
        <Stack direction="row" role="group" aria-label="Danh mục" useFlexGap sx={{ gap: 1, overflowX: 'auto', scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' }, pb: 0.5 }}>
          {[{ id: '', name: 'Tất cả' }, ...accounts].map((a) => (
            <Chip
              key={a.id || 'all'}
              label={a.name}
              onClick={() => setParams((prev) => { const n = new URLSearchParams(prev); if (a.id) n.set('p', a.id); else n.delete('p'); return n }, { replace: true })}
              color={pf === a.id ? 'primary' : 'default'}
              variant={pf === a.id ? 'filled' : 'outlined'}
              aria-pressed={pf === a.id}
              sx={{ height: 36, flexShrink: 0 }}
            />
          ))}
        </Stack>
      )}

      {held === undefined ? (
        <Stack spacing={1.5} aria-busy aria-label="Đang tải danh mục">
          <Skeleton variant="rounded" height={260} />
          <Skeleton variant="rounded" height={220} />
        </Stack>
      ) : heldFailed ? (
        <Alert severity="warning" variant="outlined" action={<Button size="small" color="inherit" onClick={() => setRetryHeld((n) => n + 1)} sx={{ minHeight: 36 }}>Thử lại</Button>}>
          Chưa lấy được danh mục của bạn, bạn thử lại nhé.
        </Alert>
      ) : (
        <>
          <Paper
            data-testid="rb-sum"
            aria-live="polite"
            sx={{ position: 'sticky', top: STICKY_TOP, zIndex: 2, pl: 2, pr: 1, py: 0.75, minHeight: 52, display: 'flex', alignItems: 'center', gap: 1 }}
          >
            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flex: 1, minWidth: 0 }}>
              {sumOk ? <CheckCircle sx={{ color: 'success.main', fontSize: 22 }} aria-hidden /> : <WarningAmberRounded sx={{ color: diff > 0 ? 'warning.main' : 'error.main', fontSize: 22 }} aria-hidden />}
              <Typography className="num" sx={{ fontWeight: 700, fontSize: 15 }} noWrap>
                {sumOk ? 'Tổng 100%' : diff > 0 ? `Còn thiếu ${pctFmt(diff)}%` : `Thừa ${pctFmt(-diff)}%`}
              </Typography>
            </Stack>
            {!sumOk && canFixWithCash && (
              <Button size="small" onClick={fixWithCash} sx={{ minHeight: 40, flexShrink: 0, whiteSpace: 'nowrap' }}>
                {diff > 0 ? 'Dồn vào tiền mặt' : 'Bớt từ tiền mặt'}
              </Button>
            )}
            {sumOk && res && !headVisible && (
              <Button size="small" endIcon={<ExpandMore />} onClick={scrollToResult} sx={{ minHeight: 40, flexShrink: 0 }}>
                Xem kết quả
              </Button>
            )}
          </Paper>

          <Panel
            title="Tỷ trọng mong muốn"
            subtitle="Tổng các dòng cần đúng 100%"
            action={
              <Stack direction="row" spacing={1}>
                <Chip label="Giữ như hiện tại" variant="outlined" onClick={() => edit(() => setTargets(keepCurrent(rows)))} sx={{ height: 36 }} />
                <Chip label="Chia đều" variant="outlined" onClick={() => edit(() => setTargets(splitEvenly(rows)))} sx={{ height: 36 }} />
              </Stack>
            }
          >
            {!hasHoldings && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Danh mục đang trống. Nhập tiền bổ sung và thêm cổ phiếu để xem cách phân bổ.
              </Typography>
            )}
            <Box sx={{ mt: -0.5, '& > *:not(:last-child)': { borderBottom: 1, borderColor: 'divider' } }}>
              {rows.map((r) => {
                const isNew = r.assetType === 'stock' && added.includes(r.symbol) && !r.held
                const v = targets[r.key] ?? 0
                const hint =
                  r.key === CASH_KEY
                    ? v > 0
                      ? `Giữ lại ${pctFmt(v)}% tiền mặt, không dùng để mua`
                      : 'Có thể dùng hết tiền mặt để mua'
                    : r.held && r.assetType !== 'cash' && r.current > 0 && v === 0
                    ? mode === 'allow_sell'
                      ? 'Bán hết số đang giữ'
                      : 'Chỉ dùng tiền mới nên sẽ không bán'
                    : undefined
                return <TargetRow key={r.key} row={r} value={v} onChange={(n) => setTarget(r.key, n)} onRemove={isNew ? () => removeStock(r.symbol) : undefined} hint={hint} />
              })}
            </Box>
            <Button
              variant="outlined"
              startIcon={<AddRounded />}
              onClick={() => setPicking(true)}
              disabled={rows.length >= MAX_ROWS}
              fullWidth
              sx={{ mt: 1.5, minHeight: 44 }}
            >
              Thêm cổ phiếu
            </Button>
          </Panel>

          <Panel title="Tuỳ chọn tính">
            <Stack spacing={2.5}>
              <Box>
                <TextField
                  label="Tiền bổ sung (VND)"
                  value={moneyText(money)}
                  placeholder="0"
                  fullWidth
                  onChange={(e) => edit(() => setMoney(parseMoneyText(e.target.value)))}
                  onFocus={(e) => e.target.select()}
                  slotProps={{
                    htmlInput: { inputMode: 'numeric', autoComplete: 'off', style: { textAlign: 'right' } },
                    input: { endAdornment: <Typography color="text.secondary" sx={{ pl: 0.5 }}>₫</Typography> },
                    inputLabel: { shrink: true },
                  }}
                />
                <Stack direction="row" useFlexGap sx={{ gap: 0.75, flexWrap: 'wrap', mt: 1 }}>
                  {MONEY_CHIPS.map((c) => (
                    <Chip key={c.label} label={c.label} variant="outlined" onClick={() => edit(() => setMoney((m) => Math.min(1e12, m + c.v)))} sx={{ height: 36, minWidth: 64 }} />
                  ))}
                  {money > 0 && <Chip label="Xoá" variant="outlined" onClick={() => edit(() => setMoney(0))} sx={{ height: 36 }} />}
                </Stack>
              </Box>
              <Segmented<RebalanceMode>
                label="Cách điều chỉnh"
                value={mode}
                onChange={(v) => edit(() => setMode(v))}
                options={[
                  { value: 'buy_only', label: 'Chỉ dùng tiền mới', desc: 'Không bán gì, chỉ dùng tiền mặt và tiền bổ sung để mua phần còn thiếu.' },
                  { value: 'allow_sell', label: 'Cho phép bán', desc: 'Có thể bán bớt phần vượt mục tiêu để mua phần còn thiếu.' },
                ]}
              />
              <Segmented<RebalanceLots>
                label="Đơn vị cổ phiếu"
                value={lots}
                onChange={(v) => edit(() => setLots(v))}
                options={[
                  { value: 'board', label: 'Lô chẵn 100 cp', desc: 'Mua bán theo bội số 100 cổ phiếu như sàn thường.' },
                  { value: 'odd', label: 'Cho phép lô lẻ', desc: 'Tính theo từng cổ phiếu (1 cp), sát mục tiêu hơn.' },
                ]}
              />
              <Box sx={{ borderTop: 1, borderColor: 'divider', pt: 0.5 }}>
                <FeesEditor value={fees} onChange={(v) => edit(() => setFees(v))} />
              </Box>
            </Stack>
          </Panel>

          {error && (
            <Alert
              severity={error.bad ? 'info' : 'warning'}
              variant="outlined"
              role="alert"
              data-testid="rb-error"
              action={
                error.gone ? (
                  <Button size="small" color="inherit" onClick={() => setParams((prev) => { const n = new URLSearchParams(prev); n.delete('p'); return n }, { replace: true })} sx={{ minHeight: 36 }}>
                    Xem tất cả
                  </Button>
                ) : error.bad ? undefined : retryBtn
              }
            >
              {error.bad ? error.message : 'Chưa tính được, bạn thử lại nhé.'}
            </Alert>
          )}

          <Box ref={resultRef} sx={{ scrollMarginTop: { xs: 'calc(120px + env(safe-area-inset-top))', md: 128 } }}>
            {!res ? (
              error ? null : !touched ? (
                <Paper sx={{ p: 2.5 }} data-testid="rb-hint">
                  <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
                    <BalanceOutlined sx={{ color: 'text.disabled', fontSize: 32 }} aria-hidden />
                    <Box>
                      <Typography sx={{ fontWeight: 700 }}>Chỉnh tỷ trọng hoặc nhập tiền bổ sung</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Kết quả hiện ngay ở đây khi tổng đạt 100%, và không thay đổi sổ của bạn.
                      </Typography>
                    </Box>
                  </Stack>
                </Paper>
              ) : !hasHoldings && money <= 0 ? (
                <Paper sx={{ p: 2.5 }} data-testid="rb-empty">
                  <Typography sx={{ fontWeight: 700 }}>Chưa có gì để tính</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                    Danh mục của bạn chưa có tài sản. Nhập một khoản tiền bổ sung ở trên, hoặc ghi tài sản vào danh mục.
                  </Typography>
                  <Button variant="outlined" component={RouterLink} to={portfolioLink}>
                    Mở danh mục
                  </Button>
                </Paper>
              ) : !sumOk ? (
                <Paper sx={{ p: 2.5 }} data-testid="rb-need-100">
                  <Typography sx={{ fontWeight: 700 }}>Đưa tổng về 100% để xem kết quả</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {diff > 0 ? `Còn thiếu ${pctFmt(diff)}%.` : `Đang thừa ${pctFmt(-diff)}%.`}
                  </Typography>
                </Paper>
              ) : (
                <Stack spacing={1.5} aria-busy aria-label="Đang tính">
                  <Skeleton variant="rounded" height={150} />
                  <Skeleton variant="rounded" height={160} />
                </Stack>
              )
            ) : (
              <Stack spacing={1.5} sx={{ opacity: loading || stale ? 0.5 : 1, transition: 'opacity .15s' }} aria-busy={loading} data-testid="rb-result" data-loading={loading}>
                {stale && (
                  <Typography variant="caption" color="text.secondary" role="status">
                    Đây là kết quả của lần tính trước. Đưa tổng về 100% để cập nhật.
                  </Typography>
                )}
                <Paper ref={headRef} sx={{ p: 2.5 }} data-testid="rb-summary">
                  <Typography variant="body2" color="text.secondary">
                    Lệch lớn nhất so với mục tiêu
                  </Typography>
                  <Typography className="num" sx={{ fontWeight: 800, fontSize: { xs: 24, sm: 28 }, lineHeight: 1.25 }} aria-live="polite" data-testid="rb-deviation">
                    {fmtNum(res.maxDeviationPct.before, 1)} <Box component="span" aria-label="thành" sx={{ color: 'text.secondary' }}>→</Box> {fmtNum(res.maxDeviationPct.after, 1)}
                    <Box component="span" sx={{ fontSize: 15, fontWeight: 600, ml: 0.75, color: 'text.secondary' }}>
                      điểm %
                    </Box>
                  </Typography>
                  <Box sx={{ mt: 1.5, pt: 1, borderTop: 1, borderColor: 'divider' }}>
                    {res.cash.fromSales > 0 && <KV k="Tiền từ bán" v={fmtVnd(res.cash.fromSales)} />}
                    <KV k="Tiền dùng để mua" v={fmtVnd(res.cash.spent)} />
                    <KV k="Phí và thuế giả định" v={fmtVnd(res.cash.fees)} />
                    <KV k="Tiền mặt còn lại" v={fmtVnd(res.cash.left)} />
                  </Box>
                </Paper>

                {res.warnings.length > 0 && (
                  <Alert severity="warning" variant="outlined" data-testid="rb-warnings">
                    <Box component="ul" sx={{ m: 0, pl: 2.25 }}>
                      {res.warnings.map((w) => (
                        <li key={w}>
                          <Typography variant="body2">{w}</Typography>
                        </li>
                      ))}
                    </Box>
                  </Alert>
                )}

                <Panel
                  title={
                    <>
                      Phép tính điều chỉnh
                      <Box component="span" sx={{ ml: 0.75 }}>
                        <InfoTip label="Giải thích phép tính">Đây là phép tính theo tỷ trọng bạn đặt, không phải lời khuyên mua hay bán mã nào. Không có giao dịch nào được tạo.</InfoTip>
                      </Box>
                    </>
                  }
                  subtitle={res.actions.length ? `${res.actions.length} bước, bán trước rồi mua` : undefined}
                  noPadding
                >
                  {res.actions.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ p: 2 }} data-testid="rb-no-actions">
                      Với lựa chọn này không có bước mua bán nào cần tính.
                    </Typography>
                  ) : (
                    <Box sx={{ px: 2, '& > *:not(:last-child)': { borderBottom: 1, borderColor: 'divider' } }}>
                      {res.actions.map((a) => (
                        <ActionRow key={`${a.side}:${a.assetType}:${a.symbol}`} a={a} />
                      ))}
                    </Box>
                  )}
                </Panel>

                <Panel title="Tỷ trọng trước và sau" subtitle="Vạch đứng là mục tiêu bạn đặt">
                  <TargetBars before={res.before.rows} after={res.after.rows} />
                </Panel>

                {res.notes.length > 0 && (
                  <Box>
                    <ButtonBase
                      onClick={() => setNotesOpen((v) => !v)}
                      aria-expanded={notesOpen}
                      sx={{ minHeight: 40, color: 'text.secondary', fontSize: 13, fontWeight: 600, gap: 0.5 }}
                    >
                      Giả định đã dùng ({res.notes.length})
                      <ExpandMore sx={{ fontSize: 20, transform: notesOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
                    </ButtonBase>
                    <Collapse in={notesOpen} unmountOnExit>
                      <Box component="ul" sx={{ m: 0, pl: 2.5, color: 'text.secondary' }} data-testid="rb-notes">
                        {res.notes.map((n) => (
                          <li key={n}>
                            <Typography variant="caption" component="span">
                              {n}
                            </Typography>
                          </li>
                        ))}
                      </Box>
                    </Collapse>
                  </Box>
                )}
              </Stack>
            )}
          </Box>

          <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', pt: 0.5, pb: 1 }}>
            Chỉ là tính toán theo lựa chọn của bạn, không tạo giao dịch và không phải khuyến nghị mua bán.
            {res ? ` Giá tính đến ${fmtDate(res.asOf)}.` : ''}
          </Typography>
        </>
      )}

      <SearchDialog
        open={picking}
        onClose={() => setPicking(false)}
        fullScreen={mobile}
        onPickStock={addStock}
        exclude={rows.filter((r) => r.assetType === 'stock').map((r) => r.symbol)}
        pickHint="Chọn cổ phiếu muốn thêm vào mục tiêu"
      />
    </Stack>
  )
}
