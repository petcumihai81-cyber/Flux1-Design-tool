import type { CatalogItem, Project, SystemId } from './types'
import { catalogItem, deviceInfo, deviceSystem } from './project'
import { symbolByType } from './symbols'

/**
 * Calculele din breviarul de calcul (formulele uzuale din proiectele avizate):
 *  - acumulatori:  n = (Iv·tv + Ia·ta) / (0.86·C),  N = [n] + 1
 *  - stocare video: C = BR·3600·24·Z·Ncam / (8·1024²)  [GB], BR în kbps
 *  - UPS:          PA = P / cosφ;  autonomie ≈ Wh·η / P
 *  - PoE:          Σ consum PoE ≤ buget switch (cu 20% rezervă)
 */

interface Line {
  key: string
  denumire: string
  qty: number
}

function groupLines<T extends Line>(lines: T[], merge: (a: T, b: T) => void): T[] {
  const map = new Map<string, T>()
  for (const l of lines) {
    const g = map.get(l.key)
    if (g) merge(g, l)
    else map.set(l.key, { ...l })
  }
  return [...map.values()]
}

/** Echipamentele și accesoriile unui sistem, cu articolul de catalog (dacă există) */
function systemItems(p: Project, system: SystemId) {
  const out: { key: string; denumire: string; qty: number; item?: CatalogItem; type: string }[] = []
  for (const d of p.devices) {
    if (deviceSystem(d) !== system) continue
    const info = deviceInfo(p, d)
    out.push({ key: d.catalogId ?? 'tip:' + d.type, denumire: info.denumire, qty: 1, item: info.item, type: d.type })
  }
  for (const a of p.accessories) {
    const it = catalogItem(p, a.catalogId)
    if (!it || it.system !== system) continue
    out.push({ key: it.id, denumire: it.denumire || it.model, qty: a.qty, item: it, type: it.type })
  }
  return out
}

// ---------------------------------------------------------------- acumulatori

export interface BatteryRow extends Line {
  u?: number
  iv: number
  ia: number
}

export interface BatteryCalc {
  system: SystemId
  rows: BatteryRow[]
  totalIv: number
  totalIa: number
  capacitateMah: number
  acumulator?: CatalogItem
  n: number
  N: number
  /** Echipamente cu baterie proprie (excluse din calcul) */
  wireless: number
  /** Echipamente fără date de consum (de completat) */
  missing: string[]
}

export function batteryCalc(p: Project, system: SystemId): BatteryCalc {
  const { tVegheH, tAlarmaH, factorAcumulator } = p.calc
  const lines: BatteryRow[] = []
  let wireless = 0
  const missing = new Set<string>()
  let acumulator: CatalogItem | undefined
  for (const x of systemItems(p, system)) {
    if (x.type === 'acc_acumulator') {
      acumulator ??= x.item
      continue
    }
    if (x.type.startsWith('acc_') && !x.item?.iVegheMa && !x.item?.iAlarmaMa) continue
    if (x.item?.baterie) {
      wireless += x.qty
      continue
    }
    const iv = x.item?.iVegheMa
    const ia = x.item?.iAlarmaMa
    if (iv == null && ia == null) {
      missing.add(x.denumire)
      continue
    }
    lines.push({ key: x.key, denumire: x.denumire, qty: x.qty, u: x.item?.tensiuneV, iv: iv ?? 0, ia: ia ?? iv ?? 0 })
  }
  const rows = groupLines(lines, (a, b) => (a.qty += b.qty))
  const totalIv = rows.reduce((s, r) => s + r.iv * r.qty, 0)
  const totalIa = rows.reduce((s, r) => s + r.ia * r.qty, 0)
  const capacitateMah = (acumulator?.capacitateAh ?? 7) * 1000
  const n = (totalIv * tVegheH + totalIa * tAlarmaH) / (factorAcumulator * capacitateMah)
  return { system, rows, totalIv, totalIa, capacitateMah, acumulator, n, N: Math.floor(n) + 1, wireless, missing: [...missing] }
}

// ---------------------------------------------------------------- stocare video

export interface StorageRow extends Line {
  bitrate: number
}

export interface StorageCalc {
  rows: StorageRow[]
  cameras: number
  gbContinuu: number
  gbDetectie: number
  /** Necesar în TB (zecimal, ca la HDD-uri) */
  tbContinuu: number
  tbDetectie: number
  hdds: { denumire: string; qty: number; tb: number }[]
  tbInstalat: number
}

const GIB_TO_TB = 1.073741824 / 1000

