import { useEffect, useMemo, useRef, useState } from 'react'
import type Konva from 'konva'
import { Circle, Group, Image as KImage, Layer, Line, Rect, Stage, Text } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { Diagram, DiagramEdge, DiagramNode, Project, Selection, Sheet } from './types'
import { SYSTEMS, onSymbolImage, systemById } from './symbols'
import { deviceImage } from './symbolLibrary'
import { NODE_H, NODE_W, blockLayout, nodeTexts } from './blockLayout'
import { cableEnds, deviceInfo, drawAreaMm, uid } from './project'
import { GRID, alignNodes, diagramBounds, distributeNodes, edgePath, materialize, moveSegment, nodeAt, pruneDiagram, snap, unplacedDevices } from './diagram'
import type { AlignMode } from './diagram'
import { ZoomBar } from './ZoomBar'
import { SCREEN_PX_PER_MM, stepPercent, useZoomKeys } from './zoom'

interface Props {
  project: Project
  sheet: Sheet
  selection: Selection
  stageRef: React.RefObject<Konva.Stage | null>
  fitSignal: number
  onSelect: (s: Selection) => void
  commit: (fn: (p: Project) => Project) => void
  update: (fn: (p: Project) => Project) => void
  checkpoint: () => void
}

type Mode = 'select' | 'conn' | 'text' | 'rect'
type LocalSel = { kind: 'node' | 'edge'; id: string } | null

const COLORS = [...SYSTEMS.map((s) => ({ name: s.short, c: s.color })), { name: 'Negru', c: '#222222' }, { name: 'Gri', c: '#78909c' }]

const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

