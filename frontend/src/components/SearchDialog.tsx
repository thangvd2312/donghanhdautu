import ArrowBack from '@mui/icons-material/ArrowBack'
import CloseRounded from '@mui/icons-material/CloseRounded'
import HistoryOutlined from '@mui/icons-material/HistoryOutlined'
import SearchIcon from '@mui/icons-material/Search'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import IconButton from '@mui/material/IconButton'
import InputBase from '@mui/material/InputBase'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchStocks } from '../api/search'
import { changeColor, fmtPct, fmtStockPrice, fmtUsd } from '../lib/format'
import { useMarket } from '../lib/market-context'
import AssetAvatar from './AssetAvatar'
import type { StockHit } from '../lib/types'
import { ChangePill } from './ui'

/** Một kết quả: cổ phiếu (tìm qua API) hoặc coin (lọc tại chỗ từ bảng giá realtime) */
interface Hit {
  kind: 'stock' | 'crypto'
  symbol: string
  name: string
  tag: string
  to: string
}

const RECENT_KEY = 'dautu_recent_search'
const MAX_RECENT = 6

function readRecent(): Hit[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as Hit[]
    return Array.isArray(v) ? v.slice(0, MAX_RECENT) : []
  } catch {
    return []
  }
}

function saveRecent(h: Hit) {
  try {
    const list = [h, ...readRecent().filter((x) => x.to !== h.to)].slice(0, MAX_RECENT)
    localStorage.setItem(RECENT_KEY, JSON.stringify(list))
  } catch {
    // Safari riêng tư / bộ nhớ bị chặn: bỏ qua lịch sử tìm kiếm
  }
}

/**
 * Tìm mã toàn app: thanh tìm dạng viên, kết quả kèm logo + giá realtime,
 * khi chưa gõ thì gợi ý tìm gần đây và các mã phổ biến. Điện thoại: phủ toàn màn hình.
 */