export function storageCalc(p: Project): StorageCalc {
  const { zileStocare, bitrateImplicitKbps, factorActivitate } = p.calc
  const lines: StorageRow[] = []
  for (const d of p.devices) {
    if (!symbolByType(d.type)?.camera) continue
    const info = deviceInfo(p, d)
    lines.push({ key: d.catalogId ?? 'tip:' + d.type, denumire: info.denumire, qty: 1, bitrate: info.item?.bitrateKbps ?? bitrateImplicitKbps })
  }
  const rows = groupLines(lines, (a, b) => (a.qty += b.qty))
  const sumBr = rows.reduce((s, r) => s + r.bitrate * r.qty, 0)
  const gbContinuu = (sumBr * 3600 * 24 * zileStocare) / (8 * 1024 * 1024)
  const gbDetectie = gbContinuu * factorActivitate
  const hdds = p.accessories
    .map((a) => ({ a, it: catalogItem(p, a.catalogId) }))
    .filter((x) => x.it?.type === 'acc_hdd')
    .map(({ a, it }) => ({ denumire: it!.denumire || it!.model, qty: a.qty, tb: it!.capacitateTB ?? 0 }))
  return {
    rows,
    cameras: rows.reduce((s, r) => s + r.qty, 0),
    gbContinuu,
    gbDetectie,
    tbContinuu: gbContinuu * GIB_TO_TB,
    tbDetectie: gbDetectie * GIB_TO_TB,
    hdds,
    tbInstalat: hdds.reduce((s, h) => s + h.tb * h.qty, 0),
  }
}

// ---------------------------------------------------------------- energie TVCI + UPS

export interface PowerRow extends Line {
  w: number
}

export interface PowerCalc {
  rows: PowerRow[]
  totalW: number
  /** Echipamente alimentate prin PoE (incluse în consumul switch-ului) */
  poeExcluded: number
  missing: string[]
  vaNecesar: number
  ups?: CatalogItem
  upsQty: number
  autonomieMin: number | null
}

export function powerCalc(p: Project, system: SystemId = 'CCTV'): PowerCalc {
  const items = systemItems(p, system)
  const hasPoeSwitch = items.some((x) => (x.item?.poeBugetW ?? 0) > 0)
  const lines: PowerRow[] = []
  const missing = new Set<string>()
  let poeExcluded = 0
  let ups: CatalogItem | undefined
  let upsQty = 0
  for (const x of items) {
    if (x.type === 'acc_ups') {
      ups ??= x.item
      upsQty += x.qty
      continue
    }
    if (x.type === 'acc_acumulator') continue
    if (x.item?.poe && hasPoeSwitch) {
      poeExcluded += x.qty
      continue
    }
    const w = x.item?.putereW
    if (w == null) {
      if (!x.type.startsWith('acc_')) missing.add(x.denumire)
      continue
    }
    lines.push({ key: x.key, denumire: x.denumire, qty: x.qty, w })
  }
  const rows = groupLines(lines, (a, b) => (a.qty += b.qty))
  const totalW = rows.reduce((s, r) => s + r.w * r.qty, 0)
  const wh = (ups?.upsWh ?? 0) * Math.max(upsQty, 1)
  return {
    rows,
    totalW,
    poeExcluded,
    missing: [...missing],
    vaNecesar: totalW / p.calc.cosPhi,
    ups,
    upsQty,
    autonomieMin: ups?.upsWh && totalW > 0 ? (wh * p.calc.randamentUps * 60) / totalW : null,
  }
}

// ---------------------------------------------------------------- PoE

export interface PoeCalc {
  consumW: number
  consumatori: number
  bugetW: number
  switches: { label: string; buget: number }[]
  missing: string[]
}

export function poeCalc(p: Project): PoeCalc {
  let consumW = 0
  let consumatori = 0
  const missing = new Set<string>()
  const switches: { label: string; buget: number }[] = []
  for (const d of p.devices) {
    const info = deviceInfo(p, d)
    const it = info.item
    if (it?.poeBugetW) switches.push({ label: d.label, buget: it.poeBugetW })
    if (it?.poe) {
      consumatori++
      const w = it.poeW ?? it.putereW
      if (w == null) missing.add(info.denumire)
      else consumW += w
    }
  }
  return { consumW, consumatori, bugetW: switches.reduce((s, x) => s + x.buget, 0), switches, missing: [...missing] }
}

export const fmt = (n: number, d = 2) => n.toLocaleString('ro-RO', { maximumFractionDigits: d, minimumFractionDigits: 0 })
