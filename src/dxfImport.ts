/**
 * Import DXF ca plan de fundal: citire (ASCII, R12 … 2018), aplatizarea blocurilor și randare pe canvas
 * la scară cunoscută (px/m), deci nivelul iese calibrat direct.
 */

export type Pt = [number, number]

/** Primitive în coordonate de desen (WCS), după aplicarea blocurilor */
export type Prim =
  | { kind: 'line'; layer: string; color: string; pts: Pt[]; closed: boolean; width: number }
  | { kind: 'fill'; layer: string; color: string; rings: Pt[][]; pattern: boolean }
  | { kind: 'text'; layer: string; color: string; x: number; y: number; h: number; rot: number; text: string; ax: number; ay: number }

export interface DxfLayer {
  name: string
  color: string
  /** Stratul e oprit / înghețat în fișier */
  off: boolean
  count: number
}

export interface DxfDrawing {
  layers: DxfLayer[]
  prims: Prim[]
  /** $INSUNITS din fișier (0 = nespecificat) */
  insunits: number
  /** Entități ignorate (tipuri nesuportate) */
  skipped: Record<string, number>
}

export type DxfUnit = 'mm' | 'cm' | 'm' | 'in' | 'ft'
export const UNIT_M: Record<DxfUnit, number> = { mm: 0.001, cm: 0.01, m: 1, in: 0.0254, ft: 0.3048 }
export const UNIT_NAMES: Record<DxfUnit, string> = { mm: 'milimetri', cm: 'centimetri', m: 'metri', in: 'țoli', ft: 'picioare' }
const INSUNITS: Record<number, DxfUnit> = { 1: 'in', 2: 'ft', 4: 'mm', 5: 'cm', 6: 'm' }

// ---------------- citire ----------------

type Pair = [number, string]

interface Ent {
  type: string
  pairs: Pair[]
  /** POLYLINE: vârfurile; INSERT: atributele */
  children?: Ent[]
}

const num = (e: Ent, code: number, def = 0) => {
  const p = e.pairs.find((q) => q[0] === code)
  if (!p) return def
  const v = parseFloat(p[1])
  return Number.isFinite(v) ? v : def
}
const str = (e: Ent, code: number, def = '') => e.pairs.find((q) => q[0] === code)?.[1] ?? def

/** Textul fișierului: UTF-8 (AutoCAD 2007+) sau, dacă nu e valid, Windows-1250 (diacritice românești) */
export function decodeDxf(buf: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    return new TextDecoder('windows-1250').decode(buf)
  }
}

function pairsOf(text: string): Pair[] {
  const lines = text.split(/\r?\n/)
  const out: Pair[] = []
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i].trim(), 10)
    if (Number.isNaN(code)) {
      // linie în plus (fișiere scrise greșit): resincronizare
      i -= 1
      continue
    }
    out.push([code, lines[i + 1].replace(/\s+$/, '')])
  }
  return out
}

/** Împarte o listă de perechi în entități (fiecare începe cu codul 0) și grupează vârfurile / atributele */
function entitiesOf(pairs: Pair[]): Ent[] {
  const raw: Ent[] = []
  let cur: Ent | null = null
  for (const p of pairs) {
    if (p[0] === 0) {
      cur = { type: p[1].trim(), pairs: [] }
      raw.push(cur)
    } else if (cur) cur.pairs.push(p)
  }
  const out: Ent[] = []
  for (let i = 0; i < raw.length; i++) {
    const e = raw[i]
    if (e.type === 'POLYLINE' || (e.type === 'INSERT' && num(e, 66) === 1)) {
      e.children = []
      let j = i + 1
      while (j < raw.length && (raw[j].type === 'VERTEX' || raw[j].type === 'ATTRIB')) e.children.push(raw[j++])
      if (j < raw.length && raw[j].type === 'SEQEND') j++
      i = j - 1
    }
    out.push(e)
  }
  return out
}

interface Block {
  base: Pt
  ents: Ent[]
}

interface Parsed {
  insunits: number
  layers: Map<string, { color: number; rgb?: number; off: boolean }>
  blocks: Map<string, Block>
  ents: Ent[]
}

