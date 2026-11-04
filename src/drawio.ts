import type { Diagram, Project, SystemId } from './types'
import { symbolByType, symbolSvg, systemById } from './symbols'
import { deviceInfo } from './project'
import { materialize, pruneDiagram } from './diagram'

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '&#xa;')

/** draw.io acceptă imagini ca data URI fără „;base64” în stil (caracterul ; e separator) */
function svgDataUri(type: string): string {
  const def = symbolByType(type)
  if (!def) return ''
  const b64 = btoa(unescape(encodeURIComponent(symbolSvg(def))))
  return 'data:image/svg+xml,' + b64
}

function diagramXml(p: Project, item: DrawioItem, idx: number): string {
  const d = item.diagram ? pruneDiagram(p, item.diagram) : materialize(p, item.system)
  const sys = systemById(item.system)
  const cells: string[] = ['<mxCell id="0"/>', '<mxCell id="1" parent="0"/>']
  const cid = (id: string) => `c${idx}_${id}`
  let n = 0
  const extra = () => `c${idx}_x${++n}`

  // chenarele primele, ca să rămână în spate
  const ordered = [...d.nodes.filter((x) => x.kind === 'rect'), ...d.nodes.filter((x) => x.kind !== 'rect')]
  for (const node of ordered) {
    const c = node.color ?? sys.color
    const geo = `<mxGeometry x="${node.x}" y="${node.y}" width="${node.w}" height="${node.h}" as="geometry"/>`
    if (node.kind === 'device') {
      const dev = p.devices.find((x) => x.id === node.deviceId)
      if (!dev) continue
      const info = deviceInfo(p, dev)
      const detail = [info.model, dev.zone].filter(Boolean).join(' · ')
      const html = `<b style="color:${c};font-size:14px">${esc(dev.label)}</b><br>${esc(info.denumire)}${detail ? `<br><font color="#666666" style="font-size:10px">${esc(detail)}</font>` : ''}`
      const style = `rounded=1;arcSize=6;whiteSpace=wrap;html=1;align=left;verticalAlign=middle;spacingLeft=58;fontSize=11;fillColor=#ffffff;strokeColor=${c};strokeWidth=2;`
      cells.push(`<mxCell id="${cid(node.id)}" value="${esc(html)}" style="${style}" vertex="1" parent="1">${geo}</mxCell>`)
      cells.push(
        `<mxCell id="${extra()}" value="" style="shape=image;html=1;imageAspect=1;aspect=fixed;image=${svgDataUri(dev.type)};" vertex="1" parent="${cid(node.id)}"><mxGeometry x="8" y="${(node.h - 44) / 2}" width="44" height="44" as="geometry"/></mxCell>`,
      )
    } else if (node.kind === 'rect') {
      const style = `rounded=1;arcSize=3;whiteSpace=wrap;html=1;align=left;verticalAlign=top;spacingLeft=8;spacingTop=4;fontStyle=1;fontSize=${node.fontSize ?? 14};fontColor=${c};fillColor=none;strokeColor=${c};${node.dashed ? 'dashed=1;' : ''}`
      cells.push(`<mxCell id="${cid(node.id)}" value="${esc(node.text ?? '')}" style="${style}" vertex="1" parent="1">${geo}</mxCell>`)
    } else {
      const style = `text;html=1;whiteSpace=wrap;align=left;verticalAlign=top;fontSize=${node.fontSize ?? 16};fontColor=${c};`
      cells.push(`<mxCell id="${cid(node.id)}" value="${esc(node.text ?? '')}" style="${style}" vertex="1" parent="1">${geo}</mxCell>`)
    }
  }

  // legăturile (draw.io le rutează ortogonal; se pot muta liber)
  const ids = new Set(d.nodes.map((x) => x.id))
  for (const e of d.edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) continue
    const style = [
      'edgeStyle=orthogonalEdgeStyle',
      'rounded=0',
      'html=1',
      'endArrow=none',
      `strokeColor=${e.color ?? sys.color}`,
      'strokeWidth=2',
      'fontSize=10',
      'labelBackgroundColor=#ffffff',
      e.dashed ? 'dashed=1' : '',
    ]
      .filter(Boolean)
      .join(';')
    // traseu manual: colțurile ca puncte de control draw.io
    const pts: string[] = []
    for (let i = 0; i + 1 < (e.points?.length ?? 0); i += 2) pts.push(`<mxPoint x="${e.points![i]}" y="${e.points![i + 1]}"/>`)
    const geom = pts.length ? `<mxGeometry relative="1" as="geometry"><Array as="points">${pts.join('')}</Array></mxGeometry>` : '<mxGeometry relative="1" as="geometry"/>'
    cells.push(`<mxCell id="${extra()}" value="${esc(e.label)}" style="${style};" edge="1" parent="1" source="${cid(e.from)}" target="${cid(e.to)}">${geom}</mxCell>`)
  }

  return `<diagram id="d${idx}" name="${esc(item.name)}"><mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1654" pageHeight="1169" math="0" shadow="0"><root>${cells.join('')}</root></mxGraphModel></diagram>`
}

export interface DrawioItem {
  system: SystemId
  diagram?: Diagram
  name: string
}

/** Fișier .drawio cu câte o pagină pentru fiecare schemă bloc */
export function exportDrawio(p: Project, items: DrawioItem[]) {
  const pages = items.map((it, i) => diagramXml(p, it, i + 1))
  const xml = `<mxfile host="Flux1-Design-tool" type="device">${pages.join('')}</mxfile>`
  const blob = new Blob([xml], { type: 'application/xml' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${(p.title.nrProiect || 'proiect').replace(/[\\/:*?"<>|]+/g, '_')} - scheme bloc.drawio`
  a.click()
  URL.revokeObjectURL(a.href)
}
