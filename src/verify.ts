/**
 * Verificarea proiectului înainte de predare: ce lipsește sau e inconsecvent în planșe, liste, calcule și memoriu.
 * Funcții pure, fără UI.
 */
import type { Project, SystemId } from './types'
import { SYSTEMS, symbolByType } from './symbols'
import { catalogItem, deviceInfo, deviceSystem, levelOf, outsideFrame, paperMmPerPx, riserHost, sheetLevel } from './project'
import { batteryCalc, poeCalc, powerCalc, storageCalc, fmt } from './calc'

export type Severity = 'err' | 'warn'

/** Unde duce click-ul pe o problemă */
export type IssueTarget =
  | { kind: 'device' | 'cable'; id: string; levelId: string }
  | { kind: 'level'; levelId: string }
  | { kind: 'sheet'; sheetId: string }
  | { kind: 'catalog'; itemId?: string }
  | { kind: 'memoriu' }
  | { kind: 'project' }
  | { kind: 'calc' }

export interface Issue {
  sev: Severity
  group: string
  text: string
  /** Elementele în cauză (etichete), afișate sub text */
  items?: string[]
  target?: IssueTarget
}

export const GROUPS = ['Planșe și niveluri', 'Echipamente', 'Cabluri', 'Calcule', 'Catalog și fișe tehnice', 'Cartuș', 'Memoriu tehnic'] as const

const has = (s?: string | null) => !!s && s.trim().length > 0
const sysName = (s: SystemId) => SYSTEMS.find((x) => x.id === s)?.name ?? s
const sortLabels = (a: string[]) => [...a].sort((x, y) => x.localeCompare(y, 'ro', { numeric: true }))

const TITLE_LABELS: [keyof Project['title'], string][] = [
  ['proiectant', 'Proiectant'],
  ['beneficiar', 'Beneficiar'],
  ['obiectiv', 'Obiectiv'],
  ['nrProiect', 'Nr. proiect'],
  ['data', 'Data'],
  ['intocmit', 'Întocmit'],
  ['verificat', 'Verificat'],
]

const MEMO_LABELS: [keyof Project['memoriu'], string, SystemId?][] = [
  ['cui', 'CUI'],
  ['sediuSocial', 'Sediu social'],
  ['activitate', 'Activitatea desfășurată'],
  ['caen', 'Cod CAEN'],
  ['caenDenumire', 'Denumire activitate CAEN'],
  ['vecinN', 'Vecinătate N'],
  ['vecinS', 'Vecinătate S'],
  ['vecinE', 'Vecinătate E'],
  ['vecinV', 'Vecinătate V'],
  ['accesPietonal', 'Acces pietonal'],
  ['accesAuto', 'Acces auto'],
  ['cerinteMinimale', 'Cerințe minimale'],
  ['mecanoFizice', 'Elemente mecano-fizice'],
  ['circuite', 'Circuite de consum'],
  ['upsSursa', 'UPS'],
  ['comunicator', 'Comunicator dispecerat', 'EFR'],
  ['timpIesireS', 'Timp ieșire', 'EFR'],
  ['timpIntrareS', 'Timp intrare', 'EFR'],
  ['directorTehnic', 'Director tehnic'],
  ['proiectantNume', 'Proiectant (nume)'],
]

