import type { SystemId } from './types'

export interface SystemDef {
  id: SystemId
  name: string
  short: string
  color: string
  cablePrefix: string
}

export const SYSTEMS: SystemDef[] = [
  { id: 'EFR', name: 'Alarmare la efracție', short: 'Efracție', color: '#c62828', cablePrefix: 'EFR' },
  { id: 'CA', name: 'Control acces', short: 'Control acces', color: '#1565c0', cablePrefix: 'CA' },
  { id: 'CCTV', name: 'Supraveghere video (TVCI)', short: 'CCTV', color: '#2e7d32', cablePrefix: 'CCTV' },
  { id: 'INC', name: 'Detecție și semnalizare incendiu', short: 'Incendiu', color: '#e65100', cablePrefix: 'INC' },
  { id: 'NET', name: 'Rețea date (cablare structurată)', short: 'Rețea date', color: '#6a1b9a', cablePrefix: 'NET' },
]

export const systemById = (id: SystemId): SystemDef => SYSTEMS.find((s) => s.id === id)!

type Shape = 'circle' | 'square' | 'rect' | 'triangle' | 'diamond' | 'hex' | 'custom'

export interface SymbolDef {
  type: string
  system: SystemId
  /** Prefix pentru numerotare automată (PIR01, CVe02...) */
  prefix: string
  name: string
  shape: Shape
  glyph?: string
  /** SVG personalizat (folosește {c} pentru culoare), pentru shape = 'custom' */
  custom?: string
  camera?: { fov: number; range: number }
  /** Echipament central (centrală, NVR, switch) — la cabluri, tipul se ia de la celălalt capăt */
  hub?: boolean
  /** Rădăcina schemei bloc (centrala sistemului); valoare mai mică = prioritate mai mare */
  root?: number
  detection?: string
  cable: string
}

const CAM_BULLET =
  '<rect x="3" y="12" width="23" height="16" rx="2" fill="#fff" stroke="{c}" stroke-width="2.4"/>' +
  '<polygon points="26,15 37,9 37,31 26,25" fill="#fff" stroke="{c}" stroke-width="2.4" stroke-linejoin="round"/>'
const CAM_DOME =
  '<circle cx="20" cy="20" r="16" fill="#fff" stroke="{c}" stroke-width="2.4"/>' +
  '<path d="M10 24 A10 10 0 0 1 30 24 Z" fill="{c}" fill-opacity="0.25" stroke="{c}" stroke-width="2"/>' +
  '<line x1="20" y1="20" x2="35" y2="20" stroke="{c}" stroke-width="2.4"/>'
const CAM_PTZ =
  '<circle cx="20" cy="20" r="16" fill="#fff" stroke="{c}" stroke-width="2.4"/>' +
  '<circle cx="20" cy="20" r="6" fill="{c}" fill-opacity="0.25" stroke="{c}" stroke-width="2"/>' +
  '<path d="M20 4 l-3 4 h6 z M20 36 l-3 -4 h6 z M4 20 l4 -3 v6 z M36 20 l-4 -3 v6 z" fill="{c}"/>'
const PIR =
  '<circle cx="20" cy="20" r="16" fill="#fff" stroke="{c}" stroke-width="2.4"/>' +
  '<path d="M12 20 L30 11 M12 20 L32 20 M12 20 L30 29" stroke="{c}" stroke-width="2"/>' +
  '<circle cx="12" cy="20" r="3" fill="{c}"/>'
const DUAL =
  '<circle cx="20" cy="20" r="16" fill="#fff" stroke="{c}" stroke-width="2.4"/>' +
  '<path d="M11 20 L29 11 M11 20 L29 29" stroke="{c}" stroke-width="2"/>' +
  '<path d="M24 15 Q28 20 24 25 M28 13 Q33 20 28 27" fill="none" stroke="{c}" stroke-width="2"/>' +
  '<circle cx="11" cy="20" r="3" fill="{c}"/>'
const CONTACT =
  '<rect x="3" y="12" width="15" height="16" fill="#fff" stroke="{c}" stroke-width="2.4"/>' +
  '<rect x="22" y="12" width="15" height="16" fill="{c}" fill-opacity="0.25" stroke="{c}" stroke-width="2.4"/>'
