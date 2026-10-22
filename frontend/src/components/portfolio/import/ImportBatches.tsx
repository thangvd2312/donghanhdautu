import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { fmtDate } from '../../../lib/format'
import type { ImportBatch } from '../../../lib/types'

/** Các đợt đã nhập gần đây, có nút hoàn tác từng đợt */
export default function ImportBatches({ batches, onUndo }: { batches: ImportBatch[]; onUndo: (b: ImportBatch) => void }) {
  if (batches.length === 0) return null
  return (
    <>
      <Divider />
      <Typography variant="subtitle2">Các đợt đã nhập</Typography>
      {batches.slice(0, 5).map((b) => (
        <Stack key={b.id} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>
            {b.fileName ?? 'File CSV'} · {fmtDate(b.createdAt)} · {b.importedCount}/{b.rowCount} dòng
          </Typography>
          {b.undoneAt ? (
            <Chip size="small" label="Đã hoàn tác" />
          ) : (
            <Button size="small" color="error" onClick={() => onUndo(b)}>
              Hoàn tác
            </Button>
          )}
        </Stack>
      ))}
    </>
  )
}
