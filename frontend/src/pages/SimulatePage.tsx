import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom'
import TuneOutlined from '@mui/icons-material/TuneOutlined'
import { EmptyState, PageHeader } from '../components/page'
import PortfolioChips from '../components/analysis/PortfolioChips'
import DeltaLine from '../components/simulate/DeltaLine'
import ShockControls from '../components/simulate/ShockControls'
import SimulateEmpty from '../components/simulate/SimulateEmpty'
import SimulationResult from '../components/simulate/SimulationResult'
import { PresetCard } from '../components/simulate/SimulateParts'
import { CardLink } from '../components/home/HomeBlocks'
import { Panel } from '../components/ui'
import { useHeldPortfolio } from '../hooks/useHeldPortfolio'
import { useInView } from '../hooks/useInView'
import { usePortfolioParam } from '../hooks/usePortfolioParam'
import { useSimulation } from '../hooks/useSimulation'
import { fmtDate, fmtVnd } from '../lib/format'
import { STICKY_TOP } from '../lib/layout'
import {
  buildShocks,
  heldGroups,
  heldSymbols,
  parseShocks,
  presetToShocks,
  PRESETS,
  sameShocks,
  serializeShocks,
  type ShockState,
} from '../lib/simulate'

/**
 * Thử kịch bản: "nếu giá thay đổi như vậy thì tài sản đang giữ của tôi thế nào". Chỉ là phép tính theo giả định người dùng chọn,
 * không ghi vào sổ, không phải dự báo. Kịch bản và danh mục nằm trên URL (?p=…&s=stock:-10,FPT:-25) để quay lại / chia sẻ.
 */
