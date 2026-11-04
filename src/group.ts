import type { ArchElement, Cable, Device, Project, Selection } from './types'

/**
 * Selecția multiplă pe plan: echipamente, elemente de arhitectură și cabluri, mutate / aliniate împreună.
 */

export type Item = Exclude<Selection, null>

export const sameItem = (a: Item, b: Item) => a.kind === b.kind && a.id === b.id

export function toggleItem(list: Item[], it: Item): Item[] {
  return list.some((x) => sameItem(x, it)) ? list.filter((x) => !sameItem(x, it)) : [...list, it]
}

/** Punctul „de referință” al unui element (pentru aliniere și încadrare) */
export function itemPoints(p: Project, it: Item): number[] {
  if (it.kind === 'device') {
    const d = p.devices.find((x) => x.id === it.id)
    return d ? [d.x, d.y] : []
  }
  if (it.kind === 'cable') return p.cables.find((x) => x.id === it.id)?.points ?? []
  const a = p.arch.find((x) => x.id === it.id)
  if (!a) return []
  return a.points ?? (a.x != null && a.y != null ? [a.x, a.y] : [])
}

export function groupBounds(p: Project, items: Item[], pad = 0) {
  const xs: number[] = []
  const ys: number[] = []
  for (const it of items) {
    const pts = itemPoints(p, it)
    for (let i = 0; i < pts.length; i += 2) {
      xs.push(pts[i])
      ys.push(pts[i + 1])
    }
  }
  if (!xs.length) return null
  const x = Math.min(...xs) - pad
  const y = Math.min(...ys) - pad
  return { x, y, width: Math.max(...xs) - Math.min(...xs) + 2 * pad, height: Math.max(...ys) - Math.min(...ys) + 2 * pad }
}

/** Copie a coordonatelor grupului la începutul tragerii */
export interface Snapshot {
  devices: Map<string, { x: number; y: number }>
  arch: Map<string, { points?: number[]; x?: number; y?: number }>
  cables: Map<string, number[]>
}

export function snapshot(p: Project, items: Item[]): Snapshot {
  const devIds = new Set(items.filter((i) => i.kind === 'device').map((i) => i.id))
  const s: Snapshot = { devices: new Map(), arch: new Map(), cables: new Map() }
  for (const d of p.devices) if (devIds.has(d.id)) s.devices.set(d.id, { x: d.x, y: d.y })
  for (const it of items) {
    if (it.kind !== 'arch') continue
    const a = p.arch.find((x) => x.id === it.id)
    if (a) s.arch.set(a.id, { points: a.points ? [...a.points] : undefined, x: a.x, y: a.y })
  }
  // cablurile selectate, plus cele legate de echipamentele din grup (li se mută capătul)
  for (const c of p.cables) {
    if (items.some((i) => i.kind === 'cable' && i.id === c.id) || (c.from && devIds.has(c.from)) || (c.to && devIds.has(c.to))) {
      s.cables.set(c.id, [...c.points])
    }
  }
  return s
}

/** Mută grupul cu (dx, dy) față de copia de la începutul tragerii */
export function translateGroup(p: Project, items: Item[], s: Snapshot, dx: number, dy: number): Project {
  const selCables = new Set(items.filter((i) => i.kind === 'cable').map((i) => i.id))
  const moveCable = (c: Cable): Cable => {
    const orig = s.cables.get(c.id)
    if (!orig) return c
    const whole = selCables.has(c.id) || ((!c.from || s.devices.has(c.from)) && (!c.to || s.devices.has(c.to)) && !!(c.from || c.to))
    if (whole) return { ...c, points: orig.map((v, i) => v + (i % 2 ? dy : dx)) }
    const pts = [...orig]
    if (c.from && s.devices.has(c.from)) {
      pts[0] += dx
      pts[1] += dy
    }
    if (c.to && s.devices.has(c.to)) {
      pts[pts.length - 2] += dx
      pts[pts.length - 1] += dy
    }
    return { ...c, points: pts }
  }
  return {
    ...p,
    devices: p.devices.map((d): Device => {
      const o = s.devices.get(d.id)
      return o ? { ...d, x: o.x + dx, y: o.y + dy } : d
    }),
    arch: p.arch.map((a): ArchElement => {
      const o = s.arch.get(a.id)
      if (!o) return a
      return {
        ...a,
        points: o.points?.map((v, i) => v + (i % 2 ? dy : dx)),
        x: o.x != null ? o.x + dx : a.x,
        y: o.y != null ? o.y + dy : a.y,
      }
    }),
    cables: p.cables.map(moveCable),
  }
}

