import type Konva from 'konva'
import { jsPDF } from 'jspdf'
import * as XLSX from 'xlsx'
import type { Project, Sheet, SystemId } from './types'
import { SYSTEMS, loadSymbolImage, symbolByType, systemById } from './symbols'
import { cableMeters, contentBounds, deviceSystem, pageSizeMm } from './project'
import { blockLayout } from './blockLayout'

function safeName(s: string) {
  return (s || 'plansa').replace(/[\\/:*?"<>|]+/g, '_').trim()
}

/** Scrie text pe o singură linie, micșorând fontul până încape */
function fitText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, size: number, bold = false, align: CanvasTextAlign = 'left') {
  let s = size
  do {
    ctx.font = `${bold ? 'bold ' : ''}${s}px Arial, Helvetica, sans-serif`
    if (ctx.measureText(text).width <= maxW) break
    s -= 1
  } while (s > 6)
  ctx.textAlign = align
  ctx.fillText(text, x, y)
}

/** Text pe mai multe rânduri, cu împărțire la cuvinte */
function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number, maxLines: number) {
  const words = text.split(/\s+/)
  let line = ''
  let n = 0
  for (let i = 0; i < words.length; i++) {
    const test = line ? line + ' ' + words[i] : words[i]
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y + n * lineH)
      n++
      line = words[i]
      if (n >= maxLines - 1) {
        line = words.slice(i).join(' ')
        break
      }
    } else line = test
  }
  if (line) ctx.fillText(line, x, y + n * lineH)
}

interface LegendRow {
  kind: 'header' | 'symbol' | 'cable'
  text: string
  type?: string
  system?: SystemId
}

function legendRows(p: Project, systems: SystemId[], withCables: boolean): LegendRow[] {
  const rows: LegendRow[] = []
  for (const sys of SYSTEMS) {
    if (!systems.includes(sys.id)) continue
    const counts = new Map<string, number>()
    for (const d of p.devices) {
      if (deviceSystem(d) === sys.id) counts.set(d.type, (counts.get(d.type) ?? 0) + 1)
    }
    const hasCables = withCables && p.cables.some((c) => c.system === sys.id)
    if (!counts.size && !hasCables) continue
    rows.push({ kind: 'header', text: sys.name.toUpperCase(), system: sys.id })
    for (const [type, n] of counts) {
      const def = symbolByType(type)!
      rows.push({ kind: 'symbol', type, text: `${def.name} (${n} buc.)`, system: sys.id })
    }
    if (hasCables) rows.push({ kind: 'cable', text: `Traseu cablu ${sys.short.toLowerCase()}`, system: sys.id })
  }
  return rows
}

type Bounds = { x: number; y: number; width: number; height: number }

/** Limitele desenului pentru o planșă */
export function sheetBounds(p: Project, sh: Sheet): Bounds | null {
  if (sh.kind === 'bloc') {
    const L = blockLayout(p, sh.systems[0])
    return L.nodes.length ? L.bounds : null
  }
  return contentBounds(p, sh.systems)
}

/** Randează desenul (fără elementele de interfață) la rezoluția cerută */
function renderDrawing(stage: Konva.Stage, b: Bounds, targetW: number, targetH: number) {
  const scale = Math.min(targetW / b.width, targetH / b.height)
  const ui = stage.findOne('.ui')
  const saved = { x: stage.x(), y: stage.y(), sx: stage.scaleX(), sy: stage.scaleY() }
  ui?.hide()
  stage.position({ x: 0, y: 0 })
  stage.scale({ x: 1, y: 1 })
  try {
    const canvas = stage.toCanvas({ x: b.x, y: b.y, width: b.width, height: b.height, pixelRatio: Math.min(scale, 8) })
    return { canvas, w: b.width * scale, h: b.height * scale }
  } finally {
    stage.position({ x: saved.x, y: saved.y })
    stage.scale({ x: saved.sx, y: saved.sy })
    ui?.show()
    stage.batchDraw()
  }
}

/** Rezoluția de randare: mai mică la formatele mari, ca să nu depășim memoria browserului */
function dpiFor(wmm: number, hmm: number) {
  const area = wmm * hmm
  if (area > 700000) return 110 // A0
  if (area > 350000) return 140 // A1
  if (area > 180000) return 170 // A2
  return 200
}

export interface RenderedPage {
  canvas: HTMLCanvasElement
  wmm: number
  hmm: number
}

