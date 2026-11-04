import type { Cable, Device, Project, SystemId } from './types'
import { symbolByType } from './symbols'
import { deviceSystem } from './project'

/**
 * Schema bloc a unui sistem, generată automat din echipamente și cabluri:
 * arbore pornind de la centrală (CAE, NVR, CDI, rack...), cu echipamentele
 * legate prin cablu dedesubt. Echipamentele fără cablu sunt legate punctat de centrală.
 */

export const NODE_W = 210
export const NODE_H = 66
const HG = 26 // spațiu orizontal între blocuri
const VG = 86 // spațiu vertical între niveluri
const MAX_COLS = 6 // peste atâtea elemente terminale, se așază pe mai multe rânduri

export interface BNode {
  id: string
  device?: Device
  /** Text pentru nod virtual (centrală lipsă) */
  text?: string
  cable?: Cable
  dashed?: boolean
  children: BNode[]
  x: number
  y: number
  // dimensiunea subarborelui
  sw: number
  sh: number
  grid?: { cols: number; rows: number }
}

export interface BEdge {
  points: number[]
  dashed: boolean
}

export interface BLabel {
  x: number
  y: number
  text: string
}

export interface BlockLayout {
  system: SystemId
  nodes: BNode[]
  edges: BEdge[]
  labels: BLabel[]
  bounds: { x: number; y: number; width: number; height: number }
}

const byLabel = (a: BNode, b: BNode) =>
  (a.device?.label ?? a.text ?? '').localeCompare(b.device?.label ?? b.text ?? '', 'ro', { numeric: true })

const rootRank = (d: Device) => symbolByType(d.type)?.root ?? 99

function mk(device: Device | undefined, cable?: Cable, dashed = false, text?: string): BNode {
  return { id: device?.id ?? 'virtual', device, text, cable, dashed, children: [], x: 0, y: 0, sw: 0, sh: 0 }
}

function buildForest(p: Project, system: SystemId): BNode[] {
  const devs = p.devices.filter((d) => deviceSystem(d) === system)
  const ids = new Set(devs.map((d) => d.id))
  const byId = new Map(devs.map((d) => [d.id, d]))
  const adj = new Map<string, { other: string; cable: Cable }[]>()
  for (const c of p.cables) {
    if (!c.from || !c.to || !ids.has(c.from) || !ids.has(c.to)) continue
    adj.set(c.from, [...(adj.get(c.from) ?? []), { other: c.to, cable: c }])
    adj.set(c.to, [...(adj.get(c.to) ?? []), { other: c.from, cable: c }])
  }
  const visited = new Set<string>()

  const bfs = (start: Device): BNode => {
    const root = mk(start)
    visited.add(start.id)
    const queue = [root]
    while (queue.length) {
      const n = queue.shift()!
      for (const { other, cable } of adj.get(n.id) ?? []) {
        if (visited.has(other)) continue
        visited.add(other)
        const child = mk(byId.get(other), cable)
        n.children.push(child)
        queue.push(child)
      }
      n.children.sort(byLabel)
    }
    return root
  }

  // 1. arbori pornind de la centrale, în ordinea priorității
  const trees: BNode[] = []
  const candidates = [...devs].sort((a, b) => rootRank(a) - rootRank(b) || a.label.localeCompare(b.label, 'ro', { numeric: true }))
  for (const d of candidates) if (!visited.has(d.id) && rootRank(d) < 99) trees.push(bfs(d))
  // 2. restul componentelor (fără centrală)
  const orphans: BNode[] = []
  for (const d of candidates) if (!visited.has(d.id)) orphans.push(bfs(d))

  let main = trees[0]
  if (!main) {
    if (!orphans.length) return []
    main = mk(undefined, undefined, false, 'Echipament central (neplasat pe plan)')
    trees.push(main)
  }
  for (const o of orphans.sort(byLabel)) {
    o.dashed = true
    main.children.push(o)
  }
  main.children.sort(byLabel)
  return trees
}