export function verifyProject(p: Project): Issue[] {
  const out: Issue[] = []
  // etichetele (PIR1, C2...) se sortează; listele de câmpuri păstrează ordinea din formular
  const add = (sev: Severity, group: (typeof GROUPS)[number], text: string, target?: IssueTarget, items?: string[]) =>
    out.push({ sev, group, text, target, items: items && items.length ? (group === 'Cartuș' || group === 'Memoriu tehnic' ? items : sortLabels(items)) : undefined })

  const used = SYSTEMS.map((s) => s.id).filter((s) => p.devices.some((d) => deviceSystem(d) === s))
  const planSheets = p.sheets.filter((s) => s.kind === 'plan')

  // ---------------------------------------------------------------- planșe și niveluri
  for (const lvl of p.levels) {
    const devs = p.devices.filter((d) => d.levelId === lvl.id)
    const cabs = p.cables.filter((c) => c.levelId === lvl.id)
    if (!devs.length && !cabs.length) continue
    if (!lvl.pxPerMeter)
      add('err', 'Planșe și niveluri', `Nivelul „${lvl.name}” nu are scara calibrată: lungimile cablurilor și conurile camerelor nu sunt reale.`, {
        kind: 'level',
        levelId: lvl.id,
      })
    const sheets = planSheets.filter((s) => sheetLevel(p, s).id === lvl.id)
    if (!sheets.length) {
      add('err', 'Planșe și niveluri', `Nivelul „${lvl.name}” are echipamente, dar nu apare pe nicio planșă de amplasare.`, { kind: 'level', levelId: lvl.id })
      continue
    }
    for (const sys of SYSTEMS.map((s) => s.id)) {
      if (!devs.some((d) => deviceSystem(d) === sys)) continue
      if (!sheets.some((s) => s.systems.includes(sys)))
        add('warn', 'Planșe și niveluri', `Echipamentele de ${sysName(sys).toLowerCase()} de pe „${lvl.name}” nu apar pe nicio planșă (sistem debifat).`, {
          kind: 'sheet',
          sheetId: sheets[0].id,
        })
    }
  }
  for (const sh of planSheets) {
    const name = `Planșa ${sh.nr} „${sh.titlu}”`
    const lvl = sheetLevel(p, sh)
    const hasContent = p.devices.some((d) => d.levelId === lvl.id && sh.systems.includes(deviceSystem(d)!))
    if (!hasContent) continue
    if (outsideFrame(p, sh))
      add('warn', 'Planșe și niveluri', `${name}: desenul iese din zona planșei, deci scara din cartuș (${sh.scara}) nu mai e reală.`, { kind: 'sheet', sheetId: sh.id })
    const k = paperMmPerPx(p, sh)
    if (k) {
      const mm = lvl.symbolSize * k
      if (mm > 11 || mm < 3.5)
        add('warn', 'Planșe și niveluri', `${name}: simbolurile ies de ~${fmt(mm, 0)} mm pe hârtie (uzual ~6 mm).`, { kind: 'sheet', sheetId: sh.id })
    }
  }
  for (const sys of used) {
    const hasHub = p.devices.some((d) => deviceSystem(d) === sys && symbolByType(d.type)?.hub)
    if (hasHub && !p.sheets.some((s) => s.kind === 'bloc' && s.systems[0] === sys))
      add('warn', 'Planșe și niveluri', `Lipsește schema bloc pentru ${sysName(sys).toLowerCase()}.`)
  }

  // ---------------------------------------------------------------- echipamente
  const byLabel = new Map<string, string[]>()
  for (const d of p.devices) byLabel.set(d.label, [...(byLabel.get(d.label) ?? []), d.id])
  const dups = [...byLabel].filter(([l, ids]) => l && ids.length > 1)
  if (dups.length) {
    const first = p.devices.find((d) => d.id === dups[0][1][0])!
    add('err', 'Echipamente', 'Simboluri cu aceeași etichetă (numerotare dublă).', { kind: 'device', id: first.id, levelId: first.levelId }, dups.map(([l, ids]) => `${l} ×${ids.length}`))
  }
  const noLabel = p.devices.filter((d) => !has(d.label))
  if (noLabel.length) add('err', 'Echipamente', `${noLabel.length} echipamente fără etichetă.`, { kind: 'device', id: noLabel[0].id, levelId: noLabel[0].levelId })

  const noModel = p.devices.filter((d) => {
    const info = deviceInfo(p, d)
    return !has(info.model) || !has(info.producator)
  })
  if (noModel.length)
    add(
      'warn',
      'Echipamente',
      'Echipamente fără model sau producător (apar goale în listele de echipamente). Leagă-le de un echipament din catalog.',
      { kind: 'device', id: noModel[0].id, levelId: noModel[0].levelId },
      noModel.map((d) => d.label),
    )

  for (const sys of ['EFR', 'INC'] as SystemId[]) {
    const noZone = p.devices.filter((d) => deviceSystem(d) === sys && !has(d.zone))
    if (noZone.length)
      add(
        'err',
        'Echipamente',
        `${sysName(sys)}: echipamente fără „Zona protejată” (tabelul de zone din memoriu).`,
        { kind: 'device', id: noZone[0].id, levelId: noZone[0].levelId },
        noZone.map((d) => d.label),
      )
  }
  const camNoZone = p.devices.filter((d) => symbolByType(d.type)?.camera && !has(d.zone))
  if (camNoZone.length)
    add('err', 'Echipamente', 'Camere fără „Zona supravegheată” (tabelul TVCI din memoriu).', { kind: 'device', id: camNoZone[0].id, levelId: camNoZone[0].levelId }, camNoZone.map((d) => d.label))

  // ---------------------------------------------------------------- cabluri
  const connected = new Set<string>()
  for (const c of p.cables) {
    if (c.from) connected.add(c.from)
    if (c.to) connected.add(c.to)
  }
  const devIds = new Set(p.devices.map((d) => d.id))
  const loose = p.cables.filter((c) => {
    if (c.riser) return !riserHost(p, c)
    const from = c.from && devIds.has(c.from)
    const to = c.to && devIds.has(c.to)
    return !from || !to
  })
  const riserLoose = loose.filter((c) => c.riser)
  const plainLoose = loose.filter((c) => !c.riser)
  if (plainLoose.length)
    add(
      'err',
      'Cabluri',
      'Cabluri care nu sunt legate la echipamente la ambele capete (lipsesc din jurnalul de cabluri și din schema bloc).',
      { kind: 'cable', id: plainLoose[0].id, levelId: plainLoose[0].levelId },
      plainLoose.map((c) => c.code),
    )
  if (riserLoose.length)
    add(
      'err',
      'Cabluri',
      'Cabluri terminate la ghenă fără continuare pe alt nivel (aceeași ghenă, același sistem, spre un echipament central).',
      { kind: 'cable', id: riserLoose[0].id, levelId: riserLoose[0].levelId },
      riserLoose.map((c) => `${c.code} (ghena ${c.riser})`),
    )
  const unwired = p.devices.filter((d) => {
    if (connected.has(d.id)) return false
    const it = catalogItem(p, d.catalogId)
    return !it?.baterie // wireless: fără cablu
  })
  if (unwired.length)
    add(
      'warn',
      'Cabluri',
      'Echipamente fără cablu (dacă sunt wireless, bifează „Baterie proprie” în catalog).',
      { kind: 'device', id: unwired[0].id, levelId: unwired[0].levelId },
      unwired.map((d) => d.label),
    )

  // ---------------------------------------------------------------- calcule
  for (const sys of ['EFR', 'INC'] as SystemId[]) {
    if (!used.includes(sys)) continue
    const b = batteryCalc(p, sys)
    if (b.missing.length)
      add('err', 'Calcule', `Calculul acumulatorilor (${sysName(sys).toLowerCase()}): lipsesc consumurile de veghe / alarmă.`, { kind: 'catalog' }, b.missing)
    if (b.rows.length && !b.acumulator)
      add('warn', 'Calcule', `Calculul acumulatorilor (${sysName(sys).toLowerCase()}): niciun acumulator în accesorii, se folosește 7 Ah implicit.`, { kind: 'calc' })
  }
  if (used.includes('CCTV')) {
    const pw = powerCalc(p, 'CCTV')
    if (pw.missing.length) add('err', 'Calcule', 'Bilanțul de putere TVCI: lipsesc puterile consumate.', { kind: 'catalog' }, pw.missing)
    if (!pw.ups) add('warn', 'Calcule', 'Bilanțul TVCI: niciun UPS în accesorii (autonomia nu se poate calcula).', { kind: 'calc' })
    else if (!pw.ups.upsVA || !pw.ups.upsWh)
      add('err', 'Calcule', `UPS-ul „${pw.ups.denumire || pw.ups.model}” nu are puterea (VA) sau energia bateriilor (Wh) în catalog.`, { kind: 'catalog', itemId: pw.ups.id })
    else if (pw.vaNecesar > pw.ups.upsVA * Math.max(1, pw.upsQty))
      add('err', 'Calcule', `UPS subdimensionat: necesar ${fmt(pw.vaNecesar, 0)} VA, instalat ${fmt(pw.ups.upsVA * Math.max(1, pw.upsQty), 0)} VA.`, { kind: 'calc' })
    else if (pw.autonomieMin != null && pw.autonomieMin < p.calc.autonomieMinimaMin)
      add('warn', 'Calcule', `Autonomia UPS estimată (${fmt(pw.autonomieMin, 0)} min) e sub minimul de ${p.calc.autonomieMinimaMin} min.`, { kind: 'calc' })

    const st = storageCalc(p)
    if (st.cameras) {
      if (!st.hdds.length) add('err', 'Calcule', 'Stocare video: niciun hard disk în accesorii.', { kind: 'calc' })
      else if (st.tbInstalat < st.tbDetectie)
        add('err', 'Calcule', `Stocare insuficientă: instalat ${fmt(st.tbInstalat)} TB, necesar ${fmt(st.tbDetectie)} TB chiar și la înregistrare pe detecție.`, { kind: 'calc' })
      else if (st.tbInstalat < st.tbContinuu)
        add('warn', 'Calcule', `Stocarea (${fmt(st.tbInstalat)} TB) ajunge doar pentru înregistrare pe detecție; continuu ar fi nevoie de ${fmt(st.tbContinuu)} TB.`, { kind: 'calc' })
    }
  }
  const poe = poeCalc(p)
  if (poe.consumatori) {
    if (poe.missing.length) add('err', 'Calcule', 'Bugetul PoE: lipsește consumul PoE.', { kind: 'catalog' }, poe.missing)
    if (!poe.switches.length) add('warn', 'Calcule', `${poe.consumatori} echipamente PoE, dar niciun switch cu buget PoE în proiect.`, { kind: 'calc' })
    else if (poe.consumW * 1.2 > poe.bugetW)
      add('err', 'Calcule', `Buget PoE depășit: ${fmt(poe.consumW)} W + 20% rezervă = ${fmt(poe.consumW * 1.2)} W > ${fmt(poe.bugetW)} W.`, { kind: 'calc' })
  }

  // ---------------------------------------------------------------- catalog și fișe tehnice
  const usedItems = new Map<string, { name: string; id: string }>()
  for (const d of p.devices) {
    const it = catalogItem(p, d.catalogId)
    if (it) usedItems.set(it.id, { id: it.id, name: it.denumire || it.model })
  }
  for (const a of p.accessories) {
    const it = catalogItem(p, a.catalogId)
    if (it) usedItems.set(it.id, { id: it.id, name: it.denumire || it.model })
  }
  const noSpecs = [...usedItems.values()].filter((u) => !(catalogItem(p, u.id)?.specs ?? []).some((r) => 'value' in r && has(r.value)))
  if (noSpecs.length)
    add('warn', 'Catalog și fișe tehnice', 'Echipamente fără fișă tehnică (capitolul VI din memoriu rămâne gol pentru ele).', { kind: 'catalog', itemId: noSpecs[0].id }, noSpecs.map((u) => u.name))

  // ---------------------------------------------------------------- cartuș și memoriu
  const noTitle = TITLE_LABELS.filter(([k]) => !has(p.title[k])).map(([, l]) => l)
  if (noTitle.length) add('warn', 'Cartuș', 'Câmpuri goale în cartuș (apar pe fiecare planșă).', { kind: 'project' }, noTitle)
  const noMemo = MEMO_LABELS.filter(([k, , sys]) => (!sys || used.includes(sys)) && !has(p.memoriu[k] as string)).map(([, l]) => l)
  const zf = p.memoriu.zoneFunctionale.filter((z) => !has(z)).length
  if (zf) noMemo.push(`${zf} zone funcționale`)
  if (noMemo.length) add('warn', 'Memoriu tehnic', 'Date necompletate: apar în memoriu ca „[DE COMPLETAT]”.', { kind: 'memoriu' }, noMemo)

  return out
}

/** Nivelul unui echipament / cablu, pentru navigare */
export const levelName = (p: Project, levelId: string) => levelOf(p, levelId).name
