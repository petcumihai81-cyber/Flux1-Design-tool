import type { AccessoryKind, CalcParams, CatalogItem, SystemId } from './types'
import { symbolByType } from './symbols'

export const ACCESSORY_KINDS: { type: AccessoryKind; name: string }[] = [
  { type: 'acc_hdd', name: 'Hard disk' },
  { type: 'acc_acumulator', name: 'Acumulator' },
  { type: 'acc_ups', name: 'UPS' },
  { type: 'acc_sursa', name: 'Sursă / adaptor' },
  { type: 'acc_altele', name: 'Alte materiale' },
]

export const isAccessory = (type: string) => type.startsWith('acc_')

export const kindName = (type: string) =>
  ACCESSORY_KINDS.find((k) => k.type === type)?.name ?? symbolByType(type)?.name ?? type

export const itemSystem = (it: CatalogItem): SystemId => symbolByType(it.type)?.system ?? it.system

export const DEFAULT_CALC: CalcParams = {
  tVegheH: 23.5,
  tAlarmaH: 0.5,
  factorAcumulator: 0.86,
  zileStocare: 30,
  bitrateImplicitKbps: 4096,
  factorActivitate: 0.3,
  cosPhi: 0.8,
  randamentUps: 0.85,
  autonomieMinimaMin: 15,
}

const item = (id: string, type: string, system: SystemId, over: Partial<CatalogItem>): CatalogItem => ({
  id,
  type,
  system,
  prefix: '',
  denumire: '',
  model: '',
  producator: '',
  baterie: false,
  poe: false,
  note: '',
  ...over,
})

/**
 * Catalog inițial, din proiectul de referință (Ajax + Hikvision).
 * Valorile provin din fișele tehnice ale proiectului; câmpurile lipsă se completează de utilizator.
 */
