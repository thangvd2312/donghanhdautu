import TuneOutlined from '@mui/icons-material/TuneOutlined'
import TrendingDown from '@mui/icons-material/TrendingDown'
import TrendingUp from '@mui/icons-material/TrendingUp'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom'
import AssetAvatar from '../components/AssetAvatar'
import { CompositionBars, HoldingImpactRow, PresetCard, ShockRow } from '../components/SimulateParts'
import { InfoTip, Panel } from '../components/ui'
import { api, ApiError, post } from '../lib/api'
import { fmtDate, fmtPct, fmtVnd } from '../lib/format'
import {
  buildShocks,
  describeScenario,
  EMPTY_SHOCKS,
  parseShocks,
  presetToShocks,
  PRESETS,
  sameShocks,
  serializeShocks,
  signedVnd,
  type GroupShockKey,
  type ShockState,
} from '../lib/simulate'
import type { Portfolio, PortfolioAccount, SimulateResponse } from '../lib/types'

const STICKY_TOP = { xs: 'calc(52px + env(safe-area-inset-top))', md: 56 }
const TOP_N = 6

const FX_HINT =
  'Áp cho tài sản tính bằng USDT (coin và tiền USDT), chỉ một lần. Ví dụ tỷ giá +2% thì mỗi USDT quy ra nhiều hơn 2% VND, cộng thêm phần giá coin bạn đặt riêng.'

function Centered({ title, children, actions }: { title: string; children?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <Stack spacing={1.5} sx={{ alignItems: 'center', textAlign: 'center', py: 4, px: 2 }} data-testid="sim-empty">
      <TuneOutlined sx={{ fontSize: 44, color: 'text.disabled' }} aria-hidden />
      <Typography sx={{ fontWeight: 700 }}>{title}</Typography>
      {children && (
        <Typography variant="body2" color="text.secondary" component="div">
          {children}
        </Typography>
      )}
      {actions}
    </Stack>
  )
}

function DeltaLine({ r, big }: { r: SimulateResponse; big?: boolean }) {
  const v = Math.round(r.delta.value)
  const Icon = v < 0 ? TrendingDown : TrendingUp
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
      {v !== 0 && <Icon fontSize={big ? 'medium' : 'small'} aria-hidden />}
      <Typography className="num" sx={{ fontWeight: 700, fontSize: big ? 18 : 14 }}>
        {v === 0 ? 'Không đổi' : signedVnd(v)}
        {r.delta.pct !== null && v !== 0 ? ` (${fmtPct(r.delta.pct, 1)})` : ''}
      </Typography>
    </Stack>
  )
}

/**
 * Thử kịch bản: "nếu giá thay đổi như vậy thì tài sản đang giữ của tôi thế nào". Chỉ là phép tính theo giả định người dùng chọn,
 * không ghi vào sổ, không phải dự báo. Kịch bản và danh mục nằm trên URL (?p=…&s=stock:-10,FPT:-25) để quay lại / chia sẻ.
 */
