export type SystemId = 'EFR' | 'CA' | 'CCTV' | 'INC'

export interface Device {
  id: string
  type: string
  x: number
  y: number
  rotation: number
  label: string
  model: string
  zone: string
  partition: string
  notes: string
  /** Doar camere: unghi de vizualizare (grade) */
  fov?: number
  /** Doar camere: distanța de vizualizare (m) */
  range?: number
}

export interface Cable {
  id: string
  code: string
  system: SystemId
  /** Puncte în coordonate plan: [x1, y1, x2, y2, ...] */
  points: number[]
  from?: string
  to?: string
  cableType: string
  /** Lungime introdusă manual (m); dacă lipsește, se calculează din scară */
  lengthOverride?: number | null
  notes: string
}

export interface TitleBlock {
  proiectant: string
  beneficiar: string
  obiectiv: string
  nrProiect: string
  titluPlansa: string
  nrPlansa: string
  scara: string
  data: string
  intocmit: string
  verificat: string
}

export interface Background {
  src: string
  width: number
  height: number
  name: string
}

export type PageFormat = 'A4' | 'A3' | 'A2'

export interface Project {
  version: 1
  title: TitleBlock
  background: Background | null
  /** Pixeli de plan per metru, din calibrarea scării */
  pxPerMeter: number | null
  symbolSize: number
  cableReservePct: number
  /** Afișează conurile de vizualizare ale camerelor */
  showCones: boolean
  pageFormat: PageFormat
  hidden: SystemId[]
  devices: Device[]
  cables: Cable[]
}

export type Selection = { kind: 'device' | 'cable'; id: string } | null

export type Tool =
  | { kind: 'select' }
  | { kind: 'place'; type: string }
  | { kind: 'scale' }
  | { kind: 'cable' }
