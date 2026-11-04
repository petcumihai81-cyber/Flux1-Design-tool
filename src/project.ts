import type { Cable, Device, Project, SystemId } from './types'
import { SYSTEMS, symbolByType } from './symbols'

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)

export function emptyProject(): Project {
  return {
    version: 1,
    title: {
      proiectant: 'ASL Security Solutions SRL',
      beneficiar: '',
      obiectiv: '',
      nrProiect: '',
      titluPlansa: 'Plan amplasare echipamente',
      nrPlansa: 'P01',
      scara: '1:100',
      data: new Date().toLocaleDateString('ro-RO'),
      intocmit: '',
      verificat: '',
    },
    background: null,
    pxPerMeter: null,
    symbolSize: 32,
    cableReservePct: 10,
    showCones: true,
    pageFormat: 'A3',
    hidden: [],
    devices: [],
    cables: [],
  }
}

/** Următorul cod liber pentru un prefix: PIR01, PIR02... */
export function nextLabel(prefix: string, labels: string[]): string {
  let max = 0
  const re = new RegExp('^' + prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\d+)$')
  for (const l of labels) {
    const m = l.match(re)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return prefix + String(max + 1).padStart(2, '0')
}

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
export function cableMeters(c: Cable, p: Project): number | null {
  if (c.lengthOverride != null && !Number.isNaN(c.lengthOverride)) return c.lengthOverride
  if (!p.pxPerMeter) return null
  const raw = polylineLength(c.points) / p.pxPerMeter
  return Math.ceil(raw * (1 + p.cableReservePct / 100))
}

export function nextCableCode(system: SystemId, cables: Cable[]): string {
  const prefix = SYSTEMS.find((s) => s.id === system)!.cablePrefix + '-'
  return nextLabel(prefix, cables.map((c) => c.code))
}

export function contentBounds(p: Project, visibleOnly = true) {
  if (p.background) return { x: 0, y: 0, width: p.background.width, height: p.background.height }
  const hidden = new Set(visibleOnly ? p.hidden : [])
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
  return !!v && typeof v === 'object' && (v as Project).version === 1 && Array.isArray((v as Project).devices)
}

/** Completează câmpurile lipsă (fișiere salvate cu versiuni mai vechi) */
export function normalizeProject(v: Project): Project {
  const base = emptyProject()
  return { ...base, ...v, title: { ...base.title, ...v.title }, cables: v.cables ?? [], hidden: v.hidden ?? [] }
}
