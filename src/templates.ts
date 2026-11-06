/**
 * Șabloane de proiect: scheletul unui proiect (planșe, niveluri, catalog, calcule, datele firmei, simboluri),
 * fără datele beneficiarului și fără planurile de fundal; desenul (echipamente, cabluri, schiță) e opțional.
 * Șabloanele utilizatorului se păstrează în browser și se pot exporta / importa ca fișier `.sablon.json`.
 */
import type { MemoriuData, Project, SystemId } from './types'
import { emptyProject, newLevel, newSheet, normalizeProject, uid } from './project'
import { systemById } from './symbols'

export interface ProjectTemplate {
  id: string
  name: string
  description: string
  createdAt: string
  /** Șablon de bază, din aplicație (nu se poate șterge) */
  builtin?: boolean
  /** Conține și desenul (echipamente, cabluri, schiță) */
  withDrawing?: boolean
  /** Proiectul-schelet (se completează la creare cu emptyProject / normalizeProject) */
  data: Partial<Project>
}

const KEY = 'plansa-securitate:sabloane'

/** Câmpurile memoriului care țin de beneficiar / obiectiv (nu intră în șablon) */
const CLIENT_MEMO: (keyof MemoriuData)[] = [
  'cui',
  'sediuSocial',
  'activitate',
  'caen',
  'caenDenumire',
  'vecinN',
  'vecinE',
  'vecinS',
  'vecinV',
  'accesPietonal',
  'accesAuto',
  'constructie',
  'mecanoFizice',
  'circuite',
]

/** Șablon din proiectul curent */
export function makeTemplate(p: Project, name: string, description: string, withDrawing: boolean): ProjectTemplate {
  const memoriu = { ...p.memoriu }
  for (const k of CLIENT_MEMO) (memoriu as Record<string, unknown>)[k] = ''
  const data: Partial<Project> = {
    title: { ...p.title, beneficiar: '', obiectiv: '', nrProiect: '', data: '' },
    levels: p.levels.map((l) => ({ ...l, background: null, bgX: undefined, bgY: undefined, bgRotation: undefined, bgFade: undefined, bgLocked: undefined, pxPerMeter: l.background ? null : l.pxPerMeter })),
    sheets: p.sheets.map((sh) => (withDrawing ? sh : { ...sh, diagram: undefined })),
    activeSheetId: p.activeSheetId,
    numberPad: p.numberPad,
    cableReservePct: p.cableReservePct,
    catalog: p.catalog,
    accessories: p.accessories,
    calc: p.calc,
    memoriu,
    customSymbols: p.customSymbols,
    devices: withDrawing ? p.devices : [],
    cables: withDrawing ? p.cables : [],
    arch: withDrawing ? p.arch : [],
  }
  return { id: uid(), name: name.trim() || 'Șablon fără nume', description: description.trim(), createdAt: new Date().toISOString(), withDrawing, data: JSON.parse(JSON.stringify(data)) }
}

/**
 * Proiect nou din șablon: id-uri noi pentru niveluri și planșe (planurile de fundal din browser sunt legate de
 * id-ul nivelului, deci un id refolosit ar aduce planul altui proiect), data de azi, logo-ul din șablon sau cel implicit.
 */
export function projectFromTemplate(t: ProjectTemplate): Project {
  const base = emptyProject()
  const d = JSON.parse(JSON.stringify(t.data)) as Partial<Project>
  const lvlMap = new Map<string, string>()
  const shMap = new Map<string, string>()
  const levels = (d.levels ?? base.levels).map((l) => {
    const id = uid()
    lvlMap.set(l.id, id)
    return { ...l, id }
  })
  const sheets = (d.sheets ?? base.sheets).map((sh) => {
    const id = uid()
    shMap.set(sh.id, id)
    return { ...sh, id, levelId: sh.levelId ? lvlMap.get(sh.levelId) ?? levels[0].id : sh.levelId }
  })
  const lv = <T extends { levelId: string }>(x: T): T => ({ ...x, levelId: lvlMap.get(x.levelId) ?? levels[0].id })
  const merged = {
    ...base,
    ...d,
    title: { ...base.title, ...(d.title ?? {}), data: base.title.data },
    memoriu: { ...base.memoriu, ...(d.memoriu ?? {}) },
    levels,
    sheets,
    activeSheetId: shMap.get(d.activeSheetId ?? '') ?? sheets[0].id,
    devices: (d.devices ?? []).map(lv),
    cables: (d.cables ?? []).map(lv),
    arch: (d.arch ?? []).map(lv),
  }
  // logo: cel din șablon; dacă șablonul nu are, cel implicit din browser (emptyProject)
  if (!merged.title.logo && base.title.logo && d.title?.logo === undefined) merged.title.logo = base.title.logo
  return normalizeProject(merged)
}

