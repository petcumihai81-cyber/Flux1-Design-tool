import type { ArchElement, ArchTool, Device, NewArch, Project } from './types'
import { levelOf, nearestOnPolyline } from './project'

/** Scara implicită pentru schițe fără plan de fundal: 1 m = 50 px */
export const SKETCH_PX_PER_M = 50


export const ARCH_TOOLS: { tool: ArchTool; name: string; hint: string }[] = [
  { tool: 'wall-ext', name: 'Perete exterior', hint: '25 cm' },
  { tool: 'wall-int', name: 'Perete interior', hint: '12 cm' },
  { tool: 'door', name: 'Ușă', hint: '90 cm' },
  { tool: 'window', name: 'Fereastră', hint: '120 cm' },
  { tool: 'label', name: 'Text încăpere', hint: 'nume' },
  { tool: 'dim', name: 'Cotă', hint: 'lungime' },
  { tool: 'riser', name: 'Trecere între niveluri', hint: 'ghenă' },
]

/** Pictogramele uneltelor de arhitectură (SVG 40×40) */
export const ARCH_ICONS: Record<ArchTool, string> = {
  polygon: '<path d="M5 9 H24 V18 H35 V33 H5 Z" fill="rgba(106,27,154,0.15)" stroke="#6a1b9a" stroke-width="2" stroke-dasharray="4 2" stroke-linejoin="round"/>',
  line: '<path d="M5 30 L18 14 L35 22" fill="none" stroke="#455a64" stroke-width="2.4" stroke-linejoin="round"/>',
  arrow: '<path d="M5 31 L30 12" stroke="#c62828" stroke-width="2.4"/><path d="M35 8 L24 11 L31 18 Z" fill="#c62828"/>',
  note:
    '<path d="M7 33 L22 18" stroke="#c62828" stroke-width="2"/><path d="M7 33 L9 25 L14 30 Z" fill="#c62828"/>' +
    '<rect x="20" y="6" width="17" height="11" rx="1.5" fill="#fff" stroke="#455a64" stroke-width="1.4"/><path d="M23 10 H34 M23 13.5 H31" stroke="#455a64" stroke-width="1.4"/>',
  rect: '<rect x="4" y="8" width="32" height="24" rx="1" fill="rgba(21,101,192,0.15)" stroke="#1565c0" stroke-width="2" stroke-dasharray="4 2"/>',
  ellipse: '<ellipse cx="20" cy="20" rx="16" ry="11" fill="rgba(46,125,50,0.15)" stroke="#2e7d32" stroke-width="2" stroke-dasharray="4 2"/>',
  image:
    '<rect x="4" y="7" width="32" height="26" rx="2" fill="#fff" stroke="#455a64" stroke-width="2"/><circle cx="13" cy="15" r="3" fill="#ffb300"/>' +
    '<path d="M6 31 L16 21 L22 27 L27 22 L34 31 Z" fill="#78909c"/>',
  table:
    '<rect x="3" y="7" width="34" height="26" fill="#fff" stroke="#455a64" stroke-width="2"/><rect x="3" y="7" width="34" height="7" fill="#cfd8dc"/>' +
    '<path d="M3 20.5 H37 M3 27 H37 M14 7 V33 M28 7 V33" stroke="#455a64" stroke-width="1.3"/>',
  riser:
    '<circle cx="20" cy="20" r="16" fill="#fff" stroke="#455a64" stroke-width="2.4"/>' +
    '<path d="M14 17 L20 9 L26 17 M14 23 L20 31 L26 23" fill="none" stroke="#455a64" stroke-width="2.4" stroke-linejoin="round"/>',
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
  riser: 'Trecere între niveluri (ghenă)',
  rect: 'Zonă dreptunghi',
  ellipse: 'Zonă elipsă',
  image: 'Imagine',
  table: 'Tabel pe planșă',
  note: 'Notă cu săgeată',
  line: 'Linie / săgeată',
  polygon: 'Zonă poligon',
}

