/**
 * Pachetul proiectului (.zip): proiectul (.plansa.json) cu planurile de fundal, imaginile de pe planșe,
 * simbolurile personalizate și logo-ul scoase ca fișiere separate (PNG / JPG / SVG), plus, opțional,
 * documentele de predare (PDF, Excel, DXF, draw.io, memoriu .docx).
 * În JSON-ul din pachet, aceste câmpuri devin referințe `zip:<cale>`; la deschidere se pun la loc.
 */
import JSZip from 'jszip'
import type { Project } from './types'
import type { CapturedFile } from './download'
import { isProject, normalizeProject } from './project'

export const PACK_JSON = 'proiect.plansa.json'
const REF = 'zip:'

const MIME_EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg' }
const EXT_MIME: Record<string, string> = Object.fromEntries(Object.entries(MIME_EXT).map(([m, e]) => [e, m]))

/** Nume de fișier sigur, fără diacritice */
export const fileSafe = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[–—]/g, '-')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .trim() || 'fisier'

/** data URL → octeți + extensie */
function fromDataUrl(url: string): { bytes: Uint8Array; ext: string } | null {
  const m = url.match(/^data:([^;,]+)(;base64)?,(.*)$/s)
  if (!m) return null
  const ext = MIME_EXT[m[1]] ?? 'bin'
  if (m[2]) {
    const bin = atob(m[3])
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return { bytes, ext }
  }
  return { bytes: new TextEncoder().encode(decodeURIComponent(m[3])), ext }
}

function toDataUrl(bytes: Uint8Array, path: string): string {
  const mime = EXT_MIME[path.split('.').pop()!.toLowerCase()] ?? 'application/octet-stream'
  let bin = ''
  const CH = 0x8000
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode(...bytes.subarray(i, i + CH))
  return `data:${mime};base64,${btoa(bin)}`
}

const README = (p: Project, extras: number) => `Pachet proiect — Planșe Securitate
${p.title.nrProiect ? `Proiect: ${p.title.nrProiect}\n` : ''}${p.title.beneficiar ? `Beneficiar: ${p.title.beneficiar}\n` : ''}${p.title.obiectiv ? `Obiectiv: ${p.title.obiectiv}\n` : ''}
Conținut:
  ${PACK_JSON}   proiectul (deschide pachetul .zip întreg din aplicație: butonul „Deschide”)
  planuri/       planurile de fundal ale nivelurilor
  imagini/       imaginile de pe planșe
  simboluri/     simbolurile personalizate
  logo.*         logo-ul firmei din cartuș
${extras ? '  predare/       documentele pentru predare (PDF, Excel, DXF, draw.io, memoriu)\n' : ''}
Fișierul ${PACK_JSON} singur nu conține planurile și imaginile: pentru a redeschide proiectul complet
se încarcă tot pachetul .zip.
`

/** Construiește pachetul .zip */
export async function makePackage(project: Project, extras: CapturedFile[] = []): Promise<Blob> {
  const zip = new JSZip()
  const p: Project = JSON.parse(JSON.stringify(project))
  const used = new Set<string>()
  const unique = (base: string, ext: string) => {
    let path = `${base}.${ext}`
    for (let i = 2; used.has(path.toLowerCase()); i++) path = `${base}-${i}.${ext}`
    used.add(path.toLowerCase())
    return path
  }
  /** Mută un data URL în fișier; întoarce referința `zip:` (sau valoarea neschimbată) */
  const put = (url: string | undefined, base: string) => {
    if (!url || !url.startsWith('data:')) return url
    const f = fromDataUrl(url)
    if (!f) return url
    const path = unique(base, f.ext)
    zip.file(path, f.bytes)
    return REF + path
  }

  p.levels.forEach((l, i) => {
    if (l.background) l.background.src = put(l.background.src, `planuri/${String(i + 1).padStart(2, '0')} ${fileSafe(l.name)}`)!
  })
  for (const a of p.arch) if (a.kind === 'image' && a.src) a.src = put(a.src, `imagini/${fileSafe(a.text || a.id)}`)
  if (p.title.logo) p.title.logo = put(p.title.logo, 'logo')
  for (const s of p.customSymbols ?? []) {
    if (s.kind === 'svg') {
      const path = unique(`simboluri/${fileSafe(s.name)}`, 'svg')
      zip.file(path, s.data)
      s.data = REF + path
    } else s.data = put(s.data, `simboluri/${fileSafe(s.name)}`)!
  }

  zip.file(PACK_JSON, JSON.stringify(p, null, 1))
  for (const f of extras) zip.file(`predare/${fileSafe(f.name)}`, f.blob)
  zip.file('CITESTE.txt', README(project, extras.length))
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })
}

/** Deschide un pachet .zip: proiectul cu planurile, imaginile, simbolurile și logo-ul puse la loc */
export async function readPackage(file: Blob): Promise<Project> {
  const zip = await JSZip.loadAsync(file)
  const entry = zip.file(PACK_JSON) ?? zip.file(/\.plansa\.json$/i)[0] ?? zip.file(/\.json$/i).find((f) => !f.name.startsWith('predare/'))
  if (!entry) throw new Error('Arhiva nu conține un proiect (.plansa.json).')
  const v = JSON.parse(await entry.async('string'))
  if (!isProject(v)) throw new Error('Proiectul din arhivă nu este valid.')
  const missing: string[] = []
  const bin = async (ref: string | undefined): Promise<string | undefined> => {
    if (!ref || !ref.startsWith(REF)) return ref
    const path = ref.slice(REF.length)
    const f = zip.file(path)
    if (!f) {
      missing.push(path)
      return undefined
    }
    return toDataUrl(await f.async('uint8array'), path)
  }
  const p = v as Project
  for (const l of p.levels) if (l.background) {
    const src = await bin(l.background.src)
    l.background = src ? { ...l.background, src } : null
  }
  for (const a of p.arch) if (a.kind === 'image' && a.src) a.src = await bin(a.src)
  if (p.title.logo?.startsWith(REF)) p.title.logo = (await bin(p.title.logo)) ?? ''
  if (p.customSymbols)
    for (const s of p.customSymbols) {
      if (!s.data.startsWith(REF)) continue
      const path = s.data.slice(REF.length)
      const f = zip.file(path)
      if (!f) missing.push(path)
      s.data = !f ? '' : s.kind === 'svg' ? await f.async('string') : toDataUrl(await f.async('uint8array'), path)
    }
  if (p.customSymbols) p.customSymbols = p.customSymbols.filter((s) => s.data)
  if (missing.length) console.warn('Fișiere lipsă din pachet:', missing)
  return normalizeProject(p)
}

export const isZip = (f: File) => /\.zip$/i.test(f.name) || f.type === 'application/zip' || f.type === 'application/x-zip-compressed'
