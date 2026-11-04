import type { Diagram, DiagramEdge, DiagramNode, Project, SystemId } from './types'
import { NODE_H, NODE_W, blockLayout } from './blockLayout'
import { deviceSystem, uid } from './project'

export const GRID = 10
export const snap = (v: number) => Math.round(v / GRID) * GRID

/** Transformă schema generată automat într-o schemă editabilă */
export function materialize(p: Project, system: SystemId): Diagram {
  const L = blockLayout(p, system)
  const ids = new Map<object, string>()
  const nodes: DiagramNode[] = L.nodes.map((n) => {
    const id = uid()
    ids.set(n, id)
    return n.device
      ? { id, kind: 'device', deviceId: n.device.id, x: snap(n.x), y: snap(n.y), w: NODE_W, h: NODE_H }
      : { id, kind: 'rect', x: snap(n.x), y: snap(n.y), w: NODE_W, h: NODE_H, text: n.text, dashed: true }
  })
  const edges = L.nodes.flatMap((n) =>
    n.children.map((c) => ({
      id: uid(),
      from: ids.get(n)!,
      to: ids.get(c)!,
      label: c.cable ? `${c.cable.code} · ${c.cable.cableType}` : '',
      dashed: !!c.dashed,
    })),
  )
  return { nodes, edges }
}

/** Echipamentele sistemului care nu apar încă în schemă */
export function unplacedDevices(p: Project, system: SystemId, d: Diagram) {
  const placed = new Set(d.nodes.map((n) => n.deviceId).filter(Boolean))
  return p.devices.filter((x) => deviceSystem(x) === system && !placed.has(x.id))
}

/** Elimină blocurile ale căror echipamente au fost șterse de pe plan */
export function pruneDiagram(p: Project, d: Diagram): Diagram {
  const alive = new Set(p.devices.map((x) => x.id))
  const nodes = d.nodes.filter((n) => n.kind !== 'device' || (n.deviceId && alive.has(n.deviceId)))
  if (nodes.length === d.nodes.length) return d
  const ids = new Set(nodes.map((n) => n.id))
  return { nodes, edges: d.edges.filter((e) => ids.has(e.from) && ids.has(e.to)) }
}

export function diagramBounds(d: Diagram) {
  if (!d.nodes.length) return null
  const pad = 40
  const x1 = Math.min(...d.nodes.map((n) => n.x)) - pad
  const y1 = Math.min(...d.nodes.map((n) => n.y)) - pad
  const x2 = Math.max(...d.nodes.map((n) => n.x + n.w)) + pad
  const y2 = Math.max(...d.nodes.map((n) => n.y + n.h)) + pad
  // colțurile traseelor manuale pot ieși în afara blocurilor
  const px: number[] = []
  const py: number[] = []
  for (const e of d.edges) {
    for (let i = 0; i + 1 < (e.points?.length ?? 0); i += 2) {
      px.push(e.points![i])
      py.push(e.points![i + 1])
    }
  }
  const X1 = Math.min(x1, ...px.map((v) => v - pad))
  const Y1 = Math.min(y1, ...py.map((v) => v - pad))
  const X2 = Math.max(x2, ...px.map((v) => v + pad))
  const Y2 = Math.max(y2, ...py.map((v) => v + pad))
  return { x: X1, y: Y1, width: X2 - X1, height: Y2 - Y1 }
}

/**
 * Traseu ortogonal între două blocuri: dacă unul e sub celălalt, iese pe jos și intră pe sus;
 * altfel iese lateral. Întoarce punctele și poziția pentru etichetă.
 */
export function route(a: DiagramNode, b: DiagramNode): { points: number[]; lx: number; ly: number } {
  const acx = a.x + a.w / 2
  const bcx = b.x + b.w / 2
  const acy = a.y + a.h / 2
  const bcy = b.y + b.h / 2
  if (b.y >= a.y + a.h + 10 || a.y >= b.y + b.h + 10) {
    const down = b.y >= a.y + a.h
    const y1 = down ? a.y + a.h : a.y
    const y2 = down ? b.y : b.y + b.h
    // magistrala la 62% din spațiu, aproape de blocul țintă, ca la schema generată
    const my = y1 + (y2 - y1) * 0.38
    return { points: [acx, y1, acx, my, bcx, my, bcx, y2], lx: bcx + 5, ly: down ? y2 - 30 : y2 + 8 }
  }
  const right = b.x >= a.x + a.w
  const x1 = right ? a.x + a.w : a.x
  const x2 = right ? b.x : b.x + b.w
  const mx = (x1 + x2) / 2
  return { points: [x1, acy, mx, acy, mx, bcy, x2, bcy], lx: Math.min(x1, x2) + 6, ly: Math.min(acy, bcy) - 16 }
}