const SIREN_INT =
  '<rect x="3" y="3" width="34" height="34" fill="#fff" stroke="{c}" stroke-width="2.4"/>' +
  '<path d="M9 16 h6 l8 -6 v20 l-8 -6 h-6 z" fill="{c}"/>' +
  '<path d="M27 15 Q31 20 27 25" fill="none" stroke="{c}" stroke-width="2"/>'
const SIREN_EXT =
  '<rect x="3" y="3" width="34" height="34" fill="#fff" stroke="{c}" stroke-width="2.4"/>' +
  '<path d="M7 16 h5 l7 -6 v20 l-7 -6 h-5 z" fill="{c}"/>' +
  '<path d="M23 15 Q27 20 23 25 M28 12 Q34 20 28 28" fill="none" stroke="{c}" stroke-width="2"/>' +
  '<circle cx="31" cy="8" r="3" fill="{c}"/>'
const READER =
  '<rect x="8" y="2" width="24" height="36" rx="3" fill="#fff" stroke="{c}" stroke-width="2.4"/>' +
  '<path d="M14 15 Q20 9 26 15 M16 19 Q20 15 24 19" fill="none" stroke="{c}" stroke-width="2"/>' +
  '<circle cx="20" cy="23" r="2" fill="{c}"/><rect x="13" y="29" width="14" height="4" fill="{c}"/>'
const FIRE_SOUNDER =
  '<circle cx="20" cy="20" r="16" fill="#fff" stroke="{c}" stroke-width="2.4"/>' +
  '<path d="M10 16 h5 l7 -6 v20 l-7 -6 h-5 z" fill="{c}"/>' +
  '<path d="M26 14 Q31 20 26 26" fill="none" stroke="{c}" stroke-width="2"/>'
const FIRE_FLASH =
  '<circle cx="20" cy="20" r="16" fill="#fff" stroke="{c}" stroke-width="2.4"/>' +
  '<path d="M9 16 h4 l6 -5 v18 l-6 -5 h-4 z" fill="{c}"/>' +
  '<path d="M27 9 l-4 9 h5 l-4 11" fill="none" stroke="{c}" stroke-width="2.2"/>'

const AP =
  '<circle cx="20" cy="20" r="16.5" fill="#fff" stroke="{c}" stroke-width="2.4"/>' +
  '<path d="M11 18 Q20 9 29 18 M14 22 Q20 16 26 22" fill="none" stroke="{c}" stroke-width="2.2" stroke-linecap="round"/>' +
  '<circle cx="20" cy="27" r="2.6" fill="{c}"/>'
const OUTLET1 =
  '<rect x="3.5" y="3.5" width="33" height="33" fill="#fff" stroke="{c}" stroke-width="2.4"/>' +
  '<path d="M13 14 h14 v12 h-4 v3 h-6 v-3 h-4 z" fill="none" stroke="{c}" stroke-width="2"/>'
const OUTLET2 =
  '<rect x="1.5" y="7" width="37" height="26" fill="#fff" stroke="{c}" stroke-width="2.4"/>' +
  '<path d="M5 13 h12 v10 h-3 v3 h-6 v-3 h-3 z M23 13 h12 v10 h-3 v3 h-6 v-3 h-3 z" fill="none" stroke="{c}" stroke-width="1.8"/>'
const RACK =
  '<rect x="6" y="2" width="28" height="36" fill="#fff" stroke="{c}" stroke-width="2.4"/>' +
  '<path d="M10 9 h20 M10 15 h20 M10 21 h20 M10 27 h20" stroke="{c}" stroke-width="2"/>' +
  '<circle cx="27" cy="33" r="1.6" fill="{c}"/>'