function measure(n: BNode) {
  n.children.forEach(measure)
  const k = n.children.length
  if (!k) {
    n.sw = NODE_W
    n.sh = NODE_H
    return
  }
  const allLeaves = n.children.every((c) => !c.children.length)
  let cw: number
  let ch: number
  if (allLeaves && k > MAX_COLS) {
    const cols = MAX_COLS
    const rows = Math.ceil(k / cols)
    n.grid = { cols, rows }
    cw = HG + cols * NODE_W + (cols - 1) * HG
    ch = rows * NODE_H + (rows - 1) * VG
  } else {
    n.grid = undefined
    cw = n.children.reduce((s, c) => s + c.sw, 0) + HG * (k - 1)
    ch = Math.max(...n.children.map((c) => c.sh))
  }
  n.sw = Math.max(NODE_W, cw)
  n.sh = NODE_H + VG + ch
}

function place(n: BNode, left: number, top: number, out: BlockLayout) {
  const cx = left + n.sw / 2
  n.x = cx - NODE_W / 2
  n.y = top
  out.nodes.push(n)
  const k = n.children.length
  if (!k) return
  const childTop = top + NODE_H + VG
  const busOffset = VG * 0.62
  const label = (c: BNode, ccx: number, ctop: number) => {
    if (c.cable) out.labels.push({ x: ccx + 5, y: ctop - VG * 0.36, text: `${c.cable.code} · ${c.cable.cableType}` })
  }

  if (n.grid) {
    const { cols } = n.grid
    const cw = HG + cols * NODE_W + (cols - 1) * HG
    const regionLeft = left + (n.sw - cw) / 2
    const trunkX = regionLeft + HG / 2
    const rowBus: number[] = []
    const rowMaxX: number[] = []
    n.children.forEach((c, i) => {
      const r = Math.floor(i / cols)
      const col = i % cols
      const x = regionLeft + HG + col * (NODE_W + HG)
      const y = childTop + r * (NODE_H + VG)
      place(c, x, y, out)
      const ccx = x + NODE_W / 2
      rowBus[r] = y - busOffset
      rowMaxX[r] = Math.max(rowMaxX[r] ?? -Infinity, ccx)
      out.edges.push({ points: [ccx, y - busOffset, ccx, y], dashed: !!c.dashed })
      label(c, ccx, y)
    })
    // coborâre din centrală până la prima magistrală, apoi trunchi vertical pe stânga
    out.edges.push({ points: [cx, top + NODE_H, cx, rowBus[0]], dashed: false })
    out.edges.push({ points: [trunkX, rowBus[0], trunkX, rowBus[rowBus.length - 1]], dashed: false })
    rowBus.forEach((by, r) => {
      const x1 = r === 0 ? Math.min(trunkX, cx) : trunkX
      const x2 = r === 0 ? Math.max(rowMaxX[r], cx) : rowMaxX[r]
      out.edges.push({ points: [x1, by, x2, by], dashed: false })
    })
    return
  }

  const cw = n.children.reduce((s, c) => s + c.sw, 0) + HG * (k - 1)
  let x = left + (n.sw - cw) / 2
  const busY = childTop - busOffset
  for (const c of n.children) {
    place(c, x, childTop, out)
    const ccx = c.x + NODE_W / 2
    out.edges.push({ points: [cx, top + NODE_H, cx, busY, ccx, busY, ccx, childTop], dashed: !!c.dashed })
    label(c, ccx, childTop)
    x += c.sw + HG
  }
}

export function blockLayout(p: Project, system: SystemId): BlockLayout {
  const out: BlockLayout = { system, nodes: [], edges: [], labels: [], bounds: { x: 0, y: 0, width: 0, height: 0 } }
  const forest = buildForest(p, system)
  let left = 0
  let maxH = 0
  for (const t of forest) {
    measure(t)
    place(t, left, 0, out)
    left += t.sw + HG * 4
    maxH = Math.max(maxH, t.sh)
  }
  const pad = 40
  out.bounds = { x: -pad, y: -pad, width: Math.max(left - HG * 4, NODE_W) + 2 * pad, height: Math.max(maxH, NODE_H) + 2 * pad }
  return out
}

/** Textele afișate într-un bloc: [cod, denumire, detaliu] */
export function nodeTexts(n: BNode): [string, string, string] {
  if (!n.device) return ['?', n.text ?? '', '']
  const def = symbolByType(n.device.type)
  const detail = [n.device.model, n.device.zone].filter(Boolean).join(' · ')
  return [n.device.label, def?.name ?? n.device.type, detail]
}
