import MicRounded from '@mui/icons-material/MicRounded'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Portal from '@mui/material/Portal'
import { keyframes } from '@mui/material/styles'
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { BOTTOM_NAV_HEIGHT } from '../layout/navConfig'

const SIZE = 56
const EDGE = 12
const DRAG_START = 6
const SPOT_KEY = 'dautu_voice_fab'
const HINT_KEY = 'dautu_voice_fab_hint'

/** Where the bubble rests: snapped to a side, y as 0..1 of the free band between the top bar and the bottom nav */
type Spot = { side: 'left' | 'right'; y: number }
type Point = { x: number; y: number }

const halo = keyframes`
  0% { transform: scale(1); opacity: .55 }
  100% { transform: scale(1.75); opacity: 0 }
`

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

function loadSpot(): Spot {
  try {
    const s = JSON.parse(localStorage.getItem(SPOT_KEY) ?? '')
    if ((s.side === 'left' || s.side === 'right') && typeof s.y === 'number') return { side: s.side, y: clamp(s.y, 0, 1) }
  } catch { /* first visit or storage blocked */ }
  return { side: 'right', y: 0.82 }
}

function safeInsets() {
  const el = document.createElement('div')
  el.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)'
  document.body.appendChild(el)
  const cs = getComputedStyle(el)
  const insets = { top: parseFloat(cs.paddingTop) || 0, bottom: parseFloat(cs.paddingBottom) || 0 }
  el.remove()
  return insets
}

/** Free area for the bubble: below the sticky top bar, above the phone bottom nav, inside the scrollbar */
function band(mobile: boolean) {
  const insets = safeInsets()
  const top = insets.top + (mobile ? 52 : 56) + EDGE
  const bottom = Math.max(top, window.innerHeight - insets.bottom - (mobile ? BOTTOM_NAV_HEIGHT : 0) - EDGE - SIZE)
  return { top, bottom, left: EDGE, right: document.documentElement.clientWidth - EDGE - SIZE }
}

/**
 * Floating mic bubble in the style of iOS AssistiveTouch: drag it anywhere, it springs to the nearest side and
 * remembers the spot; fades back after a few idle seconds so it never hides the numbers underneath for long.
 */
