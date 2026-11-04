import type { Cable, CatalogItem, Device, Level, Orientation, PageFormat, Project, Sheet, SystemId } from './types'
import { DEFAULT_CALC, defaultCatalog, withSeedSpecs } from './catalog'
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

export const newLevel = (name: string, over: Partial<Level> = {}): Level => ({
  id: uid(),
  name,
  background: null,
  pxPerMeter: null,
  symbolSize: 32,
  pageCenter: { x: 0, y: 0 },
  ...over,
})

export function emptyProject(): Project {
  const level = newLevel('Parter')
  const sheet = newSheet({ levelId: level.id })
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
    levels: [level],
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
    arch: [],
  }
}

export const activeSheet = (p: Project): Sheet => p.sheets.find((s) => s.id === p.activeSheetId) ?? p.sheets[0]

/** Nivelul cu id-ul dat (sau primul nivel) */
export const levelOf = (p: Project, id?: string): Level => p.levels.find((l) => l.id === id) ?? p.levels[0]

/** Nivelul afișat de o planșă (la schemele bloc: primul nivel) */
export const sheetLevel = (p: Project, sh: Sheet): Level => levelOf(p, sh.kind === 'plan' ? sh.levelId : undefined)

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

/** Mărimea țintă a simbolurilor pe planșa tipărită (mm) */
export const SYMBOL_PAPER_MM = 6

/**
 * Zona de desen a planșei (mm), după chenar, coloana / banda cu legendă și cartuș și 5 mm de margine —
 * aceeași așezare ca la exportul PDF.
 */
export function drawAreaMm(sh: Sheet): [number, number] {
  const [W, H] = pageSizeMm(sh)
  const small = Math.min(W, H) <= 210
  const m = small ? 7 : 10
  const fw = W - 20 - m
  const fh = H - 2 * m
  const landscape = W >= H
  const tbW = Math.min(small ? 95 : 130, fw * (landscape ? 0.4 : 0.6))
  const tbH = (small ? 7.5 : 9.5) * 9.2
  return [(landscape ? fw - tbW : fw) - 10, (landscape ? fh : fh - tbH) - 10]
}

/** Numitorul scării din cartuș („1:100” → 100); null dacă nu se poate citi */
export function parseScale(s: string): number | null {
  const m = s.match(/1\s*[:/]\s*(\d+(?:[.,]\d+)?)/)
  if (!m) return null
  const n = parseFloat(m[1].replace(',', '.'))
  return n > 0 ? n : null
}

/** Scara de plan folosită pe pagină albă când nivelul nu e calibrat (aceeași ca în desen) */
export const UNCALIBRATED_PX_PER_M = 20

/**
 * Pagină albă (nivel fără plan de fundal): zona de desen a planșei la scara din cartuș, în coordonate plan.
 * Exportul PDF folosește exact această zonă, ca scara din cartuș să fie reală.
 */
export function pageFrame(p: Project, sh: Sheet) {
  if (sh.kind !== 'plan') return null
  const level = sheetLevel(p, sh)
  if (level.background) return null
  const n = parseScale(sh.scara)
  if (!n) return null
  const ppm = level.pxPerMeter ?? UNCALIBRATED_PX_PER_M
  const [aw, ah] = drawAreaMm(sh)
  const width = ((aw * n) / 1000) * ppm
  const height = ((ah * n) / 1000) * ppm
  let c = level.pageCenter
  if (!c) {
    const b = contentBounds(p, ALL_SYSTEMS, level.id)
    c = b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : { x: 0, y: 0 }
  }
  return { x: c.x - width / 2, y: c.y - height / 2, width, height, meters: [(aw * n) / 1000, (ah * n) / 1000] as [number, number] }
}

/** Desenul iese din zona planșei (pagină albă)? */
export function outsideFrame(p: Project, sh: Sheet): boolean {
  const f = pageFrame(p, sh)
  const b = f && contentBounds(p, sh.systems, sheetLevel(p, sh).id)
  if (!f || !b) return false
  const e = 0.5
  return b.x < f.x - e || b.y < f.y - e || b.x + b.width > f.x + f.width + e || b.y + b.height > f.y + f.height + e
}

