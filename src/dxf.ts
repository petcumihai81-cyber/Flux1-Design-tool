import type { ArchElement, Project, Sheet, SystemId } from './types'
import { archLayer, layerVisible } from './layers'
import { polygonInfo } from './arch'
import { SYSTEMS, glyphLayout, symbolByType, symbolSvg } from './symbols'
import { deviceSystem, paperMmPerPx, sheetLevel } from './project'
import { FALLBACK_PX_PER_M } from './PlanCanvas'

/**
 * Export DXF (R12 / AC1009, cel mai compatibil) al unei planșe de plan:
 * unitate = metrul, straturi pe sisteme, simbolurile ca blocuri (BLOCK / INSERT).
 * Coordonatele planului (px, y în jos) devin metri, cu y în sus.
 */

// ---------------------------------------------------------------- scriere DXF

class Dxf {
  private out: string[] = []
  pair(code: number, value: string | number) {
    this.out.push(String(code), typeof value === 'number' ? fmt(value) : value)
  }
  text() {
    return this.out.join('\r\n') + '\r\n'
  }
}

const fmt = (n: number) => (Math.abs(n) < 1e-9 ? '0' : String(Math.round(n * 1e6) / 1e6))

/** Culori AutoCAD (ACI) pe sisteme */
const ACI: Record<SystemId, number> = { EFR: 1, CA: 5, CCTV: 3, INC: 30, NET: 6 }

/** Paleta ACI aproximată (RGB), pentru culorile proprii ale echipamentelor (R12 nu are culori RGB) */
const ACI_RGB: [number, number, number, number][] = (() => {
  const out: [number, number, number, number][] = [
    [1, 255, 0, 0],
    [2, 255, 255, 0],
    [3, 0, 255, 0],
    [4, 0, 255, 255],
    [5, 0, 0, 255],
    [6, 255, 0, 255],
    [7, 0, 0, 0],
    [8, 128, 128, 128],
    [9, 192, 192, 192],
  ]
  for (let i = 10; i <= 249; i++) {
    const h = ((Math.floor(i / 10) - 1) * 15) / 60
    const k = i % 10
    const v = [1, 1, 0.8, 0.8, 0.6, 0.6, 0.5, 0.5, 0.3, 0.3][k]
    const sat = k % 2 ? 0.5 : 1
    const c = v * sat
    const x = c * (1 - Math.abs((h % 2) - 1))
    const [r, g, b] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x]
    const m = v - c
    out.push([i, Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)])
  }
  return out
})()

/** Cea mai apropiată culoare ACI de o culoare #rrggbb */
export function nearestAci(hex: string): number {
  const n = parseInt(hex.replace('#', ''), 16)
  if (!Number.isFinite(n)) return 7
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  let best = 7
  let bd = Infinity
  for (const [i, R, G, B] of ACI_RGB) {
    const d = (r - R) ** 2 + (g - G) ** 2 + (b - B) ** 2
    if (d < bd) {
      bd = d
      best = i
    }
  }
  return best
}

/** Textul în DXF R12 se scrie în ANSI_1250 (central-europeană); ș / ț devin ş / ţ, ca să existe în această codificare */
const CP1250: Record<string, number> = {
  'ă': 0xe3, 'Ă': 0xc3, 'â': 0xe2, 'Â': 0xc2, 'î': 0xee, 'Î': 0xce, 'ș': 0xba, 'Ș': 0xaa, 'ş': 0xba, 'Ş': 0xaa,
  'ț': 0xfe, 'Ț': 0xde, 'ţ': 0xfe, 'Ţ': 0xde, '°': 0xb0, '×': 0xd7, '–': 0x96, '—': 0x97, '„': 0x84, '”': 0x94, '·': 0xb7, 'µ': 0xb5,
  'é': 0xe9, 'ö': 0xf6, 'ü': 0xfc, 'ä': 0xe4, 'Ø': 0x4f, 'ø': 0x6f, '÷': 0xf7,
}

function encode1250(s: string): Uint8Array {
  const bytes: number[] = []
  for (const ch of s) {
    const c = ch.codePointAt(0)!
    if (c < 0x80) bytes.push(c)
    else bytes.push(CP1250[ch] ?? 0x3f)
  }
  return new Uint8Array(bytes)
}

// ---------------------------------------------------------------- SVG → polilinii (pentru blocurile simbolurilor)

type Poly = { pts: [number, number][]; closed: boolean }
type Circ = { cx: number; cy: number; r: number }

const num = (s?: string | null) => parseFloat(s ?? '0') || 0
const attr = (el: string, name: string) => el.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1]

