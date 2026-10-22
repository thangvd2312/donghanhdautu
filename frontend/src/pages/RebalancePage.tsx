import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useEffect, useMemo, useRef, useState } from 'react'
import PortfolioChips from '../components/analysis/PortfolioChips'
import OptionsPanel from '../components/rebalance/OptionsPanel'
import RebalanceResult from '../components/rebalance/RebalanceResult'
import ResultPlaceholder from '../components/rebalance/ResultPlaceholder'
import SumBar from '../components/rebalance/SumBar'
import TargetsPanel from '../components/rebalance/TargetsPanel'
import SearchDialog from '../components/SearchDialog'
import { useHeldPortfolio } from '../hooks/useHeldPortfolio'
import { useInView } from '../hooks/useInView'
import { usePortfolioParam } from '../hooks/usePortfolioParam'
import { useRebalance } from '../hooks/useRebalance'
import { fmtDate } from '../lib/format'
import {
  buildRequest,
  buildRows,
  CASH_KEY,
  DEFAULT_FEES,
  keepCurrent,
  MAX_ROWS,
  parseFees,
  rowKey,
  splitEvenly,
  sumPct,
  type FeeText,
} from '../lib/rebalance'
import { useIsMobile } from '../lib/useIsMobile'
import type { RebalanceLots, RebalanceMode } from '../lib/types'

/**
 * Tái cân bằng: bạn đặt tỷ trọng mong muốn (và tiền bổ sung nếu có), công cụ tính cần mua / bán bao nhiêu để tiến gần mục tiêu đó.
 * Chỉ là phép tính theo lựa chọn của bạn: không khuyến nghị mã nào, không tạo giao dịch, không ghi vào sổ.
 */
export default function RebalancePage() {
  const mobile = useIsMobile()
  const [pf, setPf] = usePortfolioParam()
  const { accounts, held, failed: heldFailed, retry: retryHeld } = useHeldPortfolio(pf)
  const [added, setAdded] = useState<string[]>([])
  const [targets, setTargets] = useState<Record<string, number>>({})
  const [touched, setTouched] = useState(false)
  const [money, setMoney] = useState(0)
  const [mode, setMode] = useState<RebalanceMode>('buy_only')
  const [lots, setLots] = useState<RebalanceLots>('board')
  const [fees, setFees] = useState<FeeText>({ ...DEFAULT_FEES })
  const [picking, setPicking] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const resultRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    document.title = 'Tái cân bằng · Đồng Hành Đầu Tư'
  }, [])

  // Danh mục (mới) tải xong: bắt đầu từ "giữ như hiện tại", bỏ mã đã thêm và kết quả cũ
  useEffect(() => {
    if (!held) return
    setAdded([])
    setTargets(keepCurrent(buildRows(held, [])))
    setTouched(false)
    resetResult()
    // resetResult ổn định theo mỗi lần render nhưng chỉ cần chạy khi danh mục đổi
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const bodyKey = canRun && feeBody ? JSON.stringify(buildRequest(rows, targets, pf, money, mode, lots, feeBody)) : ''
  const { res, loading, error, reset: resetResult, retry: retrySolve } = useRebalance(bodyKey)

  // Thanh tóm tắt dính chỉ hiện nút "Xem kết quả" khi khối tóm tắt đã cuộn khỏi màn hình
  const { ref: headRef, visible: headVisible } = useInView(res !== null)

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
    <Button size="small" color="inherit" onClick={retrySolve} sx={{ minHeight: 36 }}>
      Thử lại
    </Button>
  )
  const stale = res !== null && !canRun
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

      <PortfolioChips accounts={accounts} value={pf} onChange={setPf} />

      {held === undefined ? (
        <Stack spacing={1.5} aria-busy aria-label="Đang tải danh mục">
          <Skeleton variant="rounded" height={260} />
          <Skeleton variant="rounded" height={220} />
        </Stack>
      ) : heldFailed ? (
        <Alert severity="warning" variant="outlined" action={<Button size="small" color="inherit" onClick={() => retryHeld()} sx={{ minHeight: 36 }}>Thử lại</Button>}>
          Chưa lấy được danh mục của bạn, bạn thử lại nhé.
        </Alert>
      ) : (
        <>
          <SumBar
            sumOk={sumOk}
            diff={diff}
            canFixWithCash={canFixWithCash}
            onFixWithCash={fixWithCash}
            showResultLink={sumOk && !!res && !headVisible}
            onScrollToResult={scrollToResult}
          />

          <TargetsPanel
            rows={rows}
            targets={targets}
            added={added}
            mode={mode}
            hasHoldings={hasHoldings}
            onTarget={setTarget}
            onKeepCurrent={() => edit(() => setTargets(keepCurrent(rows)))}
            onSplitEvenly={() => edit(() => setTargets(splitEvenly(rows)))}
            onRemoveStock={removeStock}
            onAddStock={() => setPicking(true)}
          />

          <OptionsPanel
            money={money}
            mode={mode}
            lots={lots}
            fees={fees}
            onMoney={(update) => edit(() => setMoney(update))}
            onMode={(v) => edit(() => setMode(v))}
            onLots={(v) => edit(() => setLots(v))}
            onFees={(v) => edit(() => setFees(v))}
          />

          {error && (
            <Alert
              severity={error.bad ? 'info' : 'warning'}
              variant="outlined"
              role="alert"
              data-testid="rb-error"
              action={
                error.gone ? (
                  <Button size="small" color="inherit" onClick={() => setPf('')} sx={{ minHeight: 36 }}>
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
              error ? null : (
                <ResultPlaceholder
                  touched={touched}
                  hasHoldings={hasHoldings}
                  money={money}
                  sumOk={sumOk}
                  diff={diff}
                  portfolioLink={portfolioLink}
                />
              )
            ) : (
              <RebalanceResult
                res={res}
                stale={stale}
                loading={loading}
                headRef={headRef}
                notesOpen={notesOpen}
                onToggleNotes={() => setNotesOpen((v) => !v)}
              />
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
