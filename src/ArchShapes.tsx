import { Circle, Group, Line, Rect, Text } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { ArchElement, Project } from './types'
import { fmtM, snapPoint, wallAt, wallVertices } from './arch'
import { polylineLength } from './project'

/**
 * Desenul elementelor de arhitectură pe plan: pereți (grosime reală), uși (cu sensul de deschidere),
 * ferestre, texte de încăpere și cote. În modul Selectare se pot selecta, muta și edita.
 */

interface Props {
  arch: ArchElement[]
  ppm: number
  /** Mărimea simbolurilor (px) — textul cotelor se scalează cu ea */
  symbolSize: number
  /** px de ecran → unități plan (pentru mânere de mărime constantă) */
  k: number
  selectedId?: string
  interactive: boolean
  onSelect: (id: string) => void
  /** Dublu-click pe un text: editare directă pe plan */
  onEditText: (id: string) => void
  checkpoint: () => void
  update: (fn: (p: Project) => Project) => void
}

const INK = '#222'

/** Puncte pe un arc (pentru deschiderea ușii) */
function arcPoints(cx: number, cy: number, r: number, a0: number, a1: number, n = 16) {
  const pts: number[] = []
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180
    pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
  }
  return pts
}

export default function ArchShapes({ arch, ppm, k, symbolSize, selectedId, interactive, onSelect, onEditText, checkpoint, update }: Props) {
  const patch = (id: string, p: Partial<ArchElement>) =>
    update((pr) => ({ ...pr, arch: pr.arch.map((a) => (a.id === id ? { ...a, ...p } : a)) }))

  const common = (a: ArchElement) => ({
    name: 'arch:' + a.id,
    onClick: (e: KonvaEventObject<MouseEvent>) => {
      if (!interactive || e.evt.button !== 0) return
      e.cancelBubble = true
      onSelect(a.id)
    },
  })

  /** Mutarea întregului element (pereți și cote: se translatează punctele) */
  const moveProps = (a: ArchElement) => ({
    draggable: interactive,
    onDragStart: (e: KonvaEventObject<DragEvent>) => {
      e.cancelBubble = true
      checkpoint()
      onSelect(a.id)
    },
    onDragEnd: (e: KonvaEventObject<DragEvent>) => {
      e.cancelBubble = true
      const n = e.target
      if (a.points) {
        const dx = n.x()
        const dy = n.y()
        n.position({ x: 0, y: 0 })
        patch(a.id, { points: a.points.map((v, i) => v + (i % 2 ? dy : dx)) })
      } else {
        let x = n.x()
        let y = n.y()
        let rotation = a.rotation
        // ușile și ferestrele se lipesc din nou de perete
        if (a.kind === 'door' || a.kind === 'window') {
          const w = wallAt(arch, x, y, 0.5 * ppm)
          if (w) {
            x = w.x
            y = w.y
            const keep = Math.round(((a.rotation ?? 0) - w.angle) / 180) * 180
            rotation = w.angle + keep
          }
        }
        patch(a.id, { x, y, rotation })
      }
    },
  })

  const sel = (a: ArchElement) => a.id === selectedId

  return (
    <>
      {/* pereții primii, ca ușile și ferestrele să-i „taie” */}
      {arch
        .filter((a) => a.kind === 'wall' && a.points)
        .map((a) => (
          <Line
            key={a.id}
            {...common(a)}
            {...moveProps(a)}
            points={a.points!}
            stroke={sel(a) ? '#1565c0' : INK}
            strokeWidth={(a.thickness ?? 0.25) * ppm}
            lineCap="square"
            lineJoin="miter"
            hitStrokeWidth={Math.max((a.thickness ?? 0.25) * ppm, 10 * k)}
          />
        ))}

      {arch.map((a) => {
        if (a.kind === 'door' || a.kind === 'window') {
          const w = (a.width ?? (a.kind === 'door' ? 0.9 : 1.2)) * ppm
          const t = 0.32 * ppm // acoperă grosimea peretelui
          const color = sel(a) ? '#1565c0' : INK
          return (
            <Group key={a.id} {...common(a)} {...moveProps(a)} x={a.x} y={a.y} rotation={a.rotation ?? 0} scaleX={a.flipX ? -1 : 1} scaleY={a.flipY ? -1 : 1}>
              <Rect name={'arch:' + a.id} x={-w / 2} y={-t / 2} width={w} height={t} fill="#fff" />
              {a.kind === 'door' ? (
                <>
                  {/* foaia ușii (deschisă la 90°) și arcul de deschidere */}
                  <Line name={'arch:' + a.id} points={[-w / 2, 0, -w / 2, -w]} stroke={color} strokeWidth={Math.max(0.04 * ppm, 1.5 * k)} />
                  <Line name={'arch:' + a.id} points={arcPoints(-w / 2, 0, w, -90, 0)} stroke={color} strokeWidth={Math.max(0.02 * ppm, 1 * k)} dash={[6 * k, 4 * k]} />
                  <Line name={'arch:' + a.id} points={[-w / 2, -t / 2, -w / 2, t / 2]} stroke={color} strokeWidth={Math.max(0.03 * ppm, 1 * k)} />
                  <Line name={'arch:' + a.id} points={[w / 2, -t / 2, w / 2, t / 2]} stroke={color} strokeWidth={Math.max(0.03 * ppm, 1 * k)} />
                </>
              ) : (
                <>
                  <Rect name={'arch:' + a.id} x={-w / 2} y={-t / 4} width={w} height={t / 2} stroke={color} strokeWidth={Math.max(0.02 * ppm, 1 * k)} />
                  <Line name={'arch:' + a.id} points={[-w / 2, 0, w / 2, 0]} stroke={color} strokeWidth={Math.max(0.02 * ppm, 1 * k)} />
                  <Line name={'arch:' + a.id} points={[-w / 2, -t / 2, -w / 2, t / 2]} stroke={color} strokeWidth={Math.max(0.03 * ppm, 1 * k)} />
                  <Line name={'arch:' + a.id} points={[w / 2, -t / 2, w / 2, t / 2]} stroke={color} strokeWidth={Math.max(0.03 * ppm, 1 * k)} />
                </>
              )}
            </Group>
          )
        }
        if (a.kind === 'label') {
          const h = (a.size ?? 0.45) * ppm
          // lățimea aproximativă a textului, ca zona de click să nu acopere pereții vecini
          const labelW = Math.max(h * 2, [...(a.text ?? '')].length * h * 0.58)
          return (
            <Text
              key={a.id}
              {...common(a)}
              {...moveProps(a)}
              x={a.x}
              y={a.y}
              rotation={a.rotation ?? 0}
              text={a.text ?? ''}
              fontSize={h}
              fontStyle="bold"
              fontFamily="Arial"
              fill={sel(a) ? '#1565c0' : '#555'}
              width={labelW}
              offsetX={labelW / 2}
              offsetY={h / 2}
              align="center"
              onDblClick={(e) => {
                if (!interactive) return
                e.cancelBubble = true
                onEditText(a.id)
              }}
            />
          )
        }
        if (a.kind === 'dim' && a.points) {
          const [x1, y1, x2, y2] = a.points
          const ang = Math.atan2(y2 - y1, x2 - x1)
          const L = Math.hypot(x2 - x1, y2 - y1)
          const tk = 0.15 * ppm
          const nx = -Math.sin(ang)
          const ny = Math.cos(ang)
          const color = sel(a) ? '#1565c0' : INK
          const fs = Math.max(0.3 * ppm, symbolSize * 0.35, 10 * k)
          let deg = (ang * 180) / Math.PI
          if (deg > 90 || deg < -90) deg += 180
          return (
            <Group key={a.id} {...common(a)} {...moveProps(a)}>
              <Line name={'arch:' + a.id} points={a.points} stroke={color} strokeWidth={Math.max(0.02 * ppm, 1 * k)} hitStrokeWidth={10 * k} />
              <Line name={'arch:' + a.id} points={[x1 - nx * tk, y1 - ny * tk, x1 + nx * tk, y1 + ny * tk]} stroke={color} strokeWidth={Math.max(0.02 * ppm, 1 * k)} />
              <Line name={'arch:' + a.id} points={[x2 - nx * tk, y2 - ny * tk, x2 + nx * tk, y2 + ny * tk]} stroke={color} strokeWidth={Math.max(0.02 * ppm, 1 * k)} />
              <Text
                name={'arch:' + a.id}
                x={(x1 + x2) / 2 - nx * fs * 0.9}
                y={(y1 + y2) / 2 - ny * fs * 0.9}
                rotation={deg}
                text={fmtM(L / ppm)}
                fontSize={fs}
                fontFamily="Arial"
                fill={color}
                width={fs * 8}
                offsetX={fs * 4}
                offsetY={fs / 2}
                align="center"
              />
            </Group>
          )
        }
        return null
      })}

      {/* mânere pentru vârfurile peretelui / capetele cotei selectate */}
      {interactive &&
        arch
          .filter((a) => a.id === selectedId && a.points)
          .map((a) =>
            a.points!.map((_, i) =>
              i % 2 ? null : (
                <Circle
                  key={a.id + i}
                  x={a.points![i]}
                  y={a.points![i + 1]}
                  radius={6 * k}
                  fill="#fff"
                  stroke="#1e88e5"
                  strokeWidth={2 * k}
                  draggable
                  onDragStart={(e) => {
                    e.cancelBubble = true
                    checkpoint()
                  }}
                  onDragMove={(e) => {
                    e.cancelBubble = true
                    const pts = [...a.points!]
                    const prev = i >= 2 ? { x: pts[i - 2], y: pts[i - 1] } : i + 2 < pts.length ? { x: pts[i + 2], y: pts[i + 3] } : undefined
                    const p = snapPoint({ x: e.target.x(), y: e.target.y() }, prev, wallVertices(arch, a.id), 10 * k, e.evt.shiftKey)
                    e.target.position(p)
                    pts[i] = p.x
                    pts[i + 1] = p.y
                    patch(a.id, { points: pts })
                  }}
                  onDragEnd={(e) => {
                    e.cancelBubble = true
                  }}
                />
              ),
            ),
          )}
      {/* mâner de redimensionare pentru textul selectat (colțul din dreapta-jos) */}
      {interactive &&
        arch
          .filter((a) => a.id === selectedId && a.kind === 'label' && a.x != null && a.y != null)
          .map((a) => {
            const len = Math.max(3, [...(a.text ?? '')].length)
            // distanța centru → colț, pentru o înălțime de 1 m
            const unit = ppm * Math.hypot(Math.max(1, len * 0.58) / 2, 0.5)
            const size = a.size ?? 0.45
            const rot = ((a.rotation ?? 0) * Math.PI) / 180
            const lx = (Math.max(1, len * 0.58) / 2) * size * ppm
            const ly = 0.5 * size * ppm
            const hx = a.x! + lx * Math.cos(rot) - ly * Math.sin(rot)
            const hy = a.y! + lx * Math.sin(rot) + ly * Math.cos(rot)
            return (
              <Rect
                key={'rs' + a.id}
                x={hx}
                y={hy}
                width={11 * k}
                height={11 * k}
                offsetX={5.5 * k}
                offsetY={5.5 * k}
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
                  const d = Math.hypot(e.target.x() - a.x!, e.target.y() - a.y!)
                  const s = Math.max(0.1, Math.round((d / unit) * 20) / 20)
                  patch(a.id, { size: s })
                }}
                onDragEnd={(e) => {
                  e.cancelBubble = true
                }}
              />
            )
          })}
      {/* lungimea peretelui selectat */}
      {arch
        .filter((a) => a.id === selectedId && a.kind === 'wall' && a.points && a.points.length >= 4)
        .map((a) => (
          <Text
            key={'len' + a.id}
            x={a.points![0]}
            y={a.points![1] - 22 * k}
            text={fmtM(polylineLength(a.points!) / ppm)}
            fontSize={13 * k}
            fontStyle="bold"
            fill="#1565c0"
            listening={false}
          />
        ))}
    </>
  )
}
