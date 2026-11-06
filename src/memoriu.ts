import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  UnderlineType,
  WidthType,
} from 'docx'
import type { CatalogItem, Project, SystemId } from './types'
import { SYSTEMS, symbolByType } from './symbols'
import { catalogItem, deviceInfo, deviceSystem, levelOf } from './project'
import { batteryCalc, poeCalc, powerCalc, storageCalc } from './calc'
import { isAccessory, kindName } from './catalog'
import { ZONE_FUNCTIONALE } from './memoriuDefaults'
import { downloadBlob } from './download'

/**
 * Generează memoriul tehnic (.docx) după tiparul documentațiilor avizate:
 * Preambul, Cap. I–VIII, breviar de calcul, liste, zone, fișe tehnice, semnături.
 * Câmpurile necompletate apar ca „[DE COMPLETAT]”, evidențiate cu galben.
 */

const FONT = 'Arial'
const SZ = 22 // 11 pt
const MISSING = '[DE COMPLETAT]'

type Part = string | { t: string; b?: boolean; i?: boolean; miss?: boolean }

const has = (s?: string | null) => !!s && s.trim().length > 0
/** Valoare din proiect sau marcaj „de completat” */
const v = (s?: string | null): Part => (has(s) ? s!.trim() : { t: MISSING, miss: true })

function runs(parts: Part[], base: { size?: number; bold?: boolean } = {}) {
  return parts.map((p) =>
    typeof p === 'string'
      ? new TextRun({ text: p, font: FONT, size: base.size ?? SZ, bold: base.bold })
      : new TextRun({
          text: p.t,
          font: FONT,
          size: base.size ?? SZ,
          bold: p.b ?? base.bold,
          italics: p.i,
          highlight: p.miss ? 'yellow' : undefined,
        }),
  )
}

/** Paragraf de text (justificat, cu alineat) */
const P = (...parts: Part[]) =>
  new Paragraph({ children: runs(parts), alignment: AlignmentType.JUSTIFIED, spacing: { after: 120, line: 276 }, indent: { firstLine: 567 } })

/** Rând de listă („- text”) */
const LI = (...parts: Part[]) =>
  new Paragraph({ children: runs(['- ', ...parts]), alignment: AlignmentType.JUSTIFIED, spacing: { after: 60 }, indent: { left: 851 } })

/** Titlu de capitol: majuscule, bold, subliniat, 14 pt */
const H1 = (text: string) =>
  new Paragraph({
    children: [new TextRun({ text, bold: true, underline: { type: UnderlineType.SINGLE }, size: 28, font: FONT })],
    spacing: { before: 360, after: 200 },
    keepNext: true,
  })

/** Subcapitol (II.1 etc.): bold, subliniat, 14 pt */
const H2 = (text: string) =>
  new Paragraph({
    children: [new TextRun({ text, bold: true, underline: { type: UnderlineType.SINGLE }, size: 28, font: FONT })],
    spacing: { before: 240, after: 120 },
    keepNext: true,
  })

/** Subsecțiune (subsistem): bold, subliniat, 12 pt */
const H3 = (text: string) =>
  new Paragraph({
    children: [new TextRun({ text, bold: true, underline: { type: UnderlineType.SINGLE }, size: 24, font: FONT })],
    spacing: { before: 200, after: 120 },
    keepNext: true,
  })

/** Titlu bold fără subliniere */
const B = (text: string) =>
  new Paragraph({ children: [new TextRun({ text, bold: true, size: SZ, font: FONT })], spacing: { before: 160, after: 80 }, keepNext: true })

const border = { style: BorderStyle.SINGLE, size: 4, color: '000000' }
const borders = { top: border, bottom: border, left: border, right: border }
const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
const W_TOTAL = 10466 // lățimea utilă (A4 cu marginile din tipar)

function cell(parts: Part[], width: number, opts: { header?: boolean; span?: number; shade?: boolean; center?: boolean } = {}) {
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    columnSpan: opts.span,
    shading: opts.header || opts.shade ? { fill: 'D9D9D9', type: ShadingType.CLEAR, color: 'auto' } : undefined,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    children: [
      new Paragraph({
        children: runs(parts, { size: 20, bold: opts.header }),
        alignment: opts.center || opts.header ? AlignmentType.CENTER : AlignmentType.LEFT,
      }),
    ],
  })
}

/** Tabel cu antet; lățimile sunt relative și se scalează la lățimea paginii */
function table(headers: string[], rows: Part[][], rel: number[], opts: { totalRow?: boolean } = {}) {
  const sum = rel.reduce((a, b) => a + b, 0)
  const widths = rel.map((r) => Math.round((r / sum) * W_TOTAL))
  const trs = [
    new TableRow({ tableHeader: true, children: headers.map((h, i) => cell([h], widths[i], { header: true })) }),
    ...rows.map(
      (r, ri) =>
        new TableRow({
          children: r.map((c, i) =>
            cell([c], widths[i], { center: i > 0 && typeof c === 'string' && /^[\d.,\s×-]+$/.test(c), shade: opts.totalRow && ri === rows.length - 1 }),
          ),
        }),
    ),
  ]
  return new Table({ width: { size: W_TOTAL, type: WidthType.DXA }, columnWidths: widths, rows: trs })
}

const spacer = () => new Paragraph({ children: [], spacing: { after: 120 } })
const num = (n: number, d = 2) => String(Math.round(n * 10 ** d) / 10 ** d)

const SYSTEM_TITLE: Record<SystemId, string> = {
  EFR: 'SISTEMUL DE DETECȚIE ȘI SEMNALIZARE EFRACȚIE',
  CA: 'SISTEMUL DE CONTROL ACCES',
  CCTV: 'SISTEMUL DE SUPRAVEGHERE VIDEO',
  INC: 'SISTEMUL DE DETECȚIE ȘI SEMNALIZARE INCENDIU',
  NET: 'REȚEAUA DE DATE (CABLARE STRUCTURATĂ)',
}

const LIST_TITLE: Record<SystemId, string> = {
  EFR: 'Structura sistemului de detecție și semnalizare efracție',
  CA: 'Structura sistemului de control acces',
  CCTV: 'Structura sistemului de supraveghere video',
  INC: 'Structura sistemului de detecție și semnalizare incendiu',
  NET: 'Structura rețelei de date',
}