export const nodeAt = (d: Diagram, x: number, y: number) =>
  [...d.nodes].reverse().find((n) => x >= n.x && x <= n.x + n.w && y >= n.y && y <= n.y + n.h && n.kind !== 'rect') ??
  [...d.nodes].reverse().find((n) => x >= n.x && x <= n.x + n.w && y >= n.y && y <= n.y + n.h)

// ---------------------------------------------------------------- trasee manuale

type P = [number, number]
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const PORT_PAD = 8

/** Capătul unei legături pe latura blocului dinspre punctul `w`; `vertical` = iese pe sus / jos */
function port(n: DiagramNode, w: P): { p: P; vertical: boolean } {
  if (w[1] >= n.y + n.h) return { p: [clamp(w[0], n.x + PORT_PAD, n.x + n.w - PORT_PAD), n.y + n.h], vertical: true }
  if (w[1] <= n.y) return { p: [clamp(w[0], n.x + PORT_PAD, n.x + n.w - PORT_PAD), n.y], vertical: true }
  if (w[0] >= n.x + n.w) return { p: [n.x + n.w, clamp(w[1], n.y + PORT_PAD, n.y + n.h - PORT_PAD)], vertical: false }
  return { p: [n.x, clamp(w[1], n.y + PORT_PAD, n.y + n.h - PORT_PAD)], vertical: false }
}

/** Elimină punctele duplicate și pe cele din mijlocul unui segment drept */
export function simplify(pts: P[]): P[] {
  const out: P[] = []
  for (const p of pts) {
    const n = out.length
    if (n && Math.abs(out[n - 1][0] - p[0]) < 0.5 && Math.abs(out[n - 1][1] - p[1]) < 0.5) continue
    if (n >= 2) {
      const [a, b] = [out[n - 2], out[n - 1]]
      if ((Math.abs(a[0] - b[0]) < 0.5 && Math.abs(b[0] - p[0]) < 0.5) || (Math.abs(a[1] - b[1]) < 0.5 && Math.abs(b[1] - p[1]) < 0.5)) {
        out[n - 1] = p
        continue
      }
    }
    out.push(p)
  }
  return out
}

/** Traseul unei legături: manual (prin colțurile salvate, ortogonal) sau automat */
export function edgePath(e: DiagramEdge, a: DiagramNode, b: DiagramNode): { points: number[]; lx: number; ly: number } {
  if (!e.points || e.points.length < 2) {
    // traseul automat, fără puncte suprapuse (mânerele de segment lucrează pe segmente reale)
    const r = route(a, b)
    const pts: P[] = []
    for (let i = 0; i + 1 < r.points.length; i += 2) pts.push([r.points[i], r.points[i + 1]])
    return { ...r, points: simplify(pts).flat() }
  }
  const w: P[] = []
  for (let i = 0; i + 1 < e.points.length; i += 2) w.push([e.points[i], e.points[i + 1]])
  const s = port(a, w[0])
  const t = port(b, w[w.length - 1])
  const pts: P[] = [s.p]
  // din bloc: întâi pe direcția de ieșire
  pts.push(s.vertical ? [s.p[0], w[0][1]] : [w[0][0], s.p[1]])
  pts.push(w[0])
  for (let i = 1; i < w.length; i++) {
    pts.push([w[i][0], w[i - 1][1]])
    pts.push(w[i])
  }
  // în bloc: ultima porțiune pe direcția de intrare
  const last = w[w.length - 1]
  pts.push(t.vertical ? [t.p[0], last[1]] : [last[0], t.p[1]])
  pts.push(t.p)
  const path = simplify(pts)
  // eticheta: lângă mijlocul celui mai lung segment
  let best = 0
  let li = 0
  for (let i = 0; i + 1 < path.length; i++) {
    const L = Math.abs(path[i + 1][0] - path[i][0]) + Math.abs(path[i + 1][1] - path[i][1])
    if (L > best) {
      best = L
      li = i
    }
  }
  const [p1, p2] = [path[li], path[li + 1] ?? path[li]]
  const horiz = Math.abs(p1[1] - p2[1]) < 0.5
  return { points: path.flat(), lx: (p1[0] + p2[0]) / 2 + (horiz ? -30 : 5), ly: (p1[1] + p2[1]) / 2 + (horiz ? -16 : -6) }
}

