import SearchIcon from '@mui/icons-material/Search'
import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import InputAdornment from '@mui/material/InputAdornment'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useEffect, useState } from 'react'
import { api } from '../lib/api'

export interface StockHit {
  symbol: string
  name: string
  board: string
}

export default function StockSearch({
  onPick,
  placeholder = 'Tìm mã cổ phiếu…',
  label,
  size = 'small',
  autoFocus,
}: {
  onPick: (symbol: string, hit: StockHit) => void
  placeholder?: string
  label?: string
  size?: 'small' | 'medium'
  autoFocus?: boolean
}) {
  const [input, setInput] = useState('')
  const [options, setOptions] = useState<StockHit[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!input.trim()) {
      setOptions([])
      return
    }
    setLoading(true)
    const t = setTimeout(() => {
      api<StockHit[]>(`/market/search?q=${encodeURIComponent(input)}`)
        .then(setOptions)
        .catch(() => setOptions([]))
        .finally(() => setLoading(false))
    }, 200)
    return () => clearTimeout(t)
  }, [input])

  return (
    <Autocomplete
      size={size}
      options={options}
      loading={loading}
      filterOptions={(x) => x}
      getOptionLabel={(o) => o.symbol}
      isOptionEqualToValue={(a, b) => a.symbol === b.symbol}
      value={null}
      inputValue={input}
      onInputChange={(_, v, reason) => reason !== 'reset' && setInput(v)}
      onChange={(_, v) => {
        if (v) {
          onPick(v.symbol, v)
          setInput('')
        }
      }}
      noOptionsText={input ? 'Không tìm thấy mã' : 'Gõ mã hoặc tên công ty'}
      loadingText="Đang tìm…"
      renderOption={({ key, ...props }, o) => (
        <Box component="li" key={key} {...props} sx={{ display: 'block !important' }}>
          <Typography component="span" sx={{ fontWeight: 700 }}>
            {o.symbol}
          </Typography>
          <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
            {o.board}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap component="div">
            {o.name}
          </Typography>
        </Box>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder={placeholder}
          autoFocus={autoFocus}
          slotProps={{
            ...params.slotProps,
            input: {
              ...params.slotProps.input,
              startAdornment: label ? (
                params.slotProps.input.startAdornment
              ) : (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
      )}
    />
  )
}