export default function SimulatePage() {
  const [params] = useSearchParams()
  const nav = useNavigate()
  const [pf, setPf] = usePortfolioParam()
  const [shocks, setShocks] = useState<ShockState>(() => parseShocks(params.get('s')))
  const { accounts, held, failed: heldFailed, retry: retryHeld } = useHeldPortfolio(pf)
  const [showAll, setShowAll] = useState(false)
  const controlsRef = useRef<HTMLDivElement | null>(null)

  const holdings = held?.holdings
  const groups = useMemo(() => heldGroups(holdings), [holdings])
  const symbols = useMemo(() => heldSymbols(holdings), [holdings])

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
    const search = [pf && `p=${encodeURIComponent(pf)}`, key && `s=${key.replace(/[^A-Za-z0-9:,.+-]/g, encodeURIComponent)}`]
      .filter(Boolean)
      .join('&')
    if (search !== window.location.search.replace(/^\?/, '')) nav({ search: search ? `?${search}` : '' }, { replace: true })
  }, [key, pf, nav])

  // Gọi API sau khi người dùng ngừng chỉnh một chút; kết quả cũ giữ lại (mờ đi) trong lúc chờ
  const body = useMemo(() => buildShocks(shocks), [shocks])
  const { res, loading, error, retry: retrySim } = useSimulation(body, pf, !!holdings?.length)

  // Thanh tóm tắt dính trên cùng chỉ hiện khi khối kết quả lớn đã cuộn khỏi màn hình
  const { ref: headRef, visible: headVisible } = useInView(res !== null)

  const pickPreset = (id: string) => {
    const p = PRESETS.find((x) => x.id === id)
    if (p) setShocks(presetToShocks(p))
  }
  const retryBtn = (
    <Button
      size="small"
      color="inherit"
      onClick={() => {
        retryHeld()
        retrySim()
      }}
      sx={{ minHeight: 36 }}
    >
      Thử lại
    </Button>
  )

  const presets = PRESETS.filter((p) => (p.needs === 'usdt' ? groups.usdt : groups[p.needs]))
  const activePreset = presets.find((p) => sameShocks(shocks, presetToShocks(p)))?.id
  const custom = !!serializeShocks(shocks) && !activePreset
  const stockOnlyCash = held && !groups.any
  const onlyCash = !!held && held.holdings.length > 0 && !groups.stock && !groups.crypto && !groups.gold && !groups.usdt
  const noScenario = !body

  return (
    <Stack spacing={2.5}>
      <PageHeader
        eyebrow="Công cụ"
        title="Thử kịch bản"
        description="Xem tài sản thay đổi thế nào nếu giá biến động theo giả định bạn chọn. Để hiểu rủi ro, không phải dự báo."
      />

      <PortfolioChips accounts={accounts} value={pf} onChange={setPf} />

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
        <>
          <SimulateEmpty
            title="Bạn chưa có tài sản nào để thử"
            actions={
              <Button variant="contained" component={RouterLink} to={pf ? `/portfolio?p=${pf}` : '/portfolio'}>
                Mở danh mục
              </Button>
            }
          >
            Ghi cổ phiếu, vàng hoặc crypto vào danh mục để thử kịch bản.
          </SimulateEmpty>
        </>
      ) : onlyCash ? (
        <>
          <SimulateEmpty
            title="Danh mục chỉ có tiền mặt"
            actions={
              <Button variant="outlined" component={RouterLink} to={pf ? `/portfolio?p=${pf}` : '/portfolio'}>
                Mở danh mục
              </Button>
            }
          >
            Tiền mặt không đổi theo giá, nên chưa có gì để thử.
          </SimulateEmpty>
        </>
      ) : (
        <>
          {/* Desktop: chọn kịch bản bên trái, kết quả bên phải; điện thoại: một cột */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) minmax(0, 1fr)' },
              gap: { xs: 2.5, md: 3 },
              alignItems: 'start',
            }}
          >
            <Stack spacing={2.5} sx={{ minWidth: 0 }}>
              <Panel
                title="Chọn kịch bản mẫu"
                subtitle="Các mức này chỉ là giả định để thử, không phải điều sắp xảy ra"
                action={<CardLink to={pf ? `/rebalance?p=${encodeURIComponent(pf)}` : '/rebalance'}>Tái cân bằng</CardLink>}
              >
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)' }, gap: 1 }}>
                  {presets.map((p) => (
                    <PresetCard key={p.id} p={p} active={activePreset === p.id} onPick={() => pickPreset(p.id)} />
                  ))}
                  <PresetCard
                    p={{ id: 'custom', title: 'Tự đặt kịch bản', desc: 'Chỉnh từng nhóm tài sản bên dưới', needs: 'stock', shocks: {} }}
                    active={custom}
                    onPick={() =>
                      controlsRef.current?.scrollIntoView({
                        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
                        block: 'start',
                      })
                    }
                  />
                </Box>
              </Panel>

              <Box ref={controlsRef} sx={{ scrollMarginTop: { xs: 'calc(64px + env(safe-area-inset-top))', md: 72 } }}>
                <ShockControls shocks={shocks} setShocks={setShocks} groups={groups} symbols={symbols} />
              </Box>
            </Stack>
            <Stack spacing={2.5} sx={{ minWidth: 0 }}>
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

              {error && (
                <Alert
                  severity={error.bad ? 'info' : 'warning'}
                  variant="outlined"
                  action={
                    error.gone ? (
                      <Button size="small" color="inherit" onClick={() => setPf('')} sx={{ minHeight: 36 }}>
                        Xem tất cả
                      </Button>
                    ) : error.bad ? undefined : (
                      retryBtn
                    )
                  }
                  role="alert"
                >
                  {error.bad ? error.message : 'Chưa tính được kịch bản, bạn thử lại nhé.'}
                </Alert>
              )}

              {noScenario ? (
                <Box data-testid="sim-hint">
                  <EmptyState Icon={TuneOutlined} title="Chọn một kịch bản để xem kết quả">
                    Chạm một kịch bản mẫu hoặc kéo thanh trượt.
                  </EmptyState>
                </Box>
              ) : !res ? (
                error ? null : (
                  <Stack spacing={1.5} aria-busy aria-label="Đang tính kịch bản">
                    <Skeleton variant="rounded" height={170} />
                    <Skeleton variant="rounded" height={160} />
                  </Stack>
                )
              ) : (
                <SimulationResult
                  res={res}
                  shocks={shocks}
                  loading={loading}
                  headRef={headRef}
                  showAll={showAll}
                  onToggleShowAll={() => setShowAll((v) => !v)}
                />
              )}
            </Stack>
          </Box>

          <Typography variant="caption" color="text.secondary" sx={{ pb: 1, display: { xs: 'none', md: 'block' } }}>
            Chỉ là mô phỏng theo giả định bạn chọn, không thay đổi sổ và không phải dự báo.
            {res ? ` Giá tính đến ${fmtDate(res.asOf)}.` : ''}
          </Typography>
        </>
      )}
    </Stack>
  )
}
