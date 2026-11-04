import type { Cable, CatalogItem, Device, Orientation, PageFormat, Project, Sheet, SystemId } from './types'
import { DEFAULT_CALC, defaultCatalog } from './catalog'
import { defaultMemoriu } from './memoriuDefaults'
import { SYSTEMS, symbolByType } from './symbols'

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)

export const ALL_SYSTEMS: SystemId[] = SYSTEMS.map((s) => s.id)

export function newSheet(over: Partial<Sheet> = {}): Sheet {
  return {
    id: uid(),
    kind: 'plan',
    titlu: 'Plan amplasare echipamente',
    nr: 'P01',
    scara: '1:100',
    format: 'A3',
    orientation: 'landscape',
    customW: 841,
    customH: 594,
    systems: [...ALL_SYSTEMS],
    showCones: true,
    ...over,
  }
}

export function emptyProject(): Project {
  const sheet = newSheet()
  return {
    version: 2,
    title: {
      proiectant: 'ASL Security Solutions SRL',
      beneficiar: '',
      obiectiv: '',
      nrProiect: '',
      data: new Date().toLocaleDateString('ro-RO'),
      intocmit: '',
      verificat: '',
    },
    background: null,
    pxPerMeter: null,
    symbolSize: 32,
    cableReservePct: 10,
    sheets: [sheet],
    activeSheetId: sheet.id,
    numberPad: false,
    catalog: defaultCatalog(),
    accessories: [],
    calc: { ...DEFAULT_CALC },
    memoriu: defaultMemoriu(),
    devices: [],
    cables: [],
  }
}

export const activeSheet = (p: Project): Sheet => p.sheets.find((s) => s.id === p.activeSheetId) ?? p.sheets[0]

const PAPER: Record<Exclude<PageFormat, 'CUSTOM'>, [number, number]> = {
  A0: [1189, 841],
  A1: [841, 594],
  A2: [594, 420],
  A3: [420, 297],
  A4: [297, 210],
}

/** Dimensiunea paginii în mm [lățime, înălțime], ținând cont de orientare */
export function pageSizeMm(sh: Sheet): [number, number] {
  if (sh.format === 'CUSTOM') return [Math.max(50, sh.customW), Math.max(50, sh.customH)]
  const [a, b] = PAPER[sh.format]
  return sh.orientation === 'landscape' ? [a, b] : [b, a]
}

export function formatLabel(sh: Sheet): string {
  if (sh.format === 'CUSTOM') return `${sh.customW}×${sh.customH} mm`
  const o: Record<Orientation, string> = { landscape: 'peisaj', portrait: 'portret' }
  return `${sh.format} ${o[sh.orientation]}`
}

/** Următorul număr de planșă liber (P01, P02...) */
export const nextSheetNr = (p: Project) => nextLabel('P', p.sheets.map((s) => s.nr))

/** Următorul cod liber pentru un prefix: PIR01, PIR02... */
export function nextLabel(prefix: string, labels: string[], pad = true): string {
  let max = 0
  const re = new RegExp('^' + prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\d+)$')
  for (const l of labels) {
    const m = l.match(re)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return prefix + (pad ? String(max + 1).padStart(2, '0') : String(max + 1))
}

export const catalogItem = (p: Project, id?: string): CatalogItem | undefined =>
  id ? p.catalog.find((c) => c.id === id) : undefined

/** Datele de listă ale unui echipament: din catalog dacă e legat, altfel din simbol */
export function deviceInfo(p: Project, d: Device) {
  const it = catalogItem(p, d.catalogId)
  const def = symbolByType(d.type)
  return {
    item: it,
    denumire: it?.denumire || def?.name || d.type,
    model: it?.model || d.model,
    producator: it?.producator ?? '',
  }
}

/** Prefixul de numerotare pentru un echipament nou */
export const devicePrefix = (type: string, it?: CatalogItem) => it?.prefix || symbolByType(type)?.prefix || 'X'

export function deviceSystem(d: Device): SystemId | undefined {
  return symbolByType(d.type)?.system
}

export function polylineLength(points: number[]): number {
  let len = 0
  for (let i = 2; i < points.length; i += 2) {
    len += Math.hypot(points[i] - points[i - 2], points[i + 1] - points[i - 1])
  }
  return len
}

/** Lungimea cablului în metri (cu rezervă), sau null dacă scara nu e calibrată */
/** Cel mai apropiat punct de pe o polilinie: distanța, punctul și lungimea de la începutul poliliniei până la el */
export function nearestOnPolyline(points: number[], x: number, y: number) {
  let best = { dist: Infinity, x: 0, y: 0, along: 0 }
  let acc = 0
  for (let i = 2; i < points.length; i += 2) {
    const ax = points[i - 2]
    const ay = points[i - 1]
    const bx = points[i]
    const by = points[i + 1]
    const len = Math.hypot(bx - ax, by - ay)
    const t = len ? Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / (len * len))) : 0
    const px = ax + (bx - ax) * t
    const py = ay + (by - ay) * t
    const dist = Math.hypot(x - px, y - py)
    if (dist < best.dist) best = { dist, x: px, y: py, along: acc + len * t }
    acc += len
  }
  return best
}

