import type Konva from 'konva'
import { jsPDF } from 'jspdf'
import * as XLSX from 'xlsx'
import type { PageFormat, Project, SystemId } from './types'
import { SYSTEMS, loadSymbolImage, symbolByType, systemById } from './symbols'
import { cableMeters, contentBounds, deviceSystem } from './project'

const PAGE_MM: Record<PageFormat, [number, number]> = {
  A4: [297, 210],
  A3: [420, 297],
  A2: [594, 420],
}
const DPI = 200

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

function legendRows(p: Project): LegendRow[] {
  const hidden = new Set(p.hidden)
  const rows: LegendRow[] = []
  for (const sys of SYSTEMS) {
    if (hidden.has(sys.id)) continue
    const counts = new Map<string, number>()
    for (const d of p.devices) {
      if (deviceSystem(d) === sys.id) counts.set(d.type, (counts.get(d.type) ?? 0) + 1)
    }
    const hasCables = p.cables.some((c) => c.system === sys.id)
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

/** Randează desenul (fără elementele de interfață) la rezoluția cerută */
function renderDrawing(stage: Konva.Stage, p: Project, targetW: number, targetH: number): { canvas: HTMLCanvasElement; w: number; h: number } | null {
  const b = contentBounds(p)
  if (!b) return null
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

export async function exportPdf(stage: Konva.Stage, p: Project) {
  const [Wmm, Hmm] = PAGE_MM[p.pageFormat]
  const k = DPI / 25.4 // px per mm
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

  // Chenar: 20 mm stânga (îndosariere), 10 mm în rest
  const fx = 20 * k
  const fy = 10 * k
  const fw = W - 30 * k
  const fh = H - 20 * k
  ctx.lineWidth = 0.7 * k
  ctx.strokeRect(fx, fy, fw, fh)

  // Coloana din dreapta: legendă + cartuș
  const colW = (p.pageFormat === 'A4' ? 85 : 110) * k
  const colX = fx + fw - colW
  ctx.lineWidth = 0.5 * k
  ctx.beginPath()
  ctx.moveTo(colX, fy)
  ctx.lineTo(colX, fy + fh)
  ctx.stroke()

  // ---- Desen ----
  const pad = 5 * k
  const areaW = colX - fx - 2 * pad
  const areaH = fh - 2 * pad
  const drawing = renderDrawing(stage, p, areaW, areaH)
  if (!drawing) throw new Error('Planșa este goală: încarcă un plan sau plasează echipamente.')
  const dx = fx + pad + (areaW - drawing.w) / 2
  const dy = fy + pad + (areaH - drawing.h) / 2
  ctx.drawImage(drawing.canvas, dx, dy, drawing.w, drawing.h)

  // ---- Cartuș ----
  const t = p.title
  const rowH = (p.pageFormat === 'A4' ? 8 : 10) * k
  const tbRows: { label: string; value: string; big?: boolean; split?: { label: string; value: string } }[] = [
    { label: 'Proiectant', value: t.proiectant, big: true },
    { label: 'Beneficiar', value: t.beneficiar },
    { label: 'Obiectiv', value: t.obiectiv },
    { label: 'Titlu planșă', value: t.titluPlansa, big: true },
    { label: 'Nr. proiect', value: t.nrProiect, split: { label: 'Planșa nr.', value: t.nrPlansa } },
    { label: 'Scara', value: t.scara, split: { label: 'Data', value: t.data } },
    { label: 'Întocmit', value: t.intocmit, split: { label: 'Semnătura', value: '' } },
    { label: 'Verificat', value: t.verificat, split: { label: 'Semnătura', value: '' } },
  ]
  const heights = tbRows.map((r) => (r.big ? rowH * 1.6 : rowH))
  const tbH = heights.reduce((a, b) => a + b, 0)
  let y = fy + fh - tbH
  ctx.lineWidth = 0.5 * k
  ctx.beginPath()
  ctx.moveTo(colX, y)
  ctx.lineTo(colX + colW, y)
  ctx.stroke()
  const labelSize = 2.4 * k
  const valueSize = 3.2 * k
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
        fitText(ctx, value, cx + cellPad, y + h - cellPad * 1.5, cw - 2 * cellPad, valueSize, true)
      }
    }
    if (r.split) {
      const half = colW * 0.55
      drawCell(colX, half, r.label, r.value)
      drawCell(colX + half, colW - half, r.split.label, r.split.value)
      ctx.beginPath()
      ctx.moveTo(colX + half, y)
      ctx.lineTo(colX + half, y + h)
      ctx.stroke()
    } else drawCell(colX, colW, r.label, r.value, r.big)
    y += h
    if (i < tbRows.length - 1) {
      ctx.beginPath()
      ctx.moveTo(colX, y)
      ctx.lineTo(colX + colW, y)
      ctx.stroke()
    }
  })

  // ---- Legendă ----
  const rows = legendRows(p)
  const lx = colX + 4 * k
  const lTop = fy + 4 * k
  ctx.fillStyle = '#000'
  fitText(ctx, 'LEGENDĂ', colX + colW / 2, lTop + 4 * k, colW - 8 * k, 4.5 * k, true, 'center')
  const avail = fy + fh - tbH - (lTop + 9 * k) - 3 * k
  let lh = Math.min(7.5 * k, avail / Math.max(rows.length, 1))
  if (lh < 3 * k) lh = 3 * k
  let ly = lTop + 9 * k
  const iconS = Math.min(lh * 0.85, 6.5 * k)
  for (const row of rows) {
    if (ly + lh > fy + fh - tbH) break
    const color = row.system ? systemById(row.system).color : '#000'
    if (row.kind === 'header') {
      ctx.fillStyle = color
      fitText(ctx, row.text, lx, ly + lh * 0.72, colW - 8 * k, Math.min(3.2 * k, lh * 0.6), true)
    } else if (row.kind === 'symbol' && row.type) {
      const img = await loadSymbolImage(row.type)
      ctx.drawImage(img, lx, ly + (lh - iconS) / 2, iconS, iconS)
      const def = symbolByType(row.type)!
      ctx.fillStyle = color
      fitText(ctx, def.prefix, lx + iconS + 2 * k, ly + lh * 0.68, 12 * k, Math.min(2.9 * k, lh * 0.55), true)
      ctx.fillStyle = '#000'
      fitText(ctx, row.text, lx + iconS + 15 * k, ly + lh * 0.68, colW - iconS - 23 * k, Math.min(2.9 * k, lh * 0.55))
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
      fitText(ctx, row.text, lx + iconS + 15 * k, ly + lh * 0.68, colW - iconS - 23 * k, Math.min(2.9 * k, lh * 0.55))
    }
    ly += lh
  }

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: p.pageFormat.toLowerCase() })
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, Wmm, Hmm, undefined, 'FAST')
  pdf.save(`${safeName(t.nrPlansa + ' ' + t.titluPlansa)}.pdf`)
}

export function exportExcel(p: Project) {
  const wb = XLSX.utils.book_new()
  const hidden = new Set(p.hidden)
  const visible = p.devices.filter((d) => !hidden.has(deviceSystem(d)!))

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
  const cables = p.cables
    .filter((c) => !hidden.has(c.system))
    .sort((a, b) => a.code.localeCompare(b.code, 'ro', { numeric: true }))
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
