import type { Project, SystemId } from './types'
import { symbolByType, symbolSvg, systemById } from './symbols'
import { NODE_H, NODE_W, blockLayout, nodeTexts } from './blockLayout'

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '&#xa;')

/** draw.io acceptă imagini ca data URI fără „;base64” în stil (caracterul ; e separator) */
function svgDataUri(type: string): string {
  const def = symbolByType(type)
  if (!def) return ''
  const b64 = btoa(unescape(encodeURIComponent(symbolSvg(def))))
  return 'data:image/svg+xml,' + b64
}

function diagramXml(p: Project, system: SystemId, idx: number): string {
  const L = blockLayout(p, system)
  const sys = systemById(system)
  const cells: string[] = ['<mxCell id="0"/>', '<mxCell id="1" parent="0"/>']
  const nodeId = new Map<object, string>()
  let n = 0
  const id = () => `c${idx}_${++n}`

  for (const node of L.nodes) {
    const [code, name, detail] = nodeTexts(node)
    const vid = id()
    nodeId.set(node, vid)
    const html = `<b style="color:${sys.color};font-size:14px">${esc(code)}</b><br>${esc(name)}${detail ? `<br><font color="#666666" style="font-size:10px">${esc(detail)}</font>` : ''}`
    const style = [
      'rounded=1',
      'arcSize=6',
      'whiteSpace=wrap',
      'html=1',
      'align=left',
      'verticalAlign=middle',
      'spacingLeft=58',
      'fontSize=11',
      'fillColor=#ffffff',
      `strokeColor=${sys.color}`,
      'strokeWidth=2',
      node.device ? '' : 'dashed=1',
    ]
      .filter(Boolean)
      .join(';')
    cells.push(
      `<mxCell id="${vid}" value="${esc(html)}" style="${style};" vertex="1" parent="1"><mxGeometry x="${node.x}" y="${node.y}" width="${NODE_W}" height="${NODE_H}" as="geometry"/></mxCell>`,
    )
    if (node.device) {
      cells.push(
        `<mxCell id="${id()}" value="" style="shape=image;html=1;verticalAlign=top;imageAspect=1;aspect=fixed;image=${svgDataUri(node.device.type)};" vertex="1" parent="${vid}"><mxGeometry x="8" y="${(NODE_H - 44) / 2}" width="44" height="44" as="geometry"/></mxCell>`,
      )
    }
  }

  // legături părinte → copil (draw.io le rutează ortogonal; se pot muta liber)
  for (const node of L.nodes) {
    for (const c of node.children) {
      const label = c.cable ? `${c.cable.code} · ${c.cable.cableType}` : ''
      const style = [
        'edgeStyle=orthogonalEdgeStyle',
        'rounded=0',
        'html=1',
        'endArrow=none',
        `strokeColor=${sys.color}`,
        'strokeWidth=2',
        'fontSize=10',
        'labelBackgroundColor=#ffffff',
        'exitX=0.5;exitY=1;exitDx=0;exitDy=0',
        'entryX=0.5;entryY=0;entryDx=0;entryDy=0',
        c.dashed ? 'dashed=1' : '',
      ]
        .filter(Boolean)
        .join(';')
      cells.push(
        `<mxCell id="${id()}" value="${esc(label)}" style="${style};" edge="1" parent="1" source="${nodeId.get(node)}" target="${nodeId.get(c)}"><mxGeometry relative="1" as="geometry"/></mxCell>`,
      )
    }
  }

  const name = `Schemă bloc – ${sys.name}`
  return `<diagram id="d${idx}" name="${esc(name)}"><mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1654" pageHeight="1169" math="0" shadow="0"><root>${cells.join('')}</root></mxGraphModel></diagram>`
}

/** Fișier .drawio cu câte o pagină pentru fiecare schemă bloc */
export function exportDrawio(p: Project, systems: SystemId[]) {
  const pages = systems.map((s, i) => diagramXml(p, s, i + 1))
  const xml = `<mxfile host="Flux1-Design-tool" type="device">${pages.join('')}</mxfile>`
  const blob = new Blob([xml], { type: 'application/xml' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${(p.title.nrProiect || 'proiect').replace(/[\\/:*?"<>|]+/g, '_')} - scheme bloc.drawio`
  a.click()
  URL.revokeObjectURL(a.href)
}
