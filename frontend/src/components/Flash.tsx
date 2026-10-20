import Box from '@mui/material/Box'
import { keyframes } from '@mui/material/styles'
import { useEffect, useRef, useState, type ReactNode } from 'react'

const flashUp = keyframes`from { background-color: rgba(34,197,94,.30) } to { background-color: transparent }`
const flashDown = keyframes`from { background-color: rgba(239,68,68,.30) } to { background-color: transparent }`

/** Nháy nền xanh/đỏ khi giá trị thay đổi, như bảng giá chứng khoán */
export default function Flash({ value, children }: { value: number; children: ReactNode }) {
  const prev = useRef(value)
  const [dir, setDir] = useState<'up' | 'down' | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (value !== prev.current) {
      setDir(value > prev.current ? 'up' : 'down')
      setTick((t) => t + 1)
      prev.current = value
    }
  }, [value])

  return (
    <Box
      component="span"
      key={tick}
      sx={{
        px: 0.5,
        mx: -0.5,
        borderRadius: 0.5,
        animation: dir ? `${dir === 'up' ? flashUp : flashDown} 1s ease-out` : undefined,
      }}
    >
      {children}
    </Box>
  )
}
