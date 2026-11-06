/**
 * Versiunea aplicației și jurnalul de actualizări (fereastra „Despre”).
 * Versiunea = 1.<numărul PR-ului unit>; la fiecare PR se adaugă o intrare SUS în `CHANGELOG`
 * și se pune aceeași versiune în package.json.
 */

export interface Release {
  version: string
  /** Data unirii (AAAA-LL-ZZ) */
  date: string
  pr: number
  title: string
  /** Detalii (opțional) */
  items?: string[]
}

/** Valorile de build (vite.config.ts): versiunea din package.json, data și commit-ul */
export const APP_VERSION: string = __APP_VERSION__
export const BUILD_DATE: string = __BUILD_DATE__
export const BUILD_COMMIT: string = __BUILD_COMMIT__
export const REPO_URL = 'https://github.com/petcumihai81-cyber/Flux1-Design-tool'

export const CHANGELOG: Release[] = [
  {
    version: '1.46',
    date: '2026-11-06',
    pr: 46,
    title: 'DXF: tabelele și imaginile de pe planșă',
    items: [
      'Tabelele (echipamente, zone, CCTV, cabluri) intră în DXF cu grilă și text, la mărimea de pe hârtie (stratul ADN_TABELE).',
      'Imaginile apar ca un contur cu X și numele fișierului (stratul ADN_IMAGINI), pentru că DXF R12 nu poate conține poze.',
    ],
  },
  {
    version: '1.45',
    date: '2026-11-06',
    pr: 45,
    title: 'Hașură configurabilă pe zone',
    items: [
      'Zonele (dreptunghi, elipsă, poligon) primesc hașură: diagonal, încrucișat, orizontal, vertical, carouri sau puncte, cu distanța în mm pe hârtie.',
      'Hașura apare pe plan, în PDF și în DXF (stratul ADN_ZONE_HASURA).',
    ],
  },
  {
    version: '1.44',
    date: '2026-11-06',
    pr: 44,
    title: 'Ecran mic: paleta și panoul ca sertare',
    items: [
      'Pe telefon și pe tableta ținută vertical, paleta și panoul din dreapta se deschid din butoanele „☰ Simboluri” și „Panou ⚙” și se închid la o atingere pe plan.',
      'Bara de sus se derulează orizontal; ferestrele (asistentul, „Nou”) se așază pe coloană.',
    ],
  },
  {
    version: '1.43',
    date: '2026-11-06',
    pr: 43,
    title: 'Fereastra „Despre”: versiune, noutăți și funcții',
    items: ['Click pe numele aplicației (sus, stânga): versiunea, data build-ului, jurnalul de actualizări și lista funcțiilor.', 'După o actualizare, un punct arată că sunt noutăți.'],
  },
  {
    version: '1.42',
    date: '2026-11-06',
    pr: 42,
    title: 'Ferestre proprii în locul celor ale browserului',
    items: ['Textul notei, numele zonelor, ghenele, calibrarea scării și toate confirmările se deschid într-o fereastră a aplicației.', 'Nota are câmp pe mai multe rânduri (Ctrl+Enter = gata).'],
  },
  {
    version: '1.41',
    date: '2026-11-06',
    pr: 41,
    title: 'Suport pentru ecran tactil',
    items: ['Atingere = click, tragere cu un deget = mutare, două degete = zoom, apăsare lungă = meniul de click dreapta.'],
  },
  { version: '1.40', date: '2026-11-06', pr: 40, title: 'Export / import al bibliotecii de simboluri', items: ['Fișier .simboluri.json; importul acceptă și proiecte, șabloane și pachete .zip.'] },
  {
    version: '1.39',
    date: '2026-11-06',
    pr: 39,
    title: 'DXF: conurile camerelor hașurate',
    items: ['Strat nou CCTV_CONURI_HASURA.', 'Reparat: textul notelor și săgețile ieșeau prea mici în DXF.'],
  },
  { version: '1.38', date: '2026-11-06', pr: 38, title: 'Pachet proiect .zip', items: ['Proiectul cu planurile, imaginile, simbolurile și logo-ul ca fișiere, plus documentele de predare.'] },
  { version: '1.37', date: '2026-11-06', pr: 37, title: 'Asistent pentru proiect nou', items: ['Pas cu pas: beneficiar, clădire și planuri, sisteme și planșe, cartuș, memoriu, rezumat.'] },
  { version: '1.36', date: '2026-11-06', pr: 36, title: 'Șabloane de proiect', items: ['Șabloane de bază (casă, birou, magazin) și șabloanele tale, cu export / import.'] },
  { version: '1.35', date: '2026-11-06', pr: 35, title: 'Logo-ul firmei în cartuș' },
  { version: '1.34', date: '2026-11-06', pr: 34, title: 'Zone poligonale pe planșă', items: ['Orice formă, cu arie calculată.'] },
  { version: '1.33', date: '2026-11-06', pr: 33, title: 'BACKLOG actualizat' },
  { version: '1.32', date: '2026-11-06', pr: 32, title: 'Linii și săgeți libere pe plan' },
  { version: '1.31', date: '2026-11-06', pr: 31, title: 'Note cu săgeată pe plan' },
  { version: '1.30', date: '2026-11-05', pr: 30, title: 'BACKLOG: ideile pe priorități și funcțiile realizate' },
  { version: '1.29', date: '2026-11-05', pr: 29, title: 'Zone, imagini și tabele pe planșă' },
  { version: '1.28', date: '2026-11-05', pr: 28, title: 'Bară de zoom: procent, presetări, încadrare, mărire pe selecție' },
  { version: '1.27', date: '2026-11-05', pr: 27, title: 'File de planșe ca în Excel: meniu, duplicare, redenumire, reordonare' },
  { version: '1.26', date: '2026-11-04', pr: 26, title: 'Straturi pe planșe: arată / ascunde și blocare' },
  { version: '1.25', date: '2026-11-04', pr: 25, title: 'Culoarea simbolurilor și simboluri personalizate' },
  { version: '1.24', date: '2026-11-04', pr: 24, title: 'Ghid: capturi noi și actualizate' },
  { version: '1.23', date: '2026-11-04', pr: 23, title: 'Editor de schemă: trasee manuale, selecție multiplă, aliniere și distribuire' },
  { version: '1.22', date: '2026-11-04', pr: 22, title: 'Verificare înainte de predare' },
  { version: '1.21', date: '2026-11-04', pr: 21, title: 'Alegerea paginii din PDF-urile cu mai multe pagini' },
  { version: '1.20', date: '2026-11-04', pr: 20, title: 'Planul de fundal: estompare, blocare, mutare și rotire' },
  { version: '1.19', date: '2026-11-04', pr: 19, title: 'Import DXF ca plan de fundal' },
  { version: '1.18', date: '2026-11-04', pr: 18, title: 'Zona de desen a planșei pe pagina albă' },
  { version: '1.17', date: '2026-11-04', pr: 17, title: 'Export DXF pentru AutoCAD' },
  { version: '1.16', date: '2026-11-04', pr: 16, title: 'Fișe tehnice în catalog și în memoriu' },
  { version: '1.15', date: '2026-11-04', pr: 15, title: 'Cabluri între etaje prin ghene și nivelul în liste' },
  { version: '1.14', date: '2026-11-04', pr: 14, title: 'Selecție multiplă pe plan' },
  { version: '1.13', date: '2026-11-04', pr: 13, title: 'Salvare automată sigură pentru planurile mari și indicator de modificări nesalvate' },
  { version: '1.12', date: '2026-11-04', pr: 12, title: 'Redimensionarea ușilor și ferestrelor direct pe plan' },
  { version: '1.11', date: '2026-11-04', pr: 11, title: 'Simboluri potrivite pentru planșă, editarea textelor și oglindirea simbolurilor' },
  { version: '1.10', date: '2026-11-04', pr: 10, title: 'Niveluri (Parter, Etaj 1, Etaj 2…) cu plan propriu' },
  { version: '1.9', date: '2026-11-04', pr: 9, title: 'Schiță de arhitectură și previzualizare PDF' },
  { version: '1.8', date: '2026-11-04', pr: 8, title: 'Ghid de utilizare în aplicație, cu capturi de ecran' },
  { version: '1.7', date: '2026-11-04', pr: 7, title: 'Ramificații de cablu și capete de cablu editabile' },
  { version: '1.6', date: '2026-11-04', pr: 6, title: 'Rotirea la toate simbolurile, cu textul păstrat drept' },
  { version: '1.5', date: '2026-11-04', pr: 5, title: 'Meniu la click dreapta și copiere / tăiere / lipire pe plan' },
  { version: '1.4', date: '2026-11-04', pr: 4, title: 'Reglarea conurilor camerelor direct pe plan și din catalog' },
  { version: '1.3', date: '2026-11-04', pr: 3, title: 'Editor de schemă bloc în stilul draw.io' },
  { version: '1.2', date: '2026-11-04', pr: 2, title: 'Generare memoriu tehnic .docx pentru avizare' },
  { version: '1.1', date: '2026-11-04', pr: 1, title: 'Planșe multiple, scheme bloc, rețea date, catalog și calcule' },
]

