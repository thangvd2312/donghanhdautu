import ContentPasteOutlined from '@mui/icons-material/ContentPasteOutlined'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { ApiError } from '../../api/client'
import { createTip } from '../../api/tips'
import { MAX_TIP_TEXT, SOURCE_KINDS, tipTextError } from '../../lib/tips'
import type { TipCheck, TipSourceKind } from '../../lib/types'
import { Panel } from '../ui'

/**
 * Dán tin → bóc tách (vài giây) → chuyển sang phiếu, phiếu tự phân tích. Tin không nêu mã nào thì hỏi người dùng
 * gõ mã rồi gửi lại cùng nội dung.
 */
export default function TipComposer({ onCreated }: { onCreated: (tip: TipCheck) => void }) {
  const [text, setText] = useState('')
  const [sourceName, setSourceName] = useState('')
  const [sourceKind, setSourceKind] = useState<TipSourceKind | null>(null)
  const [symbol, setSymbol] = useState('')
  const [needSymbol, setNeedSymbol] = useState(false)
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const textError = touched ? tipTextError(text) : ''

  const paste = async () => {
    try {
      const t = await navigator.clipboard.readText()
      if (t) setText(t.slice(0, MAX_TIP_TEXT + 100))
    } catch {
      setError('Trình duyệt không cho đọc bộ nhớ tạm: hãy nhấn giữ vào ô và chọn Dán.')
    }
  }

  const submit = async () => {
    setTouched(true)
    if (tipTextError(text)) return
    if (needSymbol && !symbol.trim()) return setError('Gõ mã cổ phiếu hoặc coin mà tin đang nói tới')
    setBusy(true)
    setError('')
    try {
      const tip = await createTip({
        text: text.trim(),
        sourceName: sourceName.trim() || undefined,
        sourceKind: sourceKind ?? undefined,
        symbol: symbol.trim() || undefined,
      })
      onCreated(tip)
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) setNeedSymbol(true)
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel
      title="Soi một lời khuyên"
      subtitle="Dán tin hô mã từ nhóm Zalo, Telegram, Facebook hay lời môi giới. App đặt nó cạnh dữ liệu thật trước khi bạn xuống tiền."
    >
      <Stack
        component="form"
        spacing={1.5}
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <TextField
          label="Nội dung lời khuyên"
          placeholder="VD: HPG múc ngay vùng 21, target 28, ăn chắc 30%…"
          multiline
          minRows={4}
          maxRows={12}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => setTouched(true)}
          error={!!textError}
          helperText={textError || `${text.length.toLocaleString('vi-VN')} / ${MAX_TIP_TEXT.toLocaleString('vi-VN')} ký tự`}
          slotProps={{ htmlInput: { style: { fontSize: 16 } } }}
        />
        {'clipboard' in navigator && (
          <Button startIcon={<ContentPasteOutlined />} onClick={() => void paste()} sx={{ alignSelf: 'flex-start', minHeight: 44 }}>
            Dán từ bộ nhớ tạm
          </Button>
        )}
        <TextField
          label="Nguồn (tuỳ chọn)"
          placeholder="VD: Nhóm VIP anh T"
          value={sourceName}
          onChange={(e) => setSourceName(e.target.value.slice(0, 80))}
          helperText="Ghi nguồn để sau này xem nguồn nào nói đúng nhiều hơn"
          slotProps={{ htmlInput: { style: { fontSize: 16 } } }}
        />
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
          {SOURCE_KINDS.map((k) => (
            <Chip
              key={k.value}
              label={k.label}
              clickable
              color={sourceKind === k.value ? 'primary' : 'default'}
              variant={sourceKind === k.value ? 'filled' : 'outlined'}
              onClick={() => setSourceKind(sourceKind === k.value ? null : k.value)}
              sx={{ minHeight: 36 }}
            />
          ))}
        </Stack>
        {needSymbol && (
          <TextField
            label="Mã cổ phiếu hoặc coin"
            placeholder="VD: HPG, BTC"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase().slice(0, 20))}
            autoFocus
            slotProps={{ htmlInput: { style: { fontSize: 16 }, autoCapitalize: 'characters' } }}
          />
        )}
        {error && <Alert severity={needSymbol ? 'info' : 'error'}>{error}</Alert>}
        <Button type="submit" variant="contained" size="large" disabled={busy} sx={{ minHeight: 48 }}>
          {busy ? 'Đang đọc tin…' : 'Soi'}
        </Button>
        <Typography variant="caption" color="text.secondary">
          Tin chỉ dùng để phân tích cho riêng bạn. App không khuyến nghị mua / bán.
        </Typography>
      </Stack>
    </Panel>
  )
}
