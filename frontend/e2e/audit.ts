import type { Page } from '@playwright/test'

export interface Issue {
  kind: string
  detail: string
}

/**
 * Các lỗi giao diện hay gặp trên iPhone, đo trực tiếp trong trang:
 * - tràn ngang (cả trang hoặc từng phần tử nằm ngoài vùng cuộn)
 * - ô nhập chữ < 16px: Safari iOS tự phóng to trang khi chạm vào
 * - hộp thoại / popover / menu vượt khỏi màn hình, nút hành động bị khuất
 * - vùng bấm quá nhỏ (< 32px)
 */
export async function audit(page: Page): Promise<Issue[]> {
  return page.evaluate(() => {
    const issues: { kind: string; detail: string }[] = []
    const vw = window.innerWidth
    const vh = window.innerHeight
    const describe = (el: Element) => {
      const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40)
      const cls = String((el as HTMLElement).className || '').split(' ').filter((c) => c && !c.startsWith('css-')).slice(0, 2).join('.')
      return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}${text ? ` "${text}"` : ''}`
    }
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect()
      const s = getComputedStyle(el)
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0
    }
    const inScroller = (el: Element) => {
      let a = el.parentElement
      while (a && a !== document.body) {
        const s = getComputedStyle(a)
        if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) return true
        a = a.parentElement
      }
      return false
    }

    const over = document.documentElement.scrollWidth - vw
    if (over > 1) issues.push({ kind: 'page-overflow-x', detail: `trang rộng hơn màn hình ${over}px` })

    const seen = new Set<string>()
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      if (!visible(el)) continue
      const r = el.getBoundingClientRect()
      if ((r.right > vw + 1 || r.left < -1) && !inScroller(el)) {
        const d = describe(el)
        if (!seen.has(d)) {
          seen.add(d)
          issues.push({ kind: 'element-off-screen', detail: `${d} (left ${Math.round(r.left)}, right ${Math.round(r.right)})` })
        }
      }
    }

    // Nhãn ô nhập (chưa thu nhỏ) đè lên đơn vị bên phải, hoặc nhãn đã thu nhỏ bị cắt chữ
    for (const fc of Array.from(document.querySelectorAll('.MuiFormControl-root'))) {
      const label = fc.querySelector('.MuiInputLabel-root')
      if (!label || !visible(label)) continue
      const text = (label.textContent ?? '').trim().slice(0, 40)
      const lr = label.getBoundingClientRect()
      const adorn = fc.querySelector('.MuiInputAdornment-positionEnd')
      if (adorn && !label.classList.contains('MuiInputLabel-shrink')) {
        const ar = adorn.getBoundingClientRect()
        const labelTextRight = lr.left + Math.min(lr.width, (label as HTMLElement).scrollWidth)
        if (labelTextRight > ar.left + 1) issues.push({ kind: 'label-overlap', detail: `nhãn "${text}" đè lên đơn vị` })
      }
      if ((label as HTMLElement).scrollWidth > (label as HTMLElement).clientWidth + 1)
        issues.push({ kind: 'label-truncated', detail: `nhãn "${text}" bị cắt chữ` })
    }

    for (const el of Array.from(document.querySelectorAll('.MuiBottomNavigationAction-label'))) {
      if (visible(el) && el.getBoundingClientRect().height > 22)
        issues.push({ kind: 'nav-label-wrap', detail: `nhãn "${el.textContent}" ở thanh dưới bị xuống dòng` })
    }

    for (const el of Array.from(document.querySelectorAll('.MuiDialog-paperFullScreen'))) {
      if (visible(el) && !el.querySelector('[aria-label="Đóng"], [aria-label="Huỷ"]') && !/Đóng|Huỷ/.test(el.textContent ?? ''))
        issues.push({ kind: 'fullscreen-no-close', detail: 'hộp thoại toàn màn hình không có nút đóng' })
      else if (visible(el) && !el.querySelector('[aria-label="Đóng"]'))
        issues.push({ kind: 'fullscreen-no-x', detail: 'hộp thoại toàn màn hình thiếu nút X ở đầu' })
    }

    for (const el of Array.from(document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]), textarea, select'))) {
      if (!visible(el)) continue
      const fs = parseFloat(getComputedStyle(el).fontSize)
      if (fs < 16) {
        const label = el.closest('.MuiFormControl-root')?.querySelector('label')?.textContent ?? (el as HTMLInputElement).placeholder ?? ''
        issues.push({ kind: 'input-zoom', detail: `ô nhập "${label.trim().slice(0, 30)}" cỡ chữ ${fs}px (< 16px → iOS phóng to)` })
      }
    }

    for (const el of Array.from(document.querySelectorAll('.MuiDialog-paper, .MuiPopover-paper, .MuiMenu-paper, .MuiDrawer-paper, .MuiAutocomplete-popper'))) {
      if (!visible(el)) continue
      const r = el.getBoundingClientRect()
      if (r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1) {
        issues.push({ kind: 'overlay-off-screen', detail: `${describe(el).slice(0, 60)} (${Math.round(r.left)},${Math.round(r.top)} → ${Math.round(r.right)},${Math.round(r.bottom)})` })
      }
      for (const b of Array.from(el.querySelectorAll('.MuiDialogActions-root button'))) {
        const br = b.getBoundingClientRect()
        if (br.bottom > vh + 1 || br.top < 0) issues.push({ kind: 'dialog-action-hidden', detail: `nút "${b.textContent?.trim()}" nằm ngoài màn hình (top ${Math.round(br.top)})` })
      }
    }

    // Phần tử bị hộp thoại / lớp phủ che thì người dùng không bấm được lúc đó: không tính
    const reachable = (el: Element, r: DOMRect) => {
      const x = Math.min(Math.max(r.left + r.width / 2, 0), vw - 1)
      const y = Math.min(Math.max(r.top + r.height / 2, 0), vh - 1)
      const top = document.elementFromPoint(x, y)
      return !!top && (top === el || el.contains(top) || top.contains(el))
    }
    const small: string[] = []
    for (const el of Array.from(document.querySelectorAll('button, a[href], [role=button], [role=tab]'))) {
      if (!visible(el)) continue
      const r = el.getBoundingClientRect()
      if (r.height < 32 && r.width < 200 && r.top < vh && r.bottom > 0 && reachable(el, r))
        small.push(`${describe(el).slice(0, 40)} ${Math.round(r.width)}×${Math.round(r.height)}`)
    }
    if (small.length) issues.push({ kind: 'small-tap-target', detail: `${small.length} vùng bấm < 32px: ${small.slice(0, 6).join(' | ')}` })

    return issues
  })
}
