import Star from '@mui/icons-material/Star'
import StarBorder from '@mui/icons-material/StarBorder'
import Button from '@mui/material/Button'
import Tooltip from '@mui/material/Tooltip'
import { useEffect, useState } from 'react'
import { api, del, post } from '../lib/api'
import type { WatchItem } from '../lib/types'
import { QuickAction } from './ui'

/** Nút theo dõi / bỏ theo dõi một tài sản (không cần sở hữu). `symbol` đã chuẩn hoá: FPT, BTCUSDT, SJL1L10 */
export default function WatchButton({
  assetType,
  symbol,
  tile,
}: {
  assetType: WatchItem['assetType']
  symbol: string
  /** Hiển thị dạng ô hành động nhanh (icon + nhãn) */
  tile?: boolean
}) {
  const [item, setItem] = useState<{ id: string } | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    setLoaded(false)
    api<WatchItem[]>('/watchlist')
      .then((list) => {
        if (!alive) return
        setItem(list.find((w) => w.assetType === assetType && w.symbol === symbol) ?? null)
        setLoaded(true)
      })
      .catch(() => alive && setLoaded(true))
    return () => {
      alive = false
    }
  }, [assetType, symbol])

  const toggle = async () => {
    setBusy(true)
    setError('')
    try {
      if (item) {
        await del(`/watchlist/${item.id}`)
        setItem(null)
      } else {
        setItem(await post<{ id: string }>('/watchlist', { assetType, symbol }))
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (tile)
    return (
      <QuickAction
        icon={item ? <Star /> : <StarBorder />}
        label={error ? 'Lỗi, thử lại' : item ? 'Đang theo dõi' : 'Theo dõi'}
        active={!!item}
        disabled={!loaded || busy}
        onClick={() => void toggle()}
      />
    )

  return (
    <Tooltip title={error || (item ? 'Bỏ khỏi danh sách theo dõi' : 'Theo dõi giá trên trang tổng quan mà không cần mua')}>
      <span>
        <Button
          variant="outlined"
          color={error ? 'error' : item ? 'primary' : 'inherit'}
          startIcon={item ? <Star /> : <StarBorder />}
          disabled={!loaded || busy}
          onClick={() => void toggle()}
        >
          {item ? 'Đang theo dõi' : 'Theo dõi'}
        </Button>
      </span>
    </Tooltip>
  )
}