/**
 * Mută segmentul `seg` al traseului (perpendicular pe el) cu `delta`; întoarce noile colțuri ale legăturii.
 * Capetele rămân pe blocuri (alunecă pe latură), deci se mută doar colțurile interioare.
 */
export function moveSegment(path: number[], seg: number, delta: number): number[] {
  const pts: P[] = []
  for (let i = 0; i + 1 < path.length; i += 2) pts.push([path[i], path[i + 1]])
  const a = pts[seg]
  const b = pts[seg + 1]
  const horiz = Math.abs(a[1] - b[1]) < 0.5
  let inner = pts.slice(1, -1).map((p) => [...p] as P)
  if (!inner.length) {
    // legătură dreaptă: se transformă în două colțuri, pe care le mutăm
    inner = [[...a] as P, [...b] as P]
    for (const p of inner) if (horiz) p[1] += delta
    else p[0] += delta
    return inner.flat().map(snap)
  }
  for (const idx of [seg, seg + 1]) {
    const k = idx - 1
    if (k < 0 || k >= inner.length) continue
    if (horiz) inner[k][1] += delta
    else inner[k][0] += delta
  }
  // segmentul capăt: colțul de lângă bloc se mută, capătul alunecă după el
  return simplify(inner).flat().map(snap)
}

// ---------------------------------------------------------------- aliniere și distribuire

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vmiddle' | 'bottom'

/** Aliniază blocurile selectate după marginea / centrul grupului */
export function alignNodes(nodes: DiagramNode[], ids: Set<string>, mode: AlignMode): DiagramNode[] {
  const sel = nodes.filter((n) => ids.has(n.id))
  if (sel.length < 2) return nodes
  const left = Math.min(...sel.map((n) => n.x))
  const right = Math.max(...sel.map((n) => n.x + n.w))
  const top = Math.min(...sel.map((n) => n.y))
  const bottom = Math.max(...sel.map((n) => n.y + n.h))
  const cx = (left + right) / 2
  const cy = (top + bottom) / 2
  return nodes.map((n) => {
    if (!ids.has(n.id)) return n
    switch (mode) {
      case 'left':
        return { ...n, x: left }
      case 'right':
        return { ...n, x: right - n.w }
      case 'hcenter':
        return { ...n, x: Math.round(cx - n.w / 2) }
      case 'top':
        return { ...n, y: top }
      case 'bottom':
        return { ...n, y: bottom - n.h }
      case 'vmiddle':
        return { ...n, y: Math.round(cy - n.h / 2) }
    }
  })
}

/** Distribuie blocurile selectate cu spații egale între ele (orizontal sau vertical) */
export function distributeNodes(nodes: DiagramNode[], ids: Set<string>, axis: 'h' | 'v'): DiagramNode[] {
  const sel = nodes.filter((n) => ids.has(n.id))
  if (sel.length < 3) return nodes
  const pos = (n: DiagramNode) => (axis === 'h' ? n.x : n.y)
  const size = (n: DiagramNode) => (axis === 'h' ? n.w : n.h)
  const sorted = [...sel].sort((a, b) => pos(a) + size(a) / 2 - (pos(b) + size(b) / 2))
  const start = pos(sorted[0])
  const end = Math.max(...sorted.map((n) => pos(n) + size(n)))
  const gap = (end - start - sorted.reduce((s, n) => s + size(n), 0)) / (sorted.length - 1)
  const at = new Map<string, number>()
  let cur = start
  for (const n of sorted) {
    at.set(n.id, Math.round(cur))
    cur += size(n) + gap
  }
  return nodes.map((n) => (at.has(n.id) ? (axis === 'h' ? { ...n, x: at.get(n.id)! } : { ...n, y: at.get(n.id)! }) : n))
}
