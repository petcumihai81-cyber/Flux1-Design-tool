import type { ArchElement, ArchTool, NewArch } from './types'
import { nearestOnPolyline } from './project'

/** Scara implicită pentru schițe fără plan de fundal: 1 m = 50 px */
export const SKETCH_PX_PER_M = 50


export const ARCH_TOOLS: { tool: ArchTool; name: string; hint: string }[] = [
  { tool: 'wall-ext', name: 'Perete exterior', hint: '25 cm' },
  { tool: 'wall-int', name: 'Perete interior', hint: '12 cm' },
  { tool: 'door', name: 'Ușă', hint: '90 cm' },
  { tool: 'window', name: 'Fereastră', hint: '120 cm' },
  { tool: 'label', name: 'Text încăpere', hint: 'nume' },
  { tool: 'dim', name: 'Cotă', hint: 'lungime' },
]

/** Pictogramele uneltelor de arhitectură (SVG 40×40) */
export const ARCH_ICONS: Record<ArchTool, string> = {
  'wall-ext': '<rect x="3" y="15" width="34" height="10" fill="#222"/>',
  'wall-int': '<rect x="3" y="17.5" width="34" height="5" fill="#222"/>',
  door:
    '<rect x="2" y="27" width="8" height="5" fill="#222"/><rect x="30" y="27" width="8" height="5" fill="#222"/>' +
    '<line x1="10" y1="29.5" x2="10" y2="9" stroke="#222" stroke-width="2"/><path d="M10 9 A20 20 0 0 1 30 29.5" fill="none" stroke="#222" stroke-width="1.5" stroke-dasharray="3 2"/>',
  window:
    '<rect x="2" y="16" width="7" height="8" fill="#222"/><rect x="31" y="16" width="7" height="8" fill="#222"/>' +
    '<rect x="9" y="16" width="22" height="8" fill="#fff" stroke="#222" stroke-width="1.5"/><line x1="9" y1="20" x2="31" y2="20" stroke="#222" stroke-width="1.5"/>',
  label: '<text x="20" y="27" text-anchor="middle" font-family="Arial" font-weight="bold" font-size="20" fill="#222">Aa</text>',
  dim:
    '<line x1="4" y1="22" x2="36" y2="22" stroke="#222" stroke-width="1.5"/><line x1="4" y1="16" x2="4" y2="28" stroke="#222" stroke-width="1.5"/>' +
    '<line x1="36" y1="16" x2="36" y2="28" stroke="#222" stroke-width="1.5"/><text x="20" y="17" text-anchor="middle" font-family="Arial" font-size="9" fill="#222">5.00</text>',
}

export const archIconUrl = (t: ArchTool) =>
  'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">${ARCH_ICONS[t]}</svg>`)

export const ARCH_NAMES: Record<ArchElement['kind'], string> = {
  wall: 'Perete',
  door: 'Ușă',
  window: 'Fereastră',
  label: 'Text încăpere',
  dim: 'Cotă',
}

export const newWall = (points: number[], thickness: number): NewArch => ({ kind: 'wall', points, thickness })

/** Peretele cel mai apropiat de un punct (pentru așezarea ușilor și ferestrelor pe perete) */
export function wallAt(arch: ArchElement[], x: number, y: number, tol: number) {
  let best: { wall: ArchElement; x: number; y: number; angle: number } | undefined
  let bestD = Infinity
  for (const w of arch) {
    if (w.kind !== 'wall' || !w.points) continue
    const lim = tol
    for (let i = 2; i < w.points.length; i += 2) {
      const seg = w.points.slice(i - 2, i + 2)
      const n = nearestOnPolyline(seg, x, y)
      if (n.dist < lim && n.dist < bestD) {
        bestD = n.dist
        const angle = (Math.atan2(seg[3] - seg[1], seg[2] - seg[0]) * 180) / Math.PI
        best = { wall: w, x: n.x, y: n.y, angle }
      }
    }
  }
  return best
}

/** Toate vârfurile pereților (pentru lipirea capetelor) */
export function wallVertices(arch: ArchElement[], excludeId?: string) {
  const out: { x: number; y: number }[] = []
  for (const w of arch) {
    if (w.kind !== 'wall' || !w.points || w.id === excludeId) continue
    for (let i = 0; i < w.points.length; i += 2) out.push({ x: w.points[i], y: w.points[i + 1] })
  }
  return out
}

/**
 * Punctul următor al unui perete: se lipește de un vârf existent (dacă e aproape),
 * altfel se aliniază ortogonal față de punctul anterior (dacă unghiul e aproape de 0° / 90°).
 */
export function snapPoint(
  pt: { x: number; y: number },
  prev: { x: number; y: number } | undefined,
  vertices: { x: number; y: number }[],
  tol: number,
  free: boolean,
) {
  for (const v of vertices) if (Math.hypot(v.x - pt.x, v.y - pt.y) < tol) return { x: v.x, y: v.y }
  if (!prev || free) return pt
  const dx = pt.x - prev.x
  const dy = pt.y - prev.y
  const ang = Math.abs((Math.atan2(dy, dx) * 180) / Math.PI) % 90
  if (ang < 8 || ang > 82) {
    const p = Math.abs(dx) >= Math.abs(dy) ? { x: pt.x, y: prev.y } : { x: prev.x, y: pt.y }
    // aliniere și cu vârfurile existente pe cealaltă axă
    for (const v of vertices) {
      if (p.y === prev.y && Math.abs(v.x - p.x) < tol) p.x = v.x
      if (p.x === prev.x && Math.abs(v.y - p.y) < tol) p.y = v.y
    }
    return p
  }
  return pt
}

export const fmtM = (m: number) => m.toFixed(2).replace('.', ',') + ' m'
