/** Ngăn kéo (bottom sheet) đang mở trên trang Lọc cổ phiếu; null = không mở */
export type ScreenerSheetState =
  | { kind: 'picker' }
  | { kind: 'edit'; key: string }
  | { kind: 'sort' }
  | { kind: 'save'; mode: 'new' }
  | { kind: 'rename'; id: string }
  | { kind: 'delete'; id: string }
  | { kind: 'saved' }
  | null
