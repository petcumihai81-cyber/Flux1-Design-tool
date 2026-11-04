import { useEffect, useMemo, useRef, useState } from 'react'
import type Konva from 'konva'
import { Circle, Group, Image as KImage, Layer, Line, Rect, Stage, Text, Wedge } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { Device, Project, Selection, Sheet, Tool } from './types'
import { symbolByType, symbolImage, systemById } from './symbols'
import { ALL_SYSTEMS, cableMeters, contentBounds, deviceSystem } from './project'

/** Scara implicită dacă planul nu e calibrat (px per metru), folosită doar pentru conurile camerelor */
export const FALLBACK_PX_PER_M = 20

interface Props {
  project: Project
  sheet: Sheet
  tool: Tool
  selection: Selection
  stageRef: React.RefObject<Konva.Stage | null>
  fitSignal: number
  onSelect: (s: Selection) => void
  onAddDevice: (type: string, x: number, y: number, catalogId?: string) => void
  onAddCable: (points: number[], from?: string, to?: string) => void
  onScaleMeasured: (pixels: number) => void
  checkpoint: () => void
  update: (fn: (p: Project) => Project) => void
}

type Pt = { x: number; y: number }

const fmtNum = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',')

/** Culoare cu transparență (fără `opacity` pe formă, care la export taie conurile mari) */
const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

function useImage(src: string | undefined) {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  useEffect(() => {
    if (!src) {
      setImg(null)
      return
    }
    const i = new Image()
    i.onload = () => setImg(i)
    i.src = src
  }, [src])
  return img
}

/** Mută capetele cablurilor legate de un echipament */
function moveDevice(p: Project, id: string, x: number, y: number): Project {
  return {
    ...p,
    devices: p.devices.map((d) => (d.id === id ? { ...d, x, y } : d)),
    cables: p.cables.map((c) => {
      if (c.from !== id && c.to !== id) return c
      const pts = [...c.points]
      if (c.from === id) {
        pts[0] = x
        pts[1] = y
      }
      if (c.to === id) {
        pts[pts.length - 2] = x
        pts[pts.length - 1] = y
      }
      return { ...c, points: pts }
    }),
  }
}