const NORMATIVE = [
  'proiectele de arhitectură și de instalații aferente clădirii puse la dispoziție de beneficiar;',
  'Legea nr. 333/2003 privind paza obiectivelor, bunurilor, valorilor și protecția persoanelor;',
  'Hotărârea nr. 301/2012 pentru aprobarea Normelor metodologice de aplicare a Legii nr. 333/2003 privind paza obiectivelor, bunurilor, valorilor și protecția persoanelor;',
  'I7/2011 - Normativ pentru proiectarea și executarea instalațiilor electrice cu tensiuni până la 1000 V c.a. și 1500 V c.c.;',
  'I18/1/2001 - Normativ pentru proiectarea și executarea instalațiilor de telecomunicații și semnalizare din clădirile civile și de producție;',
  'P118/2025 - Normativ de siguranță la foc al clădirilor;',
  'P118-3/2015 - Normativ de siguranță la foc al clădirilor - instalații de detectare, semnalizare și avertizare incendiu;',
  'NTE 007/08/00 - Normativ pentru proiectarea și executarea rețelelor de cabluri electrice;',
  'PE 116-94 - Normativ de încercări și măsurători la echipamente și instalații electrice;',
  'C 56-02 - Normativ pentru verificarea calității și recepția lucrărilor de instalații aferente construcțiilor;',
  'Legea nr. 177/2015 „Pentru modificarea și completarea Legii nr. 10/1995 privind calitatea în construcții”;',
  'Standardele SR EN 54;',
  'Standardele SR CEI 839-2;',
  'SR EN 50130-4:2012, Sisteme de alarmă. Partea 4: Compatibilitate electromagnetică. Standard familie de produse: Prescripții referitoare la imunitatea componentelor din sistemele de alarmă la incendiu, efracție și jaf armat, de TVCI, de control al accesului și de alarmă socială;',
  'SR EN 50130-5:2012, Sisteme de alarmă. Partea 5: Metode pentru încercări de mediu;',
  'Colecția de standarde SR EN 50131. Sisteme de alarmă. Sisteme de alarmă împotriva efracției și jafului armat;',
  'Colecția de standarde SR CLC/TS 50131, Sisteme de alarmă împotriva efracției și jafului armat;',
  'Colecția de standarde SR EN 50132. Sisteme de alarmă. Sisteme de supraveghere TVCI care se utilizează în aplicațiile de securitate;',
  'Colecția de standarde SR EN 50133. Sisteme de alarmă. Sisteme de control al accesului pentru utilizare în aplicații de securitate;',
  'Colecția de standarde SR EN 50134, Standarde pentru sistemele de alarmă socială;',
  'Colecția de standarde SR EN 50136, Standarde pentru sisteme și echipamente pentru transmisia alarmei;',
  'SR CLC/TR 50456:2012, Sisteme de alarmă. Linii directoare pentru obținerea conformității cu directivele CE ale echipamentelor pentru sistemele de alarmă;',
  'Colecția de standarde SR ISO 31000:2018, SR EN IEC 31010:2020, Managementul riscului;',
  'Colecția de standarde SR EN ISO 9001, Managementul calității;',
  'SR EN ISO/IEC 27001:2018, Tehnologia informației. Tehnici de securitate. Sisteme de management al securității informației;',
  'SR EN ISO 22301:2020, Securitate și reziliență. Sisteme de management al continuității activității;',
  'SR ISO 45001:2018, Sisteme de management al sănătății și securității în muncă. Cerințe și îndrumări pentru utilizare;',
  'Legea nr. 10/1995 privind calitatea în construcții;',
  'Ordonanța nr. 71/2003 pentru modificarea și completarea Legii nr. 608/2001 privind evaluarea conformității produselor;',
  'Ordonanța nr. 62/2004 pentru modificarea și completarea Legii nr. 608/2001 privind evaluarea conformității produselor;',
  'Legea nr. 506/2004 privind prelucrarea datelor cu caracter personal și protecția vieții private în sectorul comunicațiilor electronice;',
  'Legea nr. 163/2016 pentru modificarea și completarea Legii nr. 10/1995 privind calitatea în construcții;',
  'Legea nr. 449/2003 privind vânzarea produselor și garanțiile asociate acestora;',
  'Ordinul nr. 339/2015 privind aprobarea Listei cuprinzând indicativele de referință ale standardelor române care transpun standarde europene armonizate din domeniul produselor pentru construcții;',
  'EIA/TIA TSB-36 „Additional Specifications for Unshielded Twisted Pair Cables”;',
  'cerințele beneficiarului discutate și acceptate de acesta pe parcursul elaborării lucrării.',
]

/** Echipamentele unui sistem: [denumire, model, cantitate, producător], grupate */
function equipmentList(p: Project, sys: SystemId) {
  const groups = new Map<string, { denumire: string; model: string; producator: string; qty: number }>()
  const add = (key: string, denumire: string, model: string, producator: string, qty: number) => {
    const g = groups.get(key) ?? { denumire, model, producator, qty: 0 }
    g.qty += qty
    groups.set(key, g)
  }
  for (const d of p.devices) {
    if (deviceSystem(d) !== sys) continue
    const info = deviceInfo(p, d)
    add(d.catalogId ?? d.type + '|' + d.model.trim(), info.denumire, info.model, info.producator, 1)
  }
  for (const a of p.accessories) {
    const it = catalogItem(p, a.catalogId)
    if (it && it.system === sys) add(it.id, it.denumire || it.model, it.model, it.producator, a.qty)
  }
  return [...groups.values()]
}

/** Rândurile fișei tehnice, din datele de catalog (doar câmpurile completate) */
function fisaRows(it: CatalogItem): [string, string][] {
  const rows: [string, string][] = [
    ['Tip echipament', it.denumire || kindName(it.type)],
    ['Model', it.model],
    ['Producător', it.producator],
  ]
  if (it.tensiuneV != null) rows.push(['Tensiune de alimentare', `${it.tensiuneV} V`])
  if (it.baterie) rows.push(['Alimentare', 'Baterie proprie (wireless)'])
  if (it.poe) rows.push(['Alimentare PoE', 'Da'])
  if (it.iVegheMa != null) rows.push(['Consum în veghe', `${it.iVegheMa} mA`])
  if (it.iAlarmaMa != null) rows.push(['Consum în alarmă', `${it.iAlarmaMa} mA`])
  if (it.putereW != null) rows.push(['Putere consumată', `${it.putereW} W`])
  if (it.poeW != null) rows.push(['Consum PoE', `${it.poeW} W`])
  if (it.poeBugetW != null) rows.push(['Buget PoE', `${it.poeBugetW} W`])
  if (it.bitrateKbps != null) rows.push(['Bitrate', `${it.bitrateKbps} kbps`])
  if (it.fovDeg != null) rows.push(['Unghi de vizualizare orizontal', `${it.fovDeg}°`])
  if (it.capacitateAh != null) rows.push(['Capacitate', `${it.capacitateAh} Ah`])
  if (it.capacitateTB != null) rows.push(['Capacitate', `${it.capacitateTB} TB`])
  if (it.upsVA != null) rows.push(['Putere aparentă', `${it.upsVA} VA`])
  if (it.upsW != null) rows.push(['Putere activă', `${it.upsW} W`])
  if (it.upsWh != null) rows.push(['Energie baterii', `${it.upsWh} Wh`])
  if (has(it.note)) rows.push(['Observații', it.note])
  return rows
}