export default function BlockCanvas({ project, sheet, selection, stageRef, fitSignal, onSelect, commit, update, checkpoint }: Props) {
  const system = sheet.systems[0]
  const color = systemById(system).color
  const wrapRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 800, height: 600 })
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 })
  const [mode, setMode] = useState<Mode>('select')
  const [sel, setSel] = useState<LocalSel>(null)
  const [conn, setConn] = useState<{ from: string; x: number; y: number } | null>(null)
  // imaginile simbolurilor colorate / personalizate se încarcă la cerere
  const [, setImgTick] = useState(0)
  useEffect(() => onSymbolImage(() => setImgTick((n) => n + 1)), [])
  /** Selecție multiplă de blocuri (Shift+click sau Shift+tragere pe fundal) */
  const [multi, setMulti] = useState<string[]>([])
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  /** Mutarea în grup: pozițiile de pornire ale blocurilor selectate */
  const groupDrag = useRef<Map<string, { x: number; y: number }> | null>(null)
  /** Tragerea unui segment de legătură: traseul de pornire și segmentul */
  const segDrag = useRef<{ path: number[]; seg: number; x: number; y: number } | null>(null)

  const layout = useMemo(() => blockLayout(project, system), [project, system])
  const diagram = useMemo(() => (sheet.diagram ? pruneDiagram(project, sheet.diagram) : null), [project, sheet.diagram])
  const bounds = diagram ? diagramBounds(diagram) ?? { x: -40, y: -40, width: 400, height: 300 } : layout.bounds
  const unplaced = diagram ? unplacedDevices(project, system, diagram) : []

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ width: el.clientWidth, height: el.clientHeight }))
    ro.observe(el)
    setSize({ width: el.clientWidth, height: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  const [fitTick, setFitTick] = useState(0)
  useEffect(() => {
    const b = bounds
    const scale = Math.min(size.width / b.width, size.height / b.height, 1.5) * 0.92
    setView({ scale, x: (size.width - b.width * scale) / 2 - b.x * scale, y: (size.height - b.height * scale) / 2 - b.y * scale })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitSignal, fitTick, sheet.id, size.width, size.height, !!diagram])

  // zoom: 100% = mărimea schemei pe planșa tipărită (încadrată în zona de desen, ca la export)
  const [aw, ah] = drawAreaMm(sheet)
  const fullScale = Math.min(aw / bounds.width, ah / bounds.height) * SCREEN_PX_PER_MM
  const percent = (view.scale / fullScale) * 100
  const zoomAtCenter = (scale: number) => {
    const sc = Math.min(Math.max(scale, 0.05), 10)
    const cx = size.width / 2
    const cy = size.height / 2
    setView((v) => {
      const wx = (cx - v.x) / v.scale
      const wy = (cy - v.y) / v.scale
      return { scale: sc, x: cx - wx * sc, y: cy - wy * sc }
    })
  }
  const fitAll = () => setFitTick((n) => n + 1)
  useZoomKeys({ step: (dir) => zoomAtCenter((stepPercent(percent, dir) / 100) * fullScale), fit: fitAll, actual: () => zoomAtCenter(fullScale) })

  // ---------------------------------------------------------------- modificări schemă

  /** Aplică o modificare schemei planșei curente (cu sau fără istoric) */
  const change = (fn: (d: Diagram) => Diagram, record = true) =>
    (record ? commit : update)((p) => ({
      ...p,
      sheets: p.sheets.map((sh) => (sh.id === sheet.id ? { ...sh, diagram: fn(pruneDiagram(p, sh.diagram ?? materialize(p, system))) } : sh)),
    }))

  const patchNode = (id: string, patch: Partial<DiagramNode>, record = true) =>
    change((d) => ({ ...d, nodes: d.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }), record)
  const patchEdge = (id: string, patch: Partial<DiagramEdge>) => change((d) => ({ ...d, edges: d.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) }))

  const removeSel = () => {
    if (multi.length) {
      const ids = new Set(multi)
      change((d) => ({ nodes: d.nodes.filter((n) => !ids.has(n.id)), edges: d.edges.filter((e) => !ids.has(e.from) && !ids.has(e.to)) }))
      setMulti([])
      onSelect(null)
      return
    }
    if (!sel) return
    if (sel.kind === 'edge') change((d) => ({ ...d, edges: d.edges.filter((e) => e.id !== sel.id) }))
    else change((d) => ({ nodes: d.nodes.filter((n) => n.id !== sel.id), edges: d.edges.filter((e) => e.from !== sel.id && e.to !== sel.id) }))
    setSel(null)
    onSelect(null)
  }

  const addUnplaced = () => {
    const b = diagramBounds(diagram!) ?? { x: 0, y: 0, width: 0, height: 0 }
    const y0 = snap(b.y + b.height + 40)
    change((d) => ({
      ...d,
      nodes: [
        ...d.nodes,
        ...unplaced.map((dev, i) => ({
          id: uid(),
          kind: 'device' as const,
          deviceId: dev.id,
          x: snap(b.x + 40 + (i % 6) * (NODE_W + 30)),
          y: y0 + Math.floor(i / 6) * (NODE_H + 60),
          w: NODE_W,
          h: NODE_H,
        })),
      ],
    }))
  }

  /** Eticheta implicită a unei legături: cablul desenat pe plan între cele două echipamente */
  const cableLabel = (a?: DiagramNode, b?: DiagramNode) => {
    if (!a?.deviceId || !b?.deviceId) return ''
    const c = project.cables.find((x) => {
      const e = cableEnds(project, x)
      return (e.from === a.deviceId && e.to === b.deviceId) || (e.from === b.deviceId && e.to === a.deviceId)
    })
    return c ? `${c.code} · ${c.cableType}` : ''
  }

  // ---------------------------------------------------------------- taste
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, select') || document.querySelector('.modal-back')) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && (sel || multi.length) && diagram) {
        e.preventDefault()
        removeSel()
      }
      if (e.key === 'Escape') {
        setMode('select')
        setConn(null)
        setMulti([])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const pointer = () => stageRef.current?.getRelativePointerPosition() ?? null

  const onWheel = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const p = stageRef.current?.getPointerPosition()
    if (!p) return
    const scale = Math.min(Math.max(view.scale * (e.evt.deltaY > 0 ? 1 / 1.12 : 1.12), 0.05), 10)
    const wx = (p.x - view.x) / view.scale
    const wy = (p.y - view.y) / view.scale
    setView({ scale, x: p.x - wx * scale, y: p.y - wy * scale })
  }

  const onStageMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    // Shift + tragere pe fundal = dreptunghi de selecție
    if (diagram && mode === 'select' && e.evt.shiftKey && e.evt.button === 0 && (e.target === stageRef.current || e.target.name() === 'bg')) {
      const pt = pointer()
      if (!pt) return
      stageRef.current?.draggable(false)
      setMarquee({ x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y })
      return
    }
    if (!diagram || mode !== 'conn' || e.evt.button !== 0) return
    const pt = pointer()
    const n = pt && nodeAt(diagram, pt.x, pt.y)
    if (n && pt) setConn({ from: n.id, x: pt.x, y: pt.y })
  }

  const onStageMouseUp = () => {
    if (marquee && diagram) {
      stageRef.current?.draggable(true)
      const r = { x1: Math.min(marquee.x0, marquee.x1), y1: Math.min(marquee.y0, marquee.y1), x2: Math.max(marquee.x0, marquee.x1), y2: Math.max(marquee.y0, marquee.y1) }
      setMarquee(null)
      if (r.x2 - r.x1 < 3 && r.y2 - r.y1 < 3) return
      // blocurile atinse de dreptunghi; chenarele doar dacă sunt cuprinse complet
      const hit = diagram.nodes.filter((n) =>
        n.kind === 'rect'
          ? n.x >= r.x1 && n.y >= r.y1 && n.x + n.w <= r.x2 && n.y + n.h <= r.y2
          : n.x < r.x2 && n.x + n.w > r.x1 && n.y < r.y2 && n.y + n.h > r.y1,
      )
      const base = multi.length ? multi : sel?.kind === 'node' ? [sel.id] : []
      const next = [...new Set([...base, ...hit.map((n) => n.id)])]
      if (next.length > 1) {
        setMulti(next)
        setSel(null)
        onSelect(null)
      } else if (next.length === 1) {
        setMulti([])
        setSel({ kind: 'node', id: next[0] })
      }
      return
    }
    if (!diagram || !conn) return
    const pt = pointer()
    const target = pt && nodeAt(diagram, pt.x, pt.y)
    if (target && target.id !== conn.from && !diagram.edges.some((e) => (e.from === conn.from && e.to === target.id) || (e.to === conn.from && e.from === target.id))) {
      const from = diagram.nodes.find((n) => n.id === conn.from)
      const id = uid()
      change((d) => ({ ...d, edges: [...d.edges, { id, from: conn.from, to: target.id, label: cableLabel(from, target), dashed: false }] }))
      setSel({ kind: 'edge', id })
    }
    setConn(null)
  }

  const onStageClick = (e: KonvaEventObject<MouseEvent>) => {
    if (e.target !== stageRef.current && e.target.name() !== 'bg') return
    // Shift = selecție multiplă (dreptunghiul tocmai s-a terminat): nu golim selecția
    if (e.evt.shiftKey && mode === 'select') return
    if (diagram && (mode === 'text' || mode === 'rect')) {
      const pt = pointer()
      if (!pt) return
      const id = uid()
      const node: DiagramNode =
        mode === 'text'
          ? { id, kind: 'text', x: snap(pt.x), y: snap(pt.y), w: 420, h: 30, text: 'Text', fontSize: 16, color: '#222222' }
          : { id, kind: 'rect', x: snap(pt.x), y: snap(pt.y), w: 400, h: 240, text: 'Chenar', color, dashed: true }
      change((d) => ({ ...d, nodes: mode === 'rect' ? [node, ...d.nodes] : [...d.nodes, node] }))
      setSel({ kind: 'node', id })
      setMode('select')
      return
    }
    setSel(null)
    setMulti([])
    onSelect(null)
  }

  const k = 1 / view.scale
  const selectedIds = new Set(multi.length ? multi : sel?.kind === 'node' ? [sel.id] : [])
  const alignSel = (m: AlignMode) => change((d) => ({ ...d, nodes: alignNodes(d.nodes, new Set(multi), m) }))
  const distributeSel = (axis: 'h' | 'v') => change((d) => ({ ...d, nodes: distributeNodes(d.nodes, new Set(multi), axis) }))
  const nodesById = new Map((diagram?.nodes ?? []).map((n) => [n.id, n]))
  const selNode = sel?.kind === 'node' ? nodesById.get(sel.id) : undefined
  const selEdge = sel?.kind === 'edge' ? diagram?.edges.find((e) => e.id === sel.id) : undefined

  // ---------------------------------------------------------------- desen blocuri

  const deviceBlock = (deviceId: string | undefined, w: number, h: number, c: string) => {
    const dev = project.devices.find((d) => d.id === deviceId)
    if (!dev) return null
    const info = deviceInfo(project, dev)
    const img = deviceImage(project, dev).img
    const detail = [info.model, dev.zone].filter(Boolean).join(' · ')
    return (
      <>
        <Rect width={w} height={h} fill="#fff" stroke={c} strokeWidth={2} cornerRadius={4} />
        {img && <KImage image={img} x={8} y={(h - 44) / 2} width={44} height={44} />}
        <Text x={60} y={9} width={w - 66} text={dev.label} fontSize={15} fontStyle="bold" fontFamily="Arial" fill={c} />
        <Text x={60} y={28} width={w - 66} height={26} text={info.denumire} fontSize={11} fontFamily="Arial" fill="#222" ellipsis wrap="word" />
        {detail && <Text x={60} y={h - 15} width={w - 66} text={detail} fontSize={10} fontFamily="Arial" fill="#666" ellipsis wrap="none" />}
      </>
    )
  }

  const renderEditable = (d: Diagram) => {
    const rects = d.nodes.filter((n) => n.kind === 'rect')
    const others = d.nodes.filter((n) => n.kind !== 'rect')
    const draggable = mode === 'select'
    const nodeGroup = (n: DiagramNode) => {
      const c = n.color ?? color
      return (
        <Group
          key={n.id}
          x={n.x}
          y={n.y}
          draggable={draggable}
          onMouseDown={(e) => {
            if (mode === 'select') e.cancelBubble = true
          }}
          onClick={(e) => {
            if (mode !== 'select') return
            e.cancelBubble = true
            if (e.evt.shiftKey) {
              // Shift+click: adaugă / scoate blocul din selecția multiplă
              const base = multi.length ? multi : sel?.kind === 'node' ? [sel.id] : []
              const next = base.includes(n.id) ? base.filter((x) => x !== n.id) : [...base, n.id]
              if (next.length > 1) {
                setMulti(next)
                setSel(null)
                onSelect(null)
              } else {
                setMulti([])
                setSel(next.length ? { kind: 'node', id: next[0] } : null)
              }
              return
            }
            setMulti([])
            setSel({ kind: 'node', id: n.id })
            onSelect(n.deviceId ? { kind: 'device', id: n.deviceId } : null)
          }}
          onDragStart={(e) => {
            e.cancelBubble = true
            checkpoint()
            if (multi.includes(n.id)) {
              groupDrag.current = new Map(d.nodes.filter((x) => multi.includes(x.id)).map((x) => [x.id, { x: x.x, y: x.y }]))
            } else {
              groupDrag.current = null
              setMulti([])
              setSel({ kind: 'node', id: n.id })
            }
          }}
          onDragMove={(e) => {
            e.cancelBubble = true
            const x = snap(e.target.x())
            const y = snap(e.target.y())
            e.target.position({ x, y })
            const g = groupDrag.current
            if (g) {
              const s0 = g.get(n.id)!
              const dx = x - s0.x
              const dy = y - s0.y
              change((dd) => ({ ...dd, nodes: dd.nodes.map((m) => (g.has(m.id) ? { ...m, x: g.get(m.id)!.x + dx, y: g.get(m.id)!.y + dy } : m)) }), false)
            } else patchNode(n.id, { x, y }, false)
          }}
          onDragEnd={(e) => {
            e.cancelBubble = true
            groupDrag.current = null
          }}
        >
          {n.kind === 'device' && deviceBlock(n.deviceId, n.w, n.h, c)}
          {n.kind === 'rect' && (
            <>
              <Rect width={n.w} height={n.h} fill={rgba(c, 0.04)} stroke={c} strokeWidth={1.5} dash={n.dashed ? [10, 6] : undefined} cornerRadius={6} />
              {n.text && <Text x={10} y={8} width={n.w - 20} text={n.text} fontSize={n.fontSize ?? 14} fontStyle="bold" fontFamily="Arial" fill={c} />}
            </>
          )}
          {n.kind === 'text' && (
            <>
              <Rect width={n.w} height={n.h} fill="rgba(0,0,0,0)" />
              <Text width={n.w} text={n.text ?? ''} fontSize={n.fontSize ?? 16} fontFamily="Arial" fill={c} />
            </>
          )}
        </Group>
      )
    }
    return (
      <>
        {rects.map(nodeGroup)}
        {d.edges.map((e) => {
          const a = nodesById.get(e.from)
          const b = nodesById.get(e.to)
          if (!a || !b) return null
          const r = edgePath(e, a, b)
          const c = e.color ?? color
          const selected = sel?.kind === 'edge' && sel.id === e.id
          return (
            <Group key={e.id}>
              <Line
                points={r.points}
                stroke={selected ? '#1e88e5' : c}
                strokeWidth={selected ? 3 : 2}
                dash={e.dashed ? [8, 6] : undefined}
                hitStrokeWidth={12}
                onClick={(ev) => {
                  if (mode !== 'select') return
                  ev.cancelBubble = true
                  setSel({ kind: 'edge', id: e.id })
                  setMulti([])
                  onSelect(null)
                }}
              />
              {e.label && <Text x={r.lx} y={r.ly} text={e.label} fontSize={11} fontFamily="Arial" fill="#444" listening={false} />}
            </Group>
          )
        })}
        {others.map(nodeGroup)}
      </>
    )
  }

  return (
    <div ref={wrapRef} className="canvas-wrap" style={{ cursor: mode === 'conn' ? 'crosshair' : mode === 'select' ? 'default' : 'copy' }}>
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        x={view.x}
        y={view.y}
        scaleX={view.scale}
        scaleY={view.scale}
        draggable={mode !== 'conn'}
        dragDistance={4}
        onDragEnd={(e) => {
          if (e.target === stageRef.current) setView((v) => ({ ...v, x: e.target.x(), y: e.target.y() }))
        }}
        onWheel={onWheel}
        onMouseDown={onStageMouseDown}
        onMouseMove={() => {
          if (marquee) {
            const pt = pointer()
            if (pt) setMarquee({ ...marquee, x1: pt.x, y1: pt.y })
          }
          if (conn) {
            const pt = pointer()
            if (pt) setConn({ ...conn, x: pt.x, y: pt.y })
          }
        }}
        onMouseUp={onStageMouseUp}
        onClick={onStageClick}
      >
        <Layer>
          {/* fundal alb pentru export */}
          <Rect name="bg" {...bounds} fill="#fff" />
          {diagram
            ? renderEditable(diagram)
            : (
              <>
                {layout.edges.map((e, i) => (
                  <Line key={i} points={e.points} stroke={color} strokeWidth={2} dash={e.dashed ? [8, 6] : undefined} lineCap="square" listening={false} />
                ))}
                {layout.labels.map((l, i) => (
                  <Text key={'l' + i} x={l.x} y={l.y} text={l.text} fontSize={11} fontFamily="Arial" fill="#444" listening={false} />
                ))}
                {layout.nodes.map((n) => {
                  const [code, name, detail] = nodeTexts(n)
                  const img = n.device ? deviceImage(project, n.device).img : undefined
                  return (
                    <Group
                      key={n.id + n.x}
                      x={n.x}
                      y={n.y}
                      onClick={(e) => {
                        e.cancelBubble = true
                        if (n.device) onSelect({ kind: 'device', id: n.device.id })
                      }}
                    >
                      <Rect width={NODE_W} height={NODE_H} fill="#fff" stroke={color} strokeWidth={n.device ? 2 : 1.5} dash={n.device ? undefined : [6, 4]} cornerRadius={4} />
                      {img && <KImage image={img} x={8} y={(NODE_H - 44) / 2} width={44} height={44} />}
                      <Text x={60} y={9} width={NODE_W - 66} text={code} fontSize={15} fontStyle="bold" fontFamily="Arial" fill={color} />
                      <Text x={60} y={28} width={NODE_W - 66} height={26} text={name} fontSize={11} fontFamily="Arial" fill="#222" ellipsis wrap="word" />
                      {detail && <Text x={60} y={NODE_H - 15} width={NODE_W - 66} text={detail} fontSize={10} fontFamily="Arial" fill="#666" ellipsis wrap="none" />}
                    </Group>
                  )
                })}
              </>
            )}
        </Layer>

        <Layer name="ui">
          {/* selecție și mâner de redimensionare */}
          {multi.length > 0 &&
            diagram?.nodes
              .filter((n) => selectedIds.has(n.id))
              .map((n) => (
                <Rect key={'m' + n.id} x={n.x - 4 * k} y={n.y - 4 * k} width={n.w + 8 * k} height={n.h + 8 * k} stroke="#1e88e5" strokeWidth={2 * k} dash={[6 * k, 4 * k]} listening={false} />
              ))}
          {marquee && (
            <Rect
              x={Math.min(marquee.x0, marquee.x1)}
              y={Math.min(marquee.y0, marquee.y1)}
              width={Math.abs(marquee.x1 - marquee.x0)}
              height={Math.abs(marquee.y1 - marquee.y0)}
              fill="rgba(30,136,229,0.08)"
              stroke="#1e88e5"
              strokeWidth={1 * k}
              dash={[5 * k, 4 * k]}
              listening={false}
            />
          )}
          {/* legătura selectată: mânere pe segmente (se trag perpendicular pe segment) */}
          {selEdge &&
            mode === 'select' &&
            (() => {
              const a = nodesById.get(selEdge.from)
              const b = nodesById.get(selEdge.to)
              if (!a || !b) return null
              const path = edgePath(selEdge, a, b).points
              const handles = []
              for (let i = 0; i + 3 < path.length; i += 2) {
                const [x1, y1, x2, y2] = path.slice(i, i + 4)
                if (Math.abs(x2 - x1) + Math.abs(y2 - y1) < 12) continue
                const horiz = Math.abs(y1 - y2) < 0.5
                const seg = i / 2
                handles.push(
                  <Rect
                    key={'h' + seg}
                    x={(x1 + x2) / 2 - 5 * k}
                    y={(y1 + y2) / 2 - 5 * k}
                    width={10 * k}
                    height={10 * k}
                    fill="#fff"
                    stroke="#1e88e5"
                    strokeWidth={2 * k}
                    draggable
                    onMouseEnter={(e) => (e.target.getStage()!.container().style.cursor = horiz ? 'ns-resize' : 'ew-resize')}
                    onMouseLeave={(e) => (e.target.getStage()!.container().style.cursor = '')}
                    onDragStart={(e) => {
                      e.cancelBubble = true
                      checkpoint()
                      segDrag.current = { path, seg, x: e.target.x(), y: e.target.y() }
                    }}
                    onDragMove={(e) => {
                      e.cancelBubble = true
                      const sd = segDrag.current
                      if (!sd) return
                      const delta = snap(horiz ? e.target.y() - sd.y : e.target.x() - sd.x)
                      const pts = moveSegment(sd.path, sd.seg, delta)
                      change((dd) => ({ ...dd, edges: dd.edges.map((x) => (x.id === selEdge.id ? { ...x, points: pts } : x)) }), false)
                    }}
                    onDragEnd={(e) => {
                      e.cancelBubble = true
                      segDrag.current = null
                    }}
                  />,
                )
              }
              return handles
            })()}
          {selNode && (
            <>
              <Rect x={selNode.x - 4 * k} y={selNode.y - 4 * k} width={selNode.w + 8 * k} height={selNode.h + 8 * k} stroke="#1e88e5" strokeWidth={2 * k} dash={[6 * k, 4 * k]} listening={false} />
              {selNode.kind !== 'device' && mode === 'select' && (
                <Rect
                  x={selNode.x + selNode.w - 6 * k}
                  y={selNode.y + selNode.h - 6 * k}
                  width={12 * k}
                  height={12 * k}
                  fill="#1e88e5"
                  stroke="#fff"
                  strokeWidth={1.5 * k}
                  draggable
                  onMouseEnter={(e) => (e.target.getStage()!.container().style.cursor = 'nwse-resize')}
                  onMouseLeave={(e) => (e.target.getStage()!.container().style.cursor = '')}
                  onDragStart={(e) => {
                    e.cancelBubble = true
                    checkpoint()
                  }}
                  onDragMove={(e) => {
                    e.cancelBubble = true
                    const w = Math.max(GRID * 4, snap(e.target.x() + 6 * k - selNode.x))
                    const h = Math.max(GRID * 2, snap(e.target.y() + 6 * k - selNode.y))
                    patchNode(selNode.id, { w, h }, false)
                  }}
                  onDragEnd={(e) => {
                    e.cancelBubble = true
                  }}
                />
              )}
            </>
          )}
          {!diagram &&
            layout.nodes.map((n) =>
              selection?.kind === 'device' && selection.id === n.device?.id ? (
                <Rect key="asel" x={n.x - 4 * k} y={n.y - 4 * k} width={NODE_W + 8 * k} height={NODE_H + 8 * k} stroke="#1e88e5" strokeWidth={2 * k} dash={[6 * k, 4 * k]} listening={false} />
              ) : null,
            )}
          {conn &&
            (() => {
              const a = nodesById.get(conn.from)
              if (!a) return null
              return <Line points={[a.x + a.w / 2, a.y + a.h / 2, conn.x, conn.y]} stroke="#1e88e5" strokeWidth={2 * k} dash={[8 * k, 5 * k]} listening={false} />
            })()}
          {/* puncte de conectare vizibile în modul legătură */}
          {diagram &&
            mode === 'conn' &&
            diagram.nodes
              .filter((n) => n.kind !== 'rect')
              .map((n) => <Circle key={'c' + n.id} x={n.x + n.w / 2} y={n.y + n.h / 2} radius={5 * k} fill="#1e88e5" opacity={0.6} listening={false} />)}
        </Layer>
      </Stage>

      {/* bara de unelte a schemei */}
      <div className="diagram-bar">
        {diagram ? (
          <>
            <button className={mode === 'select' ? 'on' : ''} onClick={() => setMode('select')} title="Selectează și mută blocurile">
              Selectare
            </button>
            <button className={mode === 'conn' ? 'on' : ''} onClick={() => setMode('conn')} title="Trage de la un bloc la altul pentru a crea o legătură">
              Legătură
            </button>
            <button className={mode === 'text' ? 'on' : ''} onClick={() => setMode('text')} title="Click pe schemă pentru a adăuga text">
              Text
            </button>
            <button className={mode === 'rect' ? 'on' : ''} onClick={() => setMode('rect')} title="Click pe schemă pentru a adăuga un chenar (grupare)">
              Chenar
            </button>
            <span className="sep" />
            {unplaced.length > 0 && (
              <button onClick={addUnplaced} title={unplaced.map((u) => u.label).join(', ')}>
                + Neplasate ({unplaced.length})
              </button>
            )}
            <button
              onClick={() => {
                if (!window.confirm('Regenerezi schema automat? Modificările manuale din această schemă se pierd (poți reveni cu Ctrl+Z).')) return
                change(() => materialize(project, system))
                setSel(null)
              }}
              title="Refă schema din echipamentele și cablurile de pe plan"
            >
              Regenerează
            </button>
          </>
        ) : (
          <>
            <span className="hint">Schemă generată automat din plan.</span>
            <button className="primary" onClick={() => change(() => materialize(project, system))}>
              Editează schema
            </button>
          </>
        )}
      </div>

      {/* proprietăți element selectat */}
      {diagram && multi.length > 1 && (
        <div className="diagram-props">
          <b>{multi.length} blocuri selectate</b>
          <span className="hint">Trage unul dintre ele ca să le muți împreună. Shift+click adaugă / scoate un bloc.</span>
          <span className="field-label">Aliniere</span>
          <div className="align-grid">
            <button onClick={() => alignSel('left')} title="Aliniază la stânga">⇤ Stânga</button>
            <button onClick={() => alignSel('hcenter')} title="Centrează pe verticală (același centru orizontal)">↔ Centru</button>
            <button onClick={() => alignSel('right')} title="Aliniază la dreapta">⇥ Dreapta</button>
            <button onClick={() => alignSel('top')} title="Aliniază sus">⤒ Sus</button>
            <button onClick={() => alignSel('vmiddle')} title="Aliniază pe mijloc (același centru vertical)">↕ Mijloc</button>
            <button onClick={() => alignSel('bottom')} title="Aliniază jos">⤓ Jos</button>
          </div>
          <span className="field-label">Distribuire (spații egale)</span>
          <div className="align-grid two">
            <button onClick={() => distributeSel('h')} disabled={multi.length < 3} title="Spații egale pe orizontală (minim 3 blocuri)">
              Orizontal
            </button>
            <button onClick={() => distributeSel('v')} disabled={multi.length < 3} title="Spații egale pe verticală (minim 3 blocuri)">
              Vertical
            </button>
          </div>
          <button className="danger" onClick={removeSel}>
            Elimină din schemă (Del)
          </button>
        </div>
      )}
      {diagram && !multi.length && (selEdge || (selNode && selNode.kind !== 'device') || (selNode?.kind === 'device')) && (
        <div className="diagram-props">
          {selEdge && (
            <>
              <b>Legătură</b>
              <label className="field">
                <span>Etichetă (cablu)</span>
                <input value={selEdge.label} onChange={(e) => patchEdge(selEdge.id, { label: e.target.value })} />
              </label>
              <ColorPick value={selEdge.color ?? color} onChange={(c) => patchEdge(selEdge.id, { color: c })} />
              <label className="check">
                <input type="checkbox" checked={selEdge.dashed} onChange={(e) => patchEdge(selEdge.id, { dashed: e.target.checked })} />
                Linie punctată
              </label>
              <span className="hint">Trage pătratele de pe segmente ca să muți traseul.</span>
              {selEdge.points && (
                <button onClick={() => patchEdge(selEdge.id, { points: undefined })} title="Renunță la traseul manual">
                  Traseu automat
                </button>
              )}
            </>
          )}
          {selNode && selNode.kind !== 'device' && (
            <>
              <b>{selNode.kind === 'text' ? 'Text' : 'Chenar'}</b>
              <label className="field">
                <span>Text</span>
                <textarea rows={selNode.kind === 'text' ? 3 : 1} value={selNode.text ?? ''} onChange={(e) => patchNode(selNode.id, { text: e.target.value })} />
              </label>
              <label className="field">
                <span>Mărime font</span>
                <input
                  type="number"
                  min={8}
                  max={72}
                  value={selNode.fontSize ?? (selNode.kind === 'text' ? 16 : 14)}
                  onChange={(e) => patchNode(selNode.id, { fontSize: Math.max(8, parseInt(e.target.value, 10) || 14) })}
                />
              </label>
              <ColorPick value={selNode.color ?? color} onChange={(c) => patchNode(selNode.id, { color: c })} />
              {selNode.kind === 'rect' && (
                <label className="check">
                  <input type="checkbox" checked={!!selNode.dashed} onChange={(e) => patchNode(selNode.id, { dashed: e.target.checked })} />
                  Contur punctat
                </label>
              )}
            </>
          )}
          {selNode?.kind === 'device' && (
            <>
              <b>{project.devices.find((d) => d.id === selNode.deviceId)?.label}</b>
              <span className="hint">Datele echipamentului se editează în panoul din dreapta și se actualizează și pe plan.</span>
              <ColorPick value={selNode.color ?? color} onChange={(c) => patchNode(selNode.id, { color: c })} />
            </>
          )}
          <button className="danger" onClick={removeSel}>
            {selNode?.kind === 'device' ? 'Elimină din schemă (Del)' : 'Șterge (Del)'}
          </button>
        </div>
      )}

      <ZoomBar
        percent={percent}
        onPercent={(pc) => zoomAtCenter((pc / 100) * fullScale)}
        onFit={fitAll}
        onSelection={
          diagram && (multi.length || sel?.kind === 'node')
            ? () => {
                const ids = new Set(multi.length ? multi : [sel!.id])
                const ns = diagram.nodes.filter((n) => ids.has(n.id))
                if (!ns.length) return
                const x1 = Math.min(...ns.map((n) => n.x)) - 60
                const y1 = Math.min(...ns.map((n) => n.y)) - 60
                const x2 = Math.max(...ns.map((n) => n.x + n.w)) + 60
                const y2 = Math.max(...ns.map((n) => n.y + n.h)) + 60
                const sc = Math.min(size.width / (x2 - x1), size.height / (y2 - y1), fullScale * 4) * 0.95
                setView({ scale: sc, x: (size.width - (x2 - x1) * sc) / 2 - x1 * sc, y: (size.height - (y2 - y1) * sc) / 2 - y1 * sc })
              }
            : undefined
        }
      />
      <div className="canvas-hint">
        {!diagram
          ? 'Schema se actualizează automat din plan. Apasă „Editează schema” pentru a muta liber blocurile și a adăuga legături, texte și chenare.'
          : mode === 'conn'
            ? 'Trage de la un bloc la altul pentru a crea o legătură. Esc = gata.'
            : mode === 'text' || mode === 'rect'
              ? 'Click pe schemă pentru a plasa elementul.'
              : 'Trage blocurile pentru a le muta (pe grilă). Shift+click sau Shift+tragere = selecție multiplă (aliniere, distribuire). Click pe o legătură = mânere pentru traseu. Del șterge; Ctrl+Z anulează.'}
      </div>
    </div>
  )
}

function ColorPick({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="colors">
      {COLORS.map((c) => (
        <button key={c.c} title={c.name} className={'swatch' + (c.c === value ? ' on' : '')} style={{ background: c.c }} onClick={() => onChange(c.c)} />
      ))}
    </div>
  )
}

