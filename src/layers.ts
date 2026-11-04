/**
 * Straturile planșei de plan (ca în AutoCAD / Photoshop): vizibilitate și blocare, pe planșă.
 * Aceleași straturi ca la exportul DXF. Sistemul întreg se arată / ascunde din `Sheet.systems`,
 * conurile din `Sheet.showCones`; restul în `Sheet.hiddenLayers` / `Sheet.lockedLayers`.
 */
import type { ArchElement, Sheet, SystemId } from './types'

export type LayerKey = string

export interface LayerDef {
  key: LayerKey
  name: string
}

export interface LayerGroup {
  /** 'fundal', 'arh' sau id-ul sistemului */
  id: string
  name: string
  color: string
  layers: LayerDef[]
}

export const ARCH_LAYERS: LayerDef[] = [
  { key: 'arh:pereti', name: 'Pereți' },
  { key: 'arh:goluri', name: 'Uși și ferestre' },
  { key: 'arh:text', name: 'Texte încăperi' },
  { key: 'arh:cote', name: 'Cote' },
  { key: 'arh:ghene', name: 'Ghene / treceri' },
]

export const systemLayers = (sys: SystemId): LayerDef[] => [
  { key: `${sys}:echipamente`, name: 'Echipamente (simboluri)' },
  { key: `${sys}:etichete`, name: 'Etichete (coduri)' },
  { key: `${sys}:cabluri`, name: 'Trasee cabluri' },
  ...(sys === 'CCTV' ? [{ key: 'CCTV:conuri', name: 'Conuri de vizualizare' }] : []),
]

/** Stratul unui element de arhitectură */
export function archLayer(a: Pick<ArchElement, 'kind'>): LayerKey {
  switch (a.kind) {
    case 'wall':
      return 'arh:pereti'
    case 'door':
    case 'window':
      return 'arh:goluri'
    case 'label':
      return 'arh:text'
    case 'dim':
      return 'arh:cote'
    default:
      return 'arh:ghene'
  }
}

/** Stratul e vizibil pe planșă (ține cont și de sistemul întreg și de conuri) */
export function layerVisible(sh: Sheet, key: LayerKey): boolean {
  if (key === 'CCTV:conuri' && !sh.showCones) return false
  const sys = key.split(':')[0]
  if (sys !== 'arh' && sys !== 'fundal' && !sh.systems.includes(sys as SystemId)) return false
  return !(sh.hiddenLayers ?? []).includes(key)
}

export const layerLocked = (sh: Sheet, key: LayerKey): boolean => (sh.lockedLayers ?? []).includes(key)

/** Modificarea planșei la comutarea vizibilității unui strat */
export function toggleLayerVisible(sh: Sheet, key: LayerKey): Partial<Sheet> {
  if (key === 'CCTV:conuri') {
    // conurile au câmpul lor (compatibil cu fișierele vechi)
    const hidden = (sh.hiddenLayers ?? []).filter((k) => k !== key)
    return { showCones: !layerVisible(sh, key), hiddenLayers: hidden }
  }
  const h = new Set(sh.hiddenLayers ?? [])
  if (h.has(key)) h.delete(key)
  else h.add(key)
  return { hiddenLayers: [...h] }
}

export function toggleLayerLocked(sh: Sheet, key: LayerKey): Partial<Sheet> {
  const l = new Set(sh.lockedLayers ?? [])
  if (l.has(key)) l.delete(key)
  else l.add(key)
  return { lockedLayers: [...l] }
}
