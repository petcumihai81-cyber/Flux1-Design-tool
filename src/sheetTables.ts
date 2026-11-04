/**
 * Tabelele așezate pe planșă (ArchElement `table`): datele se generează din proiect, ca în Excel / memoriu,
 * deci se actualizează singure când se modifică echipamentele, zonele sau cablurile.
 */
import type { Project, SheetTable, SystemId } from './types'
import { SYSTEMS, symbolByType, systemById } from './symbols'
import { cableEnds, cableMeters, catalogItem, deviceInfo, deviceSystem, isRiserRoute } from './project'

export interface TableData {
  title: string
  header: string[]
  /** Lățimi relative ale coloanelor */
  widths: number[]
  /** Rânduri; un rând cu o singură celulă începând cu „§” = subtitlu (ex. sistemul) */
  rows: string[][]
}

export const TABLE_KINDS: { kind: SheetTable['kind']; name: string }[] = [
  { kind: 'echipamente', name: 'Lista echipamentelor' },
  { kind: 'zone', name: 'Tabel zone (efracție / incendiu)' },
  { kind: 'cctv', name: 'Zone supravegheate video' },
  { kind: 'cabluri', name: 'Jurnal de cablu' },
]

export function tableData(p: Project, t: SheetTable, levelId: string): TableData {
  const onLevel = <T extends { levelId: string }>(x: T) => !t.levelOnly || x.levelId === levelId
  const systems = SYSTEMS.filter((s) => !t.system || s.id === t.system)
  const sysSuffix = t.system ? ` – ${systemById(t.system).name.toLowerCase()}` : ''

  if (t.kind === 'echipamente') {
    const rows: string[][] = []
    for (const sys of systems) {
      const groups = new Map<string, { denumire: string; model: string; producator: string; qty: number }>()
      for (const d of p.devices) {
        if (deviceSystem(d) !== sys.id || !onLevel(d)) continue
        const info = deviceInfo(p, d)
        const key = d.catalogId ?? d.type + '|' + d.model.trim()
        const g = groups.get(key) ?? { denumire: info.denumire, model: info.model, producator: info.producator, qty: 0 }
        g.qty++
        groups.set(key, g)
      }
      if (!t.levelOnly) {
        for (const a of p.accessories) {
          const it = catalogItem(p, a.catalogId)
          if (!it || it.system !== sys.id) continue
          const g = groups.get(it.id) ?? { denumire: it.denumire || it.model, model: it.model, producator: it.producator, qty: 0 }
          g.qty += a.qty
          groups.set(it.id, g)
        }
      }
      if (!groups.size) continue
      if (!t.system) rows.push(['§' + sys.name])
      let n = 1
      for (const g of groups.values()) rows.push([`${n++}.`, g.denumire, g.model, String(g.qty), g.producator])
    }
    return { title: 'Lista echipamentelor' + sysSuffix, header: ['Nr.', 'Denumire echipament', 'Model', 'Cant.', 'Producător'], widths: [5, 34, 18, 6, 12], rows }
  }

  if (t.kind === 'zone') {
    const rows: string[][] = []
    for (const sysId of ['EFR', 'INC'] as SystemId[]) {
      if (t.system && t.system !== sysId) continue
      const list = p.devices
        .filter((d) => deviceSystem(d) === sysId && onLevel(d))
        .sort((a, b) => (a.zoneNr ?? '').localeCompare(b.zoneNr ?? '', 'ro', { numeric: true }) || a.label.localeCompare(b.label, 'ro', { numeric: true }))
      if (!list.length) continue
      if (!t.system) rows.push(['§' + systemById(sysId).name])
      let n = 1
      for (const d of list) {
        rows.push([
          `${n++}.`,
          d.module || (sysId === 'EFR' ? 'CAE' : 'CDI'),
          d.zoneNr ?? '',
          d.partition,
          d.zone,
          deviceInfo(p, d).denumire,
          d.label,
          d.zoneType || symbolByType(d.type)?.detection || '',
        ])
      }
    }
    return {
      title: 'Zone protejate' + sysSuffix,
      header: ['Nr.', 'Modul', 'Zona mod.', 'Partiție', 'Zona protejată', 'Denumire echipament', 'Simbol', 'Tip detecție'],
      widths: [4, 6, 9, 8, 14, 26, 7, 11],
      rows,
    }
  }

  if (t.kind === 'cctv') {
    const byZone = new Map<string, string[]>()
    for (const d of p.devices.filter((x) => symbolByType(x.type)?.camera && onLevel(x)).sort((a, b) => a.label.localeCompare(b.label, 'ro', { numeric: true }))) {
      const z = d.zone.trim() || '(nespecificată)'
      byZone.set(z, [...(byZone.get(z) ?? []), d.label])
    }
    return {
      title: 'Zone supravegheate video',
      header: ['Nr.', 'Zona supravegheată', 'Camere alocate'],
      widths: [5, 24, 24],
      rows: [...byZone].map(([z, l], i) => [`${i + 1}.`, z, l.join(', ')]),
    }
  }

  // jurnal de cablu
  const label = (id?: string) => p.devices.find((d) => d.id === id)?.label ?? ''
  const rows = p.cables
    .filter((c) => (!t.system || c.system === t.system) && onLevel(c) && !isRiserRoute(p, c))
    .sort((a, b) => a.code.localeCompare(b.code, 'ro', { numeric: true }))
    .map((c, i) => {
      const e = cableEnds(p, c)
      const m = cableMeters(c, p)
      return [`${i + 1}.`, c.code, label(e.from), label(e.to), c.cableType, m != null ? m.toFixed(1).replace('.', ',') : '']
    })
  return { title: 'Jurnal de cablu' + sysSuffix, header: ['Nr.', 'Cod', 'De la', 'La', 'Tip cablu', 'Lungime (m)'], widths: [4, 8, 7, 7, 20, 8], rows }
}

/** Așezarea tabelului în px de plan, pentru mărimea textului pe hârtie (mm) și px de plan pe mm de hârtie */
export function tableLayoutPx(data: TableData, fontMm: number, pxPerMm: number) {
  const fpx = fontMm * pxPerMm
  const rowH = fpx * 1.7
  const colW = data.widths.map((u) => u * fpx * 0.62)
  const width = colW.reduce((x, y) => x + y, 0)
  const titleH = fpx * 2
  const height = titleH + rowH * (1 + Math.max(1, data.rows.length))
  return { fpx, rowH, colW, width, height, titleH }
}