export default function VoiceFab({ mobile, onOpen }: { mobile: boolean; onOpen: () => void }) {
  const [spot, setSpot] = useState(loadSpot)
  const [bounds, setBounds] = useState(() => band(mobile))
  const [drag, setDrag] = useState<Point | null>(null)
  const [idle, setIdle] = useState(false)
  const [hint, setHint] = useState(false)
  const start = useRef<{ px: number; py: number; x: number; y: number } | null>(null)
  const last = useRef<Point | null>(null)
  const dragged = useRef(false)

  useEffect(() => {
    const update = () => setBounds(band(mobile))
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [mobile])

  // Introduce the bubble on the first few visits with a short label and a soft pulse
  useEffect(() => {
    let seen = 3
    try { seen = Number(localStorage.getItem(HINT_KEY) ?? 0) } catch { /* storage blocked: skip the hint */ }
    if (seen >= 3) return
    try { localStorage.setItem(HINT_KEY, String(seen + 1)) } catch { /* ignore */ }
    const show = setTimeout(() => setHint(true), 600)
    const hide = setTimeout(() => setHint(false), 6000)
    return () => { clearTimeout(show); clearTimeout(hide) }
  }, [])

  useEffect(() => {
    if (drag || idle || hint) return
    const t = setTimeout(() => setIdle(true), 3000)
    return () => clearTimeout(t)
  }, [drag, idle, hint])

  const rest: Point = { x: spot.side === 'left' ? bounds.left : bounds.right, y: bounds.top + spot.y * (bounds.bottom - bounds.top) }
  const pos = drag ?? rest

  const wake = () => setIdle(false)
  const down = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    start.current = { px: e.clientX, py: e.clientY, x: pos.x, y: pos.y }
    dragged.current = false
    wake()
  }
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    const s = start.current
    if (!s) return
    const dx = e.clientX - s.px
    const dy = e.clientY - s.py
    if (!dragged.current && Math.hypot(dx, dy) < DRAG_START) return
    dragged.current = true
    setHint(false)
    last.current = { x: clamp(s.x + dx, 0, bounds.right + EDGE), y: clamp(s.y + dy, bounds.top, bounds.bottom) }
    setDrag(last.current)
  }
  const up = () => {
    start.current = null
    const p = last.current
    last.current = null
    if (!p) return
    const next: Spot = {
      side: p.x + SIZE / 2 < (bounds.right + SIZE + EDGE) / 2 ? 'left' : 'right',
      y: bounds.bottom > bounds.top ? clamp((p.y - bounds.top) / (bounds.bottom - bounds.top), 0, 1) : 0,
    }
    setSpot(next)
    setDrag(null)
    try { localStorage.setItem(SPOT_KEY, JSON.stringify(next)) } catch { /* position just won't be remembered */ }
  }
  const click = () => {
    if (dragged.current) { dragged.current = false; return }
    setHint(false)
    onOpen()
  }

  const dim = idle && !drag
  return (
    <Portal>
      <Box
        sx={{
          position: 'fixed', left: 0, top: 0, zIndex: (t) => t.zIndex.speedDial,
          transform: `translate3d(${pos.x}px, ${pos.y}px, 0)`,
          transition: drag ? 'none' : 'transform 480ms cubic-bezier(.22, 1.35, .42, 1)',
          '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
        }}
      >
        <Box
          aria-hidden
          onClick={click}
          sx={(t) => ({
            position: 'absolute', top: '50%', whiteSpace: 'nowrap',
            [spot.side === 'right' ? 'right' : 'left']: SIZE + 10,
            px: 1.5, py: 0.75, borderRadius: 99, fontSize: 13, fontWeight: 650, cursor: 'pointer',
            color: '#fff', bgcolor: 'rgba(15, 23, 42, 0.86)', boxShadow: '0 8px 24px -10px rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(10px)',
            opacity: hint ? 1 : 0, pointerEvents: hint ? 'auto' : 'none',
            transform: `translateY(-50%) translateX(${hint ? 0 : spot.side === 'right' ? 8 : -8}px)`,
            transition: 'opacity 220ms ease, transform 260ms ease',
            ...t.applyStyles('dark', { bgcolor: 'rgba(241, 245, 249, 0.92)', color: '#0f172a' }),
          })}
        >
          Nói để nhập tài sản
        </Box>
        <ButtonBase
          aria-label="Nhập tài sản bằng giọng nói"
          title="Nhập tài sản bằng giọng nói · kéo để di chuyển"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onPointerEnter={wake}
          onFocus={wake}
          onClick={click}
          sx={(t) => ({
            width: SIZE, height: SIZE, borderRadius: '50%', touchAction: 'none', userSelect: 'none', cursor: drag ? 'grabbing' : 'pointer',
            bgcolor: 'rgba(15, 23, 42, 0.58)',
            backdropFilter: 'blur(14px) saturate(160%)',
            WebkitBackdropFilter: 'blur(14px) saturate(160%)',
            border: '1px solid rgba(255, 255, 255, 0.16)',
            boxShadow: drag
              ? '0 18px 40px -10px rgba(15, 23, 42, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
              : '0 10px 28px -10px rgba(15, 23, 42, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
            opacity: dim ? 0.55 : 1,
            transform: drag ? 'scale(1.08)' : dim ? 'scale(0.92)' : 'scale(1)',
            transition: 'opacity 300ms ease, transform 200ms ease, box-shadow 200ms ease',
            '&:active': { transform: drag ? 'scale(1.08)' : 'scale(0.94)' },
            '&.Mui-focusVisible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 3, opacity: 1 },
            '&::after': {
              content: '""', position: 'absolute', inset: -1, borderRadius: '50%', pointerEvents: 'none',
              border: '2px solid', borderColor: 'primary.main',
              animation: hint ? `${halo} 1.6s ease-out infinite` : 'none',
              opacity: 0,
            },
            '@media (prefers-reduced-motion: reduce)': { transition: 'none', '&::after': { animation: 'none' } },
            ...t.applyStyles('dark', { bgcolor: 'rgba(255, 255, 255, 0.14)', border: '1px solid rgba(255, 255, 255, 0.22)' }),
          })}
        >
          {/* AssistiveTouch-style concentric rings around a glowing mic core */}
          <Box sx={{ width: 44, height: 44, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: 'rgba(255, 255, 255, 0.12)', border: '1px solid rgba(255, 255, 255, 0.18)' }}>
            <Box
              sx={{
                width: 34, height: 34, borderRadius: '50%', display: 'grid', placeItems: 'center', color: '#fff',
                background: 'linear-gradient(145deg, rgba(var(--mui-palette-primary-mainChannel) / 0.75), var(--mui-palette-primary-main))',
                boxShadow: '0 0 14px rgba(var(--mui-palette-primary-mainChannel) / 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.35)',
              }}
            >
              <MicRounded sx={{ fontSize: 20 }} />
            </Box>
          </Box>
        </ButtonBase>
      </Box>
    </Portal>
  )
}
