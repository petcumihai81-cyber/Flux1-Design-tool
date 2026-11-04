export type SystemId = 'EFR' | 'CA' | 'CCTV' | 'INC' | 'NET'

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

/** Date comune tuturor planșelor (cartuș) */
export interface TitleBlock {
  proiectant: string
  beneficiar: string
  obiectiv: string
  nrProiect: string
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

export type PageFormat = 'A0' | 'A1' | 'A2' | 'A3' | 'A4' | 'CUSTOM'
export type Orientation = 'landscape' | 'portrait'

export interface Sheet {
  id: string
  /** plan = plan de amplasare; bloc = schemă bloc generată automat */
  kind: 'plan' | 'bloc'
  titlu: string
  nr: string
  scara: string
  format: PageFormat
  orientation: Orientation
  /** Dimensiuni (mm) pentru format personalizat */
  customW: number
  customH: number
  /** Sistemele afișate (pentru schemă bloc: un singur sistem) */
  systems: SystemId[]
  /** Afișează conurile de vizualizare ale camerelor */
  showCones: boolean
}

export interface Project {
  version: 2
  title: TitleBlock
  background: Background | null
  /** Pixeli de plan per metru, din calibrarea scării */
  pxPerMeter: number | null
  symbolSize: number
  cableReservePct: number
  sheets: Sheet[]
  activeSheetId: string
  devices: Device[]
  cables: Cable[]
}

export type Selection = { kind: 'device' | 'cable'; id: string } | null

export type Tool =
  | { kind: 'select' }
  | { kind: 'place'; type: string }
  | { kind: 'scale' }
  | { kind: 'cable' }
