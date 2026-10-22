import Box from '@mui/material/Box'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/** Hiển thị markdown của cố vấn bằng typography của theme */
export default function Markdown({ text }: { text: string }) {
  return (
    <Box
      sx={(t) => ({
        fontSize: 14.5,
        lineHeight: 1.7,
        color: 'text.primary',
        '& h1, & h2, & h3': { fontWeight: 700, lineHeight: 1.3, mt: 2.5, mb: 1 },
        '& h1': { fontSize: 20 },
        '& h2': { fontSize: 18 },
        '& h3': { fontSize: 16 },
        '& > :first-of-type': { mt: 0 },
        '& p': { my: 1 },
        '& ul, & ol': { pl: 3, my: 1 },
        '& li': { my: 0.5 },
        '& strong': { fontWeight: 700 },
        '& a': { color: 'primary.main' },
        '& hr': { border: 0, borderTop: 1, borderColor: 'divider', my: 2 },
        '& blockquote': { borderLeft: 3, borderColor: 'primary.main', pl: 2, ml: 0, color: 'text.secondary' },
        '& code': { fontSize: 13, px: 0.5, borderRadius: 0.5, bgcolor: 'action.hover' },
        '& table': {
          display: 'block',
          overflowX: 'auto',
          borderCollapse: 'collapse',
          my: 1.5,
          fontSize: 13.5,
          fontVariantNumeric: 'tabular-nums',
        },
        '& th, & td': { border: `1px solid ${t.vars?.palette.divider}`, px: 1.25, py: 0.75, textAlign: 'left' },
        '& th': { bgcolor: 'action.hover', fontWeight: 600 },
      })}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{ a: (props) => <a {...props} target="_blank" rel="noreferrer" /> }}
      >
        {text}
      </ReactMarkdown>
    </Box>
  )
}