/** Arc SVG (punct final) → puncte, după algoritmul standard de conversie în parametrizare centrală */
function arcPoints(x1: number, y1: number, rx: number, ry: number, phiDeg: number, large: number, sweep: number, x2: number, y2: number): [number, number][] {
  if (!rx || !ry) return [[x2, y2]]
  const phi = (phiDeg * Math.PI) / 180
  const cos = Math.cos(phi)
  const sin = Math.sin(phi)
  const dx = (x1 - x2) / 2
  const dy = (y1 - y2) / 2
  const x1p = cos * dx + sin * dy
  const y1p = -sin * dx + cos * dy
  let rxs = rx * rx
  let rys = ry * ry
  const lam = (x1p * x1p) / rxs + (y1p * y1p) / rys
  if (lam > 1) {
    rx *= Math.sqrt(lam)
    ry *= Math.sqrt(lam)
    rxs = rx * rx
    rys = ry * ry
  }
  const sign = large === sweep ? -1 : 1
  const co = sign * Math.sqrt(Math.max(0, (rxs * rys - rxs * y1p * y1p - rys * x1p * x1p) / (rxs * y1p * y1p + rys * x1p * x1p)))
  const cxp = (co * rx * y1p) / ry
  const cyp = (-co * ry * x1p) / rx
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2
  const ang = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
    return a
  }
  const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
  let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry)
  if (!sweep && dt > 0) dt -= 2 * Math.PI
  if (sweep && dt < 0) dt += 2 * Math.PI
  const n = Math.max(4, Math.ceil(Math.abs(dt) / (Math.PI / 12)))
  const pts: [number, number][] = []
  for (let i = 1; i <= n; i++) {
    const t = t1 + (dt * i) / n
    const x = rx * Math.cos(t)
    const y = ry * Math.sin(t)
    pts.push([cos * x - sin * y + cx, sin * x + cos * y + cy])
  }
  return pts
}

/** Calea SVG (M L H V Q A Z, absolute și relative) → polilinii */
function pathToPolys(d: string): Poly[] {
  const toks = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? []
  const polys: Poly[] = []
  let cur: Poly | null = null
  let x = 0
  let y = 0
  let sx = 0
  let sy = 0
  let i = 0
  let cmd = ''
  const n = () => parseFloat(toks[i++])
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++]
    const rel = cmd === cmd.toLowerCase()
    switch (cmd.toUpperCase()) {
      case 'M': {
        const nx = n() + (rel ? x : 0)
        const ny = n() + (rel ? y : 0)
        x = sx = nx
        y = sy = ny
        cur = { pts: [[x, y]], closed: false }
        polys.push(cur)
        cmd = rel ? 'l' : 'L' // perechile următoare sunt linii
        break
      }
      case 'L':
        x = n() + (rel ? x : 0)
        y = n() + (rel ? y : 0)
        cur?.pts.push([x, y])
        break
      case 'H':
        x = n() + (rel ? x : 0)
        cur?.pts.push([x, y])
        break
      case 'V':
        y = n() + (rel ? y : 0)
        cur?.pts.push([x, y])
        break
      case 'Q': {
        const qx = n() + (rel ? x : 0)
        const qy = n() + (rel ? y : 0)
        const ex = n() + (rel ? x : 0)
        const ey = n() + (rel ? y : 0)
        for (let k = 1; k <= 8; k++) {
          const t = k / 8
          cur?.pts.push([(1 - t) * (1 - t) * x + 2 * (1 - t) * t * qx + t * t * ex, (1 - t) * (1 - t) * y + 2 * (1 - t) * t * qy + t * t * ey])
        }
        x = ex
        y = ey
        break
      }
      case 'A': {
        const rx = n()
        const ry = n()
        const rot = n()
        const large = n()
        const sweep = n()
        const ex = n() + (rel ? x : 0)
        const ey = n() + (rel ? y : 0)
        cur?.pts.push(...arcPoints(x, y, rx, ry, rot, large, sweep, ex, ey))
        x = ex
        y = ey
        break
      }
      case 'Z':
        if (cur) cur.closed = true
        x = sx
        y = sy
        break
      default:
        i++ // comandă necunoscută: o sărim
    }
  }
  return polys
}