// ---------------------------------------------------------------- șabloane de bază

/** Structura de planșe pentru un set de sisteme: câte un plan pe sistem + schemele bloc */
function structural(id: string, name: string, description: string, systems: SystemId[]): ProjectTemplate {
  const lvl = newLevel('Parter')
  let n = 0
  const nr = () => 'P' + String(++n).padStart(2, '0')
  const plans = systems.map((s) => newSheet({ levelId: lvl.id, nr: nr(), titlu: `Plan amplasare – ${systemById(s).name}`, systems: [s], showCones: s === 'CCTV' }))
  const blocs = systems
    .filter((s) => s !== 'NET' || systems.length === 1)
    .map((s) => newSheet({ kind: 'bloc', nr: nr(), titlu: `Schemă bloc – ${systemById(s).name}`, systems: [s] }))
  const sheets = [...plans, ...blocs]
  return { id, name, description, createdAt: '', builtin: true, data: { levels: [lvl], sheets, activeSheetId: sheets[0].id } }
}

export const BUILTIN_TEMPLATES: ProjectTemplate[] = [
  structural('casa', 'Casă / locuință', 'Efracție și supraveghere video: un plan pe sistem și schemele bloc. Planșe A3 peisaj, 1:100.', ['EFR', 'CCTV']),
  structural(
    'birou',
    'Birou / spațiu administrativ',
    'Efracție, control acces, supraveghere video și rețea de date: un plan pe sistem și schemele bloc.',
    ['EFR', 'CA', 'CCTV', 'NET'],
  ),
  structural('magazin', 'Magazin / spațiu comercial', 'Efracție, supraveghere video și detecție incendiu: un plan pe sistem și schemele bloc.', ['EFR', 'CCTV', 'INC']),
]

// ---------------------------------------------------------------- șabloanele utilizatorului (browser)

export function userTemplates(): ProjectTemplate[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((t) => t && t.id && t.data) : []
  } catch {
    return []
  }
}

function saveAll(list: ProjectTemplate[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
    return true
  } catch {
    return false
  }
}

export const addTemplate = (t: ProjectTemplate) => saveAll([...userTemplates().filter((x) => x.id !== t.id), t])
export const removeTemplate = (id: string) => saveAll(userTemplates().filter((x) => x.id !== id))

/** Descarcă șablonul ca fișier .sablon.json */
export function exportTemplate(t: ProjectTemplate) {
  const blob = new Blob([JSON.stringify({ ...t, builtin: undefined, format: 'plansa-securitate-sablon', version: 1 })], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${t.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\- ]+/g, '_').trim() || 'sablon'}.sablon.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 30000)
}

/** Citește un fișier .sablon.json (sau un proiect .plansa.json, transformat în șablon) */
export async function importTemplate(f: File): Promise<ProjectTemplate> {
  const v = JSON.parse(await f.text())
  if (v && v.format === 'plansa-securitate-sablon' && v.data) return { ...v, id: uid(), builtin: false }
  if (v && Array.isArray(v.devices) && Array.isArray(v.sheets)) {
    const name = f.name.replace(/\.plansa\.json$|\.json$/i, '')
    return makeTemplate(normalizeProject(v), name, `Din proiectul „${name}”`, false)
  }
  throw new Error('Fișierul nu este un șablon (.sablon.json) sau un proiect (.plansa.json).')
}