export function parseDxf(text: string): Parsed {
  if (text.startsWith('AutoCAD Binary DXF')) throw new Error('DXF binar: salvează din AutoCAD ca DXF text (ASCII).')
  const pairs = pairsOf(text)
  const res: Parsed = { insunits: 0, layers: new Map(), blocks: new Map(), ents: [] }
  let i = 0
  const n = pairs.length
  while (i < n) {
    if (pairs[i][0] === 0 && pairs[i][1].trim() === 'SECTION' && pairs[i + 1]?.[0] === 2) {
      const name = pairs[i + 1][1].trim()
      let j = i + 2
      while (j < n && !(pairs[j][0] === 0 && pairs[j][1].trim() === 'ENDSEC')) j++
      const body = pairs.slice(i + 2, j)
      if (name === 'HEADER') {
        for (let k = 0; k < body.length; k++) {
          if (body[k][0] === 9 && body[k][1].trim() === '$INSUNITS') res.insunits = parseInt(body[k + 1]?.[1] ?? '0', 10) || 0
        }
      } else if (name === 'TABLES') {
        for (const e of entitiesOf(body)) {
          if (e.type !== 'LAYER') continue
          const color = num(e, 62, 7)
          const rgbPair = e.pairs.find((q) => q[0] === 420)
          res.layers.set(str(e, 2), { color: Math.abs(color) || 7, rgb: rgbPair ? parseInt(rgbPair[1], 10) : undefined, off: color < 0 || (num(e, 70) & 1) === 1 })
        }
      } else if (name === 'BLOCKS') {
        let blk: { name: string; block: Block; xref: boolean } | null = null
        for (const e of entitiesOf(body)) {
          if (e.type === 'BLOCK') {
            blk = { name: str(e, 2), block: { base: [num(e, 10), num(e, 20)], ents: [] }, xref: (num(e, 70) & 4) === 4 }
          } else if (e.type === 'ENDBLK') {
            if (blk && !blk.xref) res.blocks.set(blk.name, blk.block)
            blk = null
          } else if (blk) blk.block.ents.push(e)
        }
      } else if (name === 'ENTITIES') {
        res.ents = entitiesOf(body)
      }
      i = j + 1
    } else i++
  }
  return res
}

// ---------------- culori ----------------

const ACI_BASE: Record<number, string> = {
  1: '#ff0000',
  2: '#ffff00',
  3: '#00ff00',
  4: '#00ffff',
  5: '#0000ff',
  6: '#ff00ff',
  7: '#000000',
  8: '#808080',
  9: '#c0c0c0',
}

/** Culoarea AutoCAD (ACI) aproximată în RGB; 7 = negru pe fond alb */
export function aciColor(i: number): string {
  if (ACI_BASE[i]) return ACI_BASE[i]
  if (i >= 250 && i <= 255) {
    const v = Math.round(51 + ((i - 250) * 204) / 5)
    return `rgb(${v},${v},${v})`
  }
  if (i >= 10 && i <= 249) {
    const hue = (Math.floor(i / 10) - 1) * 15
    const k = i % 10
    const light = [1, 1, 0.8, 0.8, 0.6, 0.6, 0.5, 0.5, 0.3, 0.3][k]
    const pastel = k % 2 === 1
    return `hsl(${hue}, ${pastel ? 60 : 100}%, ${Math.round(light * (pastel ? 75 : 50))}%)`
  }
  return '#000000'
}

const rgbHex = (v: number) => '#' + (v & 0xffffff).toString(16).padStart(6, '0')

// ---------------- geometrie ----------------

/** Matrice afină 2D: [a, b, c, d, e, f] → x' = a·x + c·y + e, y' = b·x + d·y + f */
type Mat = [number, number, number, number, number, number]
const IDENT: Mat = [1, 0, 0, 1, 0, 0]
const mul = (m: Mat, n: Mat): Mat => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
]
const ap = (m: Mat, x: number, y: number): Pt => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
const scaleOf = (m: Mat) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]))
const rotOf = (m: Mat) => (Math.atan2(m[1], m[0]) * 180) / Math.PI