/** Geometria unui simbol (caseta 40×40, y în jos), fără textul din interior */
function symbolGeometry(svg: string): { polys: Poly[]; circles: Circ[] } {
  const polys: Poly[] = []
  const circles: Circ[] = []
  for (const el of svg.match(/<(rect|circle|polygon|line|path)\b[^>]*>/g) ?? []) {
    const tag = el.match(/^<(\w+)/)![1]
    if (tag === 'rect') {
      const x = num(attr(el, 'x'))
      const y = num(attr(el, 'y'))
      const w = num(attr(el, 'width'))
      const h = num(attr(el, 'height'))
      polys.push({ pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], closed: true })
    } else if (tag === 'circle') {
      circles.push({ cx: num(attr(el, 'cx')), cy: num(attr(el, 'cy')), r: num(attr(el, 'r')) })
    } else if (tag === 'polygon') {
      const v = (attr(el, 'points') ?? '').trim().split(/[\s,]+/).map(Number)
      const pts: [number, number][] = []
      for (let k = 0; k + 1 < v.length; k += 2) pts.push([v[k], v[k + 1]])
      polys.push({ pts, closed: true })
    } else if (tag === 'line') {
      polys.push({ pts: [[num(attr(el, 'x1')), num(attr(el, 'y1'))], [num(attr(el, 'x2')), num(attr(el, 'y2'))]], closed: false })
    } else if (tag === 'path') {
      polys.push(...pathToPolys(attr(el, 'd') ?? ''))
    }
  }
  return { polys, circles }
}

// ---------------------------------------------------------------- entități

function polyline(d: Dxf, layer: string, pts: [number, number][], opts: { closed?: boolean; width?: number; ltype?: string; color?: number } = {}) {
  if (pts.length < 2) return
  d.pair(0, 'POLYLINE')
  d.pair(8, layer)
  if (opts.ltype) d.pair(6, opts.ltype)
  if (opts.color != null) d.pair(62, opts.color)
  d.pair(66, 1)
  d.pair(10, 0)
  d.pair(20, 0)
  d.pair(30, 0)
  d.pair(70, opts.closed ? 1 : 0)
  if (opts.width) {
    d.pair(40, opts.width)
    d.pair(41, opts.width)
  }
  for (const [x, y] of pts) {
    d.pair(0, 'VERTEX')
    d.pair(8, layer)
    d.pair(10, x)
    d.pair(20, y)
    d.pair(30, 0)
  }
  d.pair(0, 'SEQEND')
  d.pair(8, layer)
}

function circle(d: Dxf, layer: string, x: number, y: number, r: number, color?: number) {
  d.pair(0, 'CIRCLE')
  d.pair(8, layer)
  if (color != null) d.pair(62, color)
  d.pair(10, x)
  d.pair(20, y)
  d.pair(30, 0)
  d.pair(40, r)
}

function arc(d: Dxf, layer: string, x: number, y: number, r: number, a0: number, a1: number) {
  d.pair(0, 'ARC')
  d.pair(8, layer)
  d.pair(10, x)
  d.pair(20, y)
  d.pair(30, 0)
  d.pair(40, r)
  d.pair(50, ((a0 % 360) + 360) % 360)
  d.pair(51, ((a1 % 360) + 360) % 360)
}

/** Text: aliniere orizontală h (0 stânga, 1 centru), verticală v (0 bază, 1 jos, 2 mijloc, 3 sus) */
function text(d: Dxf, layer: string, x: number, y: number, height: number, value: string, opts: { h?: number; v?: number; rot?: number; color?: number } = {}) {
  if (!value) return
  d.pair(0, 'TEXT')
  d.pair(8, layer)
  if (opts.color != null) d.pair(62, opts.color)
  d.pair(10, x)
  d.pair(20, y)
  d.pair(30, 0)
  d.pair(40, height)
  d.pair(1, value.replace(/[\r\n]+/g, ' '))
  if (opts.rot) d.pair(50, opts.rot)
  if (opts.h || opts.v) {
    d.pair(72, opts.h ?? 0)
    d.pair(11, x)
    d.pair(21, y)
    d.pair(31, 0)
    d.pair(73, opts.v ?? 0)
  }
}

// ---------------------------------------------------------------- export