/** Lungimea în pixeli a cablului, inclusiv porțiunea comună cu cablul pe care se ramifică */
export function cablePixels(c: Cable, p: Project): number {
  let px = polylineLength(c.points)
  const host = c.via ? p.cables.find((x) => x.id === c.via!.cableId && x.id !== c.id) : undefined
  if (host && c.points.length >= 2) {
    const n = c.points.length
    const j = nearestOnPolyline(host.points, c.points[n - 2], c.points[n - 1])
    const total = polylineLength(host.points)
    px += c.via!.end === 'to' ? total - j.along : j.along
  }
  return px
}

export function cableMeters(c: Cable, p: Project): number | null {
  if (c.lengthOverride != null && !Number.isNaN(c.lengthOverride)) return c.lengthOverride
  if (!p.pxPerMeter) return null
  const raw = cablePixels(c, p) / p.pxPerMeter
  return Math.ceil(raw * (1 + p.cableReservePct / 100))
}

export function nextCableCode(system: SystemId, cables: Cable[]): string {
  const prefix = SYSTEMS.find((s) => s.id === system)!.cablePrefix + '-'
  return nextLabel(prefix, cables.map((c) => c.code))
}

export function contentBounds(p: Project, systems: SystemId[] = ALL_SYSTEMS) {
  if (p.background) return { x: 0, y: 0, width: p.background.width, height: p.background.height }
  const hidden = new Set(ALL_SYSTEMS.filter((s) => !systems.includes(s)))
  const xs: number[] = []
  const ys: number[] = []
  for (const d of p.devices) {
    const sys = deviceSystem(d)
    if (sys && hidden.has(sys)) continue
    xs.push(d.x)
    ys.push(d.y)
  }
  for (const c of p.cables) {
    if (hidden.has(c.system)) continue
    for (let i = 0; i < c.points.length; i += 2) {
      xs.push(c.points[i])
      ys.push(c.points[i + 1])
    }
  }
  if (!xs.length) return null
  const pad = p.symbolSize * 2
  const x = Math.min(...xs) - pad
  const y = Math.min(...ys) - pad
  return { x, y, width: Math.max(...xs) + pad - x, height: Math.max(...ys) + pad - y }
}

export function isProject(v: unknown): v is Project {
  const p = v as Project
  return !!p && typeof p === 'object' && ((p.version as number) === 1 || p.version === 2) && Array.isArray(p.devices)
}

/** Completează câmpurile lipsă și migrează fișierele din versiunea 1 (o singură planșă) */
export function normalizeProject(v: Project): Project {
  const base = emptyProject()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const old = v as any
  let sheets: Sheet[] = Array.isArray(v.sheets) && v.sheets.length ? v.sheets.map((s) => ({ ...newSheet(), ...s })) : []
  if (!sheets.length) {
    const hidden: SystemId[] = old.hidden ?? []
    sheets = [
      newSheet({
        titlu: old.title?.titluPlansa ?? 'Plan amplasare echipamente',
        nr: old.title?.nrPlansa ?? 'P01',
        scara: old.title?.scara ?? '1:100',
        format: old.pageFormat ?? 'A3',
        systems: ALL_SYSTEMS.filter((s) => !hidden.includes(s)),
        showCones: old.showCones ?? true,
      }),
    ]
  }
  const activeSheetId = sheets.some((s) => s.id === v.activeSheetId) ? v.activeSheetId : sheets[0].id
  return {
    ...base,
    background: v.background ?? null,
    pxPerMeter: v.pxPerMeter ?? null,
    symbolSize: v.symbolSize ?? base.symbolSize,
    cableReservePct: v.cableReservePct ?? base.cableReservePct,
    title: { ...base.title, ...v.title },
    devices: v.devices,
    numberPad: v.numberPad ?? (v.version as number) === 1,
    catalog: Array.isArray(v.catalog) ? v.catalog : base.catalog,
    accessories: Array.isArray(v.accessories) ? v.accessories : [],
    calc: { ...DEFAULT_CALC, ...v.calc },
    memoriu: { ...defaultMemoriu(), ...v.memoriu },
    cables: v.cables ?? [],
    sheets,
    activeSheetId,
    version: 2,
  }
}