function arcPts(cx: number, cy: number, r: number, a0: number, a1: number): Pt[] {
  // unghiuri în radiani, sens trigonometric de la a0 la a1
  let sweep = a1 - a0
  while (sweep <= 0) sweep += Math.PI * 2
  const steps = Math.max(4, Math.min(128, Math.ceil(sweep / (Math.PI / 36))))
  const out: Pt[] = []
  for (let k = 0; k <= steps; k++) {
    const a = a0 + (sweep * k) / steps
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
  }
  return out
}

/** Segment cu „bulge” (arc) între două vârfuri de polilinie */
function bulgePts(p1: Pt, p2: Pt, b: number): Pt[] {
  const dx = p2[0] - p1[0]
  const dy = p2[1] - p1[1]
  const c = Math.hypot(dx, dy)
  if (c < 1e-12) return []
  const theta = 4 * Math.atan(b)
  const r = c / (2 * Math.sin(theta / 2))
  // centrul: pe mediatoare
  const mx = (p1[0] + p2[0]) / 2
  const my = (p1[1] + p2[1]) / 2
  const h = r * Math.cos(theta / 2)
  const cx = mx - (dy / c) * h
  const cy = my + (dx / c) * h
  const a0 = Math.atan2(p1[1] - cy, p1[0] - cx)
  const steps = Math.max(2, Math.min(64, Math.ceil(Math.abs(theta) / (Math.PI / 36))))
  const out: Pt[] = []
  for (let k = 1; k <= steps; k++) {
    const a = a0 + (theta * k) / steps
    out.push([cx + Math.abs(r) * Math.cos(a), cy + Math.abs(r) * Math.sin(a)])
  }
  return out
}

function polyWithBulges(verts: { p: Pt; b: number }[], closed: boolean): Pt[] {
  if (!verts.length) return []
  const out: Pt[] = [verts[0].p]
  const n = verts.length
  for (let k = 0; k < (closed ? n : n - 1); k++) {
    const a = verts[k]
    const b = verts[(k + 1) % n]
    if (Math.abs(a.b) > 1e-9) out.push(...bulgePts(a.p, b.p, a.b))
    else out.push(b.p)
  }
  return out
}

function ellipsePts(cx: number, cy: number, mx: number, my: number, ratio: number, t0: number, t1: number): Pt[] {
  let sweep = t1 - t0
  while (sweep <= 1e-9) sweep += Math.PI * 2
  const steps = Math.max(8, Math.min(128, Math.ceil(sweep / (Math.PI / 36))))
  const vx = -my * ratio
  const vy = mx * ratio
  const out: Pt[] = []
  for (let k = 0; k <= steps; k++) {
    const t = t0 + (sweep * k) / steps
    out.push([cx + mx * Math.cos(t) + vx * Math.sin(t), cy + my * Math.cos(t) + vy * Math.sin(t)])
  }
  return out
}

/** Curbă netedă prin punctele date (Catmull-Rom), pentru spline-urile definite doar prin puncte de trecere */
function throughPoints(p: Pt[]): Pt[] {
  const out: Pt[] = [p[0]]
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[Math.max(0, i - 1)]
    const p1 = p[i]
    const p2 = p[i + 1]
    const p3 = p[Math.min(p.length - 1, i + 2)]
    for (let k = 1; k <= 12; k++) {
      const t = k / 12
      const t2 = t * t
      const t3 = t2 * t
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])])
    }
  }
  return out
}