/** Compune pagina completă: chenar, desen, legendă, cartuș */
export async function renderSheetPage(stage: Konva.Stage, p: Project, sh: Sheet): Promise<RenderedPage> {
  const bounds = sheetBounds(p, sh)
  if (!bounds) throw new Error(`Planșa „${sh.nr} ${sh.titlu}” este goală.`)
  const [Wmm, Hmm] = pageSizeMm(sh)
  const k = dpiFor(Wmm, Hmm) / 25.4 // px per mm
  const W = Math.round(Wmm * k)
  const H = Math.round(Hmm * k)
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#000'
  ctx.strokeStyle = '#000'
  ctx.textBaseline = 'alphabetic'
  const landscape = Wmm >= Hmm

  // Chenar: 20 mm stânga (îndosariere), 10 mm în rest (5 mm la A4)
  const m = Math.min(Wmm, Hmm) <= 210 ? 7 : 10
  const fx = 20 * k
  const fy = m * k
  const fw = W - (20 + m) * k
  const fh = H - 2 * m * k
  ctx.lineWidth = 0.7 * k
  ctx.strokeRect(fx, fy, fw, fh)

  // ---- Cartuș ----
  const t = p.title
  const small = Math.min(Wmm, Hmm) <= 210
  const tbW = Math.min((small ? 95 : 130) * k, fw * (landscape ? 0.4 : 0.6))
  const rowH = (small ? 7.5 : 9.5) * k
  const tbRows: { label: string; value: string; big?: boolean; split?: { label: string; value: string } }[] = [
    { label: 'Proiectant', value: t.proiectant, big: true },
    { label: 'Beneficiar', value: t.beneficiar },
    { label: 'Obiectiv', value: t.obiectiv },
    { label: 'Titlu planșă', value: sh.titlu, big: true },
    { label: 'Nr. proiect', value: t.nrProiect, split: { label: 'Planșa nr.', value: sh.nr } },
    { label: 'Scara', value: sh.kind === 'bloc' ? '—' : sh.scara, split: { label: 'Data', value: t.data } },
    { label: 'Întocmit', value: t.intocmit, split: { label: 'Semnătura', value: '' } },
    { label: 'Verificat', value: t.verificat, split: { label: 'Semnătura', value: '' } },
  ]
  const heights = tbRows.map((r) => (r.big ? rowH * 1.6 : rowH))
  const tbH = heights.reduce((a, b) => a + b, 0)
  const tbX = fx + fw - tbW
  const tbY = fy + fh - tbH

  // Peisaj: coloană pe dreapta (legendă sus, cartuș jos). Portret: bandă jos (legendă stânga, cartuș dreapta).
  let legend: Bounds
  let area: Bounds
  ctx.lineWidth = 0.5 * k
  if (landscape) {
    ctx.beginPath()
    ctx.moveTo(tbX, fy)
    ctx.lineTo(tbX, fy + fh)
    ctx.stroke()
    legend = { x: tbX, y: fy, width: tbW, height: fh - tbH }
    area = { x: fx, y: fy, width: tbX - fx, height: fh }
  } else {
    ctx.beginPath()
    ctx.moveTo(fx, tbY)
    ctx.lineTo(fx + fw, tbY)
    ctx.moveTo(tbX, tbY)
    ctx.lineTo(tbX, fy + fh)
    ctx.stroke()
    legend = { x: fx, y: tbY, width: tbX - fx, height: tbH }
    area = { x: fx, y: fy, width: fw, height: fh - tbH }
  }

  // ---- Desen ----
  const pad = 5 * k
  const drawing = renderDrawing(stage, bounds, area.width - 2 * pad, area.height - 2 * pad)
  ctx.drawImage(
    drawing.canvas,
    area.x + pad + (area.width - 2 * pad - drawing.w) / 2,
    area.y + pad + (area.height - 2 * pad - drawing.h) / 2,
    drawing.w,
    drawing.h,
  )

  // ---- Cartuș (desen) ----
  let y = tbY
  ctx.strokeStyle = '#000'
  ctx.lineWidth = 0.5 * k
  ctx.beginPath()
  ctx.moveTo(tbX, y)
  ctx.lineTo(tbX + tbW, y)
  ctx.stroke()
  const labelSize = 2.4 * k
  const valueSize = (small ? 2.9 : 3.2) * k
  tbRows.forEach((r, i) => {
    const h = heights[i]
    const cellPad = 1.5 * k
    const drawCell = (cx: number, cw: number, label: string, value: string, big?: boolean) => {
      ctx.fillStyle = '#555'
      fitText(ctx, label, cx + cellPad, y + labelSize + cellPad, cw - 2 * cellPad, labelSize)
      ctx.fillStyle = '#000'
      if (big) {
        ctx.font = `bold ${valueSize * 1.1}px Arial, Helvetica, sans-serif`
        ctx.textAlign = 'left'
        wrapText(ctx, value, cx + cellPad, y + labelSize + cellPad + valueSize * 1.3, cw - 2 * cellPad, valueSize * 1.2, 2)
      } else {
        fitText(ctx, value, cx + cellPad, Math.min(y + h - cellPad, y + labelSize + cellPad + valueSize * 1.15), cw - 2 * cellPad, valueSize, true)
      }
    }
    if (r.split) {
      const half = tbW * 0.55
      drawCell(tbX, half, r.label, r.value)
      drawCell(tbX + half, tbW - half, r.split.label, r.split.value)
      ctx.beginPath()
      ctx.moveTo(tbX + half, y)
      ctx.lineTo(tbX + half, y + h)
      ctx.stroke()
    } else drawCell(tbX, tbW, r.label, r.value, r.big)
    y += h
    if (i < tbRows.length - 1) {
      ctx.beginPath()
      ctx.moveTo(tbX, y)
      ctx.lineTo(tbX + tbW, y)
      ctx.stroke()
    }
  })

  // ---- Legendă (pe una sau mai multe coloane) ----
  const rows = legendRows(p, sh.systems, sh.kind === 'plan')
  const lp = 4 * k
  const headH = 8 * k
  ctx.fillStyle = '#000'
  fitText(ctx, 'LEGENDĂ', legend.x + legend.width / 2, legend.y + lp + 4 * k, legend.width - 2 * lp, 4.5 * k, true, 'center')
  const innerH = legend.height - headH - 2 * lp
  const innerW = legend.width - 2 * lp
  let lh = 7 * k
  let cols = 1
  for (;;) {
    const perCol = Math.max(1, Math.floor(innerH / lh))
    cols = Math.ceil(rows.length / perCol)
    if (innerW / cols >= 70 * k || lh <= 3.2 * k) break
    lh -= 0.4 * k
  }
  const perCol = Math.max(1, Math.floor(innerH / lh))
  const colW = innerW / Math.max(cols, 1)
  const iconS = Math.min(lh * 0.85, 6.5 * k)
  const fs = Math.min(2.9 * k, lh * 0.55)
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const c = Math.floor(i / perCol)
    const lx = legend.x + lp + c * colW
    const ly = legend.y + lp + headH + (i % perCol) * lh
    if (lx + colW > legend.x + legend.width + 1) break
    const color = row.system ? systemById(row.system).color : '#000'
    const textX = lx + iconS + 13 * k
    const textW = colW - iconS - 15 * k
    if (row.kind === 'header') {
      ctx.fillStyle = color
      fitText(ctx, row.text, lx, ly + lh * 0.72, colW - 2 * k, Math.min(3.1 * k, lh * 0.6), true)
    } else if (row.kind === 'symbol' && row.type) {
      const img = await loadSymbolImage(row.type)
      ctx.drawImage(img, lx, ly + (lh - iconS) / 2, iconS, iconS)
      const def = symbolByType(row.type)!
      ctx.fillStyle = color
      fitText(ctx, def.prefix, lx + iconS + 1.5 * k, ly + lh * 0.68, 11 * k, fs, true)
      ctx.fillStyle = '#000'
      fitText(ctx, row.text, textX, ly + lh * 0.68, textW, fs)
    } else if (row.kind === 'cable') {
      ctx.strokeStyle = color
      ctx.lineWidth = 0.6 * k
      if (row.system === 'INC') ctx.setLineDash([2 * k, 0.8 * k])
      ctx.beginPath()
      ctx.moveTo(lx, ly + lh / 2)
      ctx.lineTo(lx + iconS + 10 * k, ly + lh / 2)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.strokeStyle = '#000'
      ctx.fillStyle = '#000'
      fitText(ctx, row.text, textX, ly + lh * 0.68, textW, fs)
    }
  }

  return { canvas, wmm: Wmm, hmm: Hmm }
}

