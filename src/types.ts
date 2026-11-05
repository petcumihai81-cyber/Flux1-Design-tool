export type SystemId = 'EFR' | 'CA' | 'CCTV' | 'INC' | 'NET'

export interface Device {
  id: string
  /** Nivelul (planul) pe care e amplasat */
  levelId: string
  type: string
  x: number
  y: number
  rotation: number
  label: string
  model: string
  /** Echipamentul din catalog (model, producător, consumuri) */
  catalogId?: string
  zone: string
  partition: string
  /** Modulul la care e conectat (ex. CAE, MOD1) — tabel zone efracție */
  module?: string
  /** Numărul zonei pe modul */
  zoneNr?: string
  /** Tip zonă: întârziere / instantanee / 24h... */
  zoneType?: string
  notes: string
  /** Oglindire simbol (orizontal / vertical) */
  flipX?: boolean
  flipY?: boolean
  /** Doar camere: unghi de vizualizare (grade) */
  fov?: number
  /** Doar camere: distanța de vizualizare (m) */
  range?: number
  /** Culoare proprie a simbolului (lipsă = culoarea sistemului) */
  color?: string
  /** Simbol personalizat (aspect); comportamentul rămâne al tipului `type` */
  symbolId?: string
}

/**
 * Simbol încărcat de utilizator (SVG sau imagine). Arată altfel, dar se comportă ca simbolul standard `base`
 * (sistem, cabluri, conuri, liste, calcule).
 */
export interface CustomSymbol {
  id: string
  name: string
  /** Tipul de simbol standard al cărui comportament îl preia (ex. cctv_dome_int) */
  base: string
  /** Prefix de numerotare propriu; gol = prefixul simbolului de bază */
  prefix: string
  kind: 'svg' | 'img'
  /** SVG normalizat (casetă 40×40) sau PNG (data URL) normalizat, cu fundal transparent */
  data: string
  /** Se poate recolora: SVG — culorile devin culoarea aleasă; imagine — pictogramă monocromă colorată */
  recolor: boolean
}

/** Element de arhitectură desenat manual (schiță): perete, ușă, fereastră, text încăpere, cotă */
/** riser = trecere verticală între niveluri (ghenă); același nume pe niveluri diferite = aceeași ghenă */
export type ArchKind = 'wall' | 'door' | 'window' | 'label' | 'dim' | 'riser' | 'rect' | 'ellipse' | 'image' | 'table'

/** Tabel așezat pe planșă, generat din proiect */
export interface SheetTable {
  kind: 'echipamente' | 'zone' | 'cctv' | 'cabluri'
  /** Doar un sistem (lipsă = toate) */
  system?: SystemId
  /** Doar elementele nivelului pe care stă tabelul */
  levelOnly?: boolean
  /** Înălțimea textului pe hârtie (mm) */
  fontMm?: number
}

export interface ArchElement {
  id: string
  levelId: string
  kind: ArchKind
  /** Perete: polilinie; cotă: [x1, y1, x2, y2] */
  points?: number[]
  /** Grosimea peretelui (m) */
  thickness?: number
  /** Ușă / fereastră / text: poziție (centru) și rotire */
  x?: number
  y?: number
  rotation?: number
  /** Lățimea golului (m) */
  width?: number
  /** Ușă: balamaua pe partea cealaltă / deschidere spre partea cealaltă */
  flipX?: boolean
  flipY?: boolean
  /** Text: conținut și înălțimea literelor (m) */
  text?: string
  size?: number
  /** Zonă (dreptunghi / elipsă) și imagine: înălțimea (m); lățimea e `width`; poziția (x, y) e centrul */
  height?: number
  /** Zonă: contur, umplere și opacitatea umplerii (0…1), contur punctat, afișarea ariei */
  stroke?: string
  fill?: string
  fillOpacity?: number
  dashed?: boolean
  showArea?: boolean
  /** Imagine (data URL); în browser se păstrează separat, în IndexedDB */
  src?: string
  /** Tabel generat din proiect */
  table?: SheetTable
}

