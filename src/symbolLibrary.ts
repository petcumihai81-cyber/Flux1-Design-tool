/**
 * Simboluri personalizate (încărcate de utilizator) și aspectul echipamentelor (culoare proprie, simbol propriu).
 * SVG-ul se curăță și se încadrează în caseta 40×40 a simbolurilor; imaginile se taie la conținut, primesc fundal
 * transparent și se aduc la 160×160 px. Recolorarea: SVG — culorile devin culoarea aleasă; imagine — pictogramă
 * monocromă colorată (canalul alfa se păstrează).
 */
import type { CustomSymbol, Device, Project } from './types'
import { cachedImage, loadCachedImage, loadSymbolImage, symbolByType, symbolImage, symbolSvg, systemById } from './symbols'

const LIB_KEY = 'plansa-securitate:simboluri'
const RASTER = 160
const MAX_SVG = 300_000

// ---------------------------------------------------------------- bibliotecă (browser)

/** Simbolurile salvate în browser: proiectele noi pornesc cu ele */
export function defaultCustomSymbols(): CustomSymbol[] {
  try {
    const v = JSON.parse(localStorage.getItem(LIB_KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((c) => c && c.id && c.data && symbolByType(c.base)) : []
  } catch {
    return []
  }
}

export function saveLibrary(list: CustomSymbol[]): boolean {
  try {
    localStorage.setItem(LIB_KEY, JSON.stringify(list))
    return true
  } catch {
    return false
  }
}

/** Adaugă / actualizează un simbol în bibliotecă (după id) */
export function addToLibrary(sym: CustomSymbol): boolean {
  const lib = defaultCustomSymbols().filter((c) => c.id !== sym.id)
  return saveLibrary([...lib, sym])
}

export function removeFromLibrary(id: string) {
  saveLibrary(defaultCustomSymbols().filter((c) => c.id !== id))
}

// ---------------------------------------------------------------- SVG

const isNeutral = (v: string) => {
  const t = v.trim().toLowerCase()
  return !t || t === 'none' || t === 'transparent' || t.startsWith('url(') || t === 'inherit' || /^(#fff|#ffffff|white|rgb\(255,\s*255,\s*255\))$/.test(t)
}

/**
 * Curăță un SVG (fără scripturi, evenimente, obiecte străine sau legături externe) și îl încadrează în caseta 40×40.
 * Întoarce SVG-ul normalizat sau aruncă eroare cu motivul.
 */
export function normalizeSvg(text: string): string {
  if (text.length > MAX_SVG) throw new Error('SVG prea mare (max. 300 KB).')
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
  const root = doc.documentElement
  if (!root || root.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) throw new Error('Fișierul nu este un SVG valid.')
  root.querySelectorAll('script, foreignObject, iframe, object, embed, audio, video').forEach((n) => n.remove())
  for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
    for (const a of Array.from(el.attributes)) {
      const n = a.name.toLowerCase()
      const val = a.value.trim().toLowerCase()
      if (n.startsWith('on')) el.removeAttribute(a.name)
      else if ((n === 'href' || n === 'xlink:href') && !val.startsWith('#') && !val.startsWith('data:image/')) el.removeAttribute(a.name)
    }
  }
  // caseta originală
  let vb = (root.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number)
  if (vb.length !== 4 || vb.some((v) => !Number.isFinite(v)) || vb[2] <= 0 || vb[3] <= 0) {
    const w = parseFloat(root.getAttribute('width') ?? '') || 100
    const h = parseFloat(root.getAttribute('height') ?? '') || 100
    vb = [0, 0, w, h]
  }
  const inner = Array.from(root.childNodes)
    .map((n) => new XMLSerializer().serializeToString(n))
    .join('')
    .replace(/ xmlns(:\w+)?="[^"]*"/g, '')
  // stilurile de pe rădăcină (fill, stroke…) trec pe un grup
  const keep = ['fill', 'stroke', 'stroke-width', 'style', 'color', 'opacity', 'fill-rule']
  const attrs = keep
    .map((k) => (root.getAttribute(k) != null ? ` ${k}="${root.getAttribute(k)!.replace(/"/g, '&quot;')}"` : ''))
    .join('')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="80" height="80" viewBox="0 0 40 40">` +
    `<svg x="1" y="1" width="38" height="38" viewBox="${vb.join(' ')}" preserveAspectRatio="xMidYMid meet"><g data-sym="1"><g${attrs}>${inner}</g></g></svg></svg>`
  )
}

/** Recolorează un SVG normalizat: culorile (nu albul / transparentul) devin `color`; formele fără culoare primesc `color` */
export function recolorSvg(svg: string, color: string): string {
  const swap = (v: string) => (isNeutral(v) ? v : color)
  const out = svg
    .replace(/\b(fill|stroke|stop-color|color)="([^"]*)"/g, (_, k, v) => `${k}="${swap(v)}"`)
    .replace(/\b(fill|stroke|stop-color|color)\s*:\s*([^;"]+)/g, (_, k, v) => `${k}:${swap(v)}`)
  // grupul exterior: culoarea implicită (forme fără fill) și currentColor
  return out.replace('<g data-sym="1">', `<g data-sym="1" fill="${color}" color="${color}">`)
}

/** Forma comună a unei culori (#000 = #000000 = black) */
function canonColor(c: string): string {
  const t = c.trim().toLowerCase()
  const named: Record<string, string> = { black: '#000000', red: '#ff0000', blue: '#0000ff', green: '#008000' }
  if (named[t]) return named[t]
  const m = t.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/)
  return m ? `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}` : t
}

/** Are SVG-ul mai multe culori „reale”? (pentru propunerea implicită de recolorare) */
export function svgColorCount(svg: string): number {
  const set = new Set<string>()
  for (const m of svg.matchAll(/\b(?:fill|stroke|stop-color)\s*[=:]\s*"?([^;"\s>]+)/g)) if (!isNeutral(m[1])) set.add(canonColor(m[1]))
  return set.size
}

const svgUrl = (svg: string) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)

// ---------------------------------------------------------------- imagini (PNG, ICO, JPG, WebP, GIF)

const loadImg = (src: string) =>
  new Promise<HTMLImageElement>((res, rej) => {
    const im = new Image()
    im.onload = () => res(im)
    im.onerror = () => rej(new Error('Imaginea nu a putut fi citită (format nesuportat de browser?).'))
    im.src = src
  })

export interface RasterResult {
  data: string
  /** Pictograma pare de o singură culoare (se poate recolora) */
  monochrome: boolean
  /** Imaginea are deja transparență */
  hadAlpha: boolean
}

/**
 * Pregătește o imagine ca simbol: opțional fundalul alb devine transparent, se taie marginile transparente,
 * se încadrează centrat în 160×160 px (cu margine) și se salvează PNG.
 */
export async function normalizeRaster(src: string, whiteToAlpha: boolean): Promise<RasterResult> {
  const im = await loadImg(src)
  const scale = Math.min(1, 1024 / Math.max(im.naturalWidth, im.naturalHeight))
  const w = Math.max(1, Math.round(im.naturalWidth * scale))
  const h = Math.max(1, Math.round(im.naturalHeight * scale))
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(im, 0, 0, w, h)
  const id = ctx.getImageData(0, 0, w, h)
  const px = id.data
  let hadAlpha = false
  for (let i = 3; i < px.length; i += 4) if (px[i] < 250) {
    hadAlpha = true
    break
  }
  if (whiteToAlpha) {
    for (let i = 0; i < px.length; i += 4) {
      const m = Math.min(px[i], px[i + 1], px[i + 2])
      // aproape alb → transparent, cu tranziție lină pe margini
      if (m > 245) px[i + 3] = 0
      else if (m > 215) px[i + 3] = Math.min(px[i + 3], Math.round(((245 - m) / 30) * 255))
    }
  }
  // limitele conținutului și dacă e monocrom
  let x0 = w
  let y0 = h
  let x1 = -1
  let y1 = -1
  let n = 0
  let sr = 0
  let sg = 0
  let sb = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      if (px[i + 3] < 24) continue
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
      n++
      sr += px[i]
      sg += px[i + 1]
      sb += px[i + 2]
    }
  }
  if (x1 < 0) throw new Error('Imaginea e goală (complet transparentă sau albă).')
  const mr = sr / n
  const mg = sg / n
  const mb = sb / n
  let close = 0
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 24) continue
    if (Math.abs(px[i] - mr) + Math.abs(px[i + 1] - mg) + Math.abs(px[i + 2] - mb) < 90) close++
  }
  ctx.putImageData(id, 0, 0)
  const out = document.createElement('canvas')
  out.width = RASTER
  out.height = RASTER
  const o = out.getContext('2d')!
  const cw = x1 - x0 + 1
  const ch = y1 - y0 + 1
  const pad = 6
  const k = Math.min((RASTER - 2 * pad) / cw, (RASTER - 2 * pad) / ch)
  o.imageSmoothingQuality = 'high'
  o.drawImage(c, x0, y0, cw, ch, (RASTER - cw * k) / 2, (RASTER - ch * k) / 2, cw * k, ch * k)
  return { data: out.toDataURL('image/png'), monochrome: close / n > 0.92, hadAlpha }
}

/** Pictogramă monocromă în culoarea dată (păstrează transparența) */
export async function tintRaster(src: string, color: string): Promise<string> {
  const im = await loadImg(src)
  const c = document.createElement('canvas')
  c.width = im.naturalWidth
  c.height = im.naturalHeight
  const ctx = c.getContext('2d')!
  ctx.drawImage(im, 0, 0)
  ctx.globalCompositeOperation = 'source-in'
  ctx.fillStyle = color
  ctx.fillRect(0, 0, c.width, c.height)
  return c.toDataURL('image/png')
}

// ---------------------------------------------------------------- aspectul echipamentelor

/** Sursa (data URL) a unui simbol personalizat, în culoarea dată (dacă se recolorează) */
export function customSymbolSrc(sym: CustomSymbol, color?: string): string | Promise<string> {
  if (sym.kind === 'svg') return svgUrl(sym.recolor && color ? recolorSvg(sym.data, color) : sym.data)
  return sym.recolor && color ? tintRaster(sym.data, color) : sym.data
}

const customKey = (sym: CustomSymbol, color?: string) => `c:${sym.id}:${sym.data.length}|${sym.recolor && color ? color.toLowerCase() : ''}`

export function customSymbolImage(sym: CustomSymbol, color?: string) {
  return cachedImage(customKey(sym, color), () => customSymbolSrc(sym, color))
}

export function loadCustomSymbolImage(sym: CustomSymbol, color?: string) {
  return loadCachedImage(customKey(sym, color), () => customSymbolSrc(sym, color))
}

/** Simbolul personalizat al echipamentului: propriu sau al echipamentului din catalog */
export function deviceSymbol(p: Project, d: Pick<Device, 'symbolId' | 'catalogId'>): CustomSymbol | undefined {
  const id = d.symbolId ?? p.catalog.find((c) => c.id === d.catalogId)?.symbolId
  return id ? p.customSymbols.find((c) => c.id === id) : undefined
}

/** Culoarea simbolului: proprie sau a sistemului */
export function deviceColor(d: Pick<Device, 'type' | 'color'>): string {
  const def = symbolByType(d.type)
  return d.color ?? (def ? systemById(def.system).color : '#222222')
}

/** Aspectul unui echipament pe plan: imaginea (încărcată sau undefined) și dacă textul din simbol se desenează separat */
export function deviceImage(p: Project, d: Device): { img?: HTMLImageElement; glyph: boolean; color: string } {
  const color = deviceColor(d)
  const sym = deviceSymbol(p, d)
  if (sym) return { img: customSymbolImage(sym, d.color ?? (sym.recolor ? color : undefined)), glyph: false, color }
  const def = symbolByType(d.type)
  const glyph = !!def?.glyph
  return { img: symbolImage(d.type, d.color, glyph), glyph, color }
}

/** Imaginea completă a simbolului (cu text), pentru legendă și export */
export function loadLookImage(p: Project, look: { type: string; color?: string; symbolId?: string; catalogId?: string }): Promise<HTMLImageElement> {
  const sym = deviceSymbol(p, look)
  if (sym) return loadCustomSymbolImage(sym, look.color ?? (sym.recolor ? deviceColor(look) : undefined))
  return loadSymbolImage(look.type, false, look.color)
}

/** Sursa imaginii complete (data URL), pentru miniaturi și export draw.io */
export async function lookDataUrl(p: Project, look: { type: string; color?: string; symbolId?: string; catalogId?: string }): Promise<string> {
  const sym = deviceSymbol(p, look)
  if (sym) return customSymbolSrc(sym, look.color ?? (sym.recolor ? deviceColor(look) : undefined))
  const def = symbolByType(look.type)
  return def ? svgUrl(symbolSvg(def, look.color)) : ''
}

/** Miniatura sincronă (pentru paletă / panouri): SVG direct sau imaginea originală */
export function symbolThumb(sym: CustomSymbol, color?: string): string {
  if (sym.kind === 'svg') return svgUrl(sym.recolor && color ? recolorSvg(sym.data, color) : sym.data)
  return sym.data
}

/** Culorile propuse pentru simboluri */
export const SYMBOL_COLORS = [
  { name: 'Roșu', c: '#c62828' },
  { name: 'Albastru', c: '#1565c0' },
  { name: 'Verde', c: '#2e7d32' },
  { name: 'Portocaliu', c: '#e65100' },
  { name: 'Violet', c: '#6a1b9a' },
  { name: 'Negru', c: '#222222' },
  { name: 'Gri', c: '#607d8b' },
  { name: 'Maro', c: '#6d4c41' },
  { name: 'Turcoaz', c: '#00838f' },
  { name: 'Roz', c: '#ad1457' },
]