export default function SimulatePage() {
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()
  const pf = params.get('p') ?? ''
  const [shocks, setShocks] = useState<ShockState>(() => parseShocks(params.get('s')))
  const [accounts, setAccounts] = useState<PortfolioAccount[]>([])
  const [held, setHeld] = useState<Portfolio | null | undefined>(undefined)
  const [heldFailed, setHeldFailed] = useState(false)
  const [res, setRes] = useState<SimulateResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<{ bad: boolean; message: string; gone?: boolean } | null>(null)
  const [retry, setRetry] = useState(0)
  const [showAll, setShowAll] = useState(false)
  const [picking, setPicking] = useState(false)
  const [headVisible, setHeadVisible] = useState(false)
  const headRef = useRef<HTMLDivElement | null>(null)
  const controlsRef = useRef<HTMLDivElement | null>(null)
  const seq = useRef(0)

  useEffect(() => {
    api<PortfolioAccount[]>('/portfolio/portfolios').then(setAccounts).catch(() => {})
  }, [])

  // Tài sản đang giữ quyết định các dòng điều chỉnh: chỉ hiện nhóm bạn thật sự có
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
  }, [pf, retry])

  const holdings = held?.holdings
  const groups = useMemo(() => {
    const hs = holdings ?? []
    const stock = hs.some((h) => h.assetType === 'stock')
    const crypto = hs.some((h) => h.assetType === 'crypto')
    const gold = hs.some((h) => h.assetType === 'gold')
    const usdtCash = hs.some((h) => h.assetType === 'cash' && h.symbol.toUpperCase() === 'USDT')
    return { stock, crypto, gold, fx: crypto || usdtCash, usdt: crypto || usdtCash, any: hs.length > 0 }
  }, [holdings])
  const symbols = useMemo(() => {
    const seen = new Map<string, string>()
    for (const h of holdings ?? []) if ((h.assetType === 'stock' || h.assetType === 'crypto') && !seen.has(h.symbol)) seen.set(h.symbol, h.assetType)
    return Array.from(seen, ([symbol, assetType]) => ({ symbol, assetType }))
  }, [holdings])
  const symType = (s: string) => symbols.find((x) => x.symbol === s)?.assetType ?? 'stock'

  // Đổi danh mục: bỏ ghi đè theo mã không còn trong danh mục đó (API trả 400 nếu mã không có)
  useEffect(() => {
    if (!holdings) return
    setShocks((s) => {
      const keep = Object.entries(s.symbols).filter(([sym]) => symbols.some((x) => x.symbol === sym))
      return keep.length === Object.keys(s.symbols).length ? s : { ...s, symbols: Object.fromEntries(keep) }
    })
  }, [holdings, symbols])

  const key = serializeShocks(shocks)
  // Giữ dấu : và , nguyên văn cho URL dễ đọc (URLSearchParams sẽ mã hoá chúng)
  useEffect(() => {
    const search = [pf && `p=${encodeURIComponent(pf)}`, key && `s=${key.replace(/[^A-Za-z0-9:,.+-]/g, encodeURIComponent)}`].filter(Boolean).join('&')
    if (search !== window.location.search.replace(/^\?/, '')) nav({ search: search ? `?${search}` : '' }, { replace: true })
  }, [key, pf, nav])

  // Gọi API sau khi người dùng ngừng chỉnh một chút; kết quả cũ giữ lại (mờ đi) trong lúc chờ
  const body = useMemo(() => buildShocks(shocks), [shocks])
  const bodyKey = JSON.stringify(body)
  const canRun = !!holdings?.length
  useEffect(() => {
    if (!canRun) return
    if (!body) {
      seq.current++
      setRes(null)
      setError(null)
      setLoading(false)
      return
    }
    const mine = ++seq.current
    setLoading(true)
    const t = setTimeout(() => {
      post<SimulateResponse>('/portfolio/simulate', { portfolioId: pf || null, shocks: body })
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
    }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bodyKey, pf, retry, canRun])

  const hasRes = res !== null
  // Thanh tóm tắt dính trên cùng chỉ hiện khi khối kết quả lớn đã cuộn khỏi màn hình
  useEffect(() => {
    const el = headRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setHeadVisible(e.isIntersecting))
    io.observe(el)
    return () => io.disconnect()
  }, [hasRes])

  const set = (k: GroupShockKey, v: number) => setShocks((s) => ({ ...s, [k]: v }))
  const setSym = (sym: string, v: number | null) =>
    setShocks((s) => {
      const symbols = { ...s.symbols }
      if (v === null) delete symbols[sym]
      else symbols[sym] = v
      return { ...s, symbols }
    })
  const pickPreset = (id: string) => {
    const p = PRESETS.find((x) => x.id === id)
    if (p) setShocks(presetToShocks(p))
  }
  const retryBtn = (
    <Button size="small" color="inherit" onClick={() => setRetry((n) => n + 1)} sx={{ minHeight: 36 }}>
      Thử lại
    </Button>
  )

  const presets = PRESETS.filter((p) => (p.needs === 'usdt' ? groups.usdt : groups[p.needs]))
  const activePreset = presets.find((p) => sameShocks(shocks, presetToShocks(p)))?.id
  const custom = !!key && !activePreset
  const rows = ([['stock', 'Cổ phiếu'], ['crypto', 'Crypto (giá USDT)'], ['gold', 'Vàng'], ['fx', 'Tỷ giá USDT/VND']] as [GroupShockKey, string][]).filter(([k]) => groups[k])
  const overridden = Object.keys(shocks.symbols)
  const candidates = symbols.filter((x) => !overridden.includes(x.symbol))
  const stockOnlyCash = held && !groups.any
  const onlyCash = !!held && held.holdings.length > 0 && !groups.stock && !groups.crypto && !groups.gold && !groups.usdt
  const top = res ? (showAll ? res.holdings : res.holdings.slice(0, TOP_N)) : []
  const noScenario = !body
  // Câu "chỉ là mô phỏng…" đã có ở chân trang, không lặp lại từ ghi chú của máy chủ
  const notes = (res?.notes ?? []).filter((n) => !/dự báo/i.test(n))

  return (
    <Stack spacing={1.5} sx={{ maxWidth: 760, mx: 'auto' }}>
      <Box sx={{ display: { xs: 'none', md: 'block' } }}>
        <Typography component="h1" sx={{ fontWeight: 800, fontSize: 26, lineHeight: 1.25 }}>
          Thử kịch bản
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary">
        Xem tài sản đang giữ thay đổi thế nào nếu giá biến động theo giả định bạn chọn. Đây là công cụ để hiểu mức rủi ro, không phải dự báo.{' '}
        <Link component={RouterLink} to={pf ? `/rebalance?p=${encodeURIComponent(pf)}` : '/rebalance'}>
          Muốn thử đổi tỷ trọng? Tái cân bằng
        </Link>
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
          <Skeleton variant="rounded" height={160} />
          <Skeleton variant="rounded" height={220} />
        </Stack>
      ) : heldFailed ? (
        <Alert severity="warning" variant="outlined" action={retryBtn}>
          Chưa lấy được danh mục của bạn, bạn thử lại nhé.
        </Alert>
      ) : stockOnlyCash ? (
        <Paper>
          <Centered
            title="Bạn chưa có tài sản nào để thử"
            actions={
              <Button variant="contained" component={RouterLink} to={pf ? `/portfolio?p=${pf}` : '/portfolio'}>
                Mở danh mục
              </Button>
            }
          >
            Khi bạn ghi cổ phiếu, vàng hoặc crypto vào danh mục, bạn có thể thử xem giá biến động ảnh hưởng thế nào.
          </Centered>
        </Paper>
      ) : onlyCash ? (
        <Paper>
          <Centered
            title="Danh mục chỉ có tiền mặt"
            actions={
              <Button variant="outlined" component={RouterLink} to={pf ? `/portfolio?p=${pf}` : '/portfolio'}>
                Mở danh mục
              </Button>
            }
          >
            Tiền mặt VND không đổi theo giá thị trường nên chưa có gì để mô phỏng. Khi bạn có cổ phiếu, vàng hoặc crypto, kịch bản sẽ hiện ở đây.
          </Centered>
        </Paper>
      ) : (
        <>
          {res && !noScenario && !headVisible && (
            <Paper
              data-testid="sim-sticky"
              aria-live="polite"
              sx={{ position: 'sticky', top: STICKY_TOP, zIndex: 2, px: 2, py: 1, opacity: loading ? 0.6 : 1 }}
            >
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="caption" color="text.secondary" component="div">
                    Tổng tài sản sau kịch bản
                  </Typography>
                  <Typography className="num" sx={{ fontWeight: 800, fontSize: 17 }} noWrap>
                    {fmtVnd(res.after.total)}
                  </Typography>
                </Box>
                <DeltaLine r={res} />
              </Stack>
            </Paper>
          )}

          <Panel title="Chọn kịch bản mẫu" subtitle="Các mức này chỉ là giả định để thử, không phải điều sắp xảy ra">
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)' }, gap: 1 }}>
              {presets.map((p) => (
                <PresetCard key={p.id} p={p} active={activePreset === p.id} onPick={() => pickPreset(p.id)} />
              ))}
              <PresetCard
                p={{ id: 'custom', title: 'Tự đặt kịch bản', desc: 'Chỉnh từng nhóm tài sản bên dưới', needs: 'stock', shocks: {} }}
                active={custom}
                onPick={() => controlsRef.current?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })}
              />
            </Box>
          </Panel>

          <Box ref={controlsRef} sx={{ scrollMarginTop: { xs: 'calc(64px + env(safe-area-inset-top))', md: 72 } }}>
            <Panel
              title="Điều chỉnh theo nhóm"
              subtitle="Kéo thanh trượt hoặc gõ số, âm là giảm giá"
              action={
                key ? (
                  <Button size="small" onClick={() => setShocks(EMPTY_SHOCKS)} sx={{ minHeight: 36 }}>
                    Đặt lại
                  </Button>
                ) : undefined
              }
            >
              <Box sx={{ mt: -1.5 }}>
                {rows.map(([k, label], i) => (
                  <Box key={k} sx={i > 0 ? { borderTop: 1, borderColor: 'divider' } : undefined}>
                    <ShockRow
                      id={k}
                      label={label}
                      value={shocks[k]}
                      onChange={(v) => set(k, v)}
                      hint={
                        k === 'fx' ? (
                          <Box component="span" sx={{ ml: 0.5 }}>
                            <InfoTip label="Giải thích tỷ giá">{FX_HINT}</InfoTip>
                          </Box>
                        ) : undefined
                      }
                    />
                  </Box>
                ))}
              </Box>

              {symbols.length > 0 && (
                <Box sx={{ borderTop: 1, borderColor: 'divider', mt: 0.5, pt: 0.5 }}>
                  <ButtonBase
                    onClick={() => setPicking((v) => !v)}
                    aria-expanded={picking || overridden.length > 0}
                    sx={{ width: '100%', justifyContent: 'space-between', py: 1.25, minHeight: 44, fontWeight: 700, fontSize: 15, color: 'primary.main' }}
                  >
                    Đặt riêng theo mã (tuỳ chọn)
                    <Box component="span" className="num" sx={{ color: 'text.secondary', fontWeight: 400, fontSize: 13 }}>
                      {overridden.length > 0 ? `${overridden.length} mã` : picking ? 'Thu gọn' : 'Mở'}
                    </Box>
                  </ButtonBase>
                  <Collapse in={picking || overridden.length > 0} unmountOnExit>
                    <Typography variant="caption" color="text.secondary" component="div">
                      Mã được đặt riêng sẽ dùng mức % của chính nó thay cho mức của nhóm.
                    </Typography>
                    {overridden.map((sym) => (
                      <ShockRow
                        key={sym}
                        id={`sym-${sym}`}
                        label={sym}
                        avatar={<AssetAvatar assetType={symType(sym)} symbol={sym} size={32} />}
                        value={shocks.symbols[sym]}
                        onChange={(v) => setSym(sym, v)}
                        onRemove={() => setSym(sym, null)}
                        compact
                      />
                    ))}
                    {candidates.length > 0 && (
                      <Box sx={{ mt: 1 }}>
                        <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 0.75 }}>
                          Chọn mã đang giữ
                        </Typography>
                        <Stack direction="row" useFlexGap sx={{ gap: 0.75, flexWrap: 'wrap' }}>
                          {candidates.map((x) => (
                            <Chip
                              key={x.symbol}
                              label={x.symbol}
                              variant="outlined"
                              onClick={() => {
                                const g = x.assetType === 'crypto' ? shocks.crypto : shocks.stock
                                setSym(x.symbol, g)
                              }}
                              sx={{ height: 36 }}
                            />
                          ))}
                        </Stack>
                      </Box>
                    )}
                  </Collapse>
                </Box>
              )}
            </Panel>
          </Box>

          {error && (
            <Alert severity={error.bad ? 'info' : 'warning'} variant="outlined" action={
                error.gone ? (
                  <Button size="small" color="inherit" onClick={() => setParams((prev) => { const n = new URLSearchParams(prev); n.delete('p'); return n }, { replace: true })} sx={{ minHeight: 36 }}>
                    Xem tất cả
                  </Button>
                ) : error.bad ? undefined : retryBtn
              }
              role="alert"
            >
              {error.bad ? error.message : 'Chưa tính được kịch bản, bạn thử lại nhé.'}
            </Alert>
          )}

          {noScenario ? (
            <Paper sx={{ p: 2.5 }} data-testid="sim-hint">
              <Typography sx={{ fontWeight: 700 }}>Chọn một kịch bản để xem kết quả</Typography>
              <Typography variant="body2" color="text.secondary">
                Chạm một kịch bản mẫu ở trên hoặc kéo một thanh trượt. Kết quả hiện ngay ở đây và không thay đổi sổ của bạn.
              </Typography>
            </Paper>
          ) : !res ? (
            error ? null : (
              <Stack spacing={1.5} aria-busy aria-label="Đang tính kịch bản">
                <Skeleton variant="rounded" height={170} />
                <Skeleton variant="rounded" height={160} />
              </Stack>
            )
          ) : (
            <Stack spacing={1.5} sx={{ opacity: loading ? 0.5 : 1, transition: 'opacity .15s' }} aria-busy={loading} data-testid="sim-result" data-loading={loading}>
              <Paper ref={headRef} sx={{ p: 2.5 }} data-testid="sim-total">
                <Typography variant="body2" color="text.secondary">
                  Hiện tại
                </Typography>
                <Typography className="num" sx={{ fontWeight: 600, fontSize: 18, lineHeight: 1.3 }}>
                  {fmtVnd(res.before.total)}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                  Sau kịch bản
                </Typography>
                <Typography className="num" sx={{ fontWeight: 800, fontSize: { xs: 28, sm: 32 }, lineHeight: 1.2 }} aria-live="polite">
                  {fmtVnd(res.after.total)}
                </Typography>
                <Box sx={{ mt: 0.5 }}>
                  <DeltaLine r={res} big />
                </Box>
                <Typography variant="body2" sx={{ mt: 1.5 }} data-testid="sim-sentence">
                  {describeScenario(shocks, res.delta)}
                </Typography>
              </Paper>

              <Panel title="Cơ cấu danh mục trước và sau" subtitle="Tỷ trọng từng nhóm trên tổng tài sản">
                <CompositionBars before={res.before} after={res.after} />
              </Panel>

              <Panel title="Tài sản bị ảnh hưởng nhiều nhất" subtitle={`${res.holdings.length} khoản, sắp theo mức thay đổi`} noPadding>
                <Box sx={{ px: 2, '& > *:not(:last-child)': { borderBottom: 1, borderColor: 'divider' } }}>
                  {top.map((h) => (
                    <HoldingImpactRow key={`${h.assetType}:${h.symbol}`} h={h} />
                  ))}
                </Box>
                {res.holdings.length > TOP_N && (
                  <Button fullWidth onClick={() => setShowAll((v) => !v)} sx={{ minHeight: 44, borderTop: 1, borderColor: 'divider', borderRadius: 0 }}>
                    {showAll ? 'Thu gọn' : `Xem tất cả ${res.holdings.length} khoản`}
                  </Button>
                )}
              </Panel>

              {res.missing.length > 0 && (
                <Alert severity="info" variant="outlined" data-testid="sim-missing">
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    Một số tài sản chưa có giá mới
                  </Typography>
                  <Typography variant="body2">
                    Giá cũ hoặc thiếu giá: các mã này được tính theo giá đang hiển thị ở Danh mục, nên kết quả chỉ mang tính tham khảo.
                  </Typography>
                  <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
                    {res.missing.map((m) => (
                      <li key={`${m.assetType}:${m.symbol}`}>
                        <Typography variant="body2">
                          <b>{m.symbol}</b>: {m.reason}
                        </Typography>
                      </li>
                    ))}
                  </Box>
                </Alert>
              )}

              {notes.length > 0 && (
                <Box component="ul" sx={{ m: 0, pl: 2.5, color: 'text.secondary' }} data-testid="sim-notes">
                  {notes.map((n) => (
                    <li key={n}>
                      <Typography variant="caption" component="span">
                        {n}
                      </Typography>
                    </li>
                  ))}
                </Box>
              )}
            </Stack>
          )}

          <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', pt: 0.5, pb: 1 }}>
            Chỉ là mô phỏng theo giả định bạn chọn, không thay đổi sổ và không phải dự báo.
            {res ? ` Giá tính đến ${fmtDate(res.asOf)}.` : ''}
          </Typography>
        </>
      )}
    </Stack>
  )
}