/** Uneltele de adnotare: zone, imagini, tabele (paleta „Zone, imagini, tabele”) */
export const ANNOT_TOOLS: { tool: ArchTool; name: string; hint: string }[] = [
  { tool: 'note', name: 'Notă cu săgeată', hint: 'text + săgeată' },
  { tool: 'line', name: 'Linie', hint: 'liberă' },
  { tool: 'arrow', name: 'Săgeată', hint: 'liberă' },
  { tool: 'rect', name: 'Zonă dreptunghi', hint: 'arie m²' },
  { tool: 'ellipse', name: 'Zonă elipsă', hint: 'arie m²' },
  { tool: 'polygon', name: 'Zonă poligon', hint: 'orice formă' },
  { tool: 'image', name: 'Imagine', hint: 'PNG, JPG, logo' },
  { tool: 'table', name: 'Tabel pe planșă', hint: 'liste, zone' },
]

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

/** Echipamentele de pe nivel aflate în interiorul unei zone (dreptunghi / elipsă, eventual rotită) */
/** Aria poligonului (px², formula lui Gauss) și centrul lui de greutate */
export function polygonInfo(pts: number[]) {
  let A = 0
  let cx = 0
  let cy = 0
  const n = pts.length / 2
  for (let i = 0; i < n; i++) {
    const [x1, y1] = [pts[2 * i], pts[2 * i + 1]]
    const j = (i + 1) % n
    const [x2, y2] = [pts[2 * j], pts[2 * j + 1]]
    const c = x1 * y2 - x2 * y1
    A += c
    cx += (x1 + x2) * c
    cy += (y1 + y2) * c
  }
  A /= 2
  if (Math.abs(A) < 1e-9) {
    // degenerat: media vârfurilor
    let sx = 0
    let sy = 0
    for (let i = 0; i < n; i++) {
      sx += pts[2 * i]
      sy += pts[2 * i + 1]
    }
    return { area: 0, cx: sx / Math.max(n, 1), cy: sy / Math.max(n, 1) }
  }
  return { area: Math.abs(A), cx: cx / (6 * A), cy: cy / (6 * A) }
}

/** Punct în poligon (regula par / impar) */
export function pointInPolygon(x: number, y: number, pts: number[]) {
  let inside = false
  const n = pts.length / 2
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi, xj, yj] = [pts[2 * i], pts[2 * i + 1], pts[2 * j], pts[2 * j + 1]]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Aria unei zone în m² (dreptunghi, elipsă sau poligon) */
export function zoneArea(a: ArchElement, ppm: number): number {
  if (a.kind === 'polygon') return a.points && a.points.length >= 6 ? polygonInfo(a.points).area / (ppm * ppm) : 0
  if (a.kind === 'ellipse') return Math.PI * ((a.width ?? 4) / 2) * ((a.height ?? 3) / 2)
  return (a.width ?? 4) * (a.height ?? 3)
}

export function devicesInZone(p: Project, a: ArchElement): Device[] {
  if (a.kind === 'polygon') {
    const pts = a.points ?? []
    return pts.length >= 6 ? p.devices.filter((d) => d.levelId === a.levelId && pointInPolygon(d.x, d.y, pts)) : []
  }
  if (a.x == null || a.y == null) return []
  const ppm = levelOf(p, a.levelId).pxPerMeter ?? 50
  const hw = ((a.width ?? 4) * ppm) / 2
  const hh = ((a.height ?? 3) * ppm) / 2
  const r = (-(a.rotation ?? 0) * Math.PI) / 180
  return p.devices.filter((d) => {
    if (d.levelId !== a.levelId) return false
    const dx = d.x - a.x!
    const dy = d.y - a.y!
    const lx = dx * Math.cos(r) - dy * Math.sin(r)
    const ly = dx * Math.sin(r) + dy * Math.cos(r)
    return a.kind === 'ellipse' ? (lx / hw) ** 2 + (ly / hh) ** 2 <= 1 : Math.abs(lx) <= hw && Math.abs(ly) <= hh
  })
}