export const SYMBOLS: SymbolDef[] = [
  // ---------- EFRACȚIE ----------
  { type: 'efr_centrala', system: 'EFR', prefix: 'CAE', name: 'Centrală alarmare efracție', shape: 'rect', glyph: 'CAE', hub: true, root: 1, cable: '2×1.5mm (alimentare 230V)' },
  { type: 'efr_tastatura', system: 'EFR', prefix: 'TAD', name: 'Tastatură armare/dezarmare', shape: 'rect', glyph: 'TAD', cable: 'JY(St)Y 4×0.8mm (bus)' },
  { type: 'efr_modul', system: 'EFR', prefix: 'MOD', name: 'Modul extensie zone', shape: 'rect', glyph: 'MOD', hub: true, root: 5, cable: 'JY(St)Y 4×0.8mm (bus)' },
  { type: 'efr_sursa', system: 'EFR', prefix: 'SA', name: 'Sursă alimentare suplimentară', shape: 'rect', glyph: 'SA', cable: 'JY(St)Y 4×0.8mm (bus)' },
  { type: 'efr_pir', system: 'EFR', prefix: 'PIR', name: 'Detector PIR (infraroșu pasiv)', shape: 'custom', custom: PIR, detection: 'Infraroșu pasiv', cable: 'JY(St)Y 2×2×0.8mm' },
  { type: 'efr_dual', system: 'EFR', prefix: 'DD', name: 'Detector dual (IR + MW)', shape: 'custom', custom: DUAL, detection: 'Dual tehnologie (IR + MW)', cable: 'JY(St)Y 2×2×0.8mm' },
  { type: 'efr_pir_ext', system: 'EFR', prefix: 'DE', name: 'Detector exterior', shape: 'triangle', glyph: 'DE', detection: 'Infraroșu pasiv exterior', cable: 'JY(St)Y 2×2×0.8mm' },
  { type: 'efr_cm', system: 'EFR', prefix: 'CM', name: 'Contact magnetic', shape: 'custom', custom: CONTACT, detection: 'Magnetic (deschidere)', cable: 'JY(St)Y 2×0.8mm' },
  { type: 'efr_geam', system: 'EFR', prefix: 'DGS', name: 'Detector geam spart', shape: 'circle', glyph: 'GS', detection: 'Acustic (spargere geam)', cable: 'JY(St)Y 2×2×0.8mm' },
  { type: 'efr_soc', system: 'EFR', prefix: 'DS', name: 'Detector de șoc / vibrații', shape: 'circle', glyph: 'Ș', detection: 'Seismic (șoc)', cable: 'JY(St)Y 2×2×0.8mm' },
  { type: 'efr_panica', system: 'EFR', prefix: 'BP', name: 'Buton de panică', shape: 'square', glyph: 'BP', detection: 'Manual (panică)', cable: 'JY(St)Y 2×0.8mm' },
  { type: 'efr_sirena_int', system: 'EFR', prefix: 'SI', name: 'Sirenă interioară', shape: 'custom', custom: SIREN_INT, cable: 'JHSTH 2×1.5mm' },
  { type: 'efr_sirena_ext', system: 'EFR', prefix: 'SE', name: 'Sirenă exterioară cu flash', shape: 'custom', custom: SIREN_EXT, cable: 'JHSTH 4×1.5mm' },
  { type: 'efr_comunicator', system: 'EFR', prefix: 'COM', name: 'Comunicator GSM / IP', shape: 'rect', glyph: 'COM', cable: 'JY(St)Y 4×0.8mm (bus)' },

  // ---------- CONTROL ACCES ----------
  { type: 'ca_controler', system: 'CA', prefix: 'CCA', name: 'Controler control acces', shape: 'rect', glyph: 'CCA', hub: true, root: 1, cable: 'UTP Cat.6' },
  { type: 'ca_cititor', system: 'CA', prefix: 'FCA', name: 'Cititor de proximitate', shape: 'custom', custom: READER, cable: 'UTP Cat.6 + 2×0.75mm' },
  { type: 'ca_biometric', system: 'CA', prefix: 'CB', name: 'Cititor biometric', shape: 'square', glyph: 'BIO', cable: 'UTP Cat.6 + 2×0.75mm' },
  { type: 'ca_tastatura', system: 'CA', prefix: 'TCA', name: 'Tastatură cod acces', shape: 'square', glyph: 'TC', cable: 'UTP Cat.6 + 2×0.75mm' },
  { type: 'ca_electromagnet', system: 'CA', prefix: 'EM', name: 'Electromagnet (ventuză)', shape: 'rect', glyph: 'EM', cable: '2×1.5mm' },
  { type: 'ca_yala', system: 'CA', prefix: 'YE', name: 'Yală electromagnetică', shape: 'rect', glyph: 'YE', cable: '2×1.5mm' },
  { type: 'ca_buton_iesire', system: 'CA', prefix: 'BI', name: 'Buton ieșire (exit)', shape: 'square', glyph: 'BI', cable: 'JY(St)Y 2×0.8mm' },
  { type: 'ca_buton_urgenta', system: 'CA', prefix: 'BU', name: 'Buton deblocare urgență', shape: 'diamond', glyph: 'BU', cable: 'JY(St)Y 2×0.8mm' },
  { type: 'ca_sursa', system: 'CA', prefix: 'SCA', name: 'Sursă alimentare control acces', shape: 'rect', glyph: 'SA', cable: '2×1.5mm' },
  { type: 'ca_turnichet', system: 'CA', prefix: 'TR', name: 'Turnichet / barieră', shape: 'hex', glyph: 'TR', cable: 'UTP Cat.6 + 3×1.5mm' },
  { type: 'ca_videointerfon', system: 'CA', prefix: 'VI', name: 'Videointerfon (post exterior)', shape: 'square', glyph: 'VI', cable: 'UTP Cat.6' },

  // ---------- CCTV ----------
  { type: 'cctv_bullet_ext', system: 'CCTV', prefix: 'CVe', name: 'Cameră video exterior (bullet)', shape: 'custom', custom: CAM_BULLET, camera: { fov: 90, range: 20 }, cable: 'UTP Cat.6 (PoE)' },
  { type: 'cctv_dome_int', system: 'CCTV', prefix: 'CVi', name: 'Cameră video interior (dome)', shape: 'custom', custom: CAM_DOME, camera: { fov: 100, range: 12 }, cable: 'UTP Cat.6 (PoE)' },
  { type: 'cctv_ptz', system: 'CCTV', prefix: 'PTZ', name: 'Cameră video PTZ', shape: 'custom', custom: CAM_PTZ, camera: { fov: 360, range: 40 }, cable: 'UTP Cat.6 (PoE+)' },
  { type: 'cctv_nvr', system: 'CCTV', prefix: 'NVR', name: 'Videorecorder de rețea (NVR)', shape: 'rect', glyph: 'NVR', hub: true, root: 1, cable: 'UTP Cat.6' },
  { type: 'cctv_switch', system: 'CCTV', prefix: 'SW', name: 'Switch PoE', shape: 'rect', glyph: 'SW', hub: true, root: 3, cable: 'UTP Cat.6' },
  { type: 'cctv_monitor', system: 'CCTV', prefix: 'MON', name: 'Monitor vizualizare', shape: 'rect', glyph: 'MON', cable: 'HDMI' },
  { type: 'cctv_ups', system: 'CCTV', prefix: 'UPS', name: 'UPS', shape: 'rect', glyph: 'UPS', cable: '3×1.5mm' },

  // ---------- INCENDIU ----------
  { type: 'inc_centrala', system: 'INC', prefix: 'CDI', name: 'Centrală detecție incendiu', shape: 'rect', glyph: 'CDI', hub: true, root: 1, cable: '3×1.5mm (alimentare 230V)' },
  { type: 'inc_fum', system: 'INC', prefix: 'DF', name: 'Detector optic de fum', shape: 'circle', glyph: 'DF', detection: 'Optic de fum', cable: 'JE-H(St)H 2×2×0.8mm' },
  { type: 'inc_termic', system: 'INC', prefix: 'DT', name: 'Detector termovelocimetric', shape: 'circle', glyph: 'DT', detection: 'Termovelocimetric', cable: 'JE-H(St)H 2×2×0.8mm' },
  { type: 'inc_multi', system: 'INC', prefix: 'DM', name: 'Detector multisenzor (fum + temp.)', shape: 'circle', glyph: 'DM', detection: 'Multisenzor (optic + termic)', cable: 'JE-H(St)H 2×2×0.8mm' },
  { type: 'inc_flacara', system: 'INC', prefix: 'DFL', name: 'Detector de flacără', shape: 'triangle', glyph: 'FL', detection: 'Flacără (IR/UV)', cable: 'JE-H(St)H 2×2×0.8mm' },
  { type: 'inc_liniar', system: 'INC', prefix: 'DLF', name: 'Detector liniar de fum (emițător/receptor)', shape: 'hex', glyph: 'DL', detection: 'Fascicul optic', cable: 'JE-H(St)H 2×2×0.8mm' },
  { type: 'inc_declansator', system: 'INC', prefix: 'DAM', name: 'Declanșator manual de alarmă', shape: 'square', glyph: 'DAM', detection: 'Manual', cable: 'JE-H(St)H 2×2×0.8mm' },
  { type: 'inc_sirena', system: 'INC', prefix: 'SAI', name: 'Sirenă alarmare incendiu', shape: 'custom', custom: FIRE_SOUNDER, cable: 'JE-H(St)H 2×2×0.8mm (E30)' },
  { type: 'inc_sirena_flash', system: 'INC', prefix: 'SFI', name: 'Sirenă cu flash incendiu', shape: 'custom', custom: FIRE_FLASH, cable: 'JE-H(St)H 2×2×0.8mm (E30)' },
  { type: 'inc_modul_io', system: 'INC', prefix: 'MIO', name: 'Modul intrare/ieșire', shape: 'square', glyph: 'I/O', cable: 'JE-H(St)H 2×2×0.8mm' },
  { type: 'inc_izolator', system: 'INC', prefix: 'IZ', name: 'Izolator de buclă', shape: 'diamond', glyph: 'IZ', cable: 'JE-H(St)H 2×2×0.8mm' },
  { type: 'inc_indicator', system: 'INC', prefix: 'IAD', name: 'Indicator optic de alarmă (repetor)', shape: 'triangle', glyph: 'IA', cable: 'JE-H(St)H 2×2×0.8mm' },

  // ---------- REȚEA DATE ----------
  { type: 'net_rack', system: 'NET', prefix: 'RK', name: 'Rack / cabinet rețea', shape: 'custom', custom: RACK, hub: true, root: 1, cable: '3×1.5mm (alimentare 230V)' },
  { type: 'net_patch', system: 'NET', prefix: 'PP', name: 'Patch panel', shape: 'rect', glyph: 'PP', hub: true, root: 4, cable: 'UTP Cat.6' },
  { type: 'net_switch', system: 'NET', prefix: 'SWR', name: 'Switch rețea', shape: 'rect', glyph: 'SWR', hub: true, root: 3, cable: 'UTP Cat.6' },
  { type: 'net_router', system: 'NET', prefix: 'RT', name: 'Router', shape: 'rect', glyph: 'RT', hub: true, root: 2, cable: 'UTP Cat.6' },
  { type: 'net_firewall', system: 'NET', prefix: 'FW', name: 'Firewall', shape: 'rect', glyph: 'FW', hub: true, root: 2, cable: 'UTP Cat.6' },
  { type: 'net_server', system: 'NET', prefix: 'SRV', name: 'Server', shape: 'rect', glyph: 'SRV', cable: 'UTP Cat.6' },
  { type: 'net_odf', system: 'NET', prefix: 'ODF', name: 'Sertar optic (ODF) / convertor FO', shape: 'rect', glyph: 'ODF', cable: 'Fibră optică SM 4F' },
  { type: 'net_ap', system: 'NET', prefix: 'AP', name: 'Access point wireless', shape: 'custom', custom: AP, cable: 'UTP Cat.6 (PoE)' },
  { type: 'net_priza1', system: 'NET', prefix: 'PD', name: 'Priză date simplă RJ45', shape: 'custom', custom: OUTLET1, cable: 'UTP Cat.6' },
  { type: 'net_priza2', system: 'NET', prefix: 'PDD', name: 'Priză date dublă RJ45', shape: 'custom', custom: OUTLET2, cable: '2× UTP Cat.6' },
  { type: 'net_tel', system: 'NET', prefix: 'TEL', name: 'Telefon IP', shape: 'square', glyph: 'TEL', cable: 'UTP Cat.6 (PoE)' },
  { type: 'net_imprimanta', system: 'NET', prefix: 'IMP', name: 'Imprimantă / multifuncțională', shape: 'square', glyph: 'IMP', cable: 'UTP Cat.6' },
  { type: 'net_ups', system: 'NET', prefix: 'UPSR', name: 'UPS rack', shape: 'rect', glyph: 'UPS', cable: '3×1.5mm' },
]