/** Ce se încadrează în pagina planșei de plan: zona de desen (pagină albă) reunită cu desenul */
export function sheetDrawBounds(p: Project, sh: Sheet) {
  const b = contentBounds(p, sh.systems, sheetLevel(p, sh).id)
  const f = pageFrame(p, sh)
  if (!f) return b
  if (!b) return { x: f.x, y: f.y, width: f.width, height: f.height }
  const x = Math.min(b.x, f.x)
  const y = Math.min(b.y, f.y)
  return { x, y, width: Math.max(b.x + b.width, f.x + f.width) - x, height: Math.max(b.y + b.height, f.y + f.height) - y }
}

/** Câți mm pe hârtie are un pixel de plan, când nivelul e încadrat în zona de desen a planșei */
export function paperMmPerPx(p: Project, sh: Sheet): number | null {
  const b = sheetDrawBounds(p, sh)
  if (!b || b.width <= 0 || b.height <= 0) return null
  const [areaW, areaH] = drawAreaMm(sh)
  return Math.min(areaW / b.width, areaH / b.height)
}

/** Mărimea simbolurilor (px) ca să iasă ~6 mm pe planșă */
export function symbolForPaper(p: Project, sh: Sheet): number | null {
  const k = paperMmPerPx(p, sh)
  return k ? Math.max(6, Math.min(600, Math.round(SYMBOL_PAPER_MM / k))) : null
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

// ---------------------------------------------------------------- treceri între niveluri (ghene)

/** Distanța pe verticală între două niveluri (m): suma înălțimilor nivelurilor dintre ele (implicit 3 m) */
export function verticalMeters(p: Project, a: string, b: string): number {
  const ia = p.levels.findIndex((l) => l.id === a)
  const ib = p.levels.findIndex((l) => l.id === b)
  if (ia < 0 || ib < 0 || ia === ib) return 0
  let m = 0
  for (let i = Math.min(ia, ib); i < Math.max(ia, ib); i++) m += p.levels[i].heightM ?? 3
  return m
}

/** Echipamentul de la capătul unui cablu care se termină la o ghenă (celălalt capăt) */
function riserDevice(p: Project, c: Cable): Device | undefined {
  return p.devices.find((d) => d.id === c.from) ?? p.devices.find((d) => d.id === c.to)
}

const isHubDevice = (d?: Device) => !!d && !!symbolByType(d.type)?.hub

/**
 * Pentru un cablu terminat la o ghenă, cablul „de continuare” de pe alt nivel: același sistem, aceeași ghenă,
 * cu un echipament central (switch, NVR, centrală...) la celălalt capăt. Cablul de continuare e traseul comun.
 */
export function riserHost(p: Project, c: Cable): Cable | undefined {
  if (!c.riser) return undefined
  const own = riserDevice(p, c)
  if (!own) return undefined
  const ownIdx = p.levels.findIndex((l) => l.id === c.levelId)
  return p.cables.find((h) => {
    if (h.id === c.id || h.riser !== c.riser || h.system !== c.system || h.levelId === c.levelId) return false
    const other = riserDevice(p, h)
    if (!other) return false
    // ramura e echipamentul obișnuit; traseul comun duce la echipamentul central (la două centrale: cel de pe nivelul inferior)
    if (isHubDevice(own) && !isHubDevice(other)) return false
    if (isHubDevice(own) && isHubDevice(other)) return p.levels.findIndex((l) => l.id === h.levelId) < ownIdx
    return isHubDevice(other) || p.levels.findIndex((l) => l.id === h.levelId) < ownIdx
  })
}

/** Cablul e doar traseul comun (ghenă → echipament central) al altor cabluri: nu se numără separat în jurnal */
export const isRiserRoute = (p: Project, c: Cable) => !!c.riser && p.cables.some((x) => x.id !== c.id && riserHost(p, x)?.id === c.id)

/** Capetele „logice” ale unui cablu: la cablurile care trec printr-o ghenă, capătul de la ghenă devine echipamentul de pe celălalt nivel */
export function cableEnds(p: Project, c: Cable): { from?: string; to?: string } {
  const host = riserHost(p, c)
  if (!host) return { from: c.from, to: c.to }
  const far = riserDevice(p, host)?.id
  return p.devices.some((d) => d.id === c.from) ? { from: c.from, to: far } : { from: far, to: c.to }
}

export function cableMeters(c: Cable, p: Project): number | null {
  if (c.lengthOverride != null && !Number.isNaN(c.lengthOverride)) return c.lengthOverride
  const ppm = levelOf(p, c.levelId).pxPerMeter
  if (!ppm) return null
  let raw = cablePixels(c, p) / ppm
  // trecere prin ghenă: + coborârea / urcarea între niveluri + traseul comun de pe celălalt nivel
  const host = riserHost(p, c)
  if (host) {
    const hppm = levelOf(p, host.levelId).pxPerMeter
    if (!hppm) return null
    raw += verticalMeters(p, c.levelId, host.levelId) + cablePixels(host, p) / hppm
  }
  return Math.ceil(raw * (1 + p.cableReservePct / 100))
}

export function nextCableCode(system: SystemId, cables: Cable[]): string {
  const prefix = SYSTEMS.find((s) => s.id === system)!.cablePrefix + '-'
  return nextLabel(prefix, cables.map((c) => c.code))
}

/** Dreptunghiul ocupat de planul de fundal, după deplasare și rotire */
export function backgroundBounds(level: Level) {
  const bg = level.background!
  const cx = (level.bgX ?? 0) + bg.width / 2
  const cy = (level.bgY ?? 0) + bg.height / 2
  const r = ((level.bgRotation ?? 0) * Math.PI) / 180
  const w = Math.abs(bg.width * Math.cos(r)) + Math.abs(bg.height * Math.sin(r))
  const h = Math.abs(bg.width * Math.sin(r)) + Math.abs(bg.height * Math.cos(r))
  return { x: cx - w / 2, y: cy - h / 2, width: w, height: h }
}

export function contentBounds(p: Project, systems: SystemId[] = ALL_SYSTEMS, levelId?: string) {
  const level = levelOf(p, levelId)
  if (level.background) return backgroundBounds(level)
  const hidden = new Set(ALL_SYSTEMS.filter((s) => !systems.includes(s)))
  const xs: number[] = []
  const ys: number[] = []
  for (const d of p.devices) {
    if (d.levelId !== level.id) continue
    const sys = deviceSystem(d)
    if (sys && hidden.has(sys)) continue
    xs.push(d.x)
    ys.push(d.y)
  }
  for (const a of p.arch ?? []) {
    if (a.levelId !== level.id) continue
    const pts = a.points ?? (a.x != null && a.y != null ? [a.x, a.y] : [])
    for (let i = 0; i < pts.length; i += 2) {
      xs.push(pts[i])
      ys.push(pts[i + 1])
    }
  }
  for (const c of p.cables) {
    if (hidden.has(c.system) || c.levelId !== level.id) continue
    for (let i = 0; i < c.points.length; i += 2) {
      xs.push(c.points[i])
      ys.push(c.points[i + 1])
    }
  }
  if (!xs.length) return null
  const pad = level.symbolSize * 2
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
  // niveluri: proiectele vechi (un singur plan) devin nivelul „Plan 1”
  const levels: Level[] =
    Array.isArray(v.levels) && v.levels.length
      ? v.levels.map((l) => ({ ...newLevel(l.name ?? 'Nivel'), pageCenter: undefined, ...l }))
      : [newLevel('Plan 1', { background: old.background ?? null, pxPerMeter: old.pxPerMeter ?? null, symbolSize: old.symbolSize ?? 32, pageCenter: undefined })]
  const ids = new Set(levels.map((l) => l.id))
  const fix = <T extends { levelId?: string }>(x: T): T & { levelId: string } => ({ ...x, levelId: x.levelId && ids.has(x.levelId) ? x.levelId : levels[0].id })
  sheets = sheets.map((sh) => (sh.kind === 'plan' ? fix(sh) : sh))
  return {
    ...base,
    levels,
    cableReservePct: v.cableReservePct ?? base.cableReservePct,
    title: { ...base.title, ...v.title },
    devices: v.devices.map(fix),
    numberPad: v.numberPad ?? (v.version as number) === 1,
    catalog: Array.isArray(v.catalog) ? withSeedSpecs(v.catalog) : base.catalog,
    accessories: Array.isArray(v.accessories) ? v.accessories : [],
    calc: { ...DEFAULT_CALC, ...v.calc },
    memoriu: { ...defaultMemoriu(), ...v.memoriu },
    cables: (v.cables ?? []).map(fix),
    arch: (Array.isArray(v.arch) ? v.arch : []).map(fix),
    sheets,
    activeSheetId,
    version: 2,
  }
}
