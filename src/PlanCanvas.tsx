import { useEffect, useMemo, useRef, useState } from 'react'
import type Konva from 'konva'
import { Arrow, Circle, Ellipse, Group, Image as KImage, Layer, Line, Rect, Stage, Text, Wedge } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { Device, Level, NewArch, Project, Selection, Sheet, Tool } from './types'
import ArchShapes from './ArchShapes'
import { groupBounds, itemsInRect, sameItem, snapshot, toggleItem, translateGroup } from './group'
import type { Item, Snapshot } from './group'
import { fmtM, newWall, snapPoint, wallAt, wallVertices } from './arch'
import { glyphLayout, onSymbolImage, symbolByType, systemById } from './symbols'
import { ZoomBar } from './ZoomBar'
import { SCREEN_PX_PER_MM, stepPercent, useZoomKeys } from './zoom'
import { archLayer, layerLocked, layerVisible } from './layers'
import { prepareImage } from './images'
import { deviceColor, deviceImage } from './symbolLibrary'
import { ALL_SYSTEMS, cableMeters, contentBounds, deviceSystem, formatLabel, nearestOnPolyline, outsideFrame, pageFrame, paperMmPerPx, sheetDrawBounds, UNCALIBRATED_PX_PER_M } from './project'

/** Scara implicită dacă planul nu e calibrat (px per metru), folosită doar pentru conurile camerelor */
export const FALLBACK_PX_PER_M = UNCALIBRATED_PX_PER_M