/** Spline B (de Boor), neraționat; dacă nodurile lipsesc, se folosesc punctele de control */
function splinePts(deg: number, knots: number[], ctrl: Pt[], fit: Pt[]): Pt[] {
  if (ctrl.length < 2 || knots.length !== ctrl.length + deg + 1) return fit.length > 2 ? throughPoints(fit) : fit.length > 1 ? fit : ctrl
  const out: Pt[] = []
  const t0 = knots[deg]
  const t1 = knots[knots.length - deg - 1]
  const steps = Math.min(400, ctrl.length * 8)
  for (let s = 0; s <= steps; s++) {
    const t = Math.min(t0 + ((t1 - t0) * s) / steps, t1 - 1e-12)
    let k = deg
    while (k < knots.length - deg - 2 && t >= knots[k + 1]) k++
    const d: Pt[] = []
    for (let j = 0; j <= deg; j++) d.push([...ctrl[k - deg + j]] as Pt)
    for (let r = 1; r <= deg; r++) {
      for (let j = deg; j >= r; j--) {
        const i = k - deg + j
        const den = knots[i + deg - r + 1] - knots[i]
        const a = den === 0 ? 0 : (t - knots[i]) / den
        d[j] = [(1 - a) * d[j - 1][0] + a * d[j][0], (1 - a) * d[j - 1][1] + a * d[j][1]]
      }
    }
    out.push(d[deg])
  }
  return out
}

/** Contururile unei hașuri (fronturi de tip polilinie sau muchii: linie, arc, elipsă, spline) */
function hatchRings(e: Ent): Pt[][] {
  const P = e.pairs
  let i = P.findIndex((q) => q[0] === 91)
  if (i < 0) return []
  const nPaths = parseInt(P[i][1], 10) || 0
  i++
  const rings: Pt[][] = []
  const val = (code: number): number => {
    while (i < P.length && P[i][0] !== code) i++
    const v = i < P.length ? parseFloat(P[i][1]) : 0
    i++
    return v
  }
  for (let pth = 0; pth < nPaths && i < P.length; pth++) {
    const flags = val(92)
    const ring: Pt[] = []
    if (flags & 2) {
      const hasBulge = val(72)
      val(73)
      const nv = val(93)
      const verts: { p: Pt; b: number }[] = []
      for (let k = 0; k < nv; k++) {
        const x = val(10)
        const y = val(20)
        let b = 0
        if (hasBulge && P[i]?.[0] === 42) b = val(42)
        verts.push({ p: [x, y], b })
      }
      ring.push(...polyWithBulges(verts, true))
    } else {
      const ne = val(93)
      for (let k = 0; k < ne; k++) {
        const t = val(72)
        if (t === 1) {
          const a: Pt = [val(10), val(20)]
          const b: Pt = [val(11), val(21)]
          if (!ring.length) ring.push(a)
          ring.push(b)
        } else if (t === 2) {
          const cx = val(10)
          const cy = val(20)
          const r = val(40)
          const s = val(50)
          const en = val(51)
          const ccw = val(73)
          let pts = arcPts(cx, cy, r, (s * Math.PI) / 180, (en * Math.PI) / 180)
          if (!ccw) pts = pts.map(([x, y]) => [x, 2 * cy - y] as Pt)
          ring.push(...pts)
        } else if (t === 3) {
          const cx = val(10)
          const cy = val(20)
          const mx = val(11)
          const my = val(21)
          const ratio = val(40)
          const s = val(50)
          const en = val(51)
          const ccw = val(73)
          let pts = ellipsePts(cx, cy, mx, my, ratio, (s * Math.PI) / 180, (en * Math.PI) / 180)
          if (!ccw) pts = pts.reverse()
          ring.push(...pts)
        } else if (t === 4) {
          const deg = val(94)
          val(73)
          val(74)
          const nk = val(95)
          const nc = val(96)
          const knots: number[] = []
          for (let q = 0; q < nk; q++) knots.push(val(40))
          const ctrl: Pt[] = []
          for (let q = 0; q < nc; q++) {
            const x = val(10)
            const y = val(20)
            if (P[i]?.[0] === 42) i++
            ctrl.push([x, y])
          }
          if (P[i]?.[0] === 97) {
            const nf = val(97)
            for (let q = 0; q < nf; q++) {
              val(11)
              val(21)
            }
          }
          ring.push(...splinePts(deg, knots, ctrl, []))
        }
      }
    }
    // obiectele sursă (asociativitate)
    if (P[i]?.[0] === 97) {
      const ns = val(97)
      for (let k = 0; k < ns; k++) if (P[i]?.[0] === 330) i++
    }
    if (ring.length > 2) rings.push(ring)
  }
  return rings
}