function fisaTable(it: CatalogItem) {
  const wL = 3134
  const wV = W_TOTAL - wL
  const sectionRow = (title: string) => new TableRow({ children: [cell([title], W_TOTAL, { span: 2, shade: true, header: true })] })
  const paramRow = (l: string, val: string) => new TableRow({ children: [cell([l], wL), cell([v(val)], wV)] })
  // fișa completă din catalog (pe secțiuni), precedată de model / producător; altfel datele de bază
  if (it.specs?.length) {
    const rows: TableRow[] = [sectionRow('Model / producător'), paramRow('Model', it.model), paramRow('Producător', it.producator)]
    for (const r of it.specs) rows.push('section' in r ? sectionRow(r.section) : paramRow(r.label, r.value))
    return new Table({ width: { size: W_TOTAL, type: WidthType.DXA }, columnWidths: [wL, wV], rows })
  }
  return new Table({
    width: { size: W_TOTAL, type: WidthType.DXA },
    columnWidths: [wL, wV],
    rows: [sectionRow('Date tehnice'), ...fisaRows(it).map(([l, val]) => paramRow(l, val))],
  })
}

export async function exportMemoriu(p: Project) {
  const m = p.memoriu
  const t = p.title
  const multiLevel = p.levels.length > 1
  const used = SYSTEMS.filter((s) => p.devices.some((d) => deviceSystem(d) === s.id)).map((s) => s.id)
  const benef = v(t.beneficiar)
  const children: (Paragraph | Table)[] = []
  const add = (...x: (Paragraph | Table)[]) => children.push(...x)

  // ---------------------------------------------------------------- titlu
  add(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: runs(['PROIECT TEHNIC'], { size: 32, bold: true }),
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 360 },
      children: runs([`Nr. proiect: `, v(t.nrProiect), ` / `, v(t.data)], { size: SZ }),
    }),
  )

  // ---------------------------------------------------------------- preambul
  add(H1('PREAMBUL'))
  add(
    P(
      'În conformitate cu prevederile art. 2, alin. (3) din Anexa la H.G. nr. 301/2012, cu modificările și completările ulterioare, adoptarea prezentelor măsuri de securitate se realizează în baza Analizei de risc la securitate fizică, pusă la dispoziție de către ',
      benef,
      ' și care este anexată la prezentul proiect.',
    ),
    P('Analiza de risc la securitatea fizică constituie fundamentul adoptării măsurilor de securitate ale obiectivului, transpuse în prezentul proiect!'),
    P('Documentația aferentă Analizei de risc la securitate fizică este înregistrată la BENEFICIAR, fiind asumată de către conducătorul BENEFICIARULUI.'),
  )

  // ---------------------------------------------------------------- cap. I
  add(H1('CAPITOLUL I. DATE GENERALE'))
  add(
    P(
      'Prezentul proiect este întocmit în conformitate cu prevederile art. 27, alin. (7) din Legea nr. 333/2003, republicată, cu modificările și completările ulterioare, respectiv, art. 5, alin. (3) și art. 6 din Anexa 7 la H.G. nr. 301/2012, cu modificările și completările ulterioare.',
    ),
    P(
      'Acesta cuprinde detaliile de execuție și montaj pentru ',
      used.length ? used.map((s) => SYSTEM_TITLE[s]).join(', ') : { t: MISSING, miss: true },
      ' pentru obiectivul în care își desfășoară activitatea ',
      benef,
      '.',
    ),
    P(benef, ' are sediul social declarat în ', v(m.sediuSocial), ', CUI ', v(m.cui), '.'),
    P(
      'Obiectivul este situat în ',
      v(t.obiectiv),
      ', unde desfășoară activități de ',
      v(m.activitate),
      ', societatea având la bază „',
      v(m.caenDenumire),
      '”, conform cod CAEN ',
      v(m.caen),
      '.',
    ),
    P('La baza întocmirii prezentei lucrări au stat:'),
    ...NORMATIVE.map((n) => LI(n)),
  )

  // ---------------------------------------------------------------- cap. II
  add(H1('CAPITOLUL II. DESCRIEREA GENERALĂ A LUCRĂRILOR'))
  add(H2('II.1. Amplasamentul:'))
  add(
    P('Vecinătățile obiectivului sunt următoarele:'),
    LI('în N: ', v(m.vecinN), ';'),
    LI('în E: ', v(m.vecinE), ';'),
    LI('în S: ', v(m.vecinS), ';'),
    LI('în V: ', v(m.vecinV), '.'),
    P('Calea de acces în interiorul obiectivului este următoarea:'),
    LI('pietonal: ', v(m.accesPietonal), ';'),
    LI('auto: ', v(m.accesAuto), '.'),
    P('Schița de dispunere a obiectivului, precum și a vecinătăților acestuia, este prezentată în piesele desenate.'),
  )
  add(H2('II.2. Elementele privind construcția:'))
  add(P(has(m.constructie) ? m.constructie : 'Nu se cunosc detalii despre elementele de construcție.'))
  add(H2('II.3. Subsistemele componente:'))
  add(
    P(
      'În conformitate cu prevederile Anexei 1 la H.G. nr. 301/2012, cu modificările și completările ulterioare, privind cerințele minimale de securitate, pe zone funcționale și categorii de unități, obiectivele din această categorie trebuie să aibă următoarele măsuri de securitate:',
    ),
    P(v(m.cerinteMinimale)),
    P(
      'În conformitate cu prevederile art. 1, alin. (2) din Anexa 1 la H.G. nr. 301/2012, cu modificările și completările ulterioare, la nivelul obiectivului au fost identificate următoarele zone funcționale:',
    ),
    table(
      ['Nr. crt.', 'Zona funcțională', 'Componența'],
      ZONE_FUNCTIONALE.map((z, i) => [`${i + 1}`, z, v(m.zoneFunctionale[i])]),
      [8, 32, 60],
    ),
  )
  add(H2('II.4. Amenajările și elementele mecano-fizice existente:'))
  add(P('Amenajările și echipamentele de protecție mecano-fizică existente constau în următoarele: ', v(m.mecanoFizice), '.'))
  add(H2('II.5. Sursele de alimentare cu energie electrică:'))
  add(
    P('Principala sursă de alimentare cu energie electrică este Rețeaua Națională de Energie Electrică.'),
    P(
      'În tabloul de alimentare cu energie electrică al obiectivului intră curent monofazat (230 V ~, 50 Hz), repartizat pe ',
      v(m.circuite),
      '. Amplasarea acestuia este figurată în planșele desenate, conform prevederilor art. 5, alin. (3), lit. h) din Anexa 7 la H.G. nr. 301/2012, cu modificările și completările ulterioare.',
    ),
    P('Sistemul de securitate este alimentat de la unul dintre circuitele pentru prize.'),
    P('Asigurarea autonomiei energetice în caz de cădere a rețelei de tensiune este realizată de un UPS ', v(m.upsSursa), '.'),
    P('De asemenea, sistemul de securitate dispune de surse de alimentare de rezervă formate din acumulatori.'),
  )
  add(H2('II.6. Rețelele de comunicații disponibile:'))
  add(
    P(
      'Rețeaua de comunicație este asigurată de către diverși operatori, pentru servicii de internet, iar pentru telefonie mobilă se folosesc serviciile asigurate de către operatori diverși.',
    ),
    P('În ceea ce privește comunicația cu dispeceratul de monitorizare-intervenție, transferul de date se face printr-un comunicator ', v(m.comunicator), '.'),
  )

  // ---------------------------------------------------------------- cap. III
  add(H1('CAPITOLUL III. MEMORII TEHNICE'))
  add(
    P('Analiza de risc la securitatea fizică a urmărit stabilirea de măsuri de securitate și protecție pentru bunurile și valorile deținute la nivelul obiectivului.'),
    P(
      'Analiza de risc la securitate fizică asigură identificarea vulnerabilităților și a riscurilor, determinarea nivelului de expunere la producerea unor incidente de securitate fizică și indică măsurile de protecție necesare obiectivului.',
    ),
    P(
      'Este obligatorie conectarea sistemului de alarmare la un dispecerat de monitorizare, în cazul în care nu există instituită pază fizică permanent (în funcție de măsurile minime stabilite în Anexa 1 din HG nr. 301/2012, cu modificările și completările ulterioare).',
    ),
  )
  const componenta = (sys: SystemId) => {
    const list = equipmentList(p, sys)
    if (!list.length) return
    add(P('Componența subsistemului:'))
    for (const g of list) add(LI(`${g.qty} × ${g.denumire}`, ';'))
  }

  if (used.includes('EFR')) {
    add(H3('Subsistemul de alarmare la efracție'))
    add(
      P(
        'Structura subsistemului de alarmare la efracție este alcătuită din: centrala de alarmă cu tastaturile de operare, elementele de detecție, echipamentele de avertizare și semnalizare și alte componente specifice acestui tip de aplicații.',
      ),
      P('Rolul funcțional al subsistemului este de a detecta pătrunderea în spațiile protejate a persoanelor neautorizate și de a sesiza stările de pericol din unitate.'),
      P(
        'Detecția la efracție este realizată cu contacte magnetice (CM), detectori de prezență în infraroșu (PIR), detectori de prezență în dublă tehnologie (PIR+MW), care pot fi însoțiți de detectori cu funcții speciale (geam spart «DGS», șoc «DV», detector de fum «DF», bariere cu infraroșu «BI», etc).',
      ),
    )
    componenta('EFR')
    add(
      P('La ieșire, angajatul care părăsește locația ultimul tastează codul de armare și beneficiază de timpul de ieșire (', v(m.timpIesireS), ' secunde).'),
      P('Centrala sistemului de alarmare va fi amplasată la o înălțime de aproximativ 2 metri.'),
      P(
        'Tastatura va fi amplasată în apropierea intrării, într-o zonă ferită, care să asigure condițiile de securitate optime tastării codului de dezarmare, astfel încât timpul de întârziere să nu depășească ',
        v(m.timpIntrareS),
        ' secunde.',
      ),
      P(
        'Echipamentele de avertizare acustică și optică vor fi amplasate în interior și exterior, sirena de exterior va fi amplasată în zona de acces principală, pe zid, la aproximativ 2.5 metri înălțime, astfel încât anihilarea ei să fie cât mai dificilă, iar sirena de interior va fi montată astfel încât să nu poată fi identificată de către posibili agresori.',
      ),
      P(
        'Centrala de alarmare împotriva efracției se alimentează de la un circuit dedicat, fără alți consumatori, racordarea la tabloul electric fiind efectuată de un electrician autorizat.',
      ),
      P(
        'Stabilirea zonelor protejate a fost făcută prin analiza de risc la securitate fizică și asumată de către beneficiar, în funcție de configurația obiectivului și cerințele actuale ale acestuia.',
      ),
      P(
        'Manipularea sistemului se va realiza de către personalul angajat al societății. Aceste persoane vor fi instruite de către instalatorul sistemului privind modul de utilizare, aspect materializat prin încheierea unui document, conform prevederilor art. 9, alin. (1) din Anexa 7 la H.G. nr. 301/2012, cu modificările și completările ulterioare.',
      ),
      P('Senzorii vor fi conectați pe ieșiri „N.C.” (normal închis) și vor fi prevăzuți cu rezistențe de capăt EOL.'),
    )
  }

  if (used.includes('CA')) {
    add(H3('Subsistemul de control acces'))
    add(
      P(
        'Subsistemul de control al accesului cuprinde unitatea centrală, care gestionează punctele de control, unitățile de comandă, cititoarele, încuietorile sau dispozitivele electromagnetice de acționare a ușilor, și are rolul de restricționare a accesului neautorizat în spațiile protejate.',
      ),
    )
    componenta('CA')
  }

  const st = storageCalc(p)
  const pw = powerCalc(p, 'CCTV')
  if (used.includes('CCTV')) {
    const nvrs = p.devices.filter((d) => d.type === 'cctv_nvr')
    const nvrModel = nvrs[0] ? deviceInfo(p, nvrs[0]) : undefined
    const hdd = st.hdds
    const hddQty = hdd.reduce((s, h) => s + h.qty, 0)
    add(H3('Subsistemul de supraveghere video'))
    add(
      P(
        'În conformitate cu prevederile art. 3, alin. (3) din Anexa 1 la HG nr. 301/2012, cu modificările și completările ulterioare, sistemul de monitorizare video cu circuit închis este alcătuit din ',
        `${nvrs.length || 0} NVR (Network Video Recorder), un număr de ${st.cameras} camere video și ${pw.upsQty || 0} UPS, iar stocarea imaginilor video se realizează pe `,
        hddQty ? `${hddQty} HDD-uri (${hdd.map((h) => `${h.qty} × ${h.tb} TB`).join(' + ')})` : { t: MISSING, miss: true },
        '.',
      ),
      P('Imaginile preluate permit observarea/recunoașterea/identificarea persoanelor și autovehiculelor din zonele funcționale stabilite în analiza de risc.'),
    )
    if (nvrModel) add(P(`NVR-ul utilizat este ${nvrModel.denumire}.`))
    componenta('CCTV')
    add(
      P(
        'Camerele au fost montate la o înălțime suficient de mare pentru a împiedica un acces facil al persoanelor neautorizate, fiind montate astfel încât să corespundă normelor de montare în vigoare.',
      ),
      P(
        'În conformitate cu prevederile art. 67, alin. (2) din Anexa 7 la H.G. nr. 301/2012, cu modificările și completările ulterioare, în unitate sunt afișate semne de avertizare cu privire la existența sistemului de supraveghere video.',
      ),
      P('La dispunerea camerelor video se va ține cont de caracteristicile și de modul de funcționare ale acestora, astfel:'),
      LI('înălțime între 2 și 3 metri;'),
      LI('poziție optimă care să permită vizualizarea feței clientului/clienților;'),
      LI('se vor avea în vedere unghiurile din care vine lumina.'),
    )
  }

  if (used.includes('INC')) {
    add(H3('Subsistemul de detecție și semnalizare incendiu'))
    add(
      P(
        'Subsistemul de detecție și semnalizare a incendiilor este alcătuit din centrala de detecție și semnalizare incendiu, detectoarele automate, declanșatoarele manuale de alarmă, dispozitivele de alarmare acustică și optică și alte componente specifice, fiind proiectat conform Normativului P118-3/2015 și standardelor SR EN 54.',
      ),
    )
    componenta('INC')
  }

  if (used.includes('NET')) {
    add(H3('Rețeaua de date'))
    add(P('Rețeaua de date asigură interconectarea echipamentelor sistemelor de securitate și a echipamentelor beneficiarului, prin cablare structurată.'))
    componenta('NET')
  }

  // ---------------------------------------------------------------- cap. IV caiete de sarcini
  add(H1('CAPITOLUL IV. CAIETELE DE SARCINI'))
  add(H3('Procurarea materialelor'))
  add(
    P(
      'Echipamentele și materialele utilizate respectă standardele europene și naționale de profil, respectiv SR EN 50130 - Cerințe generale pentru sistemele de alarmă, SR EN 50131 - Sisteme de alarmare împotriva efracției utilizate în aplicațiile de securitate, SR EN 50132 - Sisteme de supraveghere TVCI, SR EN 50136 - Sisteme și echipamente de transmitere a alarmei.',
    ),
    P(
      'Toate materialele și echipamentele sunt achiziționate de la furnizori autorizați pentru comercializare și sunt însoțite de certificate / declarații de conformitate, fișe tehnice (prospecte producător), fișe de garanție, condițiile de exploatare și utilizare.',
    ),
  )
  add(H3('Teste, probe, verificări, punere în funcțiune și exploatare subansamble'))
  add(
    P(
      'Prin exploatarea subsistemelor se înțelege, pe lângă operațiunile de întreținere și service, inclusiv modul de utilizare al acestora de către utilizatorul de drept, acesta având obligația de a proceda și acționa în conformitate cu domeniul de utilizare a echipamentelor ce răspund la acțiunile directe și indirecte ale utilizatorului. Prin aceste operațiuni stabilite de către instalator împreună cu beneficiarul de drept, se va asigura manipularea și gestionarea corectă a echipamentelor și se va reduce riscul defectării, prin comenzi neadecvate din punct de vedere al funcționării hardware și software.',
    ),
    P(
      'De asemenea, în conformitate cu prevederile art. 12, alin. (1) din Anexa 7 la H.G. nr. 301/2012, cu modificările și completările ulterioare, personalul tehnic implicat în activitatea de proiectare, instalare, modificare sau întreținere a sistemelor de alarmare împotriva efracției înștiințează beneficiarul despre eventualele vicii de funcționare.',
    ),
  )

  add(H3('Breviarele de calcul prin care se justifică dimensionarea echipamentelor și a elementelor componente'))
  const c = p.calc
  let bi = 0
  const roman = ['I', 'II', 'III', 'IV', 'V', 'VI']
  for (const sys of ['EFR', 'INC'] as SystemId[]) {
    if (!used.includes(sys)) continue
    const b = batteryCalc(p, sys)
    add(B(`${roman[bi++]}. Calculul energetic al sistemului de ${sys === 'EFR' ? 'alarmare la efracție' : 'detecție și semnalizare incendiu'}`))
    if (b.rows.length) {
      add(
        table(
          ['COMPONENTA', 'Ualim [V]', 'IVeghe [mA]', 'Ialarmă [mA]', 'buc', 'ITveghe [mA]', 'ITalarmă [mA]'],
          [
            ...b.rows.map((r) => [r.denumire, r.u != null ? String(r.u) : '', num(r.iv), num(r.ia), String(r.qty), num(r.iv * r.qty), num(r.ia * r.qty)]),
            ['TOTAL', '', '', '', '', num(b.totalIv), num(b.totalIa)],
          ],
          [34, 10, 11, 11, 7, 13, 14],
          { totalRow: true },
        ),
        spacer(),
      )
    }
    if (b.wireless) add(P(`Echipamentele wireless cu baterie proprie (${b.wireless} buc.) nu se alimentează din acumulatorul centralei și nu intră în calcul.`))
    if (b.missing.length) add(P('Echipamente fără date de consum: ', { t: `${b.missing.join(', ')} ${MISSING}`, miss: true }))
    add(
      P(
        `Numărul de acumulatori necesari subsistemului ca să funcționeze ${num(c.tAlarmaH * 60, 0)} de minute în alarmă și ${c.tVegheH} de ore în stare de veghe în cazul întreruperii tensiunii de la rețea este:`,
      ),
      LI(`Iveghe = ${num(b.totalIv)} mA`),
      LI(`Ialarmă = ${num(b.totalIa)} mA`),
      LI(`tveghe = ${c.tVegheH} h`),
      LI(`talarmă = ${num(c.tAlarmaH * 60, 0)} min = ${c.tAlarmaH} h`),
      LI(`Cac = ${num(b.capacitateMah, 0)} mAh`),
      LI(`n = (Iveghe × tveghe + Ialarmă × talarmă) / (${c.factorAcumulator} × Cac) = ${num(b.n, 4)}`),
      LI(`N = [n] + 1 = ${b.N}`),
      P(
        b.acumulator
          ? `S-a ales ${b.N === 1 ? 'un acumulator' : `${b.N} acumulatori`} ${b.acumulator.denumire} (${b.acumulator.tensiuneV ?? 12} Vcc / ${b.acumulator.capacitateAh} Ah), iar în urma calculelor a reieșit că este nevoie de ${b.N} ${b.N === 1 ? 'acumulator' : 'acumulatori'}.`
          : `În urma calculelor a reieșit că este nevoie de ${b.N} ${b.N === 1 ? 'acumulator' : 'acumulatori'} de 12 Vcc / 7 Ah.`,
      ),
    )
  }

  if (used.includes('CCTV')) {
    add(B(`${roman[bi++]}. Calculul capacității de stocare a înregistrărilor video`))
    add(
      P(
        `Conform cerințelor minime de securitate prevăzute în Anexa 1 la H.G. nr. 301/2012 cu modificările și completările ulterioare, stocarea imaginilor video trebuie să fie asigurată pentru o perioadă de minim ${c.zileStocare} zile.`,
      ),
      P('Capacitatea de stocare necesară se determină cu relația:'),
      P({ t: 'CHDD = (BR × 3600 × 24 × ZS × Ncam) / (8 × 1024²)  [GB]', b: true }),
      P('unde:'),
      LI('BR - debitul de date (bitrate) al unei camere (kbps);'),
      LI(`ZS - numărul de zile pentru care trebuie stocate înregistrările (${c.zileStocare});`),
      LI(`Ncam - numărul de camere video (${st.cameras});`),
      LI('CHDD - capacitatea de stocare necesară (GB).'),
    )
    if (st.rows.length) {
      add(
        table(
          ['Camere video', 'buc', 'Bitrate [kbps]'],
          st.rows.map((r) => [r.denumire, String(r.qty), String(r.bitrate)]),
          [64, 12, 24],
        ),
        spacer(),
      )
    }
    add(
      P(
        `Pentru înregistrare continuă rezultă CHDD = ${num(st.gbContinuu, 0)} GB (≈ ${num(st.tbContinuu, 1)} TB), iar pentru înregistrare la detecție de mișcare (activitate estimată ${num(c.factorActivitate * 100, 0)}%) rezultă ${num(st.gbDetectie, 0)} GB (≈ ${num(st.tbDetectie, 1)} TB).`,
      ),
      P(
        'În urma acestor rezultate s-a ales ',
        st.hdds.length ? st.hdds.map((h) => `${h.qty} HDD${h.qty > 1 ? '-uri' : ''} cu capacitate de ${h.tb} TB`).join(' și ') : { t: MISSING, miss: true },
        st.hdds.length ? ` (total ${num(st.tbInstalat, 1)} TB).` : '.',
      ),
    )

    add(B(`${roman[bi++]}. Calculul energetic al sistemului de supraveghere video`))
    add(
      P('Puterea reală a sistemului de supraveghere se calculează pe baza consumului echipamentelor în cazul cel mai defavorabil (IR alimentat).'),
      P({ t: 'PTVCI = Σ PCAMi + Σ PNVRj + Σ Pechipk  [W]', b: true }),
      P('Funcționarea sistemului de supraveghere video în condițiile întreruperii alimentării de la rețeaua națională va fi asigurată de una sau mai multe surse neîntreruptibile UPS.'),
      P('UPS-urile sunt comercializate având puterea exprimată în Volt-Amperi (VA), care este unitatea de măsură a puterii aparente. Relația dintre puterea reală P (W) și cea aparentă PA (VA) este:'),
      P({ t: `PA = P / cos φ, unde cos φ (factorul de putere) este considerat ${c.cosPhi}.`, b: true }),
    )
    if (pw.rows.length) {
      add(
        table(
          ['COMPONENTA', 'BUC.', 'CONSUM [W]', 'TOTAL [W]'],
          [...pw.rows.map((r) => [r.denumire, String(r.qty), num(r.w), num(r.w * r.qty)]), ['TOTAL', '', '', num(pw.totalW)]],
          [58, 10, 16, 16],
          { totalRow: true },
        ),
        spacer(),
      )
    }
    if (pw.poeExcluded) add(P(`Camerele video (${pw.poeExcluded} buc.) sunt alimentate prin PoE de la switch, consumul lor fiind inclus în consumul switch-ului.`))
    if (pw.missing.length) add(P('Echipamente fără date de consum: ', { t: `${pw.missing.join(', ')} ${MISSING}`, miss: true }))
    add(
      P(
        `Astfel, pentru un consum energetic de ${num(pw.totalW, 1)} W (PA = ${num(pw.vaNecesar, 0)} VA), se va asigura un UPS de `,
        pw.ups?.upsVA ? `${pw.ups.upsVA} VA` : { t: MISSING, miss: true },
        '.',
      ),
    )
    if (pw.autonomieMin != null) {
      add(
        P(
          `Pe baza energiei bateriilor UPS-ului (${pw.ups!.upsWh} Wh) și a unui randament de ${c.randamentUps}, rezultă un timp de funcționare estimat, în lipsa energiei electrice, de aproximativ ${num(pw.autonomieMin, 0)} de minute, ceea ce ${pw.autonomieMin >= c.autonomieMinimaMin ? 'depășește' : 'NU acoperă'} timpul minim de ${c.autonomieMinimaMin} minute stipulat prin lege pentru funcționarea în caz de avarie pe UPS. Valoarea exactă se confirmă din caracteristica de descărcare a UPS-ului furnizată de producător.`,
        ),
      )
    }
    const poe = poeCalc(p)
    if (poe.consumatori && poe.switches.length) {
      add(
        P(
          `Consumul total al echipamentelor alimentate PoE este de ${num(poe.consumW)} W (${num(poe.consumW * 1.2)} W cu 20% rezervă), acoperit de bugetul PoE al switch-urilor de ${num(poe.bugetW)} W.`,
        ),
      )
    }
  }

  add(H3('Instrucțiuni de exploatare și întreținere'))
  add(
    P('Exploatarea sistemului de detectare și alarmare a efracției se va face în conformitate cu instrucțiunile prevăzute în cartea tehnică a produsului.'),
    P(
      'În conformitate cu prevederile art. 9, alin. (1) din Anexa 7 la HG nr. 301/2012, cu modificările și completările ulterioare, personalul beneficiarului va fi instruit de către specialiști din cadrul firmei instalatoare privind utilizarea sistemului, aspect materializat prin încheierea unui document.',
    ),
    P('Periodic se va controla starea elementelor de detecție, a surselor de alimentare, acumulatorilor, elementelor de alarmare (sirene) și a comunicatoarelor care transmit semnalul de alarmă la distanță.'),
    P('Se recomandă verificarea trimestrială a sistemului de detecție a efracției conform procedurilor specifice.'),
    P('Lucrările de întreținere și reparații se vor executa numai cu personal calificat, având echipamente de protecție adecvate, cu instalația scoasă de sub tensiune, respectându-se legile și normativele în vigoare.'),
    P(
      'Apariția oricărui eveniment trebuie consemnată în Jurnalul de Service al sistemului de alarmare împotriva efracției, întocmit conform modelului de la Anexa nr. 2l) din H.G. nr. 301/2012, cu modificările și completările ulterioare.',
    ),
    B('Norme de exploatare'),
    P('Limitele specificate de funcționare ale echipamentelor (umiditate, temperatură, ambianță, praf, agenți chimici etc.) nu trebuie depășite.'),
    P('Se interzice executarea oricăror operațiuni de către personalul neautorizat la componentele sistemului.'),
    P('Sistemul de securitate trebuie să funcționeze în permanență. O parte din funcțiunile sistemului se realizează automat, iar pentru alte funcțiuni deciziile trebuie luate de operator.'),
    B('Norme de întreținere'),
    P('Întreținerea sistemului este prevăzută și are rolul de a păstra intacte funcțiunile sistemului pe toată durata de viață a acestuia. Întreținerea sistemului se face doar de personalul autorizat.'),
    P('Reviziile tehnice periodice includ toate operațiunile necesare pentru menținerea în stare de funcționare a subsistemelor tehnice instalate la parametrii proiectați.'),
  )

  add(H3('Măsuri de sănătate și securitate în muncă'))
  add(
    P(
      'Documentația de proiectare a fost astfel întocmită încât să permită executarea și utilizarea instalației proiectate în condițiile în care, la o exploatare normală a sistemelor, să prevină accidentele de muncă, precum și îmbolnăvirile profesionale.',
    ),
    B('Legislația de securitate a muncii'),
    P(
      'La întocmirea lucrărilor de proiectare s-a ținut seama de legislația de securitatea muncii aflată în vigoare. Se atrage atenția executantului lucrării și, în special, beneficiarului, ca utilizator al instalației proiectate, că trebuie să respecte întocmai legislația, care prevede că neluarea vreuneia din măsurile prevăzute de dispozițiile legale referitoare la protecția muncii sau nerespectarea de către orice persoană a măsurilor stabilite cu privire la protecția muncii constituie infracțiune și se pedepsește ca atare.',
    ),
    P('Beneficiarul și executantul trebuie, de asemenea, să elaboreze și instrucțiuni proprii de securitatea muncii, specifice instalației.'),
    LI('Legea securității și sănătății în muncă nr. 319/2006, cu modificările și completările ulterioare;'),
    LI('Normele metodologice de aplicare a Legii nr. 319/2006;'),
    LI('HG 1146/2006 - Echipamente de muncă;'),
    LI('HG 1028/2006 - Utilizarea echipamentelor cu ecrane de vizualizare;'),
    LI('HG 1048/2006 - Echipamente individuale de protecție;'),
    LI('HG 971/2006 - Semnalizările de securitate și sănătate în muncă, cu modificările și completările ulterioare.'),
    B('Factorii de risc la executarea lucrării'),
    P('Factorii de risc avuți în vedere la elaborarea documentației sunt următorii:'),
    ...[
      'cădere de obiecte de la înălțime;',
      'curent electric: atingere indirectă și directă;',
      'lucru la înălțime;',
      'proiectare de corpuri sau particule;',
      'deplasări pe suprafețe înclinate sau alunecoase;',
      'lucru în spații înguste;',
      'contact cu corpuri ascuțite.',
    ].map((x) => LI(x)),
    P(
      'Proiectantul a avut în vedere acești factori de risc care pot apărea la îndeplinirea sarcinilor de muncă. Beneficiarul este obligat să refacă această analiză cu datele concrete, conform Legii nr. 319/2006, actualizată, să identifice complet toate riscurile și să ia toate măsurile pentru diminuarea sau evitarea lor. Contractul de execuție va cuprinde și clauze privind securitatea muncii cu răspunderea părților.',
    ),
    B('Măsurile individuale și colective de securitate a muncii la execuția lucrării'),
    P('Față de factorii de risc estimați pentru execuția lucrării, indicați mai sus, se impun următoarele sortimente de mijloace individuale de protecția muncii, care pot fi acordate conform legilor în vigoare:'),
    ...[
      'cască de protecție rezistentă la foc și penetrație;',
      'mănuși de protecție electroizolante;',
      'încălțăminte de protecție electroizolantă;',
      'centură de siguranță pentru lucrul la înălțime sau platformă de lucru la înălțime;',
      'ochelari de protecție la praf;',
      'mască de protecție la praf;',
      'salopetă de protecție.',
    ].map((x) => LI(x)),
    P(
      'Personalul de execuție va utiliza numai utilaje sigure din punct de vedere al securității muncii, care au certificate de conformitate, sunt cumpărate cu declarație de conformitate relativă la securitatea muncii și sunt marcate de conformitate pentru securitatea muncii.',
    ),
    P(
      'Sculele utilizate vor avea mânere electroizolante; ele vor fi apucate numai de zona izolată, iar personalul trebuie să fie dotat și să utilizeze echipamentul individual de protecție, respectând principiul „cel puțin 2 mijloace electroizolante înseriate pe calea de curent”.',
    ),
    P(
      'Ca mijloace colective de protecție se recomandă: semnalizarea locurilor periculoase și atenționarea vizibilă a lor cu plăcuțe de semnalizare, instructajul specific și periodic de protecția muncii, elaborarea și respectarea unui program de securitate și sănătate în muncă, dotarea locurilor de muncă cu trusă sanitară de prim ajutor, utilizarea de scule și utilaje certificate, controlul permanent în vederea verificării că au fost luate măsurile privind respectarea regulilor de securitatea muncii etc.',
    ),
    P('În timpul execuției este interzisă folosirea instalațiilor și a echipamentelor improvizate sau necorespunzătoare.'),
    P('Pentru lucrul la înălțime, executantul va folosi numai personal atestat medical și va utiliza scări, platforme etc. sau mijloace individuale de protecție (cască, centuri etc.).'),
    B('Obligațiile executantului'),
    P('Executantul răspunde de realizarea lucrărilor de instalații în condiții care să asigure evitarea accidentelor de muncă. În acest scop este obligat:'),
    LI('să analizeze documentația tehnică din punct de vedere al securității muncii;'),
    LI('să aplice prevederile cuprinse în legislația de securitatea muncii specifice lucrării;'),
    LI('să execute toate lucrările, în scopul exploatării ulterioare a instalațiilor în condiții depline de securitatea muncii, respectând normele, instrucțiunile, prescripțiile și standardele;'),
    LI('să remedieze toate deficiențele constatate cu ocazia probelor și recepției, astfel încât lucrarea executată să poată fi utilizată în condiții de securitate maximă posibilă.'),
    B('Obligațiile beneficiarului'),
    P('Beneficiarul răspunde de preluarea și, apoi, de exploatarea lucrărilor de instalații în condiții care să asigure securitatea muncii. În acest scop este obligat:'),
    LI('să analizeze proiectul din punct de vedere al securității muncii;'),
    LI('să respecte și să aplice toate normele și normativele de securitatea muncii;'),
    LI('să respecte instrucțiunile de securitatea muncii ale echipamentelor livrate;'),
    LI('să facă analiza factorilor de risc de accident și să ia măsurile corespunzătoare;'),
    LI(
      'pentru lucrările de reparații care se execută în paralel cu desfășurarea procesului de producție, să încheie cu executantul un protocol, anexă la contract, în care să delimiteze zonele de lucru pentru care răspunderea privind asigurarea măsurilor de securitatea muncii revine executantului;',
    ),
    LI('să prevadă mijloace de prim ajutor eficace;'),
    LI('să prevadă și să aplice măsuri de prevenire și stingere a incendiilor;'),
    LI('să nu permită accesul persoanelor neautorizate în instalațiile electrice.'),
    P(
      'Beneficiarul trebuie să verifice că instalația de legare la pământ este corespunzătoare, să se îngrijească să facă măsurători periodice ale rezistenței prizei de pământ și să obțină buletine de măsurători care să ateste că priza de pământ este în parametrii normali, conform legislației.',
    ),
  )

  // ---------------------------------------------------------------- cap. IV liste
  add(H1('CAPITOLUL IV. LISTELE CU CANTITĂȚILE DE ECHIPAMENTE ȘI MATERIALE'))
  let li = 1
  for (const sys of used) {
    const list = equipmentList(p, sys)
    if (!list.length) continue
    add(B(`IV.${li++} ${LIST_TITLE[sys]}`))
    add(
      table(
        ['Nr. crt.', 'Denumire echipament', 'Model', 'Cantitate', 'Producător'],
        list.map((g, i) => [`${i + 1}.`, g.denumire, v(g.model), String(g.qty), v(g.producator)]),
        [7, 43, 24, 11, 15],
      ),
      spacer(),
    )
  }

  // ---------------------------------------------------------------- cap. V zone
  add(H1('CAPITOLUL V. DESCRIEREA ZONELOR PROTEJATE'))
  for (const sys of ['EFR', 'INC'] as SystemId[]) {
    const list = p.devices
      .filter((d) => deviceSystem(d) === sys)
      .sort((a, b) => (a.zoneNr ?? '').localeCompare(b.zoneNr ?? '', 'ro', { numeric: true }) || a.label.localeCompare(b.label, 'ro', { numeric: true }))
    if (!list.length) continue
    add(
      P(
        sys === 'EFR'
          ? 'Subsistemul de detecție și alarmare la efracție implementat monitorizează următoarele zone:'
          : 'Subsistemul de detecție și semnalizare incendiu implementat monitorizează următoarele zone:',
      ),
      table(
        ['Nr. crt.', 'Modul', sys === 'INC' ? 'Buclă' : 'Zona modul', sys === 'INC' ? 'Zonă' : 'Partiție', 'Zona protejată', 'Denumire echipament', 'Simbol', 'Tip detecție'],
        list.map((d, i) => [
          `${i + 1}.`,
          d.module || (sys === 'EFR' ? 'CAE' : 'CDI'),
          d.zoneNr ?? '',
          d.partition,
          multiLevel && has(d.zone) ? `${levelOf(p, d.levelId).name} – ${d.zone.trim()}` : v(d.zone),
          deviceInfo(p, d).denumire,
          d.label,
          d.zoneType || symbolByType(d.type)?.detection || '',
        ]),
        [6, 9, 8, 10, 16, 26, 10, 15],
      ),
      spacer(),
    )
  }
  const cams = p.devices.filter((d) => symbolByType(d.type)?.camera).sort((a, b) => a.label.localeCompare(b.label, 'ro', { numeric: true }))
  if (cams.length) {
    const byZone = new Map<string, string[]>()
    for (const d of cams) {
      const z = d.zone.trim() ? (multiLevel ? `${levelOf(p, d.levelId).name} – ${d.zone.trim()}` : d.zone.trim()) : ''
      byZone.set(z, [...(byZone.get(z) ?? []), d.label])
    }
    add(
      P('Subsistemele TVCI implementate supraveghează următoarele zone:'),
      table(
        ['Nr. crt.', 'Zona supravegheată', 'Camere alocate'],
        [...byZone].map(([z, labels], i) => [`${i + 1}.`, v(z), labels.join(', ')]),
        [10, 50, 40],
      ),
      spacer(),
    )
  }

  // ---------------------------------------------------------------- cap. VI fișe tehnice
  add(H1('CAPITOLUL VI. FIȘELE TEHNICE ALE ECHIPAMENTELOR'))
  const usedItems = new Map<string, CatalogItem>()
  for (const d of p.devices) {
    const it = catalogItem(p, d.catalogId)
    if (it) usedItems.set(it.id, it)
  }
  for (const a of p.accessories) {
    const it = catalogItem(p, a.catalogId)
    if (it) usedItems.set(it.id, it)
  }
  if (!usedItems.size) add(P({ t: `Nu există echipamente din catalog în proiect. ${MISSING}`, miss: true }))
  const ordered = [...usedItems.values()].sort(
    (a, b) => SYSTEMS.findIndex((s) => s.id === (symbolByType(a.type)?.system ?? a.system)) - SYSTEMS.findIndex((s) => s.id === (symbolByType(b.type)?.system ?? b.system)) || Number(isAccessory(a.type)) - Number(isAccessory(b.type)),
  )
  for (const it of ordered) {
    add(
      new Paragraph({
        children: runs([`${it.denumire || it.model}`], { size: 24, bold: true }),
        spacing: { before: 240, after: 100 },
        keepNext: true,
      }),
      fisaTable(it),
    )
  }

  // ---------------------------------------------------------------- cap. VIII piese desenate
  add(H1('CAPITOLUL VIII. PIESELE DESENATE'))
  add(P('Acestea sunt:'))
  p.sheets.forEach((sh) => add(LI(`Planșa ${sh.nr} - ${sh.titlu}`)))

  // ---------------------------------------------------------------- semnături
  add(spacer(), spacer())
  const half = Math.round(W_TOTAL / 2)
  const sigCell = (lines: Part[][]) =>
    new TableCell({
      borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
      width: { size: half, type: WidthType.DXA },
      children: lines.map((l) => new Paragraph({ alignment: AlignmentType.CENTER, children: runs(l, { bold: true }), spacing: { after: 80 } })),
    })
  add(
    new Table({
      width: { size: W_TOTAL, type: WidthType.DXA },
      columnWidths: [half, W_TOTAL - half],
      rows: [
        new TableRow({
          children: [
            sigCell([['AVIZAT,'], ['DIRECTOR TEHNIC'], [''], [v(m.directorTehnic)]]),
            sigCell([['PROIECTANT'], [v(t.proiectant)], [''], [v(m.proiectantNume)]]),
          ],
        }),
      ],
    }),
  )

  const doc = new Document({
    creator: t.proiectant || 'Flux1 Design Tool',
    title: `Proiect tehnic ${t.nrProiect}`,
    styles: { default: { document: { run: { font: FONT, size: SZ } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11909, height: 16834 },
            margin: { top: 1440, right: 360, bottom: 1134, left: 1080, header: 360, footer: 405 },
          },
        },
        children,
      },
    ],
  })
  const blob = await Packer.toBlob(doc)
  downloadBlob(blob, `${(t.nrProiect || 'proiect').replace(/[\\/:*?"<>|]+/g, '_')} - Memoriu tehnic.docx`)
}

/** Câte câmpuri importante lipsesc (pentru avertizare în dialog) */
export function missingCount(p: Project): number {
  const m = p.memoriu
  const fields = [p.title.beneficiar, p.title.obiectiv, p.title.nrProiect, m.cui, m.sediuSocial, m.activitate, m.caen, m.vecinN, m.vecinE, m.vecinS, m.vecinV, m.accesPietonal, m.mecanoFizice, m.circuite]
  return fields.filter((f) => !has(f)).length
}