export default function PlanCanvas(props: Props) {
  const { project, sheet, tool, selection, stageRef, fitSignal, onSelect, onAddDevice, onAddCable, onScaleMeasured, checkpoint, update } = props
  const wrapRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 800, height: 600 })
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 })
  const [cursor, setCursor] = useState<Pt | null>(null)
  const [draft, setDraft] = useState<{ points: number[]; from?: string }>({ points: [] })
  const [scalePts, setScalePts] = useState<Pt[]>([])
  const bgImage = useImage(project.background?.src)

  const S = project.symbolSize
  const ppm = project.pxPerMeter ?? FALLBACK_PX_PER_M
  const hidden = useMemo(() => new Set(ALL_SYSTEMS.filter((s) => !sheet.systems.includes(s))), [sheet.systems])
  const visibleDevices = project.devices.filter((d) => {
    const sys = deviceSystem(d)
    return sys && !hidden.has(sys)
  })
  const visibleCables = project.cables.filter((c) => !hidden.has(c.system))

  // Dimensiunea zonei de desen
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ width: el.clientWidth, height: el.clientHeight }))
    ro.observe(el)
    setSize({ width: el.clientWidth, height: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  // Încadrare în ecran
  useEffect(() => {
    const b = contentBounds(project)
    if (!b) {
      setView({ x: size.width / 2, y: size.height / 2, scale: 1 })
      return
    }
    const scale = Math.min(size.width / b.width, size.height / b.height) * 0.95
    setView({
      scale,
      x: (size.width - b.width * scale) / 2 - b.x * scale,
      y: (size.height - b.height * scale) / 2 - b.y * scale,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitSignal, project.background?.src, size.width > 0])

  // Resetare desen temporar la schimbarea uneltei
  useEffect(() => {
    setDraft({ points: [] })
    setScalePts([])
  }, [tool])

  // Taste pentru cablu: Enter = finalizare, Backspace = șterge ultimul punct, Esc gestionat în App
  useEffect(() => {
    if (tool.kind !== 'cable') return
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, select')) return
      if (e.key === 'Enter') finishDraft()
      if (e.key === 'Backspace' && draft.points.length) {
        e.preventDefault()
        setDraft((d) => ({ ...d, points: d.points.slice(0, -2) }))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const pointer = (): Pt | null => stageRef.current?.getRelativePointerPosition() ?? null

  const deviceAt = (pt: Pt): Device | undefined => {
    let best: Device | undefined
    let bestD = S * 0.75
    for (const d of visibleDevices) {
      const dist = Math.hypot(d.x - pt.x, d.y - pt.y)
      if (dist < bestD) {
        best = d
        bestD = dist
      }
    }
    return best
  }

  function finishDraft(to?: string, extra?: number[]) {
    const pts = [...draft.points, ...(extra ?? [])]
    // elimină punctele consecutive identice (ex. de la dublu-click)
    const clean: number[] = []
    for (let i = 0; i < pts.length; i += 2) {
      const n = clean.length
      if (n && Math.hypot(clean[n - 2] - pts[i], clean[n - 1] - pts[i + 1]) < 0.5) continue
      clean.push(pts[i], pts[i + 1])
    }
    if (clean.length >= 4) onAddCable(clean, draft.from, to)
    setDraft({ points: [] })
  }

  const onStageClick = (e: KonvaEventObject<MouseEvent>) => {
    if (e.evt.button !== 0) return
    const pt = pointer()
    if (!pt) return
    const stage = stageRef.current
    const onEmpty = e.target === stage || e.target.name() === 'background'
    switch (tool.kind) {
      case 'select':
        if (onEmpty) onSelect(null)
        break
      case 'place':
        onAddDevice(tool.type, pt.x, pt.y, tool.catalogId)
        break
      case 'scale':
        if (scalePts.length === 0) setScalePts([pt])
        else {
          const [a] = scalePts
          setScalePts([])
          onScaleMeasured(Math.hypot(pt.x - a.x, pt.y - a.y))
        }
        break
      case 'cable': {
        const dev = deviceAt(pt)
        if (!draft.points.length) {
          setDraft(dev ? { points: [dev.x, dev.y], from: dev.id } : { points: [pt.x, pt.y] })
        } else if (dev && dev.id !== draft.from) {
          finishDraft(dev.id, [dev.x, dev.y])
        } else {
          setDraft((d) => ({ ...d, points: [...d.points, pt.x, pt.y] }))
        }
        break
      }
    }
  }

  const onWheel = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const stage = stageRef.current
    if (!stage) return
    const p = stage.getPointerPosition()
    if (!p) return
    const old = view.scale
    const factor = e.evt.deltaY > 0 ? 1 / 1.12 : 1.12
    const scale = Math.min(Math.max(old * factor, 0.02), 40)
    const wx = (p.x - view.x) / old
    const wy = (p.y - view.y) / old
    setView({ scale, x: p.x - wx * scale, y: p.y - wy * scale })
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const type = e.dataTransfer.getData('text/symbol-type')
    const catalogId = e.dataTransfer.getData('text/catalog-id') || undefined
    const stage = stageRef.current
    if (!type || !stage) return
    stage.setPointersPositions(e.nativeEvent)
    const pt = stage.getRelativePointerPosition()
    if (pt) onAddDevice(type, pt.x, pt.y, catalogId)
  }

  const isSelect = tool.kind === 'select'
  const selDevice = selection?.kind === 'device' ? project.devices.find((d) => d.id === selection.id) : undefined
  const selCable = selection?.kind === 'cable' ? project.cables.find((c) => c.id === selection.id) : undefined
  const k = 1 / view.scale // pentru elemente cu dimensiune constantă pe ecran

  /** Mânere pe conul camerei selectate: vârful = distanța, marginile = unghiul */
  const coneHandles = (d: Device) => {
    const def = symbolByType(d.type)
    if (!def?.camera) return null
    const color = systemById(def.system).color
    const fov = d.fov ?? def.camera.fov
    const range = d.range ?? def.camera.range
    const R = range * ppm
    const rad = (deg: number) => (deg * Math.PI) / 180
    const at = (deg: number, r: number) => ({ x: d.x + Math.cos(rad(deg)) * r, y: d.y + Math.sin(rad(deg)) * r })
    const setCam = (patch: Partial<Device>) => update((p) => ({ ...p, devices: p.devices.map((x) => (x.id === d.id ? { ...x, ...patch } : x)) }))
    const tip = at(d.rotation, R)
    const handleProps = {
      radius: 6 * k,
      fill: '#fff',
      stroke: color,
      strokeWidth: 2.5 * k,
      draggable: true,
      onMouseEnter: (e: KonvaEventObject<MouseEvent>) => (e.target.getStage()!.container().style.cursor = 'grab'),
      onMouseLeave: (e: KonvaEventObject<MouseEvent>) => (e.target.getStage()!.container().style.cursor = ''),
      onDragStart: (e: KonvaEventObject<DragEvent>) => {
        e.cancelBubble = true
        checkpoint()
      },
      onDragEnd: (e: KonvaEventObject<DragEvent>) => {
        e.cancelBubble = true
      },
    }
    const onFovDrag = (e: KonvaEventObject<DragEvent>) => {
      e.cancelBubble = true
      const ang = (Math.atan2(e.target.y() - d.y, e.target.x() - d.x) * 180) / Math.PI
      let delta = (((ang - d.rotation) % 360) + 540) % 360 - 180
      delta = Math.abs(delta)
      const v = Math.min(359, Math.max(5, Math.round(delta * 2)))
      setCam({ fov: e.evt.shiftKey ? v : Math.round(v / 5) * 5 || 5 })
    }
    return (
      <>
        {/* distanța: vârful conului */}
        <Rect
          {...handleProps}
          x={tip.x}
          y={tip.y}
          width={11 * k}
          height={11 * k}
          offsetX={5.5 * k}
          offsetY={5.5 * k}
          onDragMove={(e) => {
            e.cancelBubble = true
            const m = Math.hypot(e.target.x() - d.x, e.target.y() - d.y) / ppm
            setCam({ range: Math.max(1, e.evt.shiftKey ? Math.round(m * 10) / 10 : Math.round(m * 2) / 2) })
          }}
        />
        {/* unghiul: marginile conului */}
        {fov < 360 && (
          <>
            <Circle {...handleProps} {...at(d.rotation - fov / 2, R * 0.85)} onDragMove={onFovDrag} />
            <Circle {...handleProps} {...at(d.rotation + fov / 2, R * 0.85)} onDragMove={onFovDrag} />
          </>
        )}
        <Text
          x={tip.x + 10 * k}
          y={tip.y - 20 * k}
          text={`${fmtNum(range)} m${fov < 360 ? ` · ${fmtNum(fov)}°` : ''}`}
          fontSize={13 * k}
          fontStyle="bold"
          fill={color}
          listening={false}
        />
      </>
    )
  }

  const cursorStyle =
    tool.kind === 'place' || tool.kind === 'scale' || tool.kind === 'cable' ? 'crosshair' : 'default'

  return (
    <div
      ref={wrapRef}
      className="canvas-wrap"
      style={{ cursor: cursorStyle }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onContextMenu={(e) => e.preventDefault()}
    >
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
        onClick={onStageClick}
        onDblClick={() => tool.kind === 'cable' && finishDraft()}
        onMouseMove={() => {
          if (tool.kind === 'cable' || tool.kind === 'scale') setCursor(pointer())
        }}
      >
        {/* Fundal */}
        <Layer listening={!!bgImage}>
          {bgImage && project.background && (
            <KImage name="background" image={bgImage} width={project.background.width} height={project.background.height} />
          )}
        </Layer>

        {/* Conuri camere + cabluri */}
        <Layer>
          {sheet.showCones && visibleDevices.map((d) => {
            const def = symbolByType(d.type)
            if (!def?.camera) return null
            const color = systemById(def.system).color
            const fov = d.fov ?? def.camera.fov
            const range = (d.range ?? def.camera.range) * ppm
            return fov >= 360 ? (
              <Circle key={'cone' + d.id} x={d.x} y={d.y} radius={range} fill={rgba(color, 0.12)} stroke={rgba(color, 0.6)} strokeWidth={S * 0.04} listening={false} />
            ) : (
              <Wedge
                key={'cone' + d.id}
                x={d.x}
                y={d.y}
                radius={range}
                angle={fov}
                rotation={d.rotation - fov / 2}
                fill={rgba(color, 0.14)}
                stroke={rgba(color, 0.6)}
                strokeWidth={S * 0.04}
                listening={false}
              />
            )
          })}
          {visibleCables.map((c) => {
            const color = systemById(c.system).color
            const selected = selCable?.id === c.id
            return (
              <Line
                key={c.id}
                points={c.points}
                stroke={color}
                strokeWidth={S * (selected ? 0.12 : 0.07)}
                dash={c.system === 'INC' ? [S * 0.4, S * 0.15] : undefined}
                lineCap="round"
                lineJoin="round"
                hitStrokeWidth={Math.max(S * 0.4, 8 * k)}
                listening={isSelect}
                onClick={(e) => {
                  e.cancelBubble = true
                  onSelect({ kind: 'cable', id: c.id })
                }}
              />
            )
          })}
        </Layer>

        {/* Echipamente */}
        <Layer>
          {visibleDevices.map((d) => {
            const def = symbolByType(d.type)!
            const color = systemById(def.system).color
            const img = symbolImage(d.type)
            const rotateSymbol = !!def.camera || def.shape === 'custom'
            return (
              <Group
                key={d.id}
                x={d.x}
                y={d.y}
                draggable={isSelect}
                listening={isSelect || tool.kind === 'cable'}
                onClick={(e) => {
                  if (!isSelect) return
                  e.cancelBubble = true
                  onSelect({ kind: 'device', id: d.id })
                }}
                onDragStart={(e) => {
                  e.cancelBubble = true
                  checkpoint()
                  onSelect({ kind: 'device', id: d.id })
                }}
                onDragMove={(e) => {
                  e.cancelBubble = true
                  update((p) => moveDevice(p, d.id, e.target.x(), e.target.y()))
                }}
                onDragEnd={(e) => {
                  e.cancelBubble = true
                  update((p) => moveDevice(p, d.id, e.target.x(), e.target.y()))
                }}
              >
                {img && (
                  <KImage
                    image={img}
                    width={S}
                    height={S}
                    offsetX={S / 2}
                    offsetY={S / 2}
                    rotation={rotateSymbol ? d.rotation : 0}
                  />
                )}
                <Text
                  text={d.label}
                  fontSize={S * 0.38}
                  fontStyle="bold"
                  fontFamily="Arial"
                  fill={color}
                  width={S * 4}
                  offsetX={S * 2}
                  y={S * 0.55}
                  align="center"
                />
              </Group>
            )
          })}
        </Layer>

        {/* Elemente de interfață (ascunse la export) */}
        <Layer name="ui">
          {selDevice && !hidden.has(deviceSystem(selDevice)!) && (
            <>
              <Circle x={selDevice.x} y={selDevice.y} radius={S * 0.8} stroke="#1e88e5" strokeWidth={2 * k} dash={[6 * k, 4 * k]} listening={false} />
              {isSelect && (
                <>
                  <Line
                    points={[
                      selDevice.x,
                      selDevice.y,
                      selDevice.x + Math.cos((selDevice.rotation * Math.PI) / 180) * S * 1.5,
                      selDevice.y + Math.sin((selDevice.rotation * Math.PI) / 180) * S * 1.5,
                    ]}
                    stroke="#1e88e5"
                    strokeWidth={1.5 * k}
                    listening={false}
                  />
                  <Circle
                    x={selDevice.x + Math.cos((selDevice.rotation * Math.PI) / 180) * S * 1.5}
                    y={selDevice.y + Math.sin((selDevice.rotation * Math.PI) / 180) * S * 1.5}
                    radius={6 * k}
                    fill="#1e88e5"
                    stroke="#fff"
                    strokeWidth={1.5 * k}
                    draggable
                    onMouseEnter={(e) => (e.target.getStage()!.container().style.cursor = 'grab')}
                    onMouseLeave={(e) => (e.target.getStage()!.container().style.cursor = '')}
                    onDragStart={(e) => {
                      e.cancelBubble = true
                      checkpoint()
                    }}
                    onDragMove={(e) => {
                      e.cancelBubble = true
                      const ang = (Math.atan2(e.target.y() - selDevice.y, e.target.x() - selDevice.x) * 180) / Math.PI
                      const snapped = e.evt.shiftKey ? ang : Math.round(ang / 5) * 5
                      const rot = (snapped + 360) % 360
                      update((p) => ({ ...p, devices: p.devices.map((d) => (d.id === selDevice.id ? { ...d, rotation: rot } : d)) }))
                    }}
                    onDragEnd={(e) => {
                      e.cancelBubble = true
                    }}
                  />
                </>
              )}
              {isSelect && sheet.showCones && coneHandles(selDevice)}
            </>
          )}

          {selCable && !hidden.has(selCable.system) && (
            <>
              {selCable.points.map((_, i) => {
                if (i % 2) return null
                const isEnd = i === 0 || i === selCable.points.length - 2
                const attached = (i === 0 && selCable.from) || (i === selCable.points.length - 2 && selCable.to)
                return (
                  <Circle
                    key={i}
                    x={selCable.points[i]}
                    y={selCable.points[i + 1]}
                    radius={(isEnd ? 5 : 6) * k}
                    fill={attached ? '#90a4ae' : '#fff'}
                    stroke="#1e88e5"
                    strokeWidth={2 * k}
                    draggable={isSelect && !attached}
                    onDragStart={(e) => {
                      e.cancelBubble = true
                      checkpoint()
                    }}
                    onDragMove={(e) => {
                      e.cancelBubble = true
                      const x = e.target.x()
                      const y = e.target.y()
                      update((p) => ({
                        ...p,
                        cables: p.cables.map((c) => {
                          if (c.id !== selCable.id) return c
                          const pts = [...c.points]
                          pts[i] = x
                          pts[i + 1] = y
                          return { ...c, points: pts }
                        }),
                      }))
                    }}
                    onDragEnd={(e) => {
                      e.cancelBubble = true
                    }}
                    onDblClick={(e) => {
                      // dublu-click pe un punct intermediar îl șterge
                      e.cancelBubble = true
                      if (isEnd) return
                      checkpoint()
                      update((p) => ({
                        ...p,
                        cables: p.cables.map((c) =>
                          c.id === selCable.id ? { ...c, points: [...c.points.slice(0, i), ...c.points.slice(i + 2)] } : c,
                        ),
                      }))
                    }}
                  />
                )
              })}
              {(() => {
                const m = cableMeters(selCable, project)
                const mid = Math.floor(selCable.points.length / 4) * 2
                const ax = selCable.points[mid - 2] ?? selCable.points[0]
                const ay = selCable.points[mid - 1] ?? selCable.points[1]
                const bx = selCable.points[mid]
                const by = selCable.points[mid + 1]
                return (
                  <Text
                    x={(ax + bx) / 2}
                    y={(ay + by) / 2 - 18 * k}
                    text={`${selCable.code}${m != null ? ` · ${m} m` : ''}`}
                    fontSize={13 * k}
                    fontStyle="bold"
                    fill="#0d47a1"
                    listening={false}
                  />
                )
              })()}
            </>
          )}

          {tool.kind === 'cable' && draft.points.length > 0 && (
            <Line
              points={cursor ? [...draft.points, cursor.x, cursor.y] : draft.points}
              stroke="#1e88e5"
              strokeWidth={2 * k}
              dash={[8 * k, 5 * k]}
              listening={false}
            />
          )}

          {tool.kind === 'scale' && scalePts.length === 1 && (
            <>
              <Circle x={scalePts[0].x} y={scalePts[0].y} radius={5 * k} fill="#d81b60" listening={false} />
              {cursor && (
                <Line
                  points={[scalePts[0].x, scalePts[0].y, cursor.x, cursor.y]}
                  stroke="#d81b60"
                  strokeWidth={2 * k}
                  dash={[8 * k, 5 * k]}
                  listening={false}
                />
              )}
            </>
          )}
        </Layer>
      </Stage>

      {tool.kind !== 'select' && (
        <div className="canvas-hint">
          {tool.kind === 'place' && <>Click pe plan pentru a plasa <b>{(tool.catalogId && project.catalog.find((c) => c.id === tool.catalogId)?.model) || symbolByType(tool.type)?.name}</b>. Esc = gata.</>}
          {tool.kind === 'scale' && <>Click pe cele două capete ale unei cote cunoscute. Esc = anulare.</>}
          {tool.kind === 'cable' && (
            <>
              Click pe echipamentul de start, apoi puncte de traseu; click pe echipamentul final (sau dublu-click / Enter) pentru a
              termina. Backspace = șterge ultimul punct, Esc = anulare.
            </>
          )}
        </div>
      )}
    </div>
  )
}