/** Salvează una sau mai multe pagini (de formate diferite) într-un singur PDF */
export function savePdf(pages: RenderedPage[], fileName: string) {
  if (!pages.length) return
  const orient = (pg: RenderedPage) => (pg.wmm >= pg.hmm ? 'landscape' : 'portrait')
  const first = pages[0]
  const pdf = new jsPDF({ orientation: orient(first), unit: 'mm', format: [first.wmm, first.hmm] })
  pages.forEach((pg, i) => {
    if (i > 0) pdf.addPage([pg.wmm, pg.hmm], orient(pg))
    pdf.addImage(pg.canvas.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, pg.wmm, pg.hmm, undefined, 'FAST')
  })
  pdf.save(`${safeName(fileName)}.pdf`)
}

export function exportExcel(p: Project) {
  const wb = XLSX.utils.book_new()
  const visible = p.devices

  // 1. Lista de echipamente (grupată pe tip + model)
  const eq: (string | number)[][] = [['Nr. crt.', 'Subsistem', 'Denumire echipament', 'Simbol', 'Model', 'Cantitate', 'Producător']]
  let n = 1
  for (const sys of SYSTEMS) {
    const groups = new Map<string, { type: string; model: string; count: number }>()
    for (const d of visible) {
      if (deviceSystem(d) !== sys.id) continue
      const key = d.type + '|' + d.model.trim()
      const g = groups.get(key) ?? { type: d.type, model: d.model.trim(), count: 0 }
      g.count++
      groups.set(key, g)
    }
    for (const g of groups.values()) {
      const def = symbolByType(g.type)!
      eq.push([n++, sys.short, def.name, def.prefix, g.model, g.count, ''])
    }
  }
  const ws1 = XLSX.utils.aoa_to_sheet(eq)
  ws1['!cols'] = [{ wch: 8 }, { wch: 14 }, { wch: 40 }, { wch: 9 }, { wch: 24 }, { wch: 10 }, { wch: 20 }]
  XLSX.utils.book_append_sheet(wb, ws1, 'Echipamente')

  // 2. Zone protejate
  const zones: (string | number)[][] = [['Nr. crt.', 'Subsistem', 'Simbol', 'Denumire echipament', 'Model', 'Zona protejată', 'Partiție', 'Tip detecție', 'Observații']]
  n = 1
  for (const sys of SYSTEMS) {
    const list = visible
      .filter((d) => deviceSystem(d) === sys.id)
      .sort((a, b) => a.label.localeCompare(b.label, 'ro', { numeric: true }))
    for (const d of list) {
      const def = symbolByType(d.type)!
      zones.push([n++, sys.short, d.label, def.name, d.model, d.zone, d.partition, def.detection ?? '', d.notes])
    }
  }
  const ws2 = XLSX.utils.aoa_to_sheet(zones)
  ws2['!cols'] = [{ wch: 8 }, { wch: 14 }, { wch: 9 }, { wch: 36 }, { wch: 20 }, { wch: 26 }, { wch: 10 }, { wch: 26 }, { wch: 30 }]
  XLSX.utils.book_append_sheet(wb, ws2, 'Zone protejate')

  // 3. Jurnal de cablu
  const byId = new Map(p.devices.map((d) => [d.id, d]))
  const cab: (string | number)[][] = [['Nr. crt.', 'Cod cablu', 'Subsistem', 'De la', 'La', 'Tip cablu', 'Lungime [m]', 'Traseu / Observații']]
  n = 1
  const cables = [...p.cables].sort((a, b) => a.code.localeCompare(b.code, 'ro', { numeric: true }))
  for (const c of cables) {
    const m = cableMeters(c, p)
    cab.push([
      n++,
      c.code,
      systemById(c.system).short,
      (c.from && byId.get(c.from)?.label) || '—',
      (c.to && byId.get(c.to)?.label) || '—',
      c.cableType,
      m ?? '',
      c.notes,
    ])
  }
  if (cables.length) {
    const totals = new Map<string, number>()
    for (const c of cables) {
      const m = cableMeters(c, p)
      if (m != null) totals.set(c.cableType, (totals.get(c.cableType) ?? 0) + m)
    }
    cab.push([])
    cab.push(['', 'TOTAL pe tip de cablu'])
    for (const [type, m] of totals) cab.push(['', '', '', '', '', type, m, ''])
  }
  const ws3 = XLSX.utils.aoa_to_sheet(cab)
  ws3['!cols'] = [{ wch: 8 }, { wch: 11 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 28 }, { wch: 12 }, { wch: 34 }]
  XLSX.utils.book_append_sheet(wb, ws3, 'Jurnal cablu')

  XLSX.writeFile(wb, `${safeName((p.title.nrProiect || 'proiect') + ' liste')}.xlsx`)
}