/** Funcțiile aplicației, pe grupe (tab-ul „Funcții”) */
export const FEATURES: { group: string; items: string[] }[] = [
  {
    group: 'Proiect',
    items: [
      'Proiect nou gol, din șablon sau cu asistentul pas cu pas',
      'Mai multe niveluri (subsol, parter, etaje), fiecare cu planul și scara lui',
      'Salvare .plansa.json, pachet .zip cu toate fișierele, salvare automată în browser',
      'Logo-ul firmei și datele din cartuș; verificare înainte de predare',
    ],
  },
  {
    group: 'Planșe și desen',
    items: [
      'Plan de fundal PDF (orice pagină), imagine sau DXF; estompare, blocare, rotire',
      'Schiță de arhitectură: pereți, uși, ferestre, texte, cote, ghene',
      'Mai multe planșe A0–A4 cu file ca în Excel, straturi arată / ascunde / blocare',
      'Zone (dreptunghi, elipsă, poligon) cu arie și hașură, note cu săgeată, linii, imagini, tabele',
      'Zoom raportat la planșa tipărită; ecran tactil, cu sertare pe ecran mic',
    ],
  },
  {
    group: 'Echipamente și cabluri',
    items: [
      'Bibliotecă de simboluri pe 5 sisteme (efracție, control acces, CCTV, incendiu, rețea), numerotare automată',
      'Conuri de vizualizare la scară, reglate direct pe plan',
      'Culoare proprie și simboluri personalizate (SVG / PNG), cu bibliotecă exportabilă',
      'Trasee de cablu cu lungimi, ramificații și treceri între niveluri prin ghene',
      'Catalog de echipamente cu fișe tehnice complete',
    ],
  },
  {
    group: 'Scheme bloc',
    items: ['Generate automat din plan', 'Editor în stilul draw.io: trasee manuale, aliniere, distribuire', 'Export .drawio'],
  },
  {
    group: 'Calcule și documente',
    items: [
      'Acumulatori, stocare video, bilanț TVCI / UPS, buget PoE',
      'PDF cu chenar, legendă și cartuș; previzualizare',
      'Excel: echipamente, zone protejate, jurnal de cablu, breviar de calcul',
      'Memoriu tehnic .docx în formatul avizat',
      'DXF pentru AutoCAD, cu straturi și blocuri',
    ],
  },
]