export const SEED_CATALOG: CatalogItem[] = [
  // Efracție — Ajax
  item('ajax-hubbp', 'efr_centrala', 'EFR', {
    prefix: 'CAE',
    denumire: 'Centrală alarmă wireless Ajax HubBP',
    model: 'HubBP',
    producator: 'Ajax',
    tensiuneV: 14.5,
    iVegheMa: 130,
    iAlarmaMa: 400,
    note: 'Comunicare celulară 2× micro SIM; alimentare externă 4.2÷16 Vcc',
  }),
  item('ajax-combiprotect', 'efr_pir', 'EFR', {
    prefix: 'PIRW',
    denumire: 'Detector wireless de mișcare și spargere geam Ajax CombiProtect Jeweller',
    model: 'CombiProtect Jeweller',
    producator: 'Ajax',
    baterie: true,
    tensiuneV: 3,
    note: '1× CR123A, autonomie max. 5 ani',
  }),
  item('ajax-doorprotect', 'efr_cm', 'EFR', {
    prefix: 'CMW',
    denumire: 'Contact magnetic wireless Ajax DoorProtect Jeweller',
    model: 'DoorProtect Jeweller',
    producator: 'Ajax',
    baterie: true,
    tensiuneV: 3,
    note: '1× CR123A, autonomie max. 7 ani',
  }),
  item('ajax-keypadplus', 'efr_tastatura', 'EFR', {
    prefix: 'TAD',
    denumire: 'Tastatură wireless Ajax KeyPad Plus Jeweller',
    model: 'KeyPad Plus Jeweller',
    producator: 'Ajax',
    baterie: true,
    note: '4× AA litiu, autonomie max. 3.5 ani cu cititorul pornit',
  }),
  item('ajax-button', 'efr_panica', 'EFR', {
    prefix: 'BPW',
    denumire: 'Buton de panică wireless Ajax Button Jeweller',
    model: 'Button Jeweller',
    producator: 'Ajax',
    baterie: true,
    tensiuneV: 3,
    note: '1× CR2032, autonomie max. 5 ani',
  }),
  item('ajax-streetsiren', 'efr_sirena_ext', 'EFR', {
    prefix: 'SE',
    denumire: 'Sirenă wireless de exterior Ajax StreetSiren Jeweller',
    model: 'StreetSiren Jeweller',
    producator: 'Ajax',
    baterie: true,
    tensiuneV: 6,
    note: '4× CR123A; opțional alimentare externă 12 Vcc: 25 mA repaus, 0.2 A mediu, 0.7 A vârf',
  }),
  item('ajax-psu-a', 'acc_sursa', 'EFR', {
    denumire: 'Adaptor sursă 12-24V PSU (tip A) Ajax',
    model: '12-24V PSU (tip A)',
    producator: 'Ajax',
    note: 'Intrare 8÷32 Vcc max. 1 A; ieșire 4.8 Vcc 1.5 A',
  }),
  item('kijo-js12-7', 'acc_acumulator', 'EFR', {
    denumire: 'Acumulator Kijo JS12-7',
    model: 'JS12-7',
    producator: 'Kijo',
    tensiuneV: 12,
    capacitateAh: 7,
  }),

  // CCTV — Hikvision
  item('hik-ds7616nxi', 'cctv_nvr', 'CCTV', {
    prefix: 'NVR',
    denumire: 'NVR 16 canale Hikvision DS-7616NXI-K2/VPro',
    model: 'DS-7616NXI-K2/VPro',
    producator: 'Hikvision',
    tensiuneV: 12,
    putereW: 15,
    note: '≤ 15 W fără HDD; 2 sloturi HDD',
  }),
  item('hik-2083g2', 'cctv_bullet_ext', 'CCTV', {
    prefix: 'CVIE',
    denumire: 'Cameră video color tip bullet Hikvision DS-2CD2083G2-LI2U-2.8mm',
    model: 'DS-2CD2083G2-LI2U-2.8mm',
    producator: 'Hikvision',
    poe: true,
    tensiuneV: 12,
    putereW: 6,
    poeW: 6,
    note: '8 MP; obiectiv 2.8 mm; IR max. 40 m; PoE 802.3af',
  }),
  item('hik-2087g2h', 'cctv_bullet_ext', 'CCTV', {
    prefix: 'CVIE',
    denumire: 'Cameră video color tip bullet Hikvision DS-2CD2087G2H-LIU-2.8mm',
    model: 'DS-2CD2087G2H-LIU-2.8mm',
    producator: 'Hikvision',
    poe: true,
    tensiuneV: 12,
    putereW: 7,
    poeW: 7,
    fovDeg: 105.1,
    note: '8 MP; obiectiv 2.8 mm; FOV orizontal 105.1°, vertical 54.8°; IR până la 40 m; PoE 802.3af',
  }),
  item('hik-3e0310hp', 'cctv_switch', 'CCTV', {
    prefix: 'SW',
    denumire: 'Switch 8 porturi PoE Hikvision DS-3E0310HP-E',
    model: 'DS-3E0310HP-E',
    producator: 'Hikvision',
    tensiuneV: 48,
    putereW: 120,
    poeBugetW: 110,
    note: 'Port 1: 90 W (802.3bt); porturile 2÷8: 30 W',
  }),
  item('wd-wd80purx', 'acc_hdd', 'CCTV', {
    denumire: 'Hard disk 8TB Western Digital PURPLE WD80PURX',
    model: 'WD80PURX',
    producator: 'Western Digital',
    putereW: 6.4,
    capacitateTB: 8,
  }),
  item('tsy-tmli2k0', 'acc_ups', 'CCTV', {
    denumire: 'Sursă neîntreruptibilă TSY Power UPS TM-LI-2k0-LCD',
    model: 'TM-LI-2k0-LCD',
    producator: 'TSY Power',
    upsVA: 2000,
    upsW: 1200,
    upsWh: 216,
    note: 'Baterii 2× 12 V / 9 Ah',
  }),
]

const LIB_KEY = 'plansa-securitate:catalog'

/** Catalogul implicit pentru proiecte noi: cel salvat de utilizator sau cel inițial */
export function defaultCatalog(): CatalogItem[] {
  try {
    const raw = localStorage.getItem(LIB_KEY)
    if (raw) {
      const v = JSON.parse(raw)
      if (Array.isArray(v)) return v
    }
  } catch {
    /* ignorat */
  }
  return SEED_CATALOG.map((i) => ({ ...i }))
}

export function saveDefaultCatalog(items: CatalogItem[]): boolean {
  try {
    localStorage.setItem(LIB_KEY, JSON.stringify(items))
    return true
  } catch {
    return false
  }
}

export function newCatalogItem(type: string, system: SystemId): CatalogItem {
  return item(Math.random().toString(36).slice(2, 10), type, system, {})
}