export interface Cable {
  id: string
  levelId: string
  code: string
  system: SystemId
  /** Puncte în coordonate plan: [x1, y1, x2, y2, ...] */
  points: number[]
  from?: string
  to?: string
  cableType: string
  /**
   * Ramificație: cablul se termină pe alt cablu și merge pe traseul acestuia până la capătul indicat
   * (ex. două camere pe același jgheab până la switch)
   */
  via?: { cableId: string; end: 'from' | 'to' }
  /** Capătul fără echipament se află la trecerea verticală (ghena) cu acest nume */
  riser?: string
  /** Lungime introdusă manual (m); dacă lipsește, se calculează din scară */
  lengthOverride?: number | null
  notes: string
}

/** Categorii de accesorii fără simbol pe plan */
export type AccessoryKind = 'acc_hdd' | 'acc_acumulator' | 'acc_ups' | 'acc_sursa' | 'acc_altele'

/** Rând de fișă tehnică: titlu de secțiune sau parametru + valoare */
export type SpecRow = { section: string } | { label: string; value: string }

export interface CatalogItem {
  id: string
  /** Tipul de simbol (efr_pir, cctv_nvr...) sau categoria de accesoriu (acc_hdd...) */
  type: string
  /** Sistemul (pentru accesorii; la simboluri rezultă din simbol) */
  system: SystemId
  /** Prefix propriu pentru numerotare (ex. PIRW, CMW, CVIE); gol = prefixul simbolului */
  prefix: string
  denumire: string
  model: string
  producator: string
  /** Alimentat din baterie proprie (wireless) — nu intră în calculul acumulatorilor */
  baterie: boolean
  /** Alimentat prin PoE — nu intră în bilanțul de putere separat dacă există switch PoE */
  poe: boolean
  tensiuneV?: number
  iVegheMa?: number
  iAlarmaMa?: number
  putereW?: number
  /** Consum PoE (W) */
  poeW?: number
  /** Buget PoE (W) — switch */
  poeBugetW?: number
  /** Bitrate (kbps) — camere */
  bitrateKbps?: number
  /** Unghi de vizualizare orizontal (°) — camere; folosit pentru con */
  fovDeg?: number
  /** Distanța utilă de vizualizare (m) — camere; folosită pentru con */
  rangeM?: number
  /** Capacitate acumulator (Ah) */
  capacitateAh?: number
  /** Capacitate HDD (TB) */
  capacitateTB?: number
  /** UPS: putere aparentă (VA) și energie baterii (Wh) */
  upsVA?: number
  upsW?: number
  upsWh?: number
  note: string
  /** Fișa tehnică completă (pentru memoriu), pe secțiuni */
  specs?: SpecRow[]
  /** Simbol personalizat folosit la plasarea acestui echipament */
  symbolId?: string
}

export interface Accessory {
  id: string
  catalogId: string
  qty: number
}

export interface CalcParams {
  tVegheH: number
  tAlarmaH: number
  /** Factor de descărcare acumulator (0.86) */
  factorAcumulator: number
  zileStocare: number
  bitrateImplicitKbps: number
  /** Procent activitate pentru înregistrare la detecție de mișcare */
  factorActivitate: number
  cosPhi: number
  /** Randament UPS pentru estimarea autonomiei */
  randamentUps: number
  autonomieMinimaMin: number
}

