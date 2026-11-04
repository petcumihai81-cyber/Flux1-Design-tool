import type { Diagram, DiagramNode, Project, SystemId } from './types'
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
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }
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