export function exportDxf(p: Project, sheet: Sheet): { ok: boolean; message: string } {
  if (sheet.kind !== 'plan') return { ok: false, message: 'Exportul DXF se face pentru planșele de tip plan (schemele bloc se exportă în draw.io).' }
  const level = sheetLevel(p, sheet)
  const ppm = level.pxPerMeter ?? FALLBACK_PX_PER_M
  const S = level.symbolSize
  const X = (px: number) => px / ppm
  const Y = (py: number) => -py / ppm
  const m = (px: number) => px / ppm
  const visible = new Set(sheet.systems)
  // doar straturile vizibile pe planșă (panoul Straturi)
  const devices = p.devices.filter((d) => d.levelId === level.id && visible.has(deviceSystem(d) as SystemId) && layerVisible(sheet, `${deviceSystem(d)}:echipamente`))
  const cables = p.cables.filter((c) => c.levelId === level.id && visible.has(c.system) && layerVisible(sheet, `${c.system}:cabluri`))
  const arch = p.arch.filter((a) => a.levelId === level.id && layerVisible(sheet, archLayer(a)))

  // straturi
  const layers: { name: string; color: number; ltype?: string }[] = [
    { name: 'ARH_PERETI', color: 7 },
    { name: 'ARH_USI', color: 7 },
    { name: 'ARH_FERESTRE', color: 4 },
    { name: 'ARH_TEXT', color: 8 },
    { name: 'ARH_COTE', color: 7 },
    { name: 'GHENE', color: 8 },
    { name: 'ADN_ZONE', color: 5 },
    { name: 'ADN_NOTE', color: 7 },
    { name: 'ADN_LINII', color: 7 },
  ]
  for (const s of SYSTEMS) {
    if (!visible.has(s.id)) continue
    layers.push({ name: `${s.id}_ECHIPAMENTE`, color: ACI[s.id] }, { name: `${s.id}_CABLURI`, color: ACI[s.id], ltype: s.id === 'INC' ? 'DASHED' : undefined }, { name: `${s.id}_ETICHETE`, color: ACI[s.id] })
    if (s.id === 'CCTV' && layerVisible(sheet, 'CCTV:conuri')) layers.push({ name: 'CCTV_CONURI', color: 3 })
  }

  // blocurile simbolurilor folosite
  const types = [...new Set(devices.map((d) => d.type))]
  const blockName = (type: string) => {
    const def = symbolByType(type)!
    return `${def.system}_${def.prefix}`.toUpperCase().replace(/[^A-Z0-9_]/g, '_')
  }

  const d = new Dxf()
  // --- antet
  const xs: number[] = []
  const ys: number[] = []
  for (const dv of devices) {
    xs.push(X(dv.x))
    ys.push(Y(dv.y))
  }
  for (const a of arch) {
    const pts = a.points ?? (a.x != null && a.y != null ? [a.x, a.y] : [])
    for (let i = 0; i < pts.length; i += 2) {
      xs.push(X(pts[i]))
      ys.push(Y(pts[i + 1]))
    }
  }
  for (const c of cables)
    for (let i = 0; i < c.points.length; i += 2) {
      xs.push(X(c.points[i]))
      ys.push(Y(c.points[i + 1]))
    }
  if (!xs.length) return { ok: false, message: 'Planșa nu are echipamente, cabluri sau schiță de exportat.' }
  d.pair(0, 'SECTION')
  d.pair(2, 'HEADER')
  d.pair(9, '$ACADVER')
  d.pair(1, 'AC1009')
  d.pair(9, '$DWGCODEPAGE')
  d.pair(3, 'ANSI_1250')
  d.pair(9, '$INSBASE')
  d.pair(10, 0)
  d.pair(20, 0)
  d.pair(30, 0)
  d.pair(9, '$EXTMIN')
  d.pair(10, Math.min(...xs) - 1)
  d.pair(20, Math.min(...ys) - 1)
  d.pair(30, 0)
  d.pair(9, '$EXTMAX')
  d.pair(10, Math.max(...xs) + 1)
  d.pair(20, Math.max(...ys) + 1)
  d.pair(30, 0)
  d.pair(9, '$LTSCALE')
  d.pair(40, 1)
  d.pair(0, 'ENDSEC')

  // --- tabele: tipuri de linie, straturi, stil text
  d.pair(0, 'SECTION')
  d.pair(2, 'TABLES')
  d.pair(0, 'TABLE')
  d.pair(2, 'LTYPE')
  d.pair(70, 2)
  d.pair(0, 'LTYPE')
  d.pair(2, 'CONTINUOUS')
  d.pair(70, 0)
  d.pair(3, 'Solid line')
  d.pair(72, 65)
  d.pair(73, 0)
  d.pair(40, 0)
  d.pair(0, 'LTYPE')
  d.pair(2, 'DASHED')
  d.pair(70, 0)
  d.pair(3, '__ __ __ __')
  d.pair(72, 65)
  d.pair(73, 2)
  d.pair(40, 0.6)
  d.pair(49, 0.4)
  d.pair(49, -0.2)
  d.pair(0, 'ENDTAB')
  d.pair(0, 'TABLE')
  d.pair(2, 'LAYER')
  d.pair(70, layers.length + 1)
  for (const l of [{ name: '0', color: 7 }, ...layers] as { name: string; color: number; ltype?: string }[]) {
    d.pair(0, 'LAYER')
    d.pair(2, l.name)
    d.pair(70, 0)
    d.pair(62, l.color)
    d.pair(6, l.ltype ?? 'CONTINUOUS')
  }
  d.pair(0, 'ENDTAB')
  d.pair(0, 'TABLE')
  d.pair(2, 'STYLE')
  d.pair(70, 1)
  d.pair(0, 'STYLE')
  d.pair(2, 'STANDARD')
  d.pair(70, 0)
  d.pair(40, 0)
  d.pair(41, 1)
  d.pair(50, 0)
  d.pair(71, 0)
  d.pair(42, 0.25)
  d.pair(3, 'arial.ttf')
  d.pair(4, '')
  d.pair(0, 'ENDTAB')
  d.pair(0, 'ENDSEC')

  // --- blocuri: geometria simbolului în caseta 40×40, centrată în origine, y în sus (culoare BYBLOCK)
  d.pair(0, 'SECTION')
  d.pair(2, 'BLOCKS')
  for (const type of types) {
    const def = symbolByType(type)!
    const geo = symbolGeometry(symbolSvg(def, '#000', true))
    const name = blockName(type)
    d.pair(0, 'BLOCK')
    d.pair(8, '0')
    d.pair(2, name)
    d.pair(70, 0)
    d.pair(10, 0)
    d.pair(20, 0)
    d.pair(30, 0)
    d.pair(3, name)
    for (const pl of geo.polys) polyline(d, '0', pl.pts.map(([x, y]) => [x - 20, 20 - y]), { closed: pl.closed, color: 0 })
    for (const c of geo.circles) circle(d, '0', c.cx - 20, 20 - c.cy, c.r, 0)
    d.pair(0, 'ENDBLK')
    d.pair(8, '0')
  }
  d.pair(0, 'ENDSEC')

  // --- entități
  d.pair(0, 'SECTION')
  d.pair(2, 'ENTITIES')

  // schița de arhitectură
  const openings = arch.filter((a) => (a.kind === 'door' || a.kind === 'window') && a.x != null && a.y != null)
  // textul notelor: mm de hârtie → metri, la scara planșei
  const paperK = paperMmPerPx(p, sheet)
  const mmToM = paperK ? paperK / ppm : 0.1
  for (const a of arch) drawArch(d, a, ppm, S, X, Y, m, openings, mmToM)

  // conuri camere
  if (layerVisible(sheet, 'CCTV:conuri') && visible.has('CCTV')) {
    for (const dv of devices) {
      const def = symbolByType(dv.type)!
      if (!def.camera) continue
      const fov = dv.fov ?? def.camera.fov
      const r = dv.range ?? def.camera.range
      const cx = X(dv.x)
      const cy = Y(dv.y)
      if (fov >= 360) {
        circle(d, 'CCTV_CONURI', cx, cy, r)
        continue
      }
      // unghiurile planului (în sens orar, y în jos) devin unghiuri DXF (trigonometric, y în sus)
      const a0 = -(dv.rotation + fov / 2)
      const a1 = -(dv.rotation - fov / 2)
      arc(d, 'CCTV_CONURI', cx, cy, r, a0, a1)
      for (const a of [a0, a1]) {
        const t = (a * Math.PI) / 180
        polyline(d, 'CCTV_CONURI', [[cx, cy], [cx + Math.cos(t) * r, cy + Math.sin(t) * r]])
      }
    }
  }

  // cabluri
  for (const c of cables) {
    const pts: [number, number][] = []
    for (let i = 0; i < c.points.length; i += 2) pts.push([X(c.points[i]), Y(c.points[i + 1])])
    polyline(d, `${c.system}_CABLURI`, pts)
  }

  // echipamente: bloc (formă) + textul din simbol (drept) + eticheta (cod)
  const sM = m(S)
  for (const dv of devices) {
    const def = symbolByType(dv.type)!
    const sys = def.system
    const k = sM / 40
    // culoare proprie: pe INSERT (blocul e desenat BYBLOCK) și pe texte; altfel culoarea stratului
    const own = dv.color ? nearestAci(dv.color) : undefined
    d.pair(0, 'INSERT')
    d.pair(8, `${sys}_ECHIPAMENTE`)
    if (own != null) d.pair(62, own)
    d.pair(2, blockName(dv.type))
    d.pair(10, X(dv.x))
    d.pair(20, Y(dv.y))
    d.pair(30, 0)
    d.pair(41, dv.flipX ? -k : k)
    d.pair(42, dv.flipY ? -k : k)
    d.pair(43, k)
    d.pair(50, -dv.rotation)
    if (def.glyph) {
      const g = glyphLayout(def)
      text(d, `${sys}_ECHIPAMENTE`, X(dv.x), Y(dv.y), (g.size / 40) * sM * 0.75, def.glyph, { h: 1, v: 2, color: own })
    }
    if (layerVisible(sheet, `${sys}:etichete`)) text(d, `${sys}_ETICHETE`, X(dv.x), Y(dv.y) - sM * 0.58, sM * 0.38, dv.label, { h: 1, v: 3, color: own })
  }

  d.pair(0, 'ENDSEC')
  d.pair(0, 'EOF')

  const bytes = encode1250(d.text())
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/dxf' })
  const name = `${(p.title.nrProiect || 'proiect').replace(/[\\/:*?"<>|]+/g, '_')} - ${sheet.nr} ${sheet.titlu}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[–—]/g, '-')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${name}.dxf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 30000)
  const calibrated = level.pxPerMeter ? '' : ' Atenție: scara nivelului nu e calibrată, dimensiunile nu sunt reale.'
  return { ok: true, message: `DXF exportat (unitate: metru, ${devices.length} echipamente, ${cables.length} cabluri).${calibrated}` }
}

/** Elementele de arhitectură în DXF */
function drawArch(
  d: Dxf,
  a: ArchElement,
  ppm: number,
  S: number,
  X: (px: number) => number,
  Y: (py: number) => number,
  m: (px: number) => number,
  openings: ArchElement[],
  mmToM: number,
) {
  if (a.kind === 'polygon' && a.points && a.points.length >= 6) {
    // zonă poligon: contur închis + nume și arie în centrul de greutate
    const pts: [number, number][] = []
    for (let i = 0; i < a.points.length; i += 2) pts.push([X(a.points[i]), Y(a.points[i + 1])])
    const color = a.stroke ? nearestAci(a.stroke) : undefined
    polyline(d, 'ADN_ZONE', pts, { closed: true, color })
    const info = polygonInfo(a.points)
    const area = info.area / (ppm * ppm)
    const th = Math.max(0.25, m(S) * 0.4)
    const lines = [a.text ?? '', a.showArea !== false ? `${area.toFixed(1).replace('.', ',')} mp` : ''].filter(Boolean)
    lines.forEach((t, i) => text(d, 'ADN_ZONE', X(info.cx), Y(info.cy) + ((lines.length - 1) / 2 - i) * th * 1.4, th, t, { h: 1, v: 2, color }))
    return
  }
  if (a.kind === 'line' && a.points && a.points.length >= 4) {
    // linie liberă (punctată: tipul DASHED), cu vârfuri de săgeată la capete
    const pts: [number, number][] = []
    for (let i = 0; i < a.points.length; i += 2) pts.push([X(a.points[i]), Y(a.points[i + 1])])
    const color = a.stroke ? nearestAci(a.stroke) : undefined
    polyline(d, 'ADN_LINII', pts, { color, ltype: a.dashed ? 'DASHED' : undefined })
    const head = Math.max((a.widthMm ?? 0.35) * 4, 2.2) * mmToM
    const arrowAt = (tip: [number, number], from: [number, number]) => {
      const ang = Math.atan2(from[1] - tip[1], from[0] - tip[0])
      const bx = tip[0] + Math.cos(ang) * head
      const by = tip[1] + Math.sin(ang) * head
      const w = head * 0.35
      polyline(d, 'ADN_LINII', [tip, [bx - Math.sin(ang) * w, by + Math.cos(ang) * w], [bx + Math.sin(ang) * w, by - Math.cos(ang) * w]], { closed: true, color })
    }
    if (a.arrowStart) arrowAt(pts[0], pts[1])
    if (a.arrowEnd) arrowAt(pts[pts.length - 1], pts[pts.length - 2])
    return
  }
  if (a.kind === 'note' && a.points && a.points.length >= 4) {
    // notă: săgeată de la text la punctul indicat, linie de sprijin, textul deasupra
    const [tx, ty, ax, ay] = [X(a.points[0]), Y(a.points[1]), X(a.points[2]), Y(a.points[3])]
    const h = (a.fontMm ?? 2.5) * mmToM
    const color = a.stroke ? nearestAci(a.stroke) : undefined
    polyline(d, 'ADN_NOTE', [[ax, ay], [tx, ty]], { color })
    const ang = Math.atan2(ay - ty, ax - tx)
    const L = h * 1.1
    const W = h * 0.375
    const bx = tx + Math.cos(ang) * L
    const by = ty + Math.sin(ang) * L
    polyline(d, 'ADN_NOTE', [[tx, ty], [bx - Math.sin(ang) * W, by + Math.cos(ang) * W], [bx + Math.sin(ang) * W, by - Math.cos(ang) * W]], { closed: true, color })
    const lines = (a.text ?? '').split('\n')
    const w = Math.max(h * 2, Math.max(...lines.map((l) => [...l].length)) * h * 0.6)
    const right = tx <= ax
    const x0 = right ? ax : ax - w
    polyline(d, 'ADN_NOTE', [[x0, ay], [x0 + w, ay]], { color })
    lines.forEach((t, i) => text(d, 'ADN_NOTE', right ? x0 : x0 + w, ay + h * 0.35 + (lines.length - 1 - i) * h * 1.25, h, t, { h: right ? 0 : 2, v: 0, color }))
    return
  }
  if (a.kind === 'wall' && a.points) {
    const pts: [number, number][] = []
    for (let i = 0; i < a.points.length; i += 2) pts.push([X(a.points[i]), Y(a.points[i + 1])])
    const closed = pts.length > 3 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1e-6
    const width = a.thickness ?? 0.25
    const pieces = wallPieces(pts, closed, width, openings, X, Y)
    if (!pieces) polyline(d, 'ARH_PERETI', closed ? pts.slice(0, -1) : pts, { closed, width })
    else for (const piece of pieces) if (piece.length > 1) polyline(d, 'ARH_PERETI', piece, { width })
    return
  }
  if (a.kind === 'dim' && a.points) {
    const [x1, y1, x2, y2] = [X(a.points[0]), Y(a.points[1]), X(a.points[2]), Y(a.points[3])]
    const ang = Math.atan2(y2 - y1, x2 - x1)
    const nx = -Math.sin(ang)
    const ny = Math.cos(ang)
    const tk = 0.15
    polyline(d, 'ARH_COTE', [[x1, y1], [x2, y2]])
    polyline(d, 'ARH_COTE', [[x1 - nx * tk, y1 - ny * tk], [x1 + nx * tk, y1 + ny * tk]])
    polyline(d, 'ARH_COTE', [[x2 - nx * tk, y2 - ny * tk], [x2 + nx * tk, y2 + ny * tk]])
    let deg = (ang * 180) / Math.PI
    if (deg > 90 || deg < -90) deg += 180
    const L = Math.hypot(x2 - x1, y2 - y1)
    const h = Math.max(0.3, m(S) * 0.35)
    text(d, 'ARH_COTE', (x1 + x2) / 2 + nx * h * 0.4, (y1 + y2) / 2 + ny * h * 0.4, h, L.toFixed(2).replace('.', ',') + ' m', { h: 1, v: 1, rot: deg })
    return
  }
  if (a.x == null || a.y == null) return
  const cx = X(a.x)
  const cy = Y(a.y)
  const rotDxf = -(a.rotation ?? 0)
  const t = (rotDxf * Math.PI) / 180
  const sx = a.flipX ? -1 : 1
  const sy = a.flipY ? -1 : 1
  // punct local (în metri, y-ul planului în jos) → DXF
  const P = (lx: number, ly: number): [number, number] => {
    const ux = lx * sx
    const uy = -ly * sy
    return [cx + ux * Math.cos(t) - uy * Math.sin(t), cy + ux * Math.sin(t) + uy * Math.cos(t)]
  }
  if (a.kind === 'door' || a.kind === 'window') {
    const w = a.width ?? (a.kind === 'door' ? 0.9 : 1.2)
    const th = 0.32
    if (a.kind === 'door') {
      polyline(d, 'ARH_USI', [P(-w / 2, 0), P(-w / 2, -w)])
      const arcPts: [number, number][] = []
      for (let i = 0; i <= 16; i++) {
        const ang = (-90 + (90 * i) / 16) * (Math.PI / 180)
        arcPts.push(P(-w / 2 + Math.cos(ang) * w, Math.sin(ang) * w))
      }
      polyline(d, 'ARH_USI', arcPts)
      polyline(d, 'ARH_USI', [P(-w / 2, -th / 2), P(-w / 2, th / 2)])
      polyline(d, 'ARH_USI', [P(w / 2, -th / 2), P(w / 2, th / 2)])
    } else {
      polyline(d, 'ARH_FERESTRE', [P(-w / 2, -th / 4), P(w / 2, -th / 4), P(w / 2, th / 4), P(-w / 2, th / 4)], { closed: true })
      polyline(d, 'ARH_FERESTRE', [P(-w / 2, 0), P(w / 2, 0)])
      polyline(d, 'ARH_FERESTRE', [P(-w / 2, -th / 2), P(-w / 2, th / 2)])
      polyline(d, 'ARH_FERESTRE', [P(w / 2, -th / 2), P(w / 2, th / 2)])
    }
    return
  }
  if (a.kind === 'rect' || a.kind === 'ellipse') {
    // zonă: contur (în culoarea ei) + nume și arie în centru
    const w = a.width ?? 4
    const h = a.height ?? 3
    const color = a.stroke ? nearestAci(a.stroke) : undefined
    const pts: [number, number][] = []
    if (a.kind === 'rect') pts.push(P(-w / 2, -h / 2), P(w / 2, -h / 2), P(w / 2, h / 2), P(-w / 2, h / 2))
    else for (let i = 0; i < 48; i++) pts.push(P((Math.cos((i / 48) * Math.PI * 2) * w) / 2, (Math.sin((i / 48) * Math.PI * 2) * h) / 2))
    polyline(d, 'ADN_ZONE', pts, { closed: true, color })
    const area = a.kind === 'rect' ? w * h : (Math.PI * w * h) / 4
    const th = Math.max(0.25, m(S) * 0.4)
    const lines = [a.text ?? '', a.showArea !== false ? `${area.toFixed(1).replace('.', ',')} mp` : ''].filter(Boolean)
    lines.forEach((t, i) => text(d, 'ADN_ZONE', cx, cy + ((lines.length - 1) / 2 - i) * th * 1.4, th, t, { h: 1, v: 2, rot: rotDxf, color }))
    return
  }
  if (a.kind === 'label') {
    text(d, 'ARH_TEXT', cx, cy, a.size ?? 0.45, a.text ?? '', { h: 1, v: 2, rot: rotDxf })
    return
  }
  if (a.kind === 'riser') {
    const r = m(S) * 0.45
    circle(d, 'GHENE', cx, cy, r)
    polyline(d, 'GHENE', [[cx - r * 0.38, cy + r * 0.18], [cx, cy + r * 0.62], [cx + r * 0.38, cy + r * 0.18]])
    polyline(d, 'GHENE', [[cx - r * 0.38, cy - r * 0.18], [cx, cy - r * 0.62], [cx + r * 0.38, cy - r * 0.18]])
    text(d, 'GHENE', cx, cy - r - m(S) * 0.08, m(S) * 0.36, a.text ?? 'G', { h: 1, v: 3 })
  }
  void ppm
}

/**
 * Peretele întrerupt la golurile ușilor și ferestrelor (în aplicație golul e acoperit cu alb).
 * Întoarce null dacă niciun gol nu cade pe perete; altfel bucățile de polilinie rămase.
 */
function wallPieces(
  pts: [number, number][],
  closed: boolean,
  thickness: number,
  openings: ArchElement[],
  X: (px: number) => number,
  Y: (py: number) => number,
): [number, number][][] | null {
  // tăieturile pe fiecare segment, ca distanțe de la începutul segmentului
  const cuts: [number, number][][] = pts.map(() => [])
  let any = false
  for (const o of openings) {
    const cx = X(o.x!)
    const cy = Y(o.y!)
    const w = o.width ?? (o.kind === 'door' ? 0.9 : 1.2)
    const r = (-(o.rotation ?? 0) * Math.PI) / 180
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, y1] = pts[i]
      const [x2, y2] = pts[i + 1]
      const L = Math.hypot(x2 - x1, y2 - y1)
      if (L < 1e-6) continue
      const ux = (x2 - x1) / L
      const uy = (y2 - y1) / L
      // golul trebuie să fie paralel cu segmentul și să stea pe el
      if (Math.abs(ux * Math.sin(r) - uy * Math.cos(r)) > 0.05) continue
      const along = (cx - x1) * ux + (cy - y1) * uy
      const off = Math.abs(-(cx - x1) * uy + (cy - y1) * ux)
      if (off > thickness / 2 + 0.05 || along < -w / 2 || along > L + w / 2) continue
      cuts[i].push([Math.max(0, along - w / 2), Math.min(L, along + w / 2)])
      any = true
    }
  }
  if (!any) return null
  const pieces: [number, number][][] = []
  let cur: [number, number][] = [pts[0]]
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[i + 1]
    const L = Math.hypot(x2 - x1, y2 - y1)
    const at = (t: number): [number, number] => [x1 + ((x2 - x1) * t) / L, y1 + ((y2 - y1) * t) / L]
    for (const [t0, t1] of cuts[i].sort((p, q) => p[0] - q[0])) {
      if (t0 > 1e-6) cur.push(at(t0))
      pieces.push(cur)
      cur = t1 < L - 1e-6 ? [at(t1)] : []
    }
    if (cur.length || i === pts.length - 2) cur.push(pts[i + 1])
    else cur = [pts[i + 1]]
  }
  pieces.push(cur)
  // perete închis: ultima bucată continuă în prima, peste punctul de pornire
  if (closed && pieces.length > 1) {
    const first = pieces[0]
    const last = pieces[pieces.length - 1]
    const start = pts[0]
    if (first.length && last.length && first[0] === start && Math.hypot(last[last.length - 1][0] - start[0], last[last.length - 1][1] - start[1]) < 1e-6) {
      pieces[0] = [...last, ...first.slice(1)]
      pieces.pop()
    }
  }
  return pieces.filter((p) => p.length > 1)
}