const symbolMap = new Map(SYMBOLS.map((s) => [s.type, s]))
export const symbolByType = (type: string): SymbolDef | undefined => symbolMap.get(type)

function shapeSvg(shape: Shape): string {
  const st = 'fill="#fff" stroke="{c}" stroke-width="2.4" stroke-linejoin="round"'
  switch (shape) {
    case 'circle':
      return `<circle cx="20" cy="20" r="16.5" ${st}/>`
    case 'square':
      return `<rect x="3.5" y="3.5" width="33" height="33" ${st}/>`
    case 'rect':
      return `<rect x="1.5" y="9" width="37" height="22" ${st}/>`
    case 'triangle':
      return `<polygon points="20,3 37.5,35 2.5,35" ${st}/>`
    case 'diamond':
      return `<polygon points="20,1.5 38.5,20 20,38.5 1.5,20" ${st}/>`
    case 'hex':
      return `<polygon points="11,3.5 29,3.5 38,20 29,36.5 11,36.5 2,20" ${st}/>`
    default:
      return ''
  }
}

/** Mărimea și poziția textului din simbol (în unitățile casetei 40×40) */
export function glyphLayout(def: SymbolDef) {
  const len = [...(def.glyph ?? '')].length
  const size = len >= 3 ? 10.5 : len === 2 ? 13 : 17
  const y = def.shape === 'triangle' ? 30 : 20 + size * 0.36
  return { size, y }
}

