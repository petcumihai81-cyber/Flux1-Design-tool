/**
 * Ecran tactil (telefon / tabletă) pentru plan și schema bloc:
 * - atingerile devin evenimentele de mouse pe care le folosește desenul (tap → click, dublă atingere → dblclick,
 *   touchstart / touchmove / touchend → mousedown / mousemove / mouseup), cu un eveniment „mouse” sintetic
 *   (buton stâng, fără Shift / Ctrl), deci uneltele merg neschimbate;
 * - tragerea cu un deget mută planul sau elementul atins (Konva);
 * - două degete = zoom (pinch) și deplasare;
 * - apăsarea lungă = meniul de click dreapta.
 */
import { useEffect, useRef } from 'react'
import type Konva from 'konva'

export interface TouchView {
  x: number
  y: number
  scale: number
}

const LONG_MS = 550
const MOVE_TOL = 10

/** Eveniment de mouse sintetic dintr-un TouchEvent (coordonatele primului deget) */
function fakeMouse(e: TouchEvent, type: string): MouseEvent {
  const t = e.changedTouches[0] ?? e.touches[0]
  return {
    type,
    clientX: t?.clientX ?? 0,
    clientY: t?.clientY ?? 0,
    pageX: t?.pageX ?? 0,
    pageY: t?.pageY ?? 0,
    button: 0,
    buttons: type === 'mouseup' ? 0 : 1,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    detail: 1,
    target: e.target,
    touch: true,
    preventDefault: () => {
      if (e.cancelable) e.preventDefault()
    },
    stopPropagation: () => e.stopPropagation(),
  } as unknown as MouseEvent
}

/**
 * Leagă gesturile tactile de o scenă Konva. `getView` / `setView` = poziția și zoom-ul scenei (starea din componentă).
 */
export function useTouchGestures(
  stageRef: React.RefObject<Konva.Stage | null>,
  getView: () => TouchView,
  setView: (v: TouchView) => void,
  limits: { min: number; max: number } = { min: 0.02, max: 40 },
) {
  // funcțiile se schimbă la fiecare randare: le ținem într-un ref, ca ascultătorii să nu se refacă
  const api = useRef({ getView, setView, limits })
  api.current = { getView, setView, limits }

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const el = stage.container()
    el.style.touchAction = 'none'

    let pinch: { d0: number; cx: number; cy: number; v0: TouchView } | null = null
    let gesture = false // după pinch / apăsare lungă: următorul tap nu mai contează
    let long: { timer: number; x: number; y: number } | null = null
    let wasDraggable = true

    const cancelLong = () => {
      if (long) clearTimeout(long.timer)
      long = null
    }
    const local = (t: Touch) => {
      const r = el.getBoundingClientRect()
      return { x: t.clientX - r.left, y: t.clientY - r.top }
    }

    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        gesture = false
        const t = e.touches[0]
        cancelLong()
        long = {
          x: t.clientX,
          y: t.clientY,
          timer: window.setTimeout(() => {
            long = null
            gesture = true
            stage.stopDrag()
            stage.setPointersPositions(e)
            const pos = stage.getPointerPosition()
            const target: Konva.Node = (pos && stage.getIntersection(pos)) || stage
            navigator.vibrate?.(15)
            target.fire('contextmenu', { evt: fakeMouse(e, 'contextmenu') }, true)
          }, LONG_MS),
        }
      } else if (e.touches.length === 2) {
        cancelLong()
        gesture = true
        stage.stopDrag()
        wasDraggable = stage.draggable()
        stage.draggable(false)
        const [a, b] = [local(e.touches[0]), local(e.touches[1])]
        pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, v0: { ...api.current.getView() } }
      }
    }

    const onMove = (e: TouchEvent) => {
      if (long) {
        const t = e.touches[0]
        if (t && Math.hypot(t.clientX - long.x, t.clientY - long.y) > MOVE_TOL) cancelLong()
      }
      if (pinch && e.touches.length >= 2) {
        if (e.cancelable) e.preventDefault()
        const [a, b] = [local(e.touches[0]), local(e.touches[1])]
        const { v0, d0, cx, cy } = pinch
        const { min, max } = api.current.limits
        const scale = Math.min(max, Math.max(min, (v0.scale * Math.hypot(a.x - b.x, a.y - b.y)) / d0))
        const nx = (a.x + b.x) / 2
        const ny = (a.y + b.y) / 2
        // punctul de sub degete rămâne sub degete (zoom + deplasare cu două degete)
        const wx = (cx - v0.x) / v0.scale
        const wy = (cy - v0.y) / v0.scale
        api.current.setView({ scale, x: nx - wx * scale, y: ny - wy * scale })
      }
    }

    const onEnd = (e: TouchEvent) => {
      cancelLong()
      if (pinch && e.touches.length < 2) {
        pinch = null
        stage.draggable(wasDraggable)
      }
      // fără evenimentele de mouse „de compatibilitate” trimise de browser după atingere (ar dubla click-ul)
      if (e.cancelable) e.preventDefault()
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: false })
    el.addEventListener('touchcancel', onEnd, { passive: false })

    // atingerile Konva → evenimentele de mouse folosite de desen
    const relay = (from: string, to: string) => {
      stage.on(`${from}.tactil`, (ev) => {
        const evt = ev.evt as unknown as TouchEvent
        if ((from === 'tap' || from === 'dbltap') && gesture) return
        if (from === 'touchmove' && pinch) return
        ev.target.fire(to, { evt: fakeMouse(evt, to) }, true)
      })
    }
    relay('tap', 'click')
    relay('dbltap', 'dblclick')
    relay('touchstart', 'mousedown')
    relay('touchmove', 'mousemove')
    relay('touchend', 'mouseup')

    return () => {
      cancelLong()
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
      stage.off('.tactil')
    }
  }, [stageRef])
}
