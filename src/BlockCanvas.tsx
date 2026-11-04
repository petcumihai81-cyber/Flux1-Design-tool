import { useEffect, useMemo, useRef, useState } from 'react'
import type Konva from 'konva'
import { Group, Image as KImage, Layer, Line, Rect, Stage, Text } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { Project, Selection, SystemId } from './types'
import { symbolImage, systemById } from './symbols'
import { NODE_H, NODE_W, blockLayout, nodeTexts } from './blockLayout'

interface Props {
  project: Project
  system: SystemId
  selection: Selection
  stageRef: React.RefObject<Konva.Stage | null>
  fitSignal: number
  onSelect: (s: Selection) => void
}

export default function BlockCanvas({ project, system, selection, stageRef, fitSignal, onSelect }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 800, height: 600 })
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 })
  const layout = useMemo(() => blockLayout(project, system), [project, system])
  const color = systemById(system).color

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ width: el.clientWidth, height: el.clientHeight }))
    ro.observe(el)
    setSize({ width: el.clientWidth, height: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const b = layout.bounds
    const scale = Math.min(size.width / b.width, size.height / b.height, 1.5) * 0.95
    setView({ scale, x: (size.width - b.width * scale) / 2 - b.x * scale, y: (size.height - b.height * scale) / 2 - b.y * scale })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitSignal, system, size.width, size.height])

  const onWheel = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const p = stageRef.current?.getPointerPosition()
    if (!p) return
    const scale = Math.min(Math.max(view.scale * (e.evt.deltaY > 0 ? 1 / 1.12 : 1.12), 0.05), 10)
    const wx = (p.x - view.x) / view.scale
    const wy = (p.y - view.y) / view.scale
    setView({ scale, x: p.x - wx * scale, y: p.y - wy * scale })
  }

  const k = 1 / view.scale
  return (
    <div ref={wrapRef} className="canvas-wrap">
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        x={view.x}
        y={view.y}
        scaleX={view.scale}
        scaleY={view.scale}
        draggable
        dragDistance={4}
        onDragEnd={(e) => {
          if (e.target === stageRef.current) setView((v) => ({ ...v, x: e.target.x(), y: e.target.y() }))
        }}
        onWheel={onWheel}
        onClick={(e) => {
          if (e.target === stageRef.current) onSelect(null)
        }}
      >
        <Layer>
          {/* fundal alb pentru export */}
          <Rect {...layout.bounds} fill="#fff" listening={false} />
          {layout.edges.map((e, i) => (
            <Line key={i} points={e.points} stroke={color} strokeWidth={2} dash={e.dashed ? [8, 6] : undefined} lineCap="square" listening={false} />
          ))}
          {layout.labels.map((l, i) => (
            <Text key={'l' + i} x={l.x} y={l.y} text={l.text} fontSize={11} fontFamily="Arial" fill="#444" listening={false} />
          ))}
          {layout.nodes.map((n) => {
            const [code, name, detail] = nodeTexts(n)
            const img = n.device ? symbolImage(n.device.type) : undefined
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
        </Layer>
        <Layer name="ui" listening={false}>
          {layout.nodes.map((n) =>
            selection?.kind === 'device' && selection.id === n.device?.id ? (
              <Rect key="sel" x={n.x - 4 * k} y={n.y - 4 * k} width={NODE_W + 8 * k} height={NODE_H + 8 * k} stroke="#1e88e5" strokeWidth={2 * k} dash={[6 * k, 4 * k]} />
            ) : null,
          )}
        </Layer>
      </Stage>
      <div className="canvas-hint">
        Schemă bloc generată automat din echipamentele și cablurile de pe plan. Modifică planul și schema se actualizează;
        pentru editare liberă, folosește „Export draw.io”.
      </div>
    </div>
  )
}
