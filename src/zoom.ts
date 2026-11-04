import { useEffect, useRef } from 'react'

/** Pixeli de ecran pe milimetru (96 dpi): la 100%, planșa apare la mărimea ei tipărită */
export const SCREEN_PX_PER_MM = 96 / 25.4

/** Pașii de zoom: următorul procent „rotund” în sus / în jos */
export function stepPercent(cur: number, dir: 1 | -1): number {
  const steps = [5, 10, 15, 20, 25, 33, 50, 67, 75, 100, 125, 150, 200, 250, 300, 400, 500, 600, 800, 1000, 1500, 2000]
  if (dir > 0) return steps.find((s) => s > cur * 1.01) ?? cur * 1.25
  return [...steps].reverse().find((s) => s < cur * 0.99) ?? cur / 1.25
}

/** Scurtăturile de zoom (Ctrl +, Ctrl −, Ctrl 0, Ctrl 1), ignorate în câmpuri de text și dialoguri */
export function useZoomKeys(on: { step: (dir: 1 | -1) => void; fit: () => void; actual: () => void }) {
  const ref = useRef(on)
  ref.current = on
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      if ((e.target as HTMLElement)?.closest('input, textarea, select') || document.querySelector('.modal-back')) return
      if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') ref.current.step(1)
      else if (e.key === '-' || e.code === 'NumpadSubtract') ref.current.step(-1)
      else if (e.key === '0' || e.code === 'Numpad0') ref.current.fit()
      else if (e.key === '1' || e.code === 'Numpad1') ref.current.actual()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