interface Props {
  project: Project
  sheet: Sheet
  /** Nivelul afișat de planșă */
  level: Level
  tool: Tool
  selection: Selection
  stageRef: React.RefObject<Konva.Stage | null>
  fitSignal: number
  onSelect: (s: Selection) => void
  onAddDevice: (type: string, x: number, y: number, catalogId?: string, symbolId?: string) => void
  onAddCable: (points: number[], from?: string, to?: string, via?: { cableId: string; end: 'from' | 'to' }, riser?: string) => void
  onScaleMeasured: (pixels: number) => void
  onAddArch: (el: NewArch) => void
  /** Selecția multiplă */
  multi: Item[]
  onMulti: (items: Item[]) => void
  /** Textul de încăpere editat direct pe plan (id) */
  editTextId: string | null
  onEditText: (id: string | null) => void
  /** Click dreapta: poziția pe ecran, pe plan și elementul de sub cursor */
  onContext: (info: { clientX: number; clientY: number; x: number; y: number; target: Selection }) => void
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
  const { multi, onMulti, editTextId, onEditText, project, sheet, level, tool, selection, stageRef, fitSignal, onSelect, onAddDevice, onAddCable, onScaleMeasured, onAddArch, onContext, checkpoint, update } = props
  const wrapRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 800, height: 600 })
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 })
  const [cursor, setCursor] = useState<Pt | null>(null)
  const [draft, setDraft] = useState<{ points: number[]; from?: string; riser?: string }>({ points: [] })
  const [scalePts, setScalePts] = useState<Pt[]>([])
  /** Peretele sau cota în curs de desenare */
  const [archDraft, setArchDraft] = useState<number[]>([])
  /** Unealta Imagine: punctul unde se pune imaginea aleasă */
  const imgAt = useRef<Pt | null>(null)
  const imgInput = useRef<HTMLInputElement>(null)
  /** Dreptunghiul de selecție (coordonate plan) */
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  /** Copia grupului la începutul tragerii */
  const groupSnap = useRef<{ snap: Snapshot; x: number; y: number } | null>(null)
  const bgImage = useImage(level.background?.src)

  const S = level.symbolSize
  // imaginile simbolurilor colorate / personalizate se încarcă la cerere: redesenăm când sosesc
  const [, setImgTick] = useState(0)
  useEffect(() => onSymbolImage(() => setImgTick((n) => n + 1)), [])
  const ppm = level.pxPerMeter ?? FALLBACK_PX_PER_M
  const frame = pageFrame(project, sheet)
  /** Planul de fundal se poate trage cu mouse-ul (deblocat din panoul Nivel) */
  const bgUnlocked = level.bgLocked === false && tool.kind === 'select'
  const frameOut = frame ? outsideFrame(project, sheet) : false
  // straturi: vizibile / blocate pe planșa curentă (layers.ts)
  const levelArch = useMemo(
    () => project.arch.filter((a) => a.levelId === level.id && layerVisible(sheet, archLayer(a))),
    [project.arch, level.id, sheet],
  )
  const archLocked = useMemo(() => levelArch.filter((a) => layerLocked(sheet, archLayer(a))), [levelArch, sheet])
  const archFree = useMemo(() => levelArch.filter((a) => !layerLocked(sheet, archLayer(a))), [levelArch, sheet])
  const hidden = useMemo(() => new Set(ALL_SYSTEMS.filter((s) => !sheet.systems.includes(s))), [sheet.systems])
  const visibleDevices = project.devices.filter((d) => {
    if (d.levelId !== level.id) return false
    const sys = deviceSystem(d)
    return sys && !hidden.has(sys) && layerVisible(sheet, `${sys}:echipamente`)
  })
  const visibleCables = project.cables.filter((c) => c.levelId === level.id && !hidden.has(c.system) && layerVisible(sheet, `${c.system}:cabluri`))
  const devLocked = (d: Device) => layerLocked(sheet, `${deviceSystem(d)}:echipamente`)
  const cabLocked = (c: { system: string }) => layerLocked(sheet, `${c.system}:cabluri`)
  const showLabels = (d: Device) => layerVisible(sheet, `${deviceSystem(d)}:etichete`)

  // Dimensiunea zonei de desen
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ width: el.clientWidth, height: el.clientHeight }))
    ro.observe(el)
    setSize({ width: el.clientWidth, height: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  /** Încadrează dreptunghiul dat în ecran (cu limită de mărire) */
  const fitBounds = (b: { x: number; y: number; width: number; height: number }, maxScale = Infinity) => {
    const scale = Math.min(size.width / Math.max(b.width, 1), size.height / Math.max(b.height, 1), maxScale) * 0.95
    setView({ scale, x: (size.width - b.width * scale) / 2 - b.x * scale, y: (size.height - b.height * scale) / 2 - b.y * scale })
  }

  /** Zoom la scara dată, păstrând fix punctul din centrul ecranului */
  const zoomAtCenter = (scale: number) => {
    const sc = Math.min(Math.max(scale, 0.02), 40)
    const cx = size.width / 2
    const cy = size.height / 2
    setView((v) => {
      const wx = (cx - v.x) / v.scale
      const wy = (cy - v.y) / v.scale
      return { scale: sc, x: cx - wx * sc, y: cy - wy * sc }
    })
  }

  // procentul de zoom: 100% = mărimea planșei tipărite (paperMmPerPx × px ecran pe mm)
  const paperK = paperMmPerPx(project, sheet)
  const fullScale = paperK ? paperK * SCREEN_PX_PER_MM : 1
  const percent = (view.scale / fullScale) * 100
  const fitAll = () => setFitAllTick((n) => n + 1)
  const [fitAllTick, setFitAllTick] = useState(0)

  // Încadrare în ecran: desenul, zona planșei (pagină albă) și tabelele de pe planșă
  useEffect(() => {
    const c = contentBounds(project, undefined, level.id)
    const sd = sheetDrawBounds(project, sheet)
    const b = c && sd ? { x: Math.min(c.x, sd.x), y: Math.min(c.y, sd.y), width: Math.max(c.x + c.width, sd.x + sd.width) - Math.min(c.x, sd.x), height: Math.max(c.y + c.height, sd.y + sd.height) - Math.min(c.y, sd.y) } : (c ?? sd)
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
  }, [fitSignal, fitAllTick, level.id, level.background?.src, size.width > 0])

  /** Mărește pe selecția curentă (element sau grup) */
  const zoomToSelection = () => {
    const items = multi.length ? multi : selection ? [selection] : []
    const b = items.length ? groupBounds(project, items, S * 3) : null
    if (b) fitBounds(b, fullScale * 4)
  }
  useZoomKeys({ step: (dir) => zoomAtCenter((stepPercent(percent, dir) / 100) * fullScale), fit: fitAll, actual: () => zoomAtCenter(fullScale) })

  // Resetare desen temporar la schimbarea uneltei
  useEffect(() => {
    setDraft({ points: [] })
    setScalePts([])
    setArchDraft([])
  }, [tool])

  // Taste pentru cablu: Enter = finalizare, Backspace = șterge ultimul punct, Esc gestionat în App
  useEffect(() => {
    if (tool.kind !== 'cable' && !isWallTool) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, select')) return
      if (isWallTool) {
        if (e.key === 'Enter') finishWall()
        if (e.key === 'Backspace' && archDraft.length) {
          e.preventDefault()
          setArchDraft((d) => d.slice(0, -2))
        }
        return
      }
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

  const isWallTool = tool.kind === 'arch' && (tool.arch === 'wall-ext' || tool.arch === 'wall-int')
  const wallThickness = tool.kind === 'arch' && tool.arch === 'wall-int' ? 0.12 : 0.25

  /** Punctul de desen pentru pereți / cote, cu lipire de vârfuri și aliniere ortogonală (Shift = liber) */
  const archSnap = (pt: Pt, free: boolean) => {
    const n = archDraft.length
    const prev = n ? { x: archDraft[n - 2], y: archDraft[n - 1] } : undefined
    const own = n >= 4 ? [{ x: archDraft[0], y: archDraft[1] }] : []
    return snapPoint(pt, prev, [...wallVertices(levelArch), ...own], 10 * k, free)
  }

  function finishWall(extra?: Pt) {
    const pts = extra ? [...archDraft, extra.x, extra.y] : archDraft
    const clean: number[] = []
    for (let i = 0; i < pts.length; i += 2) {
      const n = clean.length
      if (n && Math.hypot(clean[n - 2] - pts[i], clean[n - 1] - pts[i + 1]) < 0.5) continue
      clean.push(pts[i], pts[i + 1])
    }
    if (clean.length >= 4) onAddArch(newWall(clean, wallThickness))
    setArchDraft([])
  }

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

  /** Cablul vizibil cel mai apropiat de punct (pentru ramificații), dacă e destul de aproape */
  const cableAt = (pt: Pt, exclude?: string) => {
    let best: { cable: (typeof visibleCables)[number]; x: number; y: number; along: number } | undefined
    let bestD = Math.max(S * 0.4, 8 * k)
    for (const c of visibleCables) {
      if (c.id === exclude) continue
      const n = nearestOnPolyline(c.points, pt.x, pt.y)
      if (n.dist < bestD) {
        bestD = n.dist
        best = { cable: c, x: n.x, y: n.y, along: n.along }
      }
    }
    return best
  }

  /** Capătul spre care merge ramificația: cel legat de un echipament central (switch, NVR, centrală) */
  const viaEnd = (c: (typeof visibleCables)[number]): 'from' | 'to' => {
    const hub = (id?: string) => !!id && !!symbolByType(project.devices.find((d) => d.id === id)?.type ?? '')?.hub
    if (hub(c.to)) return 'to'
    if (hub(c.from)) return 'from'
    return c.to ? 'to' : 'from'
  }

  /** Ghena (trecerea între niveluri) de lângă punct, pe nivelul curent */
  const riserAt = (pt: Pt) => {
    let best: (typeof levelArch)[number] | undefined
    let bestD = S * 0.6
    for (const a of levelArch) {
      if (a.kind !== 'riser' || a.x == null || a.y == null) continue
      const dd = Math.hypot(a.x - pt.x, a.y - pt.y)
      if (dd < bestD) {
        best = a
        bestD = dd
      }
    }
    return best
  }

  function finishDraft(to?: string, extra?: number[], via?: { cableId: string; end: 'from' | 'to' }, riserEnd?: string) {
    const pts = [...draft.points, ...(extra ?? [])]
    // elimină punctele consecutive identice (ex. de la dublu-click)
    const clean: number[] = []
    for (let i = 0; i < pts.length; i += 2) {
      const n = clean.length
      if (n && Math.hypot(clean[n - 2] - pts[i], clean[n - 1] - pts[i + 1]) < 0.5) continue
      clean.push(pts[i], pts[i + 1])
    }
    if (clean.length >= 4) onAddCable(clean, draft.from, to, via, riserEnd ?? draft.riser)
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
        if (onEmpty && !e.evt.shiftKey) {
          onSelect(null)
          if (multi.length) onMulti([])
        }
        break
      case 'place':
        onAddDevice(tool.type, pt.x, pt.y, tool.catalogId, tool.symbolId)
        break
      case 'scale':
        if (scalePts.length === 0) setScalePts([pt])
        else {
          const [a] = scalePts
          setScalePts([])
          onScaleMeasured(Math.hypot(pt.x - a.x, pt.y - a.y))
        }
        break
      case 'arch': {
        const free = e.evt.shiftKey
        if (tool.arch === 'wall-ext' || tool.arch === 'wall-int') {
          const p = archSnap(pt, free)
          // click pe primul punct = închide conturul
          if (archDraft.length >= 4 && Math.hypot(p.x - archDraft[0], p.y - archDraft[1]) < 0.5) finishWall(p)
          else setArchDraft((d) => [...d, p.x, p.y])
        } else if (tool.arch === 'dim') {
          const p = archSnap(pt, free)
          if (!archDraft.length) setArchDraft([p.x, p.y])
          else {
            onAddArch({ kind: 'dim', points: [archDraft[0], archDraft[1], p.x, p.y] })
            setArchDraft([])
          }
        } else if (tool.arch === 'rect' || tool.arch === 'ellipse') {
          // zonă: două click-uri în colțuri opuse
          if (!archDraft.length) setArchDraft([pt.x, pt.y])
          else {
            const [x0, y0] = archDraft
            const w = Math.abs(pt.x - x0) / ppm
            const h = Math.abs(pt.y - y0) / ppm
            setArchDraft([])
            if (w < 0.1 || h < 0.1) return
            const name = window.prompt('Numele zonei (apare în zonă; gol = doar aria):', '')
            if (name == null) return
            onAddArch({
              kind: tool.arch,
              x: (pt.x + x0) / 2,
              y: (pt.y + y0) / 2,
              width: Math.round(w * 20) / 20,
              height: Math.round(h * 20) / 20,
              rotation: 0,
              text: name.trim(),
              stroke: '#1565c0',
              fillOpacity: 0.12,
              dashed: true,
              showArea: true,
            })
          }
        } else if (tool.arch === 'note') {
          // notă: întâi vârful săgeții (punctul indicat), apoi locul textului
          if (!archDraft.length) setArchDraft([pt.x, pt.y])
          else {
            const [x0, y0] = archDraft
            setArchDraft([])
            const text = window.prompt('Textul notei (ex. „cablu prin tavan fals”):', '')
            if (text && text.trim()) onAddArch({ kind: 'note', points: [x0, y0, pt.x, pt.y], text: text.trim(), fontMm: 2.5 })
          }
        } else if (tool.arch === 'image') {
          imgAt.current = pt
          imgInput.current?.click()
        } else if (tool.arch === 'table') {
          onAddArch({ kind: 'table', x: pt.x, y: pt.y, rotation: 0, table: { kind: 'echipamente', fontMm: 2.5 } })
        } else if (tool.arch === 'door' || tool.arch === 'window') {
          const w = wallAt(levelArch, pt.x, pt.y, 0.5 * ppm)
          onAddArch({
            kind: tool.arch,
            x: w?.x ?? pt.x,
            y: w?.y ?? pt.y,
            rotation: w?.angle ?? 0,
            width: tool.arch === 'door' ? 0.9 : 1.2,
          })
        } else if (tool.arch === 'riser') {
          // nume propus: o ghenă existentă pe alt nivel care lipsește de aici, altfel următoarea liberă (G1, G2...)
          const here = new Set(levelArch.filter((a) => a.kind === 'riser').map((a) => a.text))
          const elsewhere = [...new Set(project.arch.filter((a) => a.kind === 'riser' && a.levelId !== level.id).map((a) => a.text ?? ''))].filter((n) => n && !here.has(n))
          let n = 1
          while (here.has(`G${n}`)) n++
          const suggestion = elsewhere[0] ?? `G${n}`
          const name = window.prompt('Numele trecerii între niveluri (același nume pe fiecare nivel):', suggestion)
          if (name) onAddArch({ kind: 'riser', x: pt.x, y: pt.y, text: name.trim(), rotation: 0 })
        } else if (tool.arch === 'label') {
          const text = window.prompt('Numele încăperii:', 'Birou')
          // înălțimea textului: cel puțin 0,45 m, dar nu mai mică decât jumătate din simbol, ca să fie citibil
          if (text) onAddArch({ kind: 'label', x: pt.x, y: pt.y, text, size: Math.round(Math.max(0.45, (S * 0.5) / ppm) * 20) / 20, rotation: 0 })
        }
        break
      }
      case 'cable': {
        const dev = deviceAt(pt)
        const rs = !dev ? riserAt(pt) : undefined
        if (!draft.points.length) {
          // începutul cablului: pe un echipament sau la o ghenă (traseul de continuare de pe acest nivel)
          setDraft(dev ? { points: [dev.x, dev.y], from: dev.id } : rs ? { points: [rs.x!, rs.y!], riser: rs.text } : { points: [pt.x, pt.y] })
        } else if (dev && dev.id !== draft.from) {
          finishDraft(dev.id, [dev.x, dev.y])
        } else if (rs && !draft.riser) {
          // capătul cablului la ghenă: continuă pe alt nivel
          finishDraft(undefined, [rs.x!, rs.y!], undefined, rs.text)
        } else if (!dev && cableAt(pt)) {
          // ramificație pe un cablu existent: merge pe traseul lui până la echipamentul central
          const hit = cableAt(pt)!
          const end = viaEnd(hit.cable)
          finishDraft(end === 'to' ? hit.cable.to : hit.cable.from, [hit.x, hit.y], { cableId: hit.cable.id, end })
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
    const symbolId = e.dataTransfer.getData('text/symbol-id') || undefined
    const stage = stageRef.current
    if (!type || !stage) return
    stage.setPointersPositions(e.nativeEvent)
    const pt = stage.getRelativePointerPosition()
    if (pt) onAddDevice(type, pt.x, pt.y, catalogId, symbolId)
  }

  const isSelect = tool.kind === 'select'
  const selDevice = selection?.kind === 'device' ? project.devices.find((d) => d.id === selection.id) : undefined
  const selCable = selection?.kind === 'cable' ? project.cables.find((c) => c.id === selection.id) : undefined
  const k = 1 / view.scale // pentru elemente cu dimensiune constantă pe ecran

  /** Shift + click: adaugă / scoate un element din selecția multiplă */
  const toggle = (it: Item) => {
    const base = multi.length ? multi : selection ? [selection] : []
    const next = toggleItem(base, it)
    if (next.length === 1) {
      onMulti([])
      onSelect(next[0])
    } else if (next.length === 0) {
      onMulti([])
      onSelect(null)
    } else onMulti(next)
  }
  const inGroup = (kind: Item['kind'], id: string) => multi.some((x) => x.kind === kind && x.id === id)
  const archGroup = useMemo(() => new Set(multi.filter((x) => x.kind === 'arch').map((x) => x.id)), [multi])

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
    tool.kind === 'place' || tool.kind === 'scale' || tool.kind === 'cable' || tool.kind === 'arch' ? 'crosshair' : 'default'

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
        onContextMenu={(e) => {
          e.evt.preventDefault()
          const pt = pointer()
          if (!pt) return
          const dev = deviceAt(pt)
          const name = e.target.name?.() ?? ''
          const target: Selection = dev
            ? { kind: 'device', id: dev.id }
            : name.startsWith('cable:')
              ? { kind: 'cable', id: name.slice(6) }
              : name.startsWith('arch:')
                ? { kind: 'arch', id: name.slice(5) }
                : null
          setDraft({ points: [] })
          setArchDraft([])
          setScalePts([])
          onContext({ clientX: e.evt.clientX, clientY: e.evt.clientY, x: pt.x, y: pt.y, target })
        }}
        onClick={onStageClick}
        onDblClick={() => {
          if (isWallTool && archDraft.length >= 4) {
            const pt = pointer()
            const n = archDraft.length
            if (pt && Math.hypot(pt.x - archDraft[n - 2], pt.y - archDraft[n - 1]) < 10 * k) finishWall()
            return
          }
          if (tool.kind !== 'cable' || draft.points.length < 2) return
          // dublu-click real = al doilea click în același loc; click-urile rapide în locuri diferite nu termină cablul
          const pt = pointer()
          const n = draft.points.length
          if (pt && Math.hypot(pt.x - draft.points[n - 2], pt.y - draft.points[n - 1]) < 8 * k) finishDraft()
        }}
        onMouseDown={(e) => {
          // Shift + tragere pe fundal = dreptunghi de selecție
          if (!isSelect || !e.evt.shiftKey || e.evt.button !== 0) return
          if (e.target !== stageRef.current && e.target.name() !== 'background') return
          const pt = pointer()
          if (!pt) return
          stageRef.current?.draggable(false)
          setMarquee({ x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y })
        }}
        onMouseMove={() => {
          if (tool.kind === 'cable' || tool.kind === 'scale' || tool.kind === 'arch') setCursor(pointer())
          if (marquee) {
            const pt = pointer()
            if (pt) setMarquee({ ...marquee, x1: pt.x, y1: pt.y })
          }
        }}
        onMouseUp={() => {
          if (!marquee) return
          stageRef.current?.draggable(true)
          const r = { x: Math.min(marquee.x0, marquee.x1), y: Math.min(marquee.y0, marquee.y1), width: Math.abs(marquee.x1 - marquee.x0), height: Math.abs(marquee.y1 - marquee.y0) }
          setMarquee(null)
          if (r.width < 3 && r.height < 3) return
          // straturile blocate nu intră în selecție
          const found = itemsInRect(r, { devices: visibleDevices.filter((d) => !devLocked(d)), cables: visibleCables.filter((c) => !cabLocked(c)), arch: archFree })
          // dreptunghiul începe o selecție nouă; adaugă doar la o selecție multiplă existentă
          let next = multi
          for (const it of found) if (!next.some((x) => sameItem(x, it))) next = [...next, it]
          if (next.length === 1) onSelect(next[0])
          else if (next.length > 1) onMulti(next)
        }}
      >
        {/* Fundal */}
        <Layer listening={!!bgImage}>
          {bgImage && level.background && layerVisible(sheet, 'fundal') && (
            <Group
              x={(level.bgX ?? 0) + level.background.width / 2}
              y={(level.bgY ?? 0) + level.background.height / 2}
              offsetX={level.background.width / 2}
              offsetY={level.background.height / 2}
              rotation={level.bgRotation ?? 0}
              draggable={bgUnlocked}
              onMouseEnter={(e) => bgUnlocked && (e.target.getStage()!.container().style.cursor = 'move')}
              onMouseLeave={(e) => (e.target.getStage()!.container().style.cursor = '')}
              onDragStart={() => checkpoint()}
              onDragMove={(e) => {
                const bg = level.background!
                const nx = e.target.x() - bg.width / 2
                const ny = e.target.y() - bg.height / 2
                update((p) => ({ ...p, levels: p.levels.map((l) => (l.id === level.id ? { ...l, bgX: nx, bgY: ny } : l)) }))
              }}
              onDragEnd={(e) => {
                const bg = level.background!
                const nx = e.target.x() - bg.width / 2
                const ny = e.target.y() - bg.height / 2
                update((p) => ({ ...p, levels: p.levels.map((l) => (l.id === level.id ? { ...l, bgX: nx, bgY: ny } : l)) }))
              }}
            >
              <KImage name="background" image={bgImage} width={level.background.width} height={level.background.height} />
              {/* estompare: alb semitransparent peste plan (rgba, nu opacity — vezi exportul) */}
              {(level.bgFade ?? 0) > 0 && (
                <Rect name="background" width={level.background.width} height={level.background.height} fill={`rgba(255,255,255,${level.bgFade})`} />
              )}
            </Group>
          )}
        </Layer>

        {/* Schița de arhitectură: straturile blocate se desenează fără interacțiune */}
        {archLocked.length > 0 && (
          <Layer listening={false}>
            <ArchShapes
              arch={archLocked}
              ppm={ppm}
              k={k}
              symbolSize={S}
              onEditText={() => {}}
              interactive={false}
              onSelect={() => {}}
              checkpoint={checkpoint}
              update={update}
              project={project}
              pxPerMm={paperK ? 1 / paperK : ppm / 10}
            />
          </Layer>
        )}
        <Layer listening={isSelect}>
          <ArchShapes
            arch={archFree}
            ppm={ppm}
            k={k}
            symbolSize={S}
            onEditText={(id) => onEditText(id)}
            selectedId={selection?.kind === 'arch' ? selection.id : undefined}
            interactive={isSelect}
            onSelect={(id, shift) => (shift ? toggle({ kind: 'arch', id }) : onSelect({ kind: 'arch', id }))}
            groupIds={archGroup}
            checkpoint={checkpoint}
            update={update}
            project={project}
            pxPerMm={paperK ? 1 / paperK : ppm / 10}
          />
        </Layer>

        {/* Conuri camere + cabluri */}
        <Layer>
          {layerVisible(sheet, 'CCTV:conuri') && visibleDevices.map((d) => {
            const def = symbolByType(d.type)
            if (!def?.camera) return null
            const color = deviceColor(d)
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
            const selected = selCable?.id === c.id || inGroup('cable', c.id)
            return (
              <Line
                key={c.id}
                points={c.points}
                stroke={color}
                strokeWidth={S * (selected ? 0.12 : 0.07)}
                dash={c.system === 'INC' ? [S * 0.4, S * 0.15] : undefined}
                lineCap="round"
                lineJoin="round"
                name={'cable:' + c.id}
                hitStrokeWidth={Math.max(S * 0.4, 8 * k)}
                listening={isSelect && !cabLocked(c)}
                onClick={(e) => {
                  e.cancelBubble = true
                  if (e.evt.shiftKey) toggle({ kind: 'cable', id: c.id })
                  else onSelect({ kind: 'cable', id: c.id })
                }}
                onDblClick={(e) => {
                  // dublu-click pe cablul selectat adaugă un punct de traseu
                  e.cancelBubble = true
                  if (!selected) return
                  const pt = pointer()
                  if (!pt) return
                  let best = 2
                  let bestD = Infinity
                  for (let i = 2; i < c.points.length; i += 2) {
                    const n = nearestOnPolyline(c.points.slice(i - 2, i + 2), pt.x, pt.y)
                    if (n.dist < bestD) {
                      bestD = n.dist
                      best = i
                    }
                  }
                  checkpoint()
                  update((p) => ({
                    ...p,
                    cables: p.cables.map((x) => (x.id === c.id ? { ...x, points: [...x.points.slice(0, best), pt.x, pt.y, ...x.points.slice(best)] } : x)),
                  }))
                }}
              />
            )
          })}
        </Layer>

        {/* Echipamente */}
        <Layer>
          {visibleDevices.map((d) => {
            const def = symbolByType(d.type)!
            // culoare proprie / simbol personalizat; simbolurile standard cu text se rotesc doar ca contur, textul rămâne drept
            const look = deviceImage(project, d)
            const color = look.color
            const glyph = look.glyph ? glyphLayout(def) : null
            const img = look.img
            const rad = (d.rotation * Math.PI) / 180
            const gdy = glyph ? ((glyph.y - glyph.size * 0.36 - 20) / 40) * S : 0
            // dreptunghiul rotit se îngustează pe orizontală: micșorăm textul ca să încapă
            let gScale = 1
            if (glyph && def.shape === 'rect') {
              const avail = 37 * Math.abs(Math.cos(rad)) + 22 * Math.abs(Math.sin(rad)) - 7
              const textW = [...(def.glyph ?? '')].length * glyph.size * 0.62
              gScale = Math.min(1, avail / textW)
            }
            return (
              <Group
                key={d.id}
                x={d.x}
                y={d.y}
                draggable={isSelect && !multi.length && !devLocked(d)}
                listening={(isSelect && !devLocked(d)) || tool.kind === 'cable'}
                onClick={(e) => {
                  if (!isSelect) return
                  e.cancelBubble = true
                  if (e.evt.shiftKey) toggle({ kind: 'device', id: d.id })
                  else onSelect({ kind: 'device', id: d.id })
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
                    rotation={d.rotation}
                    scaleX={d.flipX ? -1 : 1}
                    scaleY={d.flipY ? -1 : 1}
                  />
                )}
                {glyph && (
                  <Text
                    text={def.glyph}
                    x={-Math.sin(rad) * gdy}
                    y={Math.cos(rad) * gdy}
                    width={S}
                    height={S}
                    offsetX={S / 2}
                    offsetY={S / 2}
                    align="center"
                    verticalAlign="middle"
                    fontSize={(glyph.size / 40) * S * gScale}
                    fontStyle="bold"
                    fontFamily="Arial"
                    fill={color}
                    listening={false}
                  />
                )}
                {showLabels(d) && <Text
                  text={d.label}
                  fontSize={S * 0.38}
                  fontStyle="bold"
                  fontFamily="Arial"
                  fill={color}
                  width={S * 4}
                  offsetX={S * 2}
                  y={S * 0.55}
                  align="center"
                />}
              </Group>
            )
          })}
        </Layer>

        {/* Elemente de interfață (ascunse la export) */}
        <Layer name="ui">
          {/* nota selectată: mânere la vârful săgeții și la text, deasupra simbolurilor */}
          {isSelect &&
            selection?.kind === 'arch' &&
            (() => {
              const a = levelArch.find((x) => x.id === selection.id && x.kind === 'note' && x.points && x.points.length >= 4)
              if (!a || layerLocked(sheet, archLayer(a))) return null
              return [0, 2].map((i) => (
                <Circle
                  key={'nh' + i}
                  x={a.points![i]}
                  y={a.points![i + 1]}
                  radius={(i === 0 ? 6 : 5) * k}
                  fill={i === 0 ? '#c62828' : '#fff'}
                  stroke="#1e88e5"
                  strokeWidth={2 * k}
                  draggable
                  onMouseEnter={(e) => (e.target.getStage()!.container().style.cursor = 'move')}
                  onMouseLeave={(e) => (e.target.getStage()!.container().style.cursor = '')}
                  onDragStart={(e) => {
                    e.cancelBubble = true
                    checkpoint()
                  }}
                  onDragMove={(e) => {
                    e.cancelBubble = true
                    const pts = [...a.points!]
                    pts[i] = e.target.x()
                    pts[i + 1] = e.target.y()
                    update((p) => ({ ...p, arch: p.arch.map((x) => (x.id === a.id ? { ...x, points: pts } : x)) }))
                  }}
                  onDragEnd={(e) => {
                    e.cancelBubble = true
                  }}
                />
              ))
            })()}
          {/* planul de fundal deblocat: conturul lui (nu apare la export) */}
          {level.background && level.bgLocked === false && (
            <Rect
              x={(level.bgX ?? 0) + level.background.width / 2}
              y={(level.bgY ?? 0) + level.background.height / 2}
              offsetX={level.background.width / 2}
              offsetY={level.background.height / 2}
              rotation={level.bgRotation ?? 0}
              width={level.background.width}
              height={level.background.height}
              stroke="#1e88e5"
              strokeWidth={2 * k}
              dash={[10 * k, 6 * k]}
              listening={false}
            />
          )}
          {/* pagină albă: zona de desen a planșei, la scara din cartuș */}
          {frame && (
            <Group listening={false}>
              <Rect
                x={frame.x}
                y={frame.y}
                width={frame.width}
                height={frame.height}
                stroke={frameOut ? '#e65100' : '#1e88e5'}
                strokeWidth={1.5 * k}
                dash={[10 * k, 6 * k]}
              />
              <Text
                x={frame.x}
                y={frame.y - 18 * k}
                width={frame.width}
                text={`Zona planșei ${formatLabel(sheet)} · ${sheet.scara} · ${frame.meters[0].toFixed(1).replace('.', ',')} × ${frame.meters[1].toFixed(1).replace('.', ',')} m${frameOut ? ' — desenul iese din zonă' : ''}`}
                fontSize={12 * k}
                fill={frameOut ? '#e65100' : '#1e88e5'}
                ellipsis
                wrap="none"
              />
            </Group>
          )}
          {/* selecția multiplă: fiecare echipament încercuit + chenarul grupului (se trage pentru mutare) */}
          {multi.length > 0 &&
            visibleDevices
              .filter((d) => inGroup('device', d.id))
              .map((d) => <Circle key={'g' + d.id} x={d.x} y={d.y} radius={S * 0.75} stroke="#1e88e5" strokeWidth={2 * k} dash={[6 * k, 4 * k]} listening={false} />)}
          {multi.length > 0 &&
            isSelect &&
            (() => {
              const b = groupBounds(project, multi, S * 0.9)
              if (!b) return null
              return (
                <Rect
                  x={b.x}
                  y={b.y}
                  width={b.width}
                  height={b.height}
                  fill="rgba(30,136,229,0.06)"
                  stroke="#1e88e5"
                  strokeWidth={1.5 * k}
                  dash={[8 * k, 5 * k]}
                  draggable
                  onMouseEnter={(e) => (e.target.getStage()!.container().style.cursor = 'move')}
                  onMouseLeave={(e) => (e.target.getStage()!.container().style.cursor = '')}
                  onClick={(e) => {
                    // click în chenar fără tragere: Shift = adaugă / scoate echipamentul de dedesubt
                    e.cancelBubble = true
                    const pt = pointer()
                    const dev = pt && deviceAt(pt)
                    if (e.evt.shiftKey && dev) toggle({ kind: 'device', id: dev.id })
                  }}
                  onDragStart={(e) => {
                    e.cancelBubble = true
                    checkpoint()
                    groupSnap.current = { snap: snapshot(project, multi), x: e.target.x(), y: e.target.y() }
                  }}
                  onDragMove={(e) => {
                    e.cancelBubble = true
                    const g = groupSnap.current
                    if (!g) return
                    const dx = e.target.x() - g.x
                    const dy = e.target.y() - g.y
                    update((p) => translateGroup(p, multi, g.snap, dx, dy))
                  }}
                  onDragEnd={(e) => {
                    e.cancelBubble = true
                    groupSnap.current = null
                  }}
                />
              )
            })()}
          {marquee && (
            <Rect
              x={Math.min(marquee.x0, marquee.x1)}
              y={Math.min(marquee.y0, marquee.y1)}
              width={Math.abs(marquee.x1 - marquee.x0)}
              height={Math.abs(marquee.y1 - marquee.y0)}
              fill="rgba(30,136,229,0.08)"
              stroke="#1e88e5"
              strokeWidth={1.5 * k}
              dash={[6 * k, 4 * k]}
              listening={false}
            />
          )}
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
                    draggable={isSelect}
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
                      if (!isEnd) return
                      // capăt de cablu: se leagă de echipamentul sau cablul de sub el, altfel rămâne liber
                      const pt = { x: e.target.x(), y: e.target.y() }
                      const isLast = i === selCable.points.length - 2
                      const dev = deviceAt(pt)
                      const host = !dev && isLast ? cableAt(pt, selCable.id) : undefined
                      update((p) => ({
                        ...p,
                        cables: p.cables.map((c) => {
                          if (c.id !== selCable.id) return c
                          const pts = [...c.points]
                          const next = { ...c }
                          if (dev) {
                            pts[i] = dev.x
                            pts[i + 1] = dev.y
                          } else if (host) {
                            pts[i] = host.x
                            pts[i + 1] = host.y
                          }
                          const end = host ? viaEnd(host.cable) : undefined
                          if (i === 0) next.from = dev?.id
                          if (isLast) {
                            next.to = dev ? dev.id : host ? (end === 'to' ? host.cable.to : host.cable.from) : undefined
                            next.via = host ? { cableId: host.cable.id, end: end! } : undefined
                          }
                          return { ...next, points: pts }
                        }),
                      }))
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

          {/* zonă în desenare: dreptunghi / elipsă între primul click și cursor */}
          {tool.kind === 'arch' && (tool.arch === 'rect' || tool.arch === 'ellipse') && archDraft.length === 2 && cursor && (() => {
            const [x0, y0] = archDraft
            const w = Math.abs(cursor.x - x0)
            const h = Math.abs(cursor.y - y0)
            const props = { stroke: '#1565c0', strokeWidth: 2 * k, dash: [8 * k, 5 * k], fill: 'rgba(21,101,192,0.08)', listening: false }
            return (
              <>
                {tool.arch === 'rect' ? (
                  <Rect x={Math.min(x0, cursor.x)} y={Math.min(y0, cursor.y)} width={w} height={h} {...props} />
                ) : (
                  <Ellipse x={(x0 + cursor.x) / 2} y={(y0 + cursor.y) / 2} radiusX={w / 2} radiusY={h / 2} {...props} />
                )}
                <Text
                  x={cursor.x + 10 * k}
                  y={cursor.y + 10 * k}
                  text={`${(w / ppm).toFixed(2).replace('.', ',')} × ${(h / ppm).toFixed(2).replace('.', ',')} m`}
                  fontSize={13 * k}
                  fontStyle="bold"
                  fill="#1565c0"
                  listening={false}
                />
              </>
            )
          })()}
          {tool.kind === 'arch' && tool.arch === 'note' && archDraft.length === 2 && cursor && (
            <Arrow
              points={[cursor.x, cursor.y, archDraft[0], archDraft[1]]}
              stroke="#c62828"
              fill="#c62828"
              strokeWidth={2 * k}
              pointerLength={12 * k}
              pointerWidth={9 * k}
              dash={[8 * k, 5 * k]}
              listening={false}
            />
          )}
          {tool.kind === 'arch' && tool.arch !== 'rect' && tool.arch !== 'ellipse' && tool.arch !== 'note' && archDraft.length > 0 && cursor && (() => {
            const c = archSnap(cursor, false)
            const n = archDraft.length
            const pts = [...archDraft, c.x, c.y]
            const seg = Math.hypot(c.x - archDraft[n - 2], c.y - archDraft[n - 1]) / ppm
            return (
              <>
                <Line
                  points={pts}
                  stroke={isWallTool ? 'rgba(21,101,192,0.55)' : '#1565c0'}
                  strokeWidth={isWallTool ? wallThickness * ppm : 1.5 * k}
                  lineCap="square"
                  lineJoin="miter"
                  listening={false}
                />
                <Text x={c.x + 10 * k} y={c.y + 10 * k} text={fmtM(seg)} fontSize={13 * k} fontStyle="bold" fill="#1565c0" listening={false} />
              </>
            )
          })()}

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

      <input
        ref={imgInput}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.png,.jpg,.jpeg,.webp,.gif,.svg"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          const at = imgAt.current
          if (!f || !at) return
          try {
            const img = await prepareImage(f)
            // lățimea propusă: ~60 mm pe planșa tipărită
            const wm = paperK ? (60 / paperK) / ppm : 4
            onAddArch({ kind: 'image', x: at.x, y: at.y, width: Math.round(wm * 100) / 100, height: Math.round(((wm * img.h) / img.w) * 100) / 100, rotation: 0, src: img.src, text: f.name })
          } catch (err) {
            window.alert('Imaginea nu a putut fi citită: ' + (err as Error).message)
          }
        }}
      />
      {editTextId &&
        (() => {
          const el = project.arch.find((x) => x.id === editTextId)
          const st = stageRef.current
          if (el?.kind === 'note' && el.points && st) {
            // notă: text pe mai multe rânduri (Enter = rând nou, Ctrl+Enter sau click în afară = gata)
            const pt = st.getAbsoluteTransform().point({ x: el.points[2], y: el.points[3] })
            return (
              <textarea
                className="text-edit note-edit"
                autoFocus
                rows={Math.max(2, (el.text ?? '').split('\n').length + 1)}
                defaultValue={el.text ?? ''}
                style={{ left: pt.x, top: pt.y - 60 }}
                onFocus={(e) => e.target.select()}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Escape') onEditText(null)
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) (e.target as HTMLTextAreaElement).blur()
                }}
                onBlur={(e) => {
                  const v = e.target.value.replace(/\s+$/, '')
                  if (v && v !== el.text) {
                    checkpoint()
                    update((p) => ({ ...p, arch: p.arch.map((x) => (x.id === el.id ? { ...x, text: v } : x)) }))
                  }
                  onEditText(null)
                }}
              />
            )
          }
          if (!el || el.x == null || el.y == null || !st) return null
          const pt = st.getAbsoluteTransform().point({ x: el.x, y: el.y })
          const fs = Math.max(12, Math.min(40, (el.size ?? 0.45) * ppm * view.scale))
          return (
            <input
              className="text-edit"
              autoFocus
              defaultValue={el.text ?? ''}
              style={{ left: pt.x, top: pt.y, fontSize: fs }}
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Escape') onEditText(null)
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              }}
              onBlur={(e) => {
                const v = e.target.value.trim()
                if (v && v !== el.text) {
                  checkpoint()
                  update((p) => ({ ...p, arch: p.arch.map((x) => (x.id === el.id ? { ...x, text: v } : x)) }))
                }
                onEditText(null)
              }}
            />
          )
        })()}

      <ZoomBar
        percent={percent}
        onPercent={(pc) => zoomAtCenter((pc / 100) * fullScale)}
        onFit={fitAll}
        onSelection={selection || multi.length ? zoomToSelection : undefined}
      />
      {tool.kind !== 'select' && (
        <div className="canvas-hint">
          {tool.kind === 'place' && <>Click pe plan pentru a plasa <b>{(tool.catalogId && project.catalog.find((c) => c.id === tool.catalogId)?.model) || symbolByType(tool.type)?.name}</b>. Esc = gata.</>}
          {tool.kind === 'scale' && <>Click pe cele două capete ale unei cote cunoscute. Esc = anulare.</>}
          {isWallTool && (
            <>
              Click din punct în punct pentru perete ({wallThickness === 0.25 ? '25' : '12'} cm). Se aliniază automat orizontal / vertical și se lipește de
              pereții existenți (Shift = liber). Click pe primul punct închide conturul; dublu-click / Enter = gata, Backspace = șterge ultimul punct.
            </>
          )}
          {tool.kind === 'arch' && (tool.arch === 'door' || tool.arch === 'window') && (
            <>Click pe un perete pentru a așeza {tool.arch === 'door' ? 'ușa' : 'fereastra'} (se aliniază singură). Esc = gata.</>
          )}
          {tool.kind === 'arch' && tool.arch === 'label' && <>Click pe plan pentru a adăuga numele unei încăperi. Esc = gata.</>}
          {tool.kind === 'arch' && tool.arch === 'dim' && <>Click pe capetele cotei; lungimea se calculează singură. Esc = gata.</>}
          {tool.kind === 'arch' && (tool.arch === 'rect' || tool.arch === 'ellipse') && (
            <>Click pe un colț al zonei, apoi pe colțul opus; aria se calculează singură. Esc = gata.</>
          )}
          {tool.kind === 'arch' && tool.arch === 'note' && (
            <>Click pe punctul indicat (vârful săgeții), apoi unde vrei textul; scrii textul notei. Dublu-click pe notă = editare. Esc = gata.</>
          )}
          {tool.kind === 'arch' && tool.arch === 'image' && <>Click unde vrei imaginea, apoi alege fișierul (PNG, JPG, SVG…). Esc = gata.</>}
          {tool.kind === 'arch' && tool.arch === 'table' && <>Click unde vrei colțul din stânga-sus al tabelului; tipul lui se alege în panoul din dreapta. Esc = gata.</>}
          {tool.kind === 'arch' && tool.arch === 'riser' && (
            <>Click pentru a pune ghena (trecerea între niveluri). Pune-o cu același nume pe fiecare nivel prin care trec cablurile. Esc = gata.</>
          )}
          {tool.kind === 'cable' && (
            <>
              Click pe echipamentul de start, apoi puncte de traseu; click pe echipamentul final pentru a termina — sau pe alt cablu, pentru o
              ramificație pe traseu comun. Dublu-click / Enter = termină liber, Backspace = șterge ultimul punct, Esc = anulare.
            </>
          )}
        </div>
      )}
    </div>
  )
}