/** Datele memoriului tehnic (completate în dialogul „Memoriu”) */
export interface MemoriuData {
  cui: string
  sediuSocial: string
  activitate: string
  caen: string
  caenDenumire: string
  vecinN: string
  vecinE: string
  vecinS: string
  vecinV: string
  accesPietonal: string
  accesAuto: string
  constructie: string
  cerinteMinimale: string
  /** Cele 8 zone funcționale (HG 301/2012), în ordine */
  zoneFunctionale: string[]
  mecanoFizice: string
  circuite: string
  upsSursa: string
  comunicator: string
  timpIesireS: string
  timpIntrareS: string
  directorTehnic: string
  proiectantNume: string
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

/** Element al unei scheme editate manual */
export interface DiagramNode {
  id: string
  /** device = bloc legat de un echipament de pe plan; text = text liber; rect = chenar / grupare */
  kind: 'device' | 'text' | 'rect'
  deviceId?: string
  x: number
  y: number
  w: number
  h: number
  text?: string
  color?: string
  dashed?: boolean
  fontSize?: number
}

export interface DiagramEdge {
  id: string
  from: string
  to: string
  label: string
  dashed: boolean
  color?: string
  /**
   * Traseu manual: colțurile intermediare [x1, y1, x2, y2, ...]; capetele se calculează pe laturile blocurilor
   * (alunecă pe latură după primul / ultimul colț). Lipsă = traseu automat.
   */
  points?: number[]
}

export interface Diagram {
  nodes: DiagramNode[]
  edges: DiagramEdge[]
}

/** Nivel / plan al clădirii (Parter, Etaj 1...): fundal, scară și mărimea simbolurilor proprii */
export interface Level {
  id: string
  name: string
  /** Planul de fundal; null = pagină albă (schiță) */
  background: Background | null
  /** Pixeli de plan per metru, din calibrarea scării */
  pxPerMeter: number | null
  symbolSize: number
  /** Înălțimea nivelului (m), pentru lungimea cablurilor care trec prin ghene între niveluri */
  heightM?: number
  /**
   * Pagină albă: centrul zonei de desen a planșei (coordonate plan).
   * Lipsește la fișierele vechi: zona se centrează pe desen.
   */
  pageCenter?: { x: number; y: number }
  /** Planul de fundal: deplasare (px plan), rotire (grade, în jurul centrului), estompare 0…0,9 și blocare */
  bgX?: number
  bgY?: number
  bgRotation?: number
  bgFade?: number
  /** Lipsă = blocat */
  bgLocked?: boolean
}

export interface Sheet {
  id: string
  /** Nivelul afișat (planșele de tip plan) */
  levelId?: string
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
  /** Straturi ascunse pe această planșă (ex. 'arh:cote', 'EFR:etichete', 'fundal'); vezi layers.ts */
  hiddenLayers?: string[]
  /** Straturi blocate (se văd, dar nu se pot selecta sau muta) */
  lockedLayers?: string[]
  /** Afișează conurile de vizualizare ale camerelor */
  showCones: boolean
  /** Schema bloc editată manual (lipsă = generată automat) */
  diagram?: Diagram
}

export interface Project {
  version: 2
  title: TitleBlock
  /** Nivelurile clădirii, fiecare cu fundalul și scara lui */
  levels: Level[]
  cableReservePct: number
  sheets: Sheet[]
  activeSheetId: string
  /** Numerotare cu două cifre (PIR01) sau fără (PIR1) */
  numberPad: boolean
  catalog: CatalogItem[]
  accessories: Accessory[]
  calc: CalcParams
  memoriu: MemoriuData
  devices: Device[]
  cables: Cable[]
  /** Schița de arhitectură (comună tuturor planșelor de tip plan) */
  arch: ArchElement[]
  /** Simbolurile încărcate de utilizator */
  customSymbols: CustomSymbol[]
}

export type Selection = { kind: 'device' | 'cable' | 'arch'; id: string } | null

/** Element de arhitectură nou (id-ul și nivelul se completează la adăugare) */
export type NewArch = Omit<ArchElement, 'id' | 'levelId'>

export type ArchTool = 'wall-ext' | 'wall-int' | 'door' | 'window' | 'label' | 'dim' | 'riser' | 'rect' | 'ellipse' | 'image' | 'table'

export type Tool =
  | { kind: 'select' }
  | { kind: 'place'; type: string; catalogId?: string; symbolId?: string }
  | { kind: 'scale' }
  | { kind: 'cable' }
  | { kind: 'arch'; arch: ArchTool }
