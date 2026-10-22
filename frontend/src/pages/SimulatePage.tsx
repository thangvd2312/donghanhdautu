import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom'
import PortfolioChips from '../components/analysis/PortfolioChips'
import DeltaLine from '../components/simulate/DeltaLine'
import ShockControls from '../components/simulate/ShockControls'
import SimulateEmpty from '../components/simulate/SimulateEmpty'
import SimulationResult from '../components/simulate/SimulationResult'
import { PresetCard } from '../components/simulate/SimulateParts'
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
    const search = [pf && `p=${encodeURIComponent(pf)}`, key && `s=${key.replace(/[^A-Za-z0-9:,.+-]/g, encodeURIComponent)}`].filter(Boolean).join('&')
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
        <Paper>
          <SimulateEmpty
            title="Bạn chưa có tài sản nào để thử"
            actions={
              <Button variant="contained" component={RouterLink} to={pf ? `/portfolio?p=${pf}` : '/portfolio'}>
                Mở danh mục
              </Button>
            }
          >
            Khi bạn ghi cổ phiếu, vàng hoặc crypto vào danh mục, bạn có thể thử xem giá biến động ảnh hưởng thế nào.
          </SimulateEmpty>
        </Paper>
      ) : onlyCash ? (
        <Paper>
          <SimulateEmpty
            title="Danh mục chỉ có tiền mặt"
            actions={
              <Button variant="outlined" component={RouterLink} to={pf ? `/portfolio?p=${pf}` : '/portfolio'}>
                Mở danh mục
              </Button>
            }
          >
            Tiền mặt VND không đổi theo giá thị trường nên chưa có gì để mô phỏng. Khi bạn có cổ phiếu, vàng hoặc crypto, kịch bản sẽ hiện ở đây.
          </SimulateEmpty>
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
            <ShockControls shocks={shocks} setShocks={setShocks} groups={groups} symbols={symbols} />
          </Box>

          {error && (
            <Alert severity={error.bad ? 'info' : 'warning'} variant="outlined" action={
                error.gone ? (
                  <Button size="small" color="inherit" onClick={() => setPf('')} sx={{ minHeight: 36 }}>
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
            <SimulationResult
              res={res}
              shocks={shocks}
              loading={loading}
              headRef={headRef}
              showAll={showAll}
              onToggleShowAll={() => setShowAll((v) => !v)}
            />
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