/** Curăță codurile de formatare din MTEXT / TEXT */
export function cleanText(s: string): string {
  return s
    .replace(/\\U\+([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/%%[cC]/g, 'Ø')
    .replace(/%%[dD]/g, '°')
    .replace(/%%[pP]/g, '±')
    .replace(/%%[uUoOkK]/g, '')
    .replace(/\\P/g, '\n')
    .replace(/\\[ACcFfHhQqTtWwp][^;]*;/g, '')
    .replace(/\\S([^;]*);/g, (_, f: string) => f.replace(/[#^/]/g, '/'))
    .replace(/\\[LlOoKkNX]/g, '')
    .replace(/\\~/g, ' ')
    .replace(/\\\\/g, '\\')
    .replace(/[{}]/g, '')
}

// ---------------- aplatizare ----------------

interface Ctx {
  m: Mat
  layer: string
  /** Culoarea moștenită (BYBLOCK) */
  color: string
  depth: number
}

/** Transformă desenul în primitive (WCS), cu blocurile explodate */
export function flattenDxf(p: Parsed): DxfDrawing {
  const prims: Prim[] = []
  const skipped: Record<string, number> = {}
  const layerColor = (name: string) => {
    const l = p.layers.get(name)
    if (!l) return '#000000'
    return l.rgb != null ? rgbHex(l.rgb) : aciColor(l.color)
  }

  const colorOf = (e: Ent, layer: string, c: Ctx): string => {
    const tc = e.pairs.find((q) => q[0] === 420)
    if (tc) return rgbHex(parseInt(tc[1], 10))
    const aci = num(e, 62, 256)
    if (aci === 0) return c.color
    if (aci === 256 || aci < 0) return layerColor(layer)
    return aciColor(aci)
  }

  const walk = (ents: Ent[], c: Ctx) => {
    for (const e of ents) {
      if (num(e, 67) === 1) continue // spațiul hârtie
      let layer = str(e, 8, '0')
      if (layer === '0' && c.depth > 0) layer = c.layer
      const color = colorOf(e, layer, c)
      const L = (pts: Pt[], closed = false, width = 0) => {
        if (pts.length > 1) prims.push({ kind: 'line', layer, color, pts: pts.map(([x, y]) => ap(c.m, x, y)), closed, width: width * scaleOf(c.m) })
      }
      switch (e.type) {
        case 'LINE':
          L([
            [num(e, 10), num(e, 20)],
            [num(e, 11), num(e, 21)],
          ])
          break
        case 'LWPOLYLINE': {
          const verts: { p: Pt; b: number }[] = []
          for (const [code, v] of e.pairs) {
            if (code === 10) verts.push({ p: [parseFloat(v), 0], b: 0 })
            else if (code === 20 && verts.length) verts[verts.length - 1].p[1] = parseFloat(v)
            else if (code === 42 && verts.length) verts[verts.length - 1].b = parseFloat(v)
          }
          const closed = (num(e, 70) & 1) === 1
          L(polyWithBulges(verts, closed), closed, num(e, 43))
          break
        }
        case 'POLYLINE': {
          const f = num(e, 70)
          if (f & (16 | 64)) {
            skipped['POLYLINE 3D'] = (skipped['POLYLINE 3D'] ?? 0) + 1
            break
          }
          const verts = (e.children ?? [])
            .filter((v) => v.type === 'VERTEX' && !(num(v, 70) & 16))
            .map((v) => ({ p: [num(v, 10), num(v, 20)] as Pt, b: num(v, 42) }))
          const closed = (f & 1) === 1
          L(polyWithBulges(verts, closed), closed, num(e, 40))
          break
        }
        case 'LEADER': {
          const pts: Pt[] = []
          for (const [code, v] of e.pairs) {
            if (code === 10) pts.push([parseFloat(v), 0])
            else if (code === 20 && pts.length) pts[pts.length - 1][1] = parseFloat(v)
          }
          L(pts)
          break
        }
        case 'CIRCLE':
          L(arcPts(num(e, 10), num(e, 20), num(e, 40), 0, Math.PI * 2), true)
          break
        case 'ARC':
          L(arcPts(num(e, 10), num(e, 20), num(e, 40), (num(e, 50) * Math.PI) / 180, (num(e, 51) * Math.PI) / 180))
          break
        case 'ELLIPSE':
          L(ellipsePts(num(e, 10), num(e, 20), num(e, 11), num(e, 21), num(e, 40, 1), num(e, 41), num(e, 42, Math.PI * 2)))
          break
        case 'SPLINE': {
          const ctrl: Pt[] = []
          const fit: Pt[] = []
          const knots: number[] = []
          let last: Pt[] | null = null
          for (const [code, v] of e.pairs) {
            if (code === 40) knots.push(parseFloat(v))
            else if (code === 10) {
              ctrl.push([parseFloat(v), 0])
              last = ctrl
            } else if (code === 11) {
              fit.push([parseFloat(v), 0])
              last = fit
            }
            else if ((code === 20 || code === 21) && last) last[last.length - 1][1] = parseFloat(v)
          }
          L(splinePts(num(e, 71, 3), knots, ctrl, fit), (num(e, 70) & 1) === 1)
          break
        }
        case 'SOLID':
        case 'TRACE': {
          const q: Pt[] = [
            [num(e, 10), num(e, 20)],
            [num(e, 11), num(e, 21)],
            [num(e, 13, num(e, 12)), num(e, 23, num(e, 22))],
            [num(e, 12), num(e, 22)],
          ]
          prims.push({ kind: 'fill', layer, color, rings: [q.map(([x, y]) => ap(c.m, x, y))], pattern: false })
          break
        }
        case 'HATCH': {
          const rings = hatchRings(e)
          if (rings.length) {
            const solid = num(e, 70) === 1 || str(e, 2).toUpperCase() === 'SOLID'
            prims.push({ kind: 'fill', layer, color, rings: rings.map((r) => r.map(([x, y]) => ap(c.m, x, y))), pattern: !solid })
          }
          break
        }
        case 'TEXT':
        case 'ATTRIB': {
          if (e.type === 'ATTRIB' && (num(e, 70) & 1)) break // atribut invizibil
          const h72 = num(e, 72)
          const v73 = num(e, e.type === 'ATTRIB' ? 74 : 73)
          const aligned = h72 !== 0 || v73 !== 0
          const [x, y] = aligned && e.pairs.some((q) => q[0] === 11) ? [num(e, 11), num(e, 21)] : [num(e, 10), num(e, 20)]
          const ax = h72 === 1 || h72 === 4 ? 0.5 : h72 === 2 ? 1 : 0
          const ay = h72 === 4 ? 0.5 : v73 === 3 ? 1 : v73 === 2 ? 0.5 : 0
          const t = cleanText(str(e, 1))
          if (t.trim()) {
            const [X, Y] = ap(c.m, x, y)
            prims.push({ kind: 'text', layer, color, x: X, y: Y, h: num(e, 40, 1) * scaleOf(c.m), rot: num(e, 50) + rotOf(c.m), text: t, ax, ay })
          }
          break
        }
        case 'MTEXT': {
          let t = ''
          for (const [code, v] of e.pairs) if (code === 3) t += v
          t += str(e, 1)
          t = cleanText(t)
          if (!t.trim()) break
          const att = num(e, 71, 1)
          const ax = [0, 0.5, 1][(att - 1) % 3]
          const ay = [1, 0.5, 0][Math.floor((att - 1) / 3)]
          let rot = num(e, 50)
          if (e.pairs.some((q) => q[0] === 11)) rot = (Math.atan2(num(e, 21), num(e, 11)) * 180) / Math.PI
          const [X, Y] = ap(c.m, num(e, 10), num(e, 20))
          prims.push({ kind: 'text', layer, color, x: X, y: Y, h: num(e, 40, 1) * scaleOf(c.m), rot: rot + rotOf(c.m), text: t, ax, ay })
          break
        }
        case 'INSERT':
        case 'DIMENSION': {
          const blk = p.blocks.get(str(e, 2))
          if (blk && c.depth < 16) {
            if (e.type === 'DIMENSION') {
              walk(blk.ents, { m: c.m, layer, color, depth: c.depth + 1 })
              break
            }
            const sx = num(e, 41, 1)
            const sy = num(e, 42, 1)
            const r = (num(e, 50) * Math.PI) / 180
            const cols = Math.max(1, num(e, 70, 1))
            const rows = Math.max(1, num(e, 71, 1))
            const cs = Math.cos(r)
            const sn = Math.sin(r)
            for (let ci = 0; ci < cols; ci++) {
              for (let ri = 0; ri < rows; ri++) {
                const ox = ci * num(e, 44)
                const oy = ri * num(e, 45)
                const tx = num(e, 10) + ox * cs - oy * sn
                const ty = num(e, 20) + ox * sn + oy * cs
                const local: Mat = mul([cs, sn, -sn, cs, tx, ty], mul([sx, 0, 0, sy, 0, 0], [1, 0, 0, 1, -blk.base[0], -blk.base[1]]))
                walk(blk.ents, { m: mul(c.m, local), layer, color, depth: c.depth + 1 })
              }
            }
          }
          if (e.children?.length) walk(e.children, { ...c })
          break
        }
        case 'ATTDEF':
        case 'POINT':
        case 'VIEWPORT':
        case 'SEQEND':
        case 'VERTEX':
          break
        default:
          skipped[e.type] = (skipped[e.type] ?? 0) + 1
      }
    }
  }
  walk(p.ents, { m: IDENT, layer: '0', color: '#000000', depth: 0 })

  const counts = new Map<string, number>()
  for (const q of prims) counts.set(q.layer, (counts.get(q.layer) ?? 0) + 1)
  const layers: DxfLayer[] = [...counts.keys()]
    .sort((a, b) => a.localeCompare(b, 'ro'))
    .map((name) => ({ name, color: layerColor(name), off: p.layers.get(name)?.off ?? false, count: counts.get(name)! }))
  return { layers, prims, insunits: p.insunits, skipped }
}

export function readDxf(buf: ArrayBuffer): DxfDrawing {
  return flattenDxf(parseDxf(decodeDxf(buf)))
}

// ---------------- unități, limite, randare ----------------

export function unitFromHeader(insunits: number): DxfUnit | null {
  return INSUNITS[insunits] ?? null
}

/** Limitele primitivelor de pe straturile vizibile (unități de desen) */
export function drawingBounds(d: DxfDrawing, visible: Set<string>) {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  const add = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return
    if (x < x0) x0 = x
    if (y < y0) y0 = y
    if (x > x1) x1 = x
    if (y > y1) y1 = y
  }
  for (const q of d.prims) {
    if (!visible.has(q.layer)) continue
    if (q.kind === 'line') for (const [x, y] of q.pts) add(x, y)
    else if (q.kind === 'fill') for (const r of q.rings) for (const [x, y] of r) add(x, y)
    else {
      // dreptunghiul aproximativ al textului (aceeași așezare ca la randare)
      const lines = q.text.split('\n')
      const lh = (q.h / 0.72) * 1.25
      const w = Math.max(...lines.map((l) => l.length)) * q.h * 0.62
      const bh = q.h + (lines.length - 1) * lh
      const r = (q.rot * Math.PI) / 180
      const cs = Math.cos(r)
      const sn = Math.sin(r)
      for (const [lx, ly] of [
        [-w * q.ax, -bh * q.ay - 0.25 * q.h],
        [w * (1 - q.ax), -bh * q.ay - 0.25 * q.h],
        [-w * q.ax, bh * (1 - q.ay)],
        [w * (1 - q.ax), bh * (1 - q.ay)],
      ])
        add(q.x + lx * cs - ly * sn, q.y + lx * sn + ly * cs)
    }
  }
  return x0 <= x1 ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null
}

/** Ghicește unitatea când fișierul nu o spune: dimensiunea care dă o clădire plauzibilă (~40 m) */
export function guessUnit(maxSide: number): DxfUnit {
  const cands: DxfUnit[] = ['mm', 'cm', 'm']
  let best: DxfUnit = 'm'
  let bestD = Infinity
  for (const u of cands) {
    const meters = maxSide * UNIT_M[u]
    const d = Math.abs(Math.log(meters / 40))
    if (d < bestD) {
      bestD = d
      best = u
    }
  }
  return best
}

export interface RenderOpts {
  visible: Set<string>
  /** metri per unitate de desen */
  unitM: number
  /** pixeli per metru în imaginea rezultată */
  ppm: number
  colors: boolean
  /** Desenează hașurile cu model (cele pline se desenează mereu) */
  patterns: boolean
}

const darken = (c: string) => {
  // culorile foarte deschise (galben, alb) nu se văd pe fond alb
  if (/^#ff(ff)?ff00$/i.test(c) || c === '#ffff00') return '#b8a000'
  if (/^#(ffffff|c0c0c0)$/i.test(c)) return '#808080'
  if (c === '#00ffff') return '#00a0a0'
  if (c === '#00ff00') return '#00a000'
  return c
}

/** Desenează planul pe un canvas; întoarce canvas-ul și limitele folosite */
export function renderDxf(d: DxfDrawing, o: RenderOpts, maxSide?: number) {
  const b = drawingBounds(d, o.visible)
  if (!b) return null
  const margin = 0.5 / o.unitM // 0,5 m în jurul desenului
  const bx = b.x - margin
  const by = b.y - margin
  const bw = b.width + 2 * margin
  const bh = b.height + 2 * margin
  let k = o.ppm * o.unitM // px per unitate de desen
  if (maxSide) k = Math.min(k, maxSide / Math.max(bw, bh))
  const W = Math.max(1, Math.round(bw * k))
  const H = Math.max(1, Math.round(bh * k))
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, W, H)
  const X = (x: number) => (x - bx) * k
  const Y = (y: number) => (by + bh - y) * k
  const gray = '#4a4a4a'
  const col = (c: string) => (o.colors ? darken(c) : gray)
  const thin = Math.max(0.8, Math.min(2, k / o.unitM / 80))
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  // întâi umplerile, apoi liniile și textele
  for (const q of d.prims) {
    if (q.kind !== 'fill' || !o.visible.has(q.layer)) continue
    if (q.pattern && !o.patterns) continue
    ctx.beginPath()
    for (const r of q.rings) {
      r.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))))
      ctx.closePath()
    }
    ctx.fillStyle = q.pattern ? (o.colors ? darken(q.color) : '#9a9a9a') : col(q.color)
    ctx.globalAlpha = q.pattern ? 0.25 : o.colors ? 1 : 0.85
    ctx.fill('evenodd')
    ctx.globalAlpha = 1
  }
  for (const q of d.prims) {
    if (q.kind !== 'line' || !o.visible.has(q.layer)) continue
    ctx.beginPath()
    q.pts.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))))
    if (q.closed) ctx.closePath()
    ctx.strokeStyle = col(q.color)
    ctx.lineWidth = Math.max(thin, q.width * k)
    ctx.stroke()
  }
  for (const q of d.prims) {
    if (q.kind !== 'text' || !o.visible.has(q.layer)) continue
    const size = (q.h * k) / 0.72
    if (size < 2) continue
    ctx.save()
    ctx.translate(X(q.x), Y(q.y))
    ctx.rotate((-q.rot * Math.PI) / 180)
    ctx.font = `${size}px Arial, Helvetica, sans-serif`
    ctx.fillStyle = col(q.color)
    ctx.textBaseline = 'alphabetic'
    const lines = q.text.split('\n')
    const lh = size * 1.25
    const widths = lines.map((l) => ctx.measureText(l).width)
    const blockH = q.h * k + (lines.length - 1) * lh
    lines.forEach((l, i) => {
      const tx = -widths[i] * q.ax
      const ty = (blockH * q.ay) - (lines.length - 1 - i) * lh
      ctx.fillText(l, tx, ty)
    })
    ctx.restore()
  }
  return { canvas, k, widthM: bw * o.unitM, heightM: bh * o.unitM }
}

/** Rezoluția planului de fundal: până la 100 px/m, fără să depășească ~6000 px pe latură */
export function chooseResolution(widthM: number, heightM: number) {
  const side = Math.max(widthM, heightM, 1)
  return Math.max(5, Math.min(100, Math.floor(6000 / side)))
}
