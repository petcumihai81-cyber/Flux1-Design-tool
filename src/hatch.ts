/**
 * Hașura zonelor (dreptunghi, elipsă, poligon): model + distanța dintre linii pe hârtie (mm).
 * Pe plan (și deci în PDF) e un model de umplere Konva; în DXF, linii tăiate cu conturul zonei.
 */
import type { HatchKind } from './types'

export const HATCHES: { id: HatchKind; name: string }[] = [
  { id: 'none', name: 'Fără' },
  { id: 'diag', name: 'Diagonal ╱' },
  { id: 'diag2', name: 'Diagonal ╲' },
  { id: 'cross', name: 'Diagonal încrucișat' },
  { id: 'horiz', name: 'Orizontal' },
  { id: 'vert', name: 'Vertical' },
  { id: 'grid', name: 'Carouri' },
  { id: 'dots', name: 'Puncte' },
]

export const HATCH_MM_DEFAULT = 3

/** Unghiurile liniilor (grade, plan cu y în jos: 45 = „╲”) pentru fiecare model; puncte = [] */
export function hatchAngles(kind: HatchKind): number[] {
  switch (kind) {
    case 'diag':
      return [-45]
    case 'diag2':
      return [45]
    case 'cross':
      return [-45, 45]
    case 'horiz':
      return [0]
    case 'vert':
      return [90]
    case 'grid':
      return [0, 90]
    default:
      return []
  }
}

const cache = new Map<string, HTMLCanvasElement>()

/**
 * Plăcuța modelului, repetată pe suprafață: `spacing` = distanța dintre linii (px plan), `lw` = grosimea liniei (px plan).
 * Se desenează la rezoluție mai mare (`res`) și se scalează înapoi cu `fillPatternScale` = 1 / res.
 */
export function hatchTile(kind: HatchKind, color: string, spacing: number, lw: number): { canvas: HTMLCanvasElement; res: number } | null {
  if (kind === 'none' || !(spacing > 0)) return null
  const diag = kind === 'diag' || kind === 'diag2' || kind === 'cross'
  const t = diag ? spacing * Math.SQRT2 : spacing
  const res = Math.min(8, Math.max(1, 96 / t))
  const key = `${kind}|${color}|${t.toFixed(3)}|${lw.toFixed(3)}|${res.toFixed(2)}`
  const hit = cache.get(key)
  if (hit) return { canvas: hit, res }
  const size = Math.max(2, Math.round(t * res))
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const g = c.getContext('2d')!
  g.strokeStyle = color
  g.fillStyle = color
  g.lineWidth = Math.max(1, lw * res)
  g.lineCap = 'square'
  const s = size
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    g.beginPath()
    g.moveTo(x1, y1)
    g.lineTo(x2, y2)
    g.stroke()
  }
  if (kind === 'diag' || kind === 'cross') for (const o of [-s, 0, s]) line(o, s, o + s, 0)
  if (kind === 'diag2' || kind === 'cross') for (const o of [-s, 0, s]) line(o, 0, o + s, s)
  if (kind === 'horiz' || kind === 'grid') line(0, s / 2, s, s / 2)
  if (kind === 'vert' || kind === 'grid') line(s / 2, 0, s / 2, s)
  if (kind === 'dots') {
    g.beginPath()
    g.arc(s / 2, s / 2, Math.max(1, lw * res * 1.4), 0, Math.PI * 2)
    g.fill()
  }
  if (cache.size > 200) cache.clear()
  cache.set(key, c)
  return { canvas: c, res }
}
