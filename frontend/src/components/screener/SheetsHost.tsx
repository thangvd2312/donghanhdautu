import Typography from '@mui/material/Typography'
import { useRef } from 'react'
import type { SavedScreen, ScreenCriterion, ScreenFilter, ScreenSort } from '../../lib/types'
import Sheet from '../Sheet'
import { SavedList } from './ScreenerParts'
import { ConfirmDelete, CriteriaPicker, MultiEditor, NameForm, RangeEditor, SortList } from './ScreenerEditors'
import type { ScreenerSheetState } from './sheetState'

interface SheetsHostProps {
  sheet: ScreenerSheetState
  criteria: ScreenCriterion[] | null
  critMap: Record<string, ScreenCriterion>
  activeKeys: Set<string>
  filters: ScreenFilter[]
  sort: ScreenSort
  saved: SavedScreen[]
  savedId: string | null
  onClose: () => void
  onOpen: (s: ScreenerSheetState) => void
  onSetFilter: (f: ScreenFilter | null, key: string) => void
  onApplySort: (s: ScreenSort) => void
  onSaveNew: (name: string) => Promise<void>
  onRename: (id: string, name: string) => Promise<void>
  onRemove: (id: string) => Promise<void>
  onOpenSaved: (s: SavedScreen) => void
}

/** Các ngăn kéo của trang Lọc cổ phiếu: chọn / sửa điều kiện, sắp xếp, lưu / đổi tên / xoá, danh sách đã lưu */
export default function SheetsHost({
  sheet,
  criteria,
  critMap,
  activeKeys,
  filters,
  sort,
  saved,
  savedId,
  onClose,
  onOpen,
  onSetFilter,
  onApplySort,
  onSaveNew,
  onRename,
  onRemove,
  onOpenSaved,
}: SheetsHostProps) {
  // Giữ nội dung của ngăn vừa đóng để hiệu ứng đóng không bị trống
  const lastSheet = useRef<ScreenerSheetState>(null)
  if (sheet) lastSheet.current = sheet
  const shown = sheet ?? lastSheet.current
  const target = shown?.kind === 'edit' ? critMap[shown.key] : undefined
  const renameTarget = shown?.kind === 'rename' || shown?.kind === 'delete' ? saved.find((s) => s.id === shown.id) : undefined

  return (
    <>
    <Sheet open={sheet?.kind === 'picker'} onClose={() => onClose()} label="Thêm điều kiện lọc" title="Thêm điều kiện">
      {criteria && <CriteriaPicker criteria={criteria} active={activeKeys} onPick={(key) => onOpen({ kind: 'edit', key })} />}
    </Sheet>

    <Sheet open={sheet?.kind === 'edit' && !!target} onClose={() => onClose()} label={target ? `Điều kiện ${target.label}` : 'Điều kiện'} title={target?.label}>
      {target &&
        (target.type === 'multi' ? (
          <MultiEditor key={target.key} c={target} current={filters.find((f) => f.key === target.key)} onApply={(f) => onSetFilter(f, target.key)} />
        ) : (
          <RangeEditor key={target.key} c={target} current={filters.find((f) => f.key === target.key)} onApply={(f) => onSetFilter(f, target.key)} />
        ))}
    </Sheet>

    <Sheet open={sheet?.kind === 'sort'} onClose={() => onClose()} label="Sắp xếp kết quả" title="Sắp xếp theo">
      <SortList
        value={sort}
        onPick={(s) => {
          onApplySort(s)
        }}
      />
    </Sheet>

    <Sheet open={sheet?.kind === 'save'} onClose={() => onClose()} label="Lưu bộ lọc" title="Lưu bộ lọc">
      <NameForm initial="" submitLabel="Lưu bộ lọc" note="Đặt tên để mở lại bộ lọc này bất cứ lúc nào, kể cả trên điện thoại khác." onSubmit={onSaveNew} />
    </Sheet>

    <Sheet open={sheet?.kind === 'rename' && !!renameTarget} onClose={() => onClose()} label="Đổi tên bộ lọc" title="Đổi tên bộ lọc">
      {renameTarget && <NameForm key={renameTarget.id} initial={renameTarget.name} submitLabel="Lưu tên" onSubmit={(n) => onRename(renameTarget.id, n)} />}
    </Sheet>

    <Sheet open={sheet?.kind === 'delete' && !!renameTarget} onClose={() => onClose()} label="Xoá bộ lọc" title="Xoá bộ lọc?">
      {renameTarget && <ConfirmDelete key={renameTarget.id} name={renameTarget.name} onConfirm={() => onRemove(renameTarget.id)} onCancel={() => onClose()} />}
    </Sheet>

    <Sheet open={sheet?.kind === 'saved'} onClose={() => onClose()} label="Bộ lọc đã lưu" title="Bộ lọc đã lưu">
      {saved.length ? (
        <SavedList
          items={saved}
          crits={critMap}
          activeId={savedId}
          onOpen={onOpenSaved}
          onRename={(s) => onOpen({ kind: 'rename', id: s.id })}
          onDelete={(s) => onOpen({ kind: 'delete', id: s.id })}
        />
      ) : (
        <Typography color="text.secondary" variant="body2">
          Bạn chưa lưu bộ lọc nào. Chọn điều kiện rồi nhấn “Lưu bộ lọc”.
        </Typography>
      )}
    </Sheet>
    </>
  )
}