export default function SearchDialog({
  open,
  onClose,
  fullScreen,
  onPickStock,
  exclude,
  pickHint,
}: {
  open: boolean
  onClose: () => void
  fullScreen: boolean
  /** Chế độ chọn mã: chỉ cổ phiếu, chọn xong gọi hàm này thay vì mở trang mã (dùng cho màn hình so sánh) */
  onPickStock?: (symbol: string) => void
  /** Mã đã chọn, không hiện lại trong kết quả */
  exclude?: string[]
  pickHint?: string
}) {
  const nav = useNavigate()
  const { snapshot } = useMarket()
  const [q, setQ] = useState('')
  const [stocks, setStocks] = useState<StockHit[]>([])
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(0)
  const [recent, setRecent] = useState<Hit[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setQ('')
    setActive(0)
    setRecent(readRecent())
  }, [open])

  useEffect(() => {
    const term = q.trim()
    if (!term) {
      setStocks([])
      setLoading(false)
      return
    }
    setLoading(true)
    const t = setTimeout(() => {
      searchStocks(term)
        .then(setStocks)
        .catch(() => setStocks([]))
        .finally(() => setLoading(false))
    }, 200)
    return () => clearTimeout(t)
  }, [q])

  const hits = useMemo<Hit[]>(() => {
    const term = q.trim().toUpperCase()
    if (!term) return []
    const coins = (onPickStock ? [] : snapshot?.crypto ?? [])
      .filter((c) => c.base.startsWith(term))
      .slice(0, 3)
      .map<Hit>((c) => ({ kind: 'crypto', symbol: c.base, name: `${c.base}/USDT`, tag: 'Crypto', to: `/crypto/${c.base}` }))
    const st = stocks
      .filter((s) => !exclude?.includes(s.symbol))
      .map<Hit>((s) => ({ kind: 'stock', symbol: s.symbol, name: s.name, tag: s.board, to: `/stock/${s.symbol}` }))
    // Mã khớp chính xác lên đầu (gõ "BTC" thì BTC trước, gõ "FPT" thì FPT trước FTS)
    return [...st, ...coins].sort((a, b) => Number(b.symbol === term) - Number(a.symbol === term))
  }, [q, stocks, snapshot, onPickStock, exclude])

  const popular = useMemo<Hit[]>(() => {
    const st = [...(snapshot?.stocks ?? [])]
      .filter((s) => !exclude?.includes(s.symbol))
      .sort((a, b) => b.valueBn - a.valueBn)
      .slice(0, 6)
      .map<Hit>((s) => ({ kind: 'stock', symbol: s.symbol, name: s.name, tag: 'HSX', to: `/stock/${s.symbol}` }))
    const coins = (onPickStock ? [] : snapshot?.crypto ?? [])
      .slice(0, 3)
      .map<Hit>((c) => ({ kind: 'crypto', symbol: c.base, name: `${c.base}/USDT`, tag: 'Crypto', to: `/crypto/${c.base}` }))
    return [...st, ...coins]
  }, [snapshot, onPickStock, exclude])

  const pick = (h: Hit) => {
    onClose()
    if (onPickStock) {
      onPickStock(h.symbol)
      return
    }
    saveRecent(h)
    nav(h.to)
  }

  const onKey = (e: KeyboardEvent) => {
    if (!hits.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(hits.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      pick(hits[Math.min(active, hits.length - 1)])
    }
  }

  const quote = (h: Hit) => {
    if (h.kind === 'stock') {
      const s = snapshot?.stocks.find((x) => x.symbol === h.symbol)
      return s ? { price: fmtStockPrice(s.price), pct: s.changePct } : null
    }
    const c = snapshot?.crypto.find((x) => x.base === h.symbol)
    return c ? { price: fmtUsd(c.price), pct: c.changePct } : null
  }

  const row = (h: Hit, i: number, icon?: ReactNode) => {
    const qt = quote(h)
    return (
      <ButtonBase
        key={h.to}
        onClick={() => pick(h)}
        onMouseEnter={() => setActive(i)}
        sx={{
          width: '100%',
          justifyContent: 'flex-start',
          textAlign: 'left',
          gap: 1.5,
          px: 2,
          py: 1.25,
          borderRadius: 2,
          bgcolor: q && i === active ? 'action.hover' : 'transparent',
        }}
      >
        {icon ?? <AssetAvatar assetType={h.kind} symbol={h.symbol} size={36} />}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, lineHeight: 1.3 }}>
            {h.symbol}
            <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
              {h.tag}
            </Typography>
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap component="div">
            {h.name}
          </Typography>
        </Box>
        {qt && (
          <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
            <Typography variant="body2" className="num" sx={{ fontWeight: 600 }}>
              {qt.price}
            </Typography>
            <ChangePill small color={changeColor(qt.pct)}>
              {fmtPct(qt.pct)}
            </ChangePill>
          </Box>
        )}
      </ButtonBase>
    )
  }

  const section = (title: string, children: ReactNode) => (
    <Box sx={{ mt: 1.5 }}>
      <Typography variant="overline" color="text.secondary" sx={{ px: 2 }}>
        {title}
      </Typography>
      {children}
    </Box>
  )

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={fullScreen}
      fullWidth
      maxWidth="sm"
      // Desktop: hộp tìm nằm phía trên màn hình như bảng lệnh, không giữa màn hình
      sx={fullScreen ? undefined : { '& .MuiDialog-container': { alignItems: 'flex-start' }, '& .MuiDialog-paper': { mt: 10 } }}
      slotProps={{ transition: { onEntered: () => inputRef.current?.focus() } }}
    >
      <Box sx={{ p: 1.5, pt: fullScreen ? 'calc(12px + env(safe-area-inset-top))' : 1.5, borderBottom: 1, borderColor: 'divider' }}>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
          {fullScreen && (
            <IconButton aria-label="Đóng" onClick={onClose}>
              <ArrowBack />
            </IconButton>
          )}
          <Stack
            direction="row"
            spacing={1}
            sx={{ flex: 1, alignItems: 'center', bgcolor: 'action.hover', borderRadius: 99, px: 1.75, height: 46 }}
          >
            {loading ? <CircularProgress size={18} /> : <SearchIcon sx={{ color: 'text.secondary' }} />}
            <InputBase
              inputRef={inputRef}
              autoFocus
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setActive(0)
              }}
              onKeyDown={onKey}
              placeholder="Tìm mã hoặc tên công ty"
              inputProps={{ 'aria-label': 'Tìm mã', autoCapitalize: 'characters', autoCorrect: 'off', spellCheck: false, enterKeyHint: 'search' }}
              sx={{ flex: 1, fontSize: 16 }}
            />
            {q && (
              <IconButton aria-label="Xoá" size="small" onClick={() => setQ('')} sx={{ mr: -1, width: 32, height: 32 }}>
                <CloseRounded fontSize="small" />
              </IconButton>
            )}
          </Stack>
          {!fullScreen && (
            <IconButton aria-label="Đóng" onClick={onClose}>
              <CloseRounded />
            </IconButton>
          )}
        </Stack>
      </Box>

      <Box sx={{ overflowY: 'auto', pb: 2, px: 0.5, minHeight: fullScreen ? undefined : 320, maxHeight: fullScreen ? undefined : '60vh' }}>
        {q.trim() ? (
          hits.length ? (
            <Box sx={{ mt: 1 }}>{hits.map((h, i) => row(h, i))}</Box>
          ) : (
            !loading && (
              <Typography color="text.secondary" sx={{ textAlign: 'center', py: 6 }}>
                Không tìm thấy “{q.trim()}”
              </Typography>
            )
          )
        ) : (
          <>
            {pickHint && (
              <Typography variant="body2" color="text.secondary" sx={{ px: 2, pt: 1.5 }}>
                {pickHint}
              </Typography>
            )}
            {!onPickStock && recent.length > 0 &&
              section(
                'Tìm gần đây',
                recent.map((h, i) =>
                  row(
                    h,
                    i,
                    <Box sx={{ width: 36, height: 36, display: 'grid', placeItems: 'center', color: 'text.secondary' }}>
                      <HistoryOutlined />
                    </Box>,
                  ),
                ),
              )}
            {popular.length > 0 && section(onPickStock ? 'Gợi ý: mã giao dịch nhiều' : 'Giao dịch nhiều', popular.map((h, i) => row(h, i)))}
          </>
        )}
      </Box>
    </Dialog>
  )
}
