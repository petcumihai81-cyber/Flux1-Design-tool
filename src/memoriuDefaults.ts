import type { MemoriuData } from './types'

export const ZONE_FUNCTIONALE = [
  'Zona de acces în obiectiv și zona perimetrală',
  'Zona de tranzacționare',
  'Zona de depozitare',
  'Zona de expunere',
  'Zona de transfer',
  'Zona de procesare',
  'Zona echipamentelor de securitate',
  'Alte zone cu regim de securitate ridicat',
]

export function defaultMemoriu(): MemoriuData {
  return {
    cui: '',
    sediuSocial: '',
    activitate: '',
    caen: '',
    caenDenumire: '',
    vecinN: '',
    vecinE: '',
    vecinS: '',
    vecinV: '',
    accesPietonal: '',
    accesAuto: '',
    constructie: '',
    cerinteMinimale: 'Nu există cerințe minimale pentru aceste tipuri de obiective.',
    zoneFunctionale: [
      'Este constituită din accesul pietonal în obiectiv.',
      'Nu există.',
      'Nu există.',
      'Nu există.',
      'Nu există.',
      'Nu există.',
      'Zona unde sunt amplasate echipamentele centrale ale sistemelor de securitate.',
      'Nu există.',
    ],
    mecanoFizice: '',
    circuite: '',
    upsSursa: 'pus la dispoziție de beneficiar',
    comunicator: 'GPRS',
    timpIesireS: '10',
    timpIntrareS: '10',
    directorTehnic: '',
    proiectantNume: '',
  }
}