export function symbolSvg(def: SymbolDef, color?: string, noGlyph = false): string {
  const c = color ?? systemById(def.system).color
  let body = def.shape === 'custom' ? def.custom ?? '' : shapeSvg(def.shape)
  if (def.glyph && !noGlyph) {
    const { size, y } = glyphLayout(def)
    body += `<text x="20" y="${y}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="bold" font-size="${size}" fill="{c}">${def.glyph}</text>`
  }
  body = body.split('{c}').join(c)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 40 40">${body}</svg>`
}

export const symbolDataUrl = (def: SymbolDef, noGlyph = false): string =>
  'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(symbolSvg(def, undefined, noGlyph))

const imageCache = new Map<string, Promise<HTMLImageElement>>()
const loadedImages = new Map<string, HTMLImageElement>()

/** Imaginea simbolului, dacă e deja încărcată (vezi preloadSymbols) */
export const symbolImage = (type: string) => loadedImages.get(type)

/** Doar conturul simbolului, fără text (pentru rotire cu textul păstrat drept) */
export const symbolShapeImage = (type: string) => loadedImages.get(type + '|contur')

export const preloadSymbols = () =>
  Promise.all(
    SYMBOLS.flatMap((s) => [
      loadSymbolImage(s.type).catch(() => null),
      ...(s.glyph ? [loadSymbolImage(s.type, true).catch(() => null)] : []),
    ]),
  )

/** Încarcă (cu cache) imaginea unui simbol, pentru Konva și pentru export */
export function loadSymbolImage(type: string, shapeOnly = false): Promise<HTMLImageElement> {
  const key = shapeOnly ? type + '|contur' : type
  let p = imageCache.get(key)
  if (!p) {
    const def = symbolByType(type)
    if (!def) return Promise.reject(new Error('Simbol necunoscut: ' + type))
    p = new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        loadedImages.set(key, img)
        resolve(img)
      }
      img.onerror = reject
      img.src = symbolDataUrl(def, shapeOnly)
    })
    imageCache.set(key, p)
  }
  return p
}

/** Tipul de cablu implicit între două echipamente */
export function defaultCableType(fromType?: string, toType?: string): string {
  const a = fromType ? symbolByType(fromType) : undefined
  const b = toType ? symbolByType(toType) : undefined
  if (a && !a.hub) return a.cable
  if (b && !b.hub) return b.cable
  return (a ?? b)?.cable ?? ''
}
