import Box from '@mui/material/Box'
import type { TextPart } from '../../lib/types'

/** Chữ có đoạn khớp từ khoá tô sáng; không có `parts` thì hiện chữ thường */
export default function Highlight({ parts, text }: { parts?: TextPart[]; text: string }) {
  if (!parts?.length) return <>{text}</>
  return (
    <>
      {parts.map((p, i) =>
        p.hit ? (
          <Box
            key={i}
            component="mark"
            sx={(t) => ({
              bgcolor: '#fde68a',
              color: '#111827',
              borderRadius: '3px',
              px: '2px',
              mx: '-2px',
              boxDecorationBreak: 'clone',
              WebkitBoxDecorationBreak: 'clone',
              ...t.applyStyles('dark', { bgcolor: 'rgba(250, 204, 21, 0.35)', color: 'inherit' }),
            })}
          >
            {p.text}
          </Box>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  )
}