/** Centrul unui element (pentru aliniere / distribuire) */
function center(p: Project, it: Item) {
  const pts = itemPoints(p, it)
  if (!pts.length) return null
  let x = 0
  let y = 0
  for (let i = 0; i < pts.length; i += 2) {
    x += pts[i]
    y += pts[i + 1]
  }
  return { x: (x * 2) / pts.length, y: (y * 2) / pts.length }
}

/** Mută un singur element cu (dx, dy), inclusiv capetele cablurilor legate */
function moveOne(p: Project, it: Item, dx: number, dy: number): Project {
  if (!dx && !dy) return p
  return translateGroup(p, [it], snapshot(p, [it]), dx, dy)
}

/** Elementele „punctuale” (echipamente, uși, ferestre, texte): doar ele se aliniază / distribuie; cablurile și pereții urmează */
function pointItems(p: Project, items: Item[]) {
  return items.filter((it) => it.kind === 'device' || (it.kind === 'arch' && p.arch.find((a) => a.id === it.id)?.x != null))
}

/** Aliniere: toate centrele pe aceeași linie (media), orizontal sau vertical */
export function alignGroup(p: Project, items: Item[], axis: 'h' | 'v'): Project {
  const cs = pointItems(p, items)
    .map((it) => ({ it, c: center(p, it) }))
    .filter((x) => x.c)
  if (cs.length < 2) return p
  const avg = cs.reduce((s, x) => s + (axis === 'h' ? x.c!.y : x.c!.x), 0) / cs.length
  let out = p
  for (const { it, c } of cs) out = moveOne(out, it, axis === 'v' ? avg - c!.x : 0, axis === 'h' ? avg - c!.y : 0)
  return out
}

/** Distribuire uniformă între primul și ultimul element, pe orizontală sau verticală */
export function distributeGroup(p: Project, items: Item[], axis: 'h' | 'v'): Project {
  const cs = pointItems(p, items)
    .map((it) => ({ it, c: center(p, it) }))
    .filter((x) => x.c)
    .sort((a, b) => (axis === 'h' ? a.c!.x - b.c!.x : a.c!.y - b.c!.y))
  if (cs.length < 3) return p
  const first = axis === 'h' ? cs[0].c!.x : cs[0].c!.y
  const last = axis === 'h' ? cs[cs.length - 1].c!.x : cs[cs.length - 1].c!.y
  const step = (last - first) / (cs.length - 1)
  let out = p
  cs.forEach(({ it, c }, i) => {
    const target = first + step * i
    out = moveOne(out, it, axis === 'h' ? target - c!.x : 0, axis === 'v' ? target - c!.y : 0)
  })
  return out
}

/** Elementele din dreptunghiul de selecție (doar de pe nivelul dat și din sistemele afișate) */
export function itemsInRect(
  r: { x: number; y: number; width: number; height: number },
  visible: { devices: Device[]; cables: Cable[]; arch: ArchElement[] },
): Item[] {
  const inside = (x: number, y: number) => x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height
  const allIn = (pts: number[]) => {
    for (let i = 0; i < pts.length; i += 2) if (!inside(pts[i], pts[i + 1])) return false
    return pts.length > 0
  }
  const out: Item[] = []
  for (const d of visible.devices) if (inside(d.x, d.y)) out.push({ kind: 'device', id: d.id })
  for (const a of visible.arch) if (allIn(a.points ?? (a.x != null && a.y != null ? [a.x, a.y] : []))) out.push({ kind: 'arch', id: a.id })
  for (const c of visible.cables) if (allIn(c.points)) out.push({ kind: 'cable', id: c.id })
  return out
}
