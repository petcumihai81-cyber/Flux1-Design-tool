import { useCallback, useEffect, useRef, useMemo, useState } from 'react'
import { flushSync } from 'react-dom'
import type Konva from 'konva'
import './App.css'
import type { ArchElement, Background, Cable, Device, Level, NewArch, Project, Selection, Sheet, SystemId, Tool } from './types'
import { alignGroup, distributeGroup } from './group'
import type { Item } from './group'
import { backgroundKeys, deleteBackground, getBackground, getImage, putBackground, putImage } from './storage'
import { ARCH_NAMES, SKETCH_PX_PER_M } from './arch'
import { useHistory } from './history'
import { ALL_SYSTEMS, activeSheet, contentBounds, levelOf, outsideFrame, pageFrame, newLevel, paperMmPerPx, sheetLevel, symbolForPaper, catalogItem, devicePrefix, deviceSystem, emptyProject, formatLabel, isProject, newSheet, nextCableCode, nextLabel, nextSheetNr, normalizeProject, uid } from './project'
import { SYSTEMS, canMirror, defaultCableType, symbolByType, systemById } from './symbols'
import PlanCanvas from './PlanCanvas'
import BlockCanvas from './BlockCanvas'
import { ArchProps, CableProps, ColorRow, DeviceProps, GroupPanel, LayersPanel, LevelPanel, ListsPanel, Palette, ProjectPanel, SheetPanel } from './Panels'
import { loadBackground } from './background'
import type { PdfDoc } from './background'
import { PdfPagePicker } from './PdfPagePicker'
import { addToLibrary, defaultCustomSymbols, deviceSymbol, removeFromLibrary } from './symbolLibrary'
import { CustomSymbolDialog } from './CustomSymbolDialog'
import { archLayer } from './layers'
import { verifyProject } from './verify'
import type { IssueTarget } from './verify'
import { VerifyDialog } from './VerifyDialog'
import { readDxf } from './dxfImport'
import type { DxfDrawing } from './dxfImport'
import { DxfImportDialog } from './DxfImportDialog'
import { exportExcel, renderSheetPage, savePdf } from './exporters'
import { PdfPreview } from './PdfPreview'
import { exportDxf } from './dxf'
import type { PreviewPage } from './PdfPreview'
import { exportDrawio } from './drawio'
import { CalcPanel, CatalogDialog } from './CatalogUI'
import { MemoriuDialog } from './MemoriuDialog'
import { HelpDialog } from './HelpDialog'

const STORAGE_KEY = 'plansa-securitate:proiect'
const DIRTY_KEY = 'plansa-securitate:nesalvat'

function loadStored(): Project {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const v = JSON.parse(raw)
      if (isProject(v)) return normalizeProject(v)
    }
  } catch {
    /* ignorat */
  }
  return emptyProject()
}

type Tab = 'element' | 'proiect' | 'straturi' | 'calcule' | 'liste'

export default function App() {
  const h = useHistory<Project>(loadStored)
  const project = h.value
  const sheet = activeSheet(project)
  /** Nivelul planșei curente (la schemele bloc: primul nivel) */
  const level = sheetLevel(project, sheet)
  const [catalogOpen, setCatalogOpen] = useState(false)
  /** Elementul din catalog de deschis (din verificare) */
  const [catalogFocus, setCatalogFocus] = useState<string | undefined>(undefined)
  const [verifyOpen, setVerifyOpen] = useState(false)
  /** Dialogul simbolului personalizat: {} = încărcare nouă, { id } = editare */
  const [symDialog, setSymDialog] = useState<{ id?: string } | null>(null)
  const [editTextId, setEditTextId] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ pages: PreviewPage[]; name: string; title: string } | null>(null)
  const [memoOpen, setMemoOpen] = useState(false)
  // ghidul se deschide singur la prima vizită
  const [helpOpen, setHelpOpen] = useState(() => {
    try {
      return !localStorage.getItem('plansa-securitate:ghid-vazut')
    } catch {
      return false
    }
  })
  const closeHelp = () => {
    setHelpOpen(false)
    try {
      localStorage.setItem('plansa-securitate:ghid-vazut', '1')
    } catch {
      /* ignorat */
    }
  }
  const [sheetMenu, setSheetMenu] = useState<{ left: number; bottom: number } | null>(null)
  /** Meniul de click dreapta pe fila unei planșe */
  const [sheetCtx, setSheetCtx] = useState<{ id: string; left: number; top: number } | null>(null)
  /** Fila redenumită direct (dublu-click) */
  const [renaming, setRenaming] = useState<string | null>(null)
  /** Tragerea unei file: planșa trasă și locul de inserare (indexul înaintea căruia ajunge) */
  const [tabDrag, setTabDrag] = useState<{ id: string; over: number | null } | null>(null)
  const [tool, setTool] = useState<Tool>({ kind: 'select' })
  const [selection, setSelection] = useState<Selection>(null)
  /** Selecția multiplă de pe plan (cu ≥ 2 elemente); când e activă, `selection` e gol */
  const [multi, setMulti] = useState<Item[]>([])
  const [tab, setTab] = useState<Tab>('proiect')
  const [fitSignal, setFitSignal] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const stageRef = useRef<Konva.Stage | null>(null)
  const bgInput = useRef<HTMLInputElement>(null)
  const openInput = useRef<HTMLInputElement>(null)

  const notify = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 3500)
  }

  // ---------------------------------------------------------------- salvare automată în browser
  // Proiectul (fără planurile de fundal) stă în localStorage; planurile mari stau în IndexedDB, pe nivel.
  const restored = useRef(false)
  const storedBgs = useRef(new Map<string, string>()) // id nivel → src salvat (ca să nu rescriem degeaba)
  const warned = useRef(false)
  /** Modificări nesalvate în fișier; se ține minte și peste reîncărcarea paginii */
  const [dirty, setDirtyState] = useState(() => {
    try {
      return localStorage.getItem(DIRTY_KEY) === '1'
    } catch {
      return false
    }
  })
  const setDirty = (v: boolean) => {
    setDirtyState(v)
    try {
      localStorage.setItem(DIRTY_KEY, v ? '1' : '0')
    } catch {
      /* ignorat */
    }
  }
  /** Schimbările de proiect care nu sunt modificări ale utilizatorului (deschidere, proiect nou, reîncărcarea planurilor) */
  const skipDirty = useRef(true)
  useEffect(() => {
    if (skipDirty.current) {
      skipDirty.current = false
      return
    }
    if (!dirty) setDirty(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project])

  // la pornire: planurile de fundal se reîncarcă din IndexedDB
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const missing = project.levels.filter((l) => !l.background)
        const found = new Map<string, Background>()
        for (const l of missing) {
          const bg = await getBackground(l.id)
          if (bg) found.set(l.id, bg)
        }
        for (const l of project.levels) if (l.background) storedBgs.current.set(l.id, '')
        for (const [id, bg] of found) storedBgs.current.set(id, bg.src)
        // imaginile de pe planșe
        const imgs = new Map<string, string>()
        for (const a of project.arch) {
          if (a.kind !== 'image' || a.src) continue
          const src = await getImage('img:' + a.id)
          if (src) {
            imgs.set(a.id, src)
            storedBgs.current.set('img:' + a.id, src)
          }
        }
        if (alive && imgs.size) {
          skipDirty.current = true
          h.update((p) => ({ ...p, arch: p.arch.map((a) => (imgs.has(a.id) && !a.src ? { ...a, src: imgs.get(a.id)! } : a)) }))
        }
        if (alive && found.size) {
          const apply = (p: Project) => ({ ...p, levels: p.levels.map((l) => (!l.background && found.has(l.id) ? { ...l, background: found.get(l.id)! } : l)) })
          skipDirty.current = true
          h.update(apply)
        }
      } catch (err) {
        console.warn('Planurile de fundal nu au putut fi citite din browser', err)
      } finally {
        restored.current = true
      }
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const t = window.setTimeout(async () => {
      if (!restored.current) return
      const warn = (what: string) => {
        if (warned.current) return
        warned.current = true
        notify(`Atenție: ${what} nu încape în memoria browserului. Salvează proiectul în fișier (Ctrl+S) ca să nu-l pierzi.`)
      }
      try {
        // planurile de fundal și imaginile de pe planșe stau în IndexedDB (localStorage are ~5 MB)
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            ...project,
            levels: project.levels.map((l) => ({ ...l, background: null })),
            arch: project.arch.map((a) => (a.kind === 'image' && a.src ? { ...a, src: undefined } : a)),
          }),
        )
      } catch {
        warn('proiectul')
      }
      try {
        const ids = new Set(project.levels.map((l) => l.id))
        for (const l of project.levels) {
          if (l.background && storedBgs.current.get(l.id) !== l.background.src) {
            await putBackground(l.id, l.background)
            storedBgs.current.set(l.id, l.background.src)
          } else if (!l.background && storedBgs.current.has(l.id)) {
            await deleteBackground(l.id)
            storedBgs.current.delete(l.id)
          }
        }
        const imgs = project.arch.filter((a) => a.kind === 'image' && a.src)
        for (const a of imgs) {
          const key = 'img:' + a.id
          if (storedBgs.current.get(key) !== a.src) {
            await putImage(key, a.src!)
            storedBgs.current.set(key, a.src!)
          }
        }
        const imgIds = new Set(imgs.map((a) => 'img:' + a.id))
        for (const key of await backgroundKeys()) {
          const k = String(key)
          if (k.startsWith('img:') ? !imgIds.has(k) : !ids.has(k)) {
            await deleteBackground(k)
            storedBgs.current.delete(k)
          }
        }
      } catch (err) {
        console.warn(err)
        warn('planul de fundal')
      }
    }, 600)
    return () => window.clearTimeout(t)
  }, [project])

  // Selecția multiplă păstrează doar elementele care mai există (ex. după undo)
  useEffect(() => {
    if (!multi.length) return
    const ok = multi.filter((m) =>
      m.kind === 'device' ? project.devices.some((d) => d.id === m.id) : m.kind === 'arch' ? project.arch.some((a) => a.id === m.id) : project.cables.some((c) => c.id === m.id),
    )
    if (ok.length !== multi.length) setMulti(ok.length > 1 ? ok : [])
  }, [project, multi])

  // Selecția devine invalidă dacă elementul dispare (ex. undo)
  useEffect(() => {
    if (!selection) return
    const exists =
      selection.kind === 'device'
        ? project.devices.some((d) => d.id === selection.id)
        : selection.kind === 'arch'
          ? project.arch.some((a) => a.id === selection.id)
          : project.cables.some((c) => c.id === selection.id)
    if (!exists) setSelection(null)
  }, [project, selection])

  const select = useCallback((s: Selection) => {
    setSelection(s)
    if (s) {
      setMulti([])
      setTab('element')
    }
  }, [])

  // ---------------------------------------------------------------- acțiuni

  const addDevice = useCallback(
    (type: string, x: number, y: number, catalogId?: string, symbolId?: string) => {
      const def = symbolByType(type)
      if (!def) return
      const id = uid()
      h.commit((p) => {
        const it = catalogItem(p, catalogId)
        const sym = deviceSymbol(p, { symbolId, catalogId })
        const d: Device = {
          id,
          levelId: sheetLevel(p, activeSheet(p)).id,
          type,
          x,
          y,
          rotation: 0,
          label: nextLabel(devicePrefix(type, it, sym), p.devices.map((d) => d.label), p.numberPad),
          model: '',
          ...(it ? { catalogId: it.id } : {}),
          ...(symbolId && p.customSymbols.some((c) => c.id === symbolId) ? { symbolId } : {}),
          zone: '',
          partition: '',
          notes: '',
          ...(def.camera ? { fov: it?.fovDeg ?? def.camera.fov, range: it?.rangeM ?? def.camera.range } : {}),
        }
        const sheets = p.sheets.map((sh) => {
          if (sh.id !== p.activeSheetId || sh.kind !== 'plan') return sh
          // sistemul și stratul de echipamente devin vizibile pe planșa curentă
          const systems = sh.systems.includes(def.system) ? sh.systems : SYSTEMS.map((x) => x.id).filter((x) => x === def.system || sh.systems.includes(x))
          return { ...sh, systems, hiddenLayers: (sh.hiddenLayers ?? []).filter((k) => k !== `${def.system}:echipamente`) }
        })
        return { ...p, sheets, devices: [...p.devices, d] }
      })
      setSelection({ kind: 'device', id })
    },
    [h],
  )

  const addCable = useCallback(
    (points: number[], from?: string, to?: string, via?: { cableId: string; end: 'from' | 'to' }, riser?: string) => {
      const id = uid()
      h.commit((p) => {
        const a = p.devices.find((d) => d.id === from)
        const b = p.devices.find((d) => d.id === to)
        const system = (a && symbolByType(a.type)?.system) || (b && symbolByType(b.type)?.system) || 'EFR'
        const c: Cable = {
          id,
          levelId: sheetLevel(p, activeSheet(p)).id,
          code: nextCableCode(system, p.cables),
          system,
          points,
          from,
          to,
          ...(via ? { via } : {}),
          ...(riser ? { riser } : {}),
          cableType: defaultCableType(a?.type, b?.type),
          lengthOverride: null,
          notes: '',
        }
        // stratul traseelor sistemului devine vizibil pe planșa curentă
        const sheets = p.sheets.map((sh) => (sh.id === p.activeSheetId ? { ...sh, hiddenLayers: (sh.hiddenLayers ?? []).filter((k) => k !== `${c.system}:cabluri`) } : sh))
        return { ...p, sheets, cables: [...p.cables, c] }
      })
      select({ kind: 'cable', id })
    },
    [h, select],
  )

  const patchDevice = (id: string, patch: Partial<Device>) =>
    h.commit((p) => ({
      ...p,
      devices: p.devices.map((d) => {
        if (d.id !== id) return d
        const next = { ...d, ...patch }
        // la alegerea unui model de cameră din catalog, conul preia unghiul și distanța modelului
        if ('catalogId' in patch && patch.catalogId !== d.catalogId) {
          const it = catalogItem(p, patch.catalogId)
          if (it?.fovDeg != null && !('fov' in patch)) next.fov = it.fovDeg
          if (it?.rangeM != null && !('range' in patch)) next.range = it.rangeM
        }
        // la schimbarea modelului din catalog sau a simbolului, renumerotează dacă prefixul diferă (ex. PIR1 → PIRW1)
        if (('catalogId' in patch && patch.catalogId !== d.catalogId) || ('symbolId' in patch && patch.symbolId !== d.symbolId)) {
          const oldP = devicePrefix(d.type, catalogItem(p, d.catalogId), deviceSymbol(p, d))
          const newP = devicePrefix(next.type, catalogItem(p, next.catalogId), deviceSymbol(p, next))
          if (oldP !== newP && new RegExp('^' + oldP.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\d+$').test(d.label)) {
            next.label = nextLabel(newP, p.devices.filter((x) => x.id !== id).map((x) => x.label), p.numberPad)
          }
        }
        return next
      }),
    }))

  const patchCable = (id: string, patch: Partial<Cable>) =>
    h.commit((p) => ({ ...p, cables: p.cables.map((c) => (c.id === id ? { ...c, ...patch } : c)) }))

  const deleteSelection = useCallback(() => {
    if (!selection) return
    if (selection.kind === 'device') {
      h.commit((p) => ({
        ...p,
        devices: p.devices.filter((d) => d.id !== selection.id),
        cables: p.cables.map((c) => ({
          ...c,
          from: c.from === selection.id ? undefined : c.from,
          to: c.to === selection.id ? undefined : c.to,
        })),
      }))
    } else if (selection.kind === 'arch') {
      h.commit((p) => ({ ...p, arch: p.arch.filter((a) => a.id !== selection.id) }))
    } else {
      h.commit((p) => ({ ...p, cables: p.cables.filter((c) => c.id !== selection.id) }))
    }
    setSelection(null)
  }, [selection, h])

  /** Adaugă un element de arhitectură; o schiță fără plan de fundal pornește la scara 1 m = 50 px */
  const addArch = useCallback(
    (el: NewArch) => {
      const id = uid()
      h.commit((p) => {
        const lvl = sheetLevel(p, activeSheet(p))
        return {
          ...p,
          levels: p.levels.map((l) => (l.id === lvl.id && !l.pxPerMeter && !l.background ? { ...l, pxPerMeter: SKETCH_PX_PER_M } : l)),
          arch: [...p.arch, { ...el, id, levelId: lvl.id }],
          // stratul elementului nou devine vizibil pe planșa curentă
          sheets: p.sheets.map((sh) => (sh.id === p.activeSheetId ? { ...sh, hiddenLayers: (sh.hiddenLayers ?? []).filter((k) => k !== archLayer(el)) } : sh)),
        }
      })
      // zonele, imaginile și tabelele se reglează imediat din panou (tab-ul Element)
      if (el.kind === 'rect' || el.kind === 'ellipse' || el.kind === 'image' || el.kind === 'table' || el.kind === 'note') select({ kind: 'arch', id })
      else if (el.kind !== 'wall' && el.kind !== 'dim') setSelection({ kind: 'arch', id })
    },
    [h, select],
  )

  const patchArch = (id: string, patch: Partial<ArchElement>) =>
    h.commit((p) => ({ ...p, arch: p.arch.map((a) => (a.id === id ? { ...a, ...patch } : a)) }))

  const rotateSelection = useCallback(
    (delta: number) => {
      if (selection?.kind === 'arch') {
        h.commit((p) => ({
          ...p,
          arch: p.arch.map((a) => (a.id === selection.id && a.x != null ? { ...a, rotation: ((((a.rotation ?? 0) + delta) % 360) + 360) % 360 } : a)),
        }))
        return
      }
      if (selection?.kind !== 'device') return
      h.commit((p) => ({
        ...p,
        devices: p.devices.map((d) => (d.id === selection.id ? { ...d, rotation: (((d.rotation + delta) % 360) + 360) % 360 } : d)),
      }))
    },
    [selection, h],
  )

  const duplicateSelection = useCallback(() => {
    if (selection?.kind === 'arch') {
      const src = project.arch.find((a) => a.id === selection.id)
      if (!src) return
      const id = uid()
      const off = 0.5 * (levelOf(project, src.levelId).pxPerMeter ?? SKETCH_PX_PER_M)
      h.commit((p) => ({
        ...p,
        arch: [
          ...p.arch,
          { ...src, id, points: src.points?.map((v) => v + off), x: src.x != null ? src.x + off : undefined, y: src.y != null ? src.y + off : undefined },
        ],
      }))
      setSelection({ kind: 'arch', id })
      return
    }
    if (selection?.kind !== 'device') return
    const src = project.devices.find((d) => d.id === selection.id)
    const def = src && symbolByType(src.type)
    if (!src || !def) return
    const id = uid()
    h.commit((p) => ({
      ...p,
      devices: [
        ...p.devices,
        { ...src, id, x: src.x + levelOf(p, src.levelId).symbolSize * 1.5, y: src.y, label: nextLabel(devicePrefix(src.type, catalogItem(p, src.catalogId), deviceSymbol(p, src)), p.devices.map((d) => d.label), p.numberPad) },
      ],
    }))
    setSelection({ kind: 'device', id })
  }, [selection, project, h])

  // ---------------------------------------------------------------- copiere / lipire

  /** Echipamentul copiat (cu toate datele: model din catalog, zonă, con cameră...) */
  /** Elementele copiate (echipamente și schiță), cu toate datele: model din catalog, zonă, con cameră... */
  const [clipboard, setClipboard] = useState<{ devices: Device[]; arch: ArchElement[] } | null>(null)
  const pasteCount = useRef(0)
  const [ctxMenu, setCtxMenu] = useState<{ clientX: number; clientY: number; x: number; y: number; target: Selection } | null>(null)

  const selectedDevice = selection?.kind === 'device' ? project.devices.find((d) => d.id === selection.id) : undefined
  /** Elementele asupra cărora acționează comenzile: grupul sau elementul selectat */
  const targets = (): Item[] => (multi.length ? multi : selection ? [selection] : [])

  const collect = (items: Item[]) => ({
    devices: project.devices.filter((d) => items.some((i) => i.kind === 'device' && i.id === d.id)),
    arch: project.arch.filter((a) => items.some((i) => i.kind === 'arch' && i.id === a.id)),
  })

  const copySelection = (cut = false) => {
    const c = collect(targets())
    const n = c.devices.length + c.arch.length
    if (!n) return
    setClipboard(c)
    pasteCount.current = 0
    if (cut) deleteTargets()
    notify(`${cut ? 'Tăiat' : 'Copiat'}: ${n === 1 ? (c.devices[0]?.label ?? ARCH_NAMES[c.arch[0].kind]) : `${n} elemente`}`)
  }

  /** Lipește elemente: la poziția dată (centrate pe ea) sau decalate față de original */
  const pasteItems = (src: { devices: Device[]; arch: ArchElement[] }, at?: { x: number; y: number }, step = 1) => {
    if (sheet.kind !== 'plan' || (!src.devices.length && !src.arch.length)) return
    const xs: number[] = []
    const ys: number[] = []
    for (const d of src.devices) {
      xs.push(d.x)
      ys.push(d.y)
    }
    for (const a of src.arch) {
      const pts = a.points ?? (a.x != null && a.y != null ? [a.x, a.y] : [])
      for (let i = 0; i < pts.length; i += 2) {
        xs.push(pts[i])
        ys.push(pts[i + 1])
      }
    }
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2
    const created: Item[] = []
    h.commit((p) => {
      const lvl = sheetLevel(p, activeSheet(p))
      const off = lvl.symbolSize * 1.5 * step
      const dx = at ? at.x - cx : off
      const dy = at ? at.y - cy : off
      const labels = p.devices.map((x) => x.label)
      const systems = new Set<SystemId>()
      const devices = src.devices.map((d) => {
        const label = nextLabel(devicePrefix(d.type, catalogItem(p, d.catalogId), deviceSymbol(p, d)), labels, p.numberPad)
        labels.push(label)
        const sys = symbolByType(d.type)?.system
        if (sys) systems.add(sys)
        const id = uid()
        created.push({ kind: 'device', id })
        return { ...d, id, levelId: lvl.id, x: d.x + dx, y: d.y + dy, label }
      })
      const arch = src.arch.map((a) => {
        const id = uid()
        created.push({ kind: 'arch', id })
        return {
          ...a,
          id,
          levelId: lvl.id,
          points: a.points?.map((v, i) => v + (i % 2 ? dy : dx)),
          x: a.x != null ? a.x + dx : undefined,
          y: a.y != null ? a.y + dy : undefined,
        }
      })
      const sheets = p.sheets.map((sh) =>
        sh.id === p.activeSheetId && [...systems].some((x) => !sh.systems.includes(x))
          ? { ...sh, systems: SYSTEMS.map((x) => x.id).filter((x) => systems.has(x) || sh.systems.includes(x)) }
          : sh,
      )
      return { ...p, sheets, devices: [...p.devices, ...devices], arch: [...p.arch, ...arch] }
    })
    // selecția trece pe elementele lipite
    window.setTimeout(() => {
      if (created.length === 1) {
        setMulti([])
        setSelection(created[0])
      } else if (created.length > 1) {
        setSelection(null)
        setMulti(created)
      }
    }, 0)
  }

  const paste = (at?: { x: number; y: number }) => {
    if (!clipboard) return
    pasteCount.current++
    pasteItems(clipboard, at, pasteCount.current)
  }

  /** Șterge elementele țintă (grup sau element selectat) */
  const deleteTargets = () => {
    const items = targets()
    if (!items.length) return
    const ids = (k: Item['kind']) => new Set(items.filter((i) => i.kind === k).map((i) => i.id))
    const dev = ids('device')
    const arch = ids('arch')
    const cab = ids('cable')
    h.commit((p) => ({
      ...p,
      devices: p.devices.filter((d) => !dev.has(d.id)),
      arch: p.arch.filter((a) => !arch.has(a.id)),
      cables: p.cables
        .filter((c) => !cab.has(c.id))
        .map((c) => ({ ...c, from: c.from && dev.has(c.from) ? undefined : c.from, to: c.to && dev.has(c.to) ? undefined : c.to })),
    }))
    setSelection(null)
    setMulti([])
  }

  /** Rotește fiecare element din grup în jurul propriului centru */
  const rotateTargets = (delta: number) => {
    if (!multi.length) return rotateSelection(delta)
    const dev = new Set(multi.filter((i) => i.kind === 'device').map((i) => i.id))
    const arch = new Set(multi.filter((i) => i.kind === 'arch').map((i) => i.id))
    const rot = (r: number) => (((r + delta) % 360) + 360) % 360
    h.commit((p) => ({
      ...p,
      devices: p.devices.map((d) => (dev.has(d.id) ? { ...d, rotation: rot(d.rotation) } : d)),
      arch: p.arch.map((a) => (arch.has(a.id) && a.x != null ? { ...a, rotation: rot(a.rotation ?? 0) } : a)),
    }))
  }

  const duplicateTargets = () => {
    if (!multi.length) return duplicateSelection()
    pasteItems(collect(multi), undefined, 1)
  }

  const applyToGroup = (fn: (p: Project, items: Item[]) => Project) => h.commit((p) => fn(p, multi))

  const onScaleMeasured = (pixels: number) => {
    setTool({ kind: 'select' })
    if (pixels < 2) return notify('Segment prea scurt.')
    const answer = window.prompt('Lungimea reală a segmentului măsurat (metri):', '5')
    if (answer == null) return
    const m = parseFloat(answer.replace(',', '.'))
    if (!(m > 0)) return notify('Valoare invalidă.')
    const ppm = pixels / m
    h.commit((p) => {
      const lvl = sheetLevel(p, activeSheet(p))
      return { ...p, levels: p.levels.map((l) => (l.id === lvl.id ? { ...l, pxPerMeter: ppm } : l)) }
    })
    notify(`Scară calibrată: ${ppm.toFixed(2)} px/m.`)
  }

  /** Nivelul pe care se încarcă următorul plan de fundal (implicit: nivelul planșei curente) */
  const bgTarget = useRef<string | null>(null)

  /** PDF cu mai multe pagini: alegerea paginii */
  const [pdfPick, setPdfPick] = useState<{ doc: PdfDoc; fileName: string; resolve: (page: number | null) => void } | null>(null)

  /** Planul DXF citit, în așteptarea alegerii straturilor și a unității */
  const [dxfImport, setDxfImport] = useState<{ drawing: DxfDrawing; fileName: string; targetId: string } | null>(null)

  const onBackgroundFile = async (file: File) => {
    const targetId = bgTarget.current ?? level.id
    bgTarget.current = null
    const lower = file.name.toLowerCase()
    if (lower.endsWith('.dwg')) {
      notify('Fișierele DWG nu se pot citi în browser. În AutoCAD: Save As → DXF (orice versiune), apoi încarcă fișierul DXF.')
      return
    }
    if (lower.endsWith('.dxf')) {
      setBusy('Se citește planul DXF…')
      try {
        await new Promise((r) => setTimeout(r, 30))
        const drawing = readDxf(await file.arrayBuffer())
        if (!drawing.prims.length) throw new Error('fișierul nu conține desen în spațiul model.')
        setDxfImport({ drawing, fileName: file.name, targetId })
      } catch (err) {
        console.error(err)
        notify('Nu am putut citi DXF-ul: ' + (err as Error).message)
      } finally {
        setBusy(null)
      }
      return
    }
    setBusy('Se încarcă planul…')
    try {
      const bg = await loadBackground(file, async (doc) => {
        setBusy(null)
        const page = await new Promise<number | null>((resolve) => setPdfPick({ doc, fileName: file.name, resolve }))
        setPdfPick(null)
        if (page != null) setBusy('Se încarcă planul…')
        return page
      })
      if (!bg) return
      h.commit((p) => ({
        ...p,
        levels: p.levels.map((l) =>
          l.id === targetId
            ? {
                ...l,
                background: bg,
                bgX: 0,
                bgY: 0,
                bgRotation: 0,
                pxPerMeter: null,
                symbolSize: p.devices.some((d) => d.levelId === l.id) ? l.symbolSize : Math.max(16, Math.round(Math.max(bg.width, bg.height) / 50)),
              }
            : l,
        ),
      }))
      setFitSignal((n) => n + 1)
      notify('Plan încărcat. Calibrează scara: unealta „Scară”.')
    } catch (err) {
      console.error(err)
      notify('Nu am putut încărca fișierul: ' + (err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const saveJson = () => {
    const blob = new Blob([JSON.stringify(project)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${(project.title.nrProiect || 'proiect').replace(/[\\/:*?"<>|]+/g, '_')}.plansa.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 30000)
    setDirty(false)
  }

  const openJson = async (file: File) => {
    if (dirty && !window.confirm('Ai modificări nesalvate în fișier. Deschizi totuși alt proiect?')) return
    try {
      const v = JSON.parse(await file.text())
      if (!isProject(v)) throw new Error('Fișierul nu este un proiect valid.')
      const opened = normalizeProject(v)
      skipDirty.current = true
      h.reset(opened)
      setDirty(false)
      setSelection(null)
      setTool({ kind: 'select' })
      setFitSignal((n) => n + 1)
      notify('Proiect deschis.')
    } catch (err) {
      notify('Eroare: ' + (err as Error).message)
    }
  }

  const newProject = () => {
    if (dirty && !window.confirm('Ai modificări nesalvate în fișier. Începi totuși un proiect nou? (Salvează întâi cu Ctrl+S dacă vrei să le păstrezi.)')) return
    const fresh = emptyProject()
    skipDirty.current = true
    h.reset(fresh)
    setDirty(false)
    setSelection(null)
    setTool({ kind: 'select' })
    setFitSignal((n) => n + 1)
  }

  // ---------------------------------------------------------------- planșe

  /** Verificare: problemele proiectului (recalculate la fiecare modificare) */
  const issues = useMemo(() => verifyProject(project), [project])
  const verifyErrors = issues.filter((i) => i.sev === 'err').length

  /** Navigare la locul unei probleme din verificare */
  const goToIssue = (t: IssueTarget) => {
    const sheetFor = (levelId: string, system?: string) =>
      project.sheets.find((s) => s.kind === 'plan' && sheetLevel(project, s).id === levelId && (!system || s.systems.includes(system as never))) ??
      project.sheets.find((s) => s.kind === 'plan' && sheetLevel(project, s).id === levelId)
    switch (t.kind) {
      case 'device':
      case 'cable': {
        const sys = t.kind === 'device' ? deviceSystem(project.devices.find((d) => d.id === t.id)!) : project.cables.find((c) => c.id === t.id)?.system
        const sh = sheetFor(t.levelId, sys)
        if (sh && sh.id !== sheet.id) setActiveSheet(sh.id)
        setTimeout(() => select({ kind: t.kind, id: t.id }), 0)
        break
      }
      case 'level': {
        const sh = sheetFor(t.levelId)
        if (sh && sh.id !== sheet.id) setActiveSheet(sh.id)
        setTab('proiect')
        break
      }
      case 'sheet':
        if (t.sheetId !== sheet.id) setActiveSheet(t.sheetId)
        setTab('proiect')
        break
      case 'catalog':
        setCatalogFocus(t.itemId)
        setCatalogOpen(true)
        break
      case 'memoriu':
        setMemoOpen(true)
        break
      case 'project':
        setTab('proiect')
        break
      case 'calc':
        setTab('calcule')
        break
    }
  }

  const setActiveSheet = (id: string) => {
    setSelection(null)
    setTool({ kind: 'select' })
    // schimbarea planșei afișate nu e o modificare a proiectului
    if (!dirty) skipDirty.current = true
    h.update((p) => ({ ...p, activeSheetId: id }))
    setFitSignal((n) => n + 1)
  }

  const patchSheet = (id: string, patch: Partial<Sheet>) =>
    h.commit((p) => ({ ...p, sheets: p.sheets.map((sh) => (sh.id === id ? { ...sh, ...patch } : sh)) }))

  const addSheets = (make: (p: Project) => Sheet[]) => {
    let firstId: string | undefined
    h.commit((p) => {
      const added: Sheet[] = []
      const lvlId = sheetLevel(p, activeSheet(p)).id
      for (const sh of make(p)) {
        const nr = nextSheetNr({ ...p, sheets: [...p.sheets, ...added] })
        added.push({ ...sh, nr, format: sheet.format, orientation: sheet.orientation, levelId: sh.kind === 'plan' ? sh.levelId ?? lvlId : undefined })
      }
      if (!added.length) return p
      firstId = added[0].id
      return { ...p, sheets: [...p.sheets, ...added], activeSheetId: added[0].id }
    })
    setSheetMenu(null)
    setSelection(null)
    setTool({ kind: 'select' })
    setFitSignal((n) => n + 1)
    window.setTimeout(() => !firstId && notify('Nu există echipamente pentru planșele cerute.'), 0)
  }

  const systemsWithDevices = (p: Project): SystemId[] =>
    SYSTEMS.map((s) => s.id).filter((id) => p.devices.some((d) => deviceSystem(d) === id))

  /** Titlul unei planșe de plan: include nivelul când proiectul are mai multe niveluri */
  const planTitle = (p: Project, lvl: Level, what?: string) =>
    ['Plan amplasare', p.levels.length > 1 ? lvl.name : '', what ?? ''].filter(Boolean).join(' – ')

  const addPlanPerSystem = () =>
    addSheets((p) => {
      const lvl = sheetLevel(p, activeSheet(p))
      return SYSTEMS.map((s) => s.id)
        .filter((id) => p.devices.some((d) => d.levelId === lvl.id && deviceSystem(d) === id))
        .filter((id) => !p.sheets.some((sh) => sh.kind === 'plan' && sh.levelId === lvl.id && sh.systems.length === 1 && sh.systems[0] === id))
        .map((id) => newSheet({ titlu: planTitle(p, lvl, systemById(id).name), systems: [id], showCones: id === 'CCTV', levelId: lvl.id }))
    })

  /** Nume propus pentru nivelul următor: Etaj 1, Etaj 2... (sau Plan 2, Plan 3 la proiectele vechi) */
  const nextLevelName = (p: Project) => {
    const n = p.levels.length
    if (p.levels.some((l) => /^Plan \d+$/.test(l.name))) return `Plan ${n + 1}`
    return `Etaj ${n}`
  }

  /** Nivel nou cu o planșă de plan; cu `withImage`, se deschide imediat alegerea planului de fundal */
  const addLevel = (withImage: boolean) => {
    const lvl = newLevel(nextLevelName(project))
    h.commit((p) => {
      const withLvl = { ...p, levels: [...p.levels, lvl] }
      const sh = newSheet({ levelId: lvl.id, titlu: planTitle(withLvl, lvl), nr: nextSheetNr(p), format: sheet.format, orientation: sheet.orientation })
      return { ...withLvl, sheets: [...p.sheets, sh], activeSheetId: sh.id }
    })
    setSheetMenu(null)
    setSelection(null)
    setTool({ kind: 'select' })
    setFitSignal((n) => n + 1)
    if (withImage) {
      bgTarget.current = lvl.id
      bgInput.current?.click()
    } else notify(`Nivel nou „${lvl.name}”: pagină albă pentru schiță. Îl redenumești din tab-ul Proiect.`)
  }

  /** Planșă nouă pe un nivel existent */
  const addSheetOnLevel = (levelId: string) =>
    addSheets((p) => [newSheet({ levelId, titlu: planTitle(p, levelOf(p, levelId)) })])

  const patchLevel = (id: string, patch: Partial<Level>) =>
    h.commit((p) => {
      const old = levelOf(p, id).name
      // la redenumire, titlurile planșelor nivelului care conțin vechiul nume se actualizează
      const sheets =
        patch.name && old && patch.name !== old
          ? p.sheets.map((sh) => (sh.kind === 'plan' && sh.levelId === id && sh.titlu.includes(old) ? { ...sh, titlu: sh.titlu.split(old).join(patch.name!) } : sh))
          : p.sheets
      return { ...p, sheets, levels: p.levels.map((l) => (l.id === id ? { ...l, ...patch } : l)) }
    })

  const deleteLevel = (id: string) => {
    if (project.levels.length < 2) return
    const lvl = levelOf(project, id)
    const nDev = project.devices.filter((d) => d.levelId === id).length
    const nCab = project.cables.filter((c) => c.levelId === id).length
    const nSh = project.sheets.filter((s) => s.kind === 'plan' && s.levelId === id).length
    if (!window.confirm(`Ștergi nivelul „${lvl.name}”? Se șterg și ${nSh} planșe, ${nDev} echipamente și ${nCab} cabluri de pe el (poți reveni cu Ctrl+Z).`)) return
    h.commit((p) => {
      const sheets = p.sheets.filter((s) => !(s.kind === 'plan' && s.levelId === id))
      const keep = sheets.length ? sheets : [newSheet({ levelId: p.levels.find((l) => l.id !== id)!.id })]
      const gone = new Set(p.devices.filter((d) => d.levelId === id).map((d) => d.id))
      return {
        ...p,
        levels: p.levels.filter((l) => l.id !== id),
        sheets: keep,
        activeSheetId: keep.some((s) => s.id === p.activeSheetId) ? p.activeSheetId : keep[0].id,
        devices: p.devices.filter((d) => d.levelId !== id),
        cables: p.cables.filter((c) => c.levelId !== id).map((c) => ({ ...c, from: c.from && gone.has(c.from) ? undefined : c.from, to: c.to && gone.has(c.to) ? undefined : c.to })),
        arch: p.arch.filter((a) => a.levelId !== id),
      }
    })
    setSelection(null)
    setFitSignal((n) => n + 1)
  }

  const addBlocSheet = (id: SystemId) =>
    addSheets(() => [newSheet({ kind: 'bloc', titlu: `Schemă bloc – ${systemById(id).name}`, systems: [id] })])

  const deleteSheet = (id: string) => {
    if (project.sheets.length < 2) return
    const sh = project.sheets.find((x) => x.id === id)
    if (!sh || !window.confirm(`Ștergi planșa „${sh.nr} ${sh.titlu}”? Echipamentele de pe plan rămân.`)) return
    h.commit((p) => {
      const sheets = p.sheets.filter((x) => x.id !== id)
      return { ...p, sheets, activeSheetId: p.activeSheetId === id ? sheets[0].id : p.activeSheetId }
    })
    setFitSignal((n) => n + 1)
  }

  /** Mută planșa la poziția `to` (indexul înaintea căruia ajunge, în lista inițială) */
  const moveSheet = (id: string, to: number) =>
    h.commit((p) => {
      const from = p.sheets.findIndex((x) => x.id === id)
      if (from < 0) return p
      const target = Math.max(0, Math.min(p.sheets.length, to))
      if (target === from || target === from + 1) return p
      const sheets = [...p.sheets]
      const [sh] = sheets.splice(from, 1)
      sheets.splice(target > from ? target - 1 : target, 0, sh)
      return { ...p, sheets }
    })

  /** Copie a planșei (cu schema bloc editată și straturile ei), pusă imediat după ea */
  const duplicateSheet = (id: string) => {
    const nid = uid()
    h.commit((p) => {
      const i = p.sheets.findIndex((x) => x.id === id)
      if (i < 0) return p
      const src = p.sheets[i]
      const copy: Sheet = { ...structuredClone(src), id: nid, nr: nextSheetNr(p), titlu: `${src.titlu} (copie)` }
      const sheets = [...p.sheets]
      sheets.splice(i + 1, 0, copy)
      return { ...p, sheets, activeSheetId: nid }
    })
    setSelection(null)
    setTool({ kind: 'select' })
    setFitSignal((n) => n + 1)
  }

  /** Numerele planșelor în ordinea filelor: P01, P02… */
  const renumberSheets = () =>
    h.commit((p) => ({ ...p, sheets: p.sheets.map((sh, i) => ({ ...sh, nr: 'P' + String(i + 1).padStart(2, '0') })) }))

  // ---------------------------------------------------------------- export

  const fileBase = () => `${project.title.nrProiect || 'proiect'}`

  const doExportPdf = async () => {
    const stage = stageRef.current
    if (!stage) return
    setSelection(null)
    setBusy('Se generează PDF-ul…')
    try {
      await new Promise((r) => setTimeout(r, 50))
      const page = await renderSheetPage(stage, project, sheet)
      setPreview({ pages: [{ ...page, label: `${sheet.nr} ${sheet.titlu}` }], name: `${fileBase()} - ${sheet.nr} ${sheet.titlu}`, title: `Planșa ${sheet.nr}` })
    } catch (err) {
      notify((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const doExportAllPdf = async () => {
    const original = project.activeSheetId
    setBusy('Se generează toate planșele…')
    const pages: PreviewPage[] = []
    const skipped: string[] = []
    try {
      for (const sh of project.sheets) {
        // afișează planșa ca să poată fi randată, apoi o capturează
        flushSync(() => {
          setSelection(null)
          h.update((p) => ({ ...p, activeSheetId: sh.id }))
        })
        await new Promise((r) => setTimeout(r, 30))
        const stage = stageRef.current
        if (!stage) continue
        try {
          pages.push({ ...(await renderSheetPage(stage, project, sh)), label: `${sh.nr} ${sh.titlu}` })
        } catch {
          skipped.push(sh.nr)
        }
      }
      if (pages.length) setPreview({ pages, name: `${fileBase()} - planse`, title: 'Toate planșele' })
      if (skipped.length) notify(`Planșe goale, sărite: ${skipped.join(', ')}.`)
    } finally {
      h.update((p) => ({ ...p, activeSheetId: original }))
      setFitSignal((n) => n + 1)
      setBusy(null)
    }
  }

  const doExportDrawio = () => {
    const blocs = project.sheets.filter((sh) => sh.kind === 'bloc')
    const items = blocs.length
      ? blocs.map((sh) => ({ system: sh.systems[0], diagram: sh.diagram, name: `${sh.nr} ${sh.titlu}` }))
      : systemsWithDevices(project).map((s) => ({ system: s, name: `Schemă bloc – ${systemById(s).name}` }))
    if (!items.length) return notify('Nu există echipamente pentru schemele bloc.')
    exportDrawio(project, items)
    notify(`Exportat ${items.length} ${items.length === 1 ? 'schemă bloc' : 'scheme bloc'} în draw.io.`)
  }

  // ---------------------------------------------------------------- taste

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ctrl+S salvează oriunde, inclusiv din câmpurile de text și din dialoguri
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        ;(document.activeElement as HTMLElement | null)?.blur?.()
        saveJson()
        return
      }
      if (catalogOpen || memoOpen || helpOpen || preview) {
        if (e.key === 'Escape') {
          setPreview(null)
          setCatalogOpen(false)
          setMemoOpen(false)
          if (helpOpen) closeHelp()
        }
        return
      }
      if ((e.target as HTMLElement)?.closest('input, textarea, select')) return
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) h.redo()
        else h.undo()
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        h.redo()
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        duplicateTargets()
      } else if (mod && e.key.toLowerCase() === 'a' && sheet.kind === 'plan') {
        // Ctrl+A: tot ce se vede pe planșa curentă
        e.preventDefault()
        const all: Item[] = [
          ...project.devices.filter((d) => d.levelId === level.id && sheet.systems.includes(symbolByType(d.type)?.system ?? 'EFR')).map((d) => ({ kind: 'device' as const, id: d.id })),
          ...project.arch.filter((a) => a.levelId === level.id).map((a) => ({ kind: 'arch' as const, id: a.id })),
          ...project.cables.filter((c) => c.levelId === level.id && sheet.systems.includes(c.system)).map((c) => ({ kind: 'cable' as const, id: c.id })),
        ]
        setSelection(null)
        setMulti(all.length > 1 ? all : [])
        if (all.length === 1) setSelection(all[0])
      } else if (mod && (e.key.toLowerCase() === 'c' || e.key.toLowerCase() === 'x') && sheet.kind === 'plan' && (multi.length || selectedDevice || selection?.kind === 'arch')) {
        e.preventDefault()
        copySelection(e.key.toLowerCase() === 'x')
      } else if (mod && e.key.toLowerCase() === 'v' && sheet.kind === 'plan' && clipboard) {
        e.preventDefault()
        paste()
      } else if (e.key === 'Escape') {
        if (ctxMenu) setCtxMenu(null)
        else if (sheetMenu) setSheetMenu(null)
        else if (tool.kind !== 'select') setTool({ kind: 'select' })
        else {
          setSelection(null)
          setMulti([])
        }
      } else if ((e.key === 'Delete' || (e.key === 'Backspace' && tool.kind !== 'cable')) && (selection || multi.length) && sheet.kind === 'plan') {
        e.preventDefault()
        if (multi.length) deleteTargets()
        else deleteSelection()
      } else if (e.key === 'F2' && selection?.kind === 'arch' && project.arch.find((a) => a.id === selection.id)?.kind === 'label') {
        e.preventDefault()
        setEditTextId(selection.id)
      } else if (e.key.toLowerCase() === 'r' && !mod) {
        rotateTargets(e.shiftKey ? -15 : 15)
      } else if (e.key.toLowerCase() === 'v' && !mod) {
        setTool({ kind: 'select' })
      } else if (e.key.toLowerCase() === 'c' && !mod) {
        setTool({ kind: 'cable' })
        setSelection(null)
      } else if (e.key.toLowerCase() === 'f' && !mod) {
        setFitSignal((n) => n + 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // ---------------------------------------------------------------- UI

  const selDevice = selection?.kind === 'device' ? project.devices.find((d) => d.id === selection.id) : undefined
  const selCable = selection?.kind === 'cable' ? project.cables.find((c) => c.id === selection.id) : undefined
  const selArch = selection?.kind === 'arch' ? project.arch.find((a) => a.id === selection.id) : undefined

  return (
    <div className="app">
      <header className="toolbar">
        <div className="brand">Planșe Securitate</div>
        <div className="group">
          <button onClick={newProject} title="Proiect nou">Nou</button>
          <button onClick={() => openInput.current?.click()} title="Deschide proiect (.json)">Deschide</button>
          <button onClick={saveJson} className={dirty ? 'unsaved' : ''} title={dirty ? 'Ai modificări nesalvate în fișier — Salvează (Ctrl+S)' : 'Salvează proiect (Ctrl+S)'}>
            Salvează{dirty && <span className="dirty-dot" />}
          </button>
          <button onClick={() => bgInput.current?.click()} title="Încarcă planul clădirii (PDF, imagine sau DXF)">Încarcă plan</button>
          <button onClick={() => setCatalogOpen(true)} title="Catalog echipamente (modele, consumuri)">Catalog</button>
        </div>
        <div className="group">
          <button className={tool.kind === 'select' ? 'on' : ''} onClick={() => setTool({ kind: 'select' })} title="Selectare / mutare (V)">
            Selectare
          </button>
          <button className={tool.kind === 'scale' ? 'on' : ''} onClick={() => setTool({ kind: 'scale' })} title="Calibrează scara pe o cotă cunoscută">
            Scară
          </button>
          <button
            className={tool.kind === 'cable' ? 'on' : ''}
            onClick={() => {
              setTool({ kind: 'cable' })
              setSelection(null)
            }}
            title="Desenează traseu de cablu (C)"
          >
            Cablu
          </button>
        </div>
        <div className="group">
          <button onClick={h.undo} disabled={!h.canUndo} title="Anulează (Ctrl+Z)">↶</button>
          <button onClick={h.redo} disabled={!h.canRedo} title="Refă (Ctrl+Y)">↷</button>
          <button onClick={() => setFitSignal((n) => n + 1)} title="Încadrează în ecran (F)">Încadrare</button>
        </div>
        <div className="group right">
          <button className="verify-btn" onClick={() => setVerifyOpen(true)} title="Verifică ce lipsește înainte de predarea proiectului">
            Verificare
            {verifyErrors > 0 && <span className="badge">{verifyErrors}</span>}
          </button>
          <button className="primary" onClick={doExportPdf} title="Exportă planșa curentă">PDF planșă</button>
          <button className="primary" onClick={doExportAllPdf} title="Toate planșele într-un singur PDF">PDF toate</button>
          <button className="primary" onClick={() => exportExcel(project)} title="Liste echipamente, zone, jurnal cablu">Excel</button>
          <button
            className="primary"
            onClick={() => notify(exportDxf(project, sheet).message)}
            disabled={sheet.kind !== 'plan'}
            title="Planșa curentă ca desen DXF pentru AutoCAD (în metri)"
          >
            DXF
          </button>
          <button className="primary" onClick={doExportDrawio} title="Schemele bloc ca fișier draw.io editabil">draw.io</button>
          <button className="primary" onClick={() => setMemoOpen(true)} title="Memoriul tehnic pentru avizare (.docx)">Memoriu</button>
          <button className="help-btn" onClick={() => setHelpOpen(true)} title="Ghid de utilizare (Ajutor)" aria-label="Ajutor">?</button>
        </div>
        <input
          ref={bgInput}
          type="file"
          accept="application/pdf,image/*,.dxf,.dwg"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) onBackgroundFile(f)
          }}
        />
        <input
          ref={openInput}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) openJson(f)
          }}
        />
      </header>

      <main className="workspace">
        <Palette
          tool={tool}
          catalog={project.catalog}
          customSymbols={project.customSymbols}
          onUploadSymbol={() => setSymDialog({})}
          onEditSymbol={(id) => setSymDialog({ id })}
          onPickArch={(arch) => {
            if (sheet.kind === 'bloc') {
              const target = project.sheets.find((sh) => sh.kind === 'plan')
              if (!target) return
              setActiveSheet(target.id)
            }
            setSelection(null)
            setTool(tool.kind === 'arch' && tool.arch === arch ? { kind: 'select' } : { kind: 'arch', arch })
          }}
          onPick={(type, catalogId, symbolId) => {
            if (sheet.kind === 'bloc') {
              const sys = symbolByType(type)?.system
              const target =
                project.sheets.find((sh) => sh.kind === 'plan' && sys && sh.systems.includes(sys)) ??
                project.sheets.find((sh) => sh.kind === 'plan')
              if (!target) return notify('Adaugă întâi o planșă de tip plan.')
              setActiveSheet(target.id)
              setTool({ kind: 'place', type, catalogId, symbolId })
              return
            }
            setTool(
              tool.kind === 'place' && tool.type === type && tool.catalogId === catalogId && tool.symbolId === symbolId
                ? { kind: 'select' }
                : { kind: 'place', type, catalogId, symbolId },
            )
          }}
        />

        <div className="center">
          {sheet.kind === 'plan' ? (
            <PlanCanvas
              project={project}
              sheet={sheet}
              level={level}
              tool={tool}
              selection={selection}
              stageRef={stageRef}
              fitSignal={fitSignal}
              onSelect={select}
              onAddDevice={addDevice}
              onAddCable={addCable}
              onScaleMeasured={onScaleMeasured}
              onAddArch={addArch}
              editTextId={editTextId}
              onEditText={setEditTextId}
              onContext={(info) => {
                setTool({ kind: 'select' })
                const inMulti = info.target && multi.some((m) => m.kind === info.target!.kind && m.id === info.target!.id)
                if (info.target && !inMulti) select(info.target)
                setCtxMenu(info)
              }}
              multi={multi}
              onMulti={(items) => {
                setMulti(items)
                if (items.length) {
                  setSelection(null)
                  setTab('element')
                }
              }}
              checkpoint={h.checkpoint}
              update={h.update}
            />
          ) : (
            <BlockCanvas
              project={project}
              sheet={sheet}
              selection={selection}
              stageRef={stageRef}
              fitSignal={fitSignal}
              onSelect={select}
              commit={h.commit}
              update={h.update}
              checkpoint={h.checkpoint}
            />
          )}
          <nav className="sheet-bar">
            {project.sheets.map((sh, idx) => (
              <div
                key={sh.id}
                className={
                  'sheet-tab' +
                  (sh.id === sheet.id ? ' on' : '') +
                  (tabDrag?.id === sh.id ? ' dragging' : '') +
                  (tabDrag && tabDrag.over === idx ? ' drop-before' : '') +
                  (tabDrag && tabDrag.over === idx + 1 && idx === project.sheets.length - 1 ? ' drop-after' : '')
                }
                draggable={renaming !== sh.id}
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/sheet-id', sh.id)
                  e.dataTransfer.effectAllowed = 'move'
                  setTabDrag({ id: sh.id, over: null })
                }}
                onDragOver={(e) => {
                  if (!tabDrag) return
                  e.preventDefault()
                  const r = e.currentTarget.getBoundingClientRect()
                  const over = e.clientX < r.left + r.width / 2 ? idx : idx + 1
                  if (over !== tabDrag.over) setTabDrag({ ...tabDrag, over })
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  if (tabDrag?.over != null) moveSheet(tabDrag.id, tabDrag.over)
                  setTabDrag(null)
                }}
                onDragEnd={() => setTabDrag(null)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setSheetCtx({ id: sh.id, left: Math.min(e.clientX, window.innerWidth - 250), top: Math.max(8, e.clientY - 330) })
                }}
              >
                {renaming === sh.id ? (
                  <input
                    className="sheet-rename"
                    autoFocus
                    defaultValue={sh.titlu}
                    onFocus={(e) => e.target.select()}
                    onBlur={(e) => {
                      const v = e.target.value.trim()
                      if (v && v !== sh.titlu) patchSheet(sh.id, { titlu: v })
                      setRenaming(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                      if (e.key === 'Escape') setRenaming(null)
                    }}
                  />
                ) : (
                  <button
                    onClick={() => sh.id !== sheet.id && setActiveSheet(sh.id)}
                    onDoubleClick={() => setRenaming(sh.id)}
                    title={`${sh.titlu} · ${formatLabel(sh)}\nDublu-click = redenumire · click dreapta = meniu · trage = mută`}
                  >
                    <span className="sheet-kind">{sh.kind === 'bloc' ? '⊞' : '▭'}</span>
                    <b>{sh.nr}</b> {sh.titlu}
                    <small>
                      {formatLabel(sh)}
                      {sh.kind === 'plan' && project.levels.length > 1 ? ` · ${levelOf(project, sh.levelId).name}` : ''}
                    </small>
                  </button>
                )}
                {sh.id === sheet.id && project.sheets.length > 1 && renaming !== sh.id && (
                  <button className="sheet-x" title="Șterge planșa" onClick={() => deleteSheet(sh.id)}>
                    ×
                  </button>
                )}
              </div>
            ))}
            {sheetCtx &&
              (() => {
                const sh = project.sheets.find((x) => x.id === sheetCtx.id)
                if (!sh) return null
                const i = project.sheets.indexOf(sh)
                const n = project.sheets.length
                const close = (fn: () => void) => () => {
                  fn()
                  setSheetCtx(null)
                }
                return (
                  <div className="ctx-back" onMouseDown={() => setSheetCtx(null)} onContextMenu={(e) => { e.preventDefault(); setSheetCtx(null) }}>
                    <div className="ctx-menu" style={{ left: sheetCtx.left, top: sheetCtx.top }} onMouseDown={(e) => e.stopPropagation()}>
                      <div className="ctx-title">
                        {sh.nr} {sh.titlu}
                      </div>
                      <button disabled={sh.id === sheet.id} onClick={close(() => setActiveSheet(sh.id))}>Deschide</button>
                      <button onClick={close(() => setRenaming(sh.id))}>Redenumește…</button>
                      <button onClick={close(() => duplicateSheet(sh.id))}>Duplică planșa</button>
                      <div className="ctx-sep" />
                      <button disabled={i === 0} onClick={close(() => moveSheet(sh.id, i - 1))}>Mută la stânga ◂</button>
                      <button disabled={i === n - 1} onClick={close(() => moveSheet(sh.id, i + 2))}>Mută la dreapta ▸</button>
                      <button disabled={i === 0} onClick={close(() => moveSheet(sh.id, 0))}>Mută la început ⇤</button>
                      <button disabled={i === n - 1} onClick={close(() => moveSheet(sh.id, n))}>Mută la sfârșit ⇥</button>
                      <button onClick={close(renumberSheets)} title="Numerele planșelor devin P01, P02… în ordinea filelor">
                        Renumerotează planșele în ordine
                      </button>
                      <div className="ctx-sep" />
                      <button className="danger-item" disabled={n < 2} onClick={close(() => deleteSheet(sh.id))}>
                        Șterge planșa
                      </button>
                    </div>
                  </div>
                )
              })()}
            <div className="sheet-add">
              <button
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect()
                  setSheetMenu((v) => (v ? null : { left: Math.max(8, Math.min(r.left, window.innerWidth - 330)), bottom: window.innerHeight - r.top + 6 }))
                }}
                title="Adaugă planșă"
              >
                + Planșă
              </button>
              {sheetMenu && (
                <div className="menu" style={sheetMenu} onMouseLeave={() => setSheetMenu(null)}>
                  <div className="menu-sep">Pe nivelul „{level.name}”</div>
                  <button onClick={() => addSheets((p) => [newSheet({ titlu: planTitle(p, level) })])}>Plan nou (toate sistemele)</button>
                  <button onClick={addPlanPerSystem}>Câte un plan pentru fiecare sistem folosit</button>
                  <div className="menu-sep">Nivel nou (etaj)</div>
                  <button onClick={() => addLevel(true)}>Nivel nou – încarcă planul (PDF / imagine)…</button>
                  <button onClick={() => addLevel(false)}>Nivel nou – pagină albă (schiță)</button>
                  {project.levels.length > 1 && (
                    <>
                      <div className="menu-sep">Planșă pe alt nivel</div>
                      {project.levels
                        .filter((l) => l.id !== level.id)
                        .map((l) => (
                          <button key={l.id} onClick={() => addSheetOnLevel(l.id)}>
                            ▭ {l.name}
                          </button>
                        ))}
                    </>
                  )}
                  <div className="menu-sep">Schemă bloc</div>
                  {SYSTEMS.map((s) => (
                    <button key={s.id} onClick={() => addBlocSheet(s.id)}>
                      <span className="dot" style={{ background: s.color }} /> {s.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </nav>
        </div>

        <aside className="side">
          <nav className="tabs">
            <button className={tab === 'element' ? 'on' : ''} onClick={() => setTab('element')}>Element</button>
            <button className={tab === 'proiect' ? 'on' : ''} onClick={() => setTab('proiect')}>Proiect</button>
            <button className={tab === 'straturi' ? 'on' : ''} onClick={() => setTab('straturi')} title="Straturi: arată / ascunde, blochează">Straturi</button>
            <button className={tab === 'calcule' ? 'on' : ''} onClick={() => setTab('calcule')}>Calcule</button>
            <button className={tab === 'liste' ? 'on' : ''} onClick={() => setTab('liste')}>Liste</button>
          </nav>
          <div className="side-body">
            {tab === 'element' &&
              (multi.length ? (
                <GroupPanel
                  project={project}
                  items={multi}
                  onPatchDevices={(patch) =>
                    h.commit((p) => ({ ...p, devices: p.devices.map((d) => (multi.some((m) => m.kind === 'device' && m.id === d.id) ? { ...d, ...patch } : d)) }))
                  }
                  onAlign={(fn) => applyToGroup(fn)}
                  onDelete={deleteTargets}
                />
              ) : selDevice ? (
                <DeviceProps d={selDevice} project={project} onChange={(patch) => patchDevice(selDevice.id, patch)} onDelete={deleteSelection} />
              ) : selCable ? (
                <CableProps c={selCable} project={project} onChange={(patch) => patchCable(selCable.id, patch)} onDelete={deleteSelection} />
              ) : selArch ? (
                <ArchProps
                  a={selArch}
                  project={project}
                  onChange={(patch) => patchArch(selArch.id, patch)}
                  onDelete={deleteSelection}
                  onAssignZone={(ids, zone) => {
                    h.commit((p) => ({ ...p, devices: p.devices.map((d) => (ids.includes(d.id) ? { ...d, zone } : d)) }))
                    notify(`Zona „${zone}” a fost atribuită la ${ids.length} echipamente.`)
                  }}
                />
              ) : (
                <div className="props">
                  <p className="hint">Selectează un echipament sau un cablu de pe plan.</p>
                  <h4>Scurtături</h4>
                  <ul className="keys">
                    <li><kbd>V</kbd> selectare · <kbd>C</kbd> cablu · <kbd>F</kbd> încadrare</li>
                    <li><kbd>R</kbd> / <kbd>Shift+R</kbd> rotire ±15°</li>
                    <li><kbd>Ctrl+D</kbd> duplicare · <kbd>Del</kbd> ștergere</li>
                    <li><kbd>Ctrl+Z</kbd> / <kbd>Ctrl+Y</kbd> anulare / refacere</li>
                    <li>Rotiță mouse = zoom · trage pe fundal = deplasare</li>
                    <li>
                      <kbd>Ctrl +</kbd> / <kbd>Ctrl −</kbd> zoom · <kbd>Ctrl 0</kbd> încadrare · <kbd>Ctrl 1</kbd> 100%
                    </li>
                  </ul>
                </div>
              ))}
            {tab === 'straturi' &&
              (sheet.kind === 'plan' ? (
                <LayersPanel
                  project={project}
                  sheet={sheet}
                  level={level}
                  onChange={(patch) => patchSheet(sheet.id, patch)}
                  onLevelChange={(patch) => patchLevel(level.id, patch)}
                />
              ) : (
                <div className="props">
                  <p className="hint">Straturile sunt pentru planșele de plan. Schema bloc arată un singur sistem (alege-l din tab-ul Proiect).</p>
                </div>
              ))}
            {tab === 'proiect' && (
              <SheetPanel
                sheet={sheet}
                levels={project.levels}
                onChange={(patch) => patchSheet(sheet.id, patch)}
              />
            )}
            {tab === 'proiect' && sheet.kind === 'plan' && (
              <LevelPanel
                level={level}
                paperMmPerPx={paperMmPerPx(project, sheet)}
                frame={(() => {
                  const f = pageFrame(project, sheet)
                  return f ? { meters: f.meters, out: outsideFrame(project, sheet), format: formatLabel(sheet), scara: sheet.scara } : null
                })()}
                onCenterFrame={() => {
                  const b = contentBounds(project, ALL_SYSTEMS, level.id)
                  patchLevel(level.id, { pageCenter: b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : { x: 0, y: 0 } })
                }}
                suggested={symbolForPaper(project, sheet)}
                canDelete={project.levels.length > 1}
                onChange={(patch) => patchLevel(level.id, patch)}
                onFitSymbols={(size) =>
                  h.commit((p) => {
                    const ppm = levelOf(p, level.id).pxPerMeter ?? SKETCH_PX_PER_M
                    const minText = Math.round(((size * 0.5) / ppm) * 20) / 20
                    return {
                      ...p,
                      levels: p.levels.map((l) => (l.id === level.id ? { ...l, symbolSize: size } : l)),
                      // textele de încăpere prea mici cresc odată cu simbolurile
                      arch: p.arch.map((a) => (a.levelId === level.id && a.kind === 'label' && (a.size ?? 0.45) < minText ? { ...a, size: minText } : a)),
                    }
                  })
                }
                onLoadPlan={() => {
                  bgTarget.current = level.id
                  bgInput.current?.click()
                }}
                onCalibrate={() => {
                  setTool({ kind: 'scale' })
                  setSelection(null)
                }}
                onDelete={() => deleteLevel(level.id)}
              />
            )}
            {tab === 'proiect' && (
              <ProjectPanel project={project} onChange={(patch) => h.commit((p) => ({ ...p, ...patch }))} />
            )}
            {tab === 'calcule' && (
              <CalcPanel project={project} onChange={(patch) => h.commit((p) => ({ ...p, ...patch }))} onOpenCatalog={() => setCatalogOpen(true)} />
            )}
            {tab === 'liste' && <ListsPanel project={project} onSelectDevice={(id) => select({ kind: 'device', id })} />}
          </div>
        </aside>
      </main>

      {catalogOpen && (
        <CatalogDialog
          project={project}
          initialId={catalogFocus}
          onChange={(catalog) => h.commit((p) => ({ ...p, catalog }))}
          onClose={() => {
            setCatalogOpen(false)
            setCatalogFocus(undefined)
          }}
          notify={notify}
        />
      )}
      {memoOpen && (
        <MemoriuDialog project={project} onChange={(patch) => h.commit((p) => ({ ...p, ...patch }))} onClose={() => setMemoOpen(false)} notify={notify} />
      )}
      {helpOpen && <HelpDialog onClose={closeHelp} />}
      {symDialog && (
        <CustomSymbolDialog
          existing={symDialog.id ? project.customSymbols.find((c) => c.id === symDialog.id) : undefined}
          usedBy={symDialog.id ? project.devices.filter((d) => d.symbolId === symDialog.id).length : 0}
          onClose={() => setSymDialog(null)}
          onSave={(sym, keep) => {
            h.commit((p) => ({
              ...p,
              customSymbols: p.customSymbols.some((c) => c.id === sym.id) ? p.customSymbols.map((c) => (c.id === sym.id ? sym : c)) : [...p.customSymbols, sym],
            }))
            // biblioteca din browser: la adăugare (dacă e bifat) și la editarea unui simbol care e deja acolo
            const inLib = defaultCustomSymbols().some((c) => c.id === sym.id)
            if ((keep && !symDialog.id) || inLib) {
              if (!addToLibrary(sym)) notify('Simbolul e în proiect, dar biblioteca din browser e plină.')
            }
            setSymDialog(null)
            if (!symDialog.id) {
              setTool({ kind: 'place', type: sym.base, symbolId: sym.id })
              notify(`Simbolul „${sym.name}” a fost adăugat. Click pe plan pentru plasare.`)
            }
          }}
          onDelete={() => {
            const id = symDialog.id!
            h.commit((p) => ({
              ...p,
              customSymbols: p.customSymbols.filter((c) => c.id !== id),
              devices: p.devices.map((d) => (d.symbolId === id ? { ...d, symbolId: undefined } : d)),
              catalog: p.catalog.map((c) => (c.symbolId === id ? { ...c, symbolId: undefined } : c)),
            }))
            removeFromLibrary(id)
            setSymDialog(null)
          }}
        />
      )}
      {verifyOpen && <VerifyDialog issues={issues} onGo={goToIssue} onClose={() => setVerifyOpen(false)} />}
      {pdfPick && <PdfPagePicker doc={pdfPick.doc} fileName={pdfPick.fileName} onPick={pdfPick.resolve} />}
      {dxfImport && (
        <DxfImportDialog
          drawing={dxfImport.drawing}
          fileName={dxfImport.fileName}
          onCancel={() => setDxfImport(null)}
          onImport={(bg, ppm) => {
            const { targetId } = dxfImport
            setDxfImport(null)
            h.commit((p) => {
              const next = {
                ...p,
                levels: p.levels.map((l) => (l.id === targetId ? { ...l, background: bg, pxPerMeter: ppm, bgX: 0, bgY: 0, bgRotation: 0 } : l)),
              }
              // simbolurile ~6 mm pe planșa curentă (dacă arată nivelul), altfel ~0,5 m
              const sh = activeSheet(next)
              const fit = sh.kind === 'plan' && sheetLevel(next, sh).id === targetId ? symbolForPaper(next, sh) : null
              const hasDevices = p.devices.some((d) => d.levelId === targetId)
              return {
                ...next,
                levels: next.levels.map((l) => (l.id === targetId && !hasDevices ? { ...l, symbolSize: fit ?? Math.round(ppm * 0.5) } : l)),
              }
            })
            setFitSignal((n) => n + 1)
            notify(`Plan DXF încărcat, scara calibrată automat (${ppm.toFixed(1)} px/m).`)
          }}
        />
      )}
      {preview && (
        <PdfPreview
          pages={preview.pages}
          title={preview.title}
          onClose={() => setPreview(null)}
          onDownload={() => {
            savePdf(preview.pages, preview.name)
            notify(`PDF descărcat (${preview.pages.length} ${preview.pages.length === 1 ? 'pagină' : 'pagini'}).`)
            setPreview(null)
          }}
        />
      )}
      {busy && <div className="overlay">{busy}</div>}
      {ctxMenu && (
        <div className="ctx-back" onMouseDown={() => setCtxMenu(null)} onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null) }}>
          <div
            className="ctx-menu"
            style={{ left: Math.min(ctxMenu.clientX, window.innerWidth - 230), top: Math.min(ctxMenu.clientY, window.innerHeight - 260) }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {(() => {
              const close = (fn: () => void) => () => {
                fn()
                setCtxMenu(null)
              }
              const t = ctxMenu.target
              // meniul grupului: click dreapta pe un element din grup sau în chenarul grupului
              if (multi.length && (!t || multi.some((m) => m.kind === t.kind && m.id === t.id))) {
                const nDev = multi.filter((m) => m.kind === 'device').length
                return (
                  <>
                    <div className="ctx-title">{multi.length} elemente selectate</div>
                    <button onClick={close(() => copySelection())}>
                      Copiază<kbd>Ctrl+C</kbd>
                    </button>
                    <button onClick={close(() => copySelection(true))}>
                      Taie<kbd>Ctrl+X</kbd>
                    </button>
                    <button onClick={close(duplicateTargets)}>
                      Duplică<kbd>Ctrl+D</kbd>
                    </button>
                    <button onClick={close(() => rotateTargets(90))}>
                      Rotește fiecare 90°<kbd>R</kbd>
                    </button>
                    <div className="ctx-sep" />
                    <button onClick={close(() => applyToGroup((p, it) => alignGroup(p, it, 'h')))}>Aliniază pe orizontală ⎯</button>
                    <button onClick={close(() => applyToGroup((p, it) => alignGroup(p, it, 'v')))}>Aliniază pe verticală │</button>
                    <button disabled={multi.length < 3} onClick={close(() => applyToGroup((p, it) => distributeGroup(p, it, 'h')))}>
                      Distribuie uniform pe orizontală
                    </button>
                    <button disabled={multi.length < 3} onClick={close(() => applyToGroup((p, it) => distributeGroup(p, it, 'v')))}>
                      Distribuie uniform pe verticală
                    </button>
                    {nDev > 0 && (
                      <>
                        <div className="ctx-label">Culoare simboluri ({nDev})</div>
                        <div className="ctx-colors">
                          <ColorRow
                            defaultColor=""
                            showReset
                            onChange={(c) => {
                              h.commit((p) => ({ ...p, devices: p.devices.map((d) => (multi.some((m) => m.kind === 'device' && m.id === d.id) ? { ...d, color: c } : d)) }))
                              setCtxMenu(null)
                            }}
                          />
                        </div>
                      </>
                    )}
                    {nDev > 0 && (
                      <button
                        onClick={close(() => {
                          setTab('element')
                        })}
                      >
                        Editează datele ({nDev} echipamente)
                      </button>
                    )}
                    <div className="ctx-sep" />
                    <button className="danger-item" onClick={close(deleteTargets)}>
                      Șterge {multi.length} elemente<kbd>Del</kbd>
                    </button>
                  </>
                )
              }
              const dev = t?.kind === 'device' ? project.devices.find((d) => d.id === t.id) : undefined
              const pasteBtn = (
                <button disabled={!clipboard} onClick={close(() => paste({ x: ctxMenu.x, y: ctxMenu.y }))}>
                  Lipește aici
                  {clipboard
                    ? clipboard.devices.length + clipboard.arch.length === 1 && clipboard.devices[0]
                      ? ` (${devicePrefix(clipboard.devices[0].type, catalogItem(project, clipboard.devices[0].catalogId))})`
                      : ` (${clipboard.devices.length + clipboard.arch.length} el.)`
                    : ''}
                  <kbd>Ctrl+V</kbd>
                </button>
              )
              if (dev)
                return (
                  <>
                    <div className="ctx-title">{dev.label}</div>
                    <button onClick={close(() => copySelection())}>
                      Copiază<kbd>Ctrl+C</kbd>
                    </button>
                    <button onClick={close(() => copySelection(true))}>
                      Taie<kbd>Ctrl+X</kbd>
                    </button>
                    {pasteBtn}
                    <button onClick={close(duplicateSelection)}>
                      Duplică<kbd>Ctrl+D</kbd>
                    </button>
                    <button onClick={close(() => rotateSelection(90))}>
                      Rotește 90°<kbd>R</kbd>
                    </button>
                    {canMirror(dev.type) && (
                      <>
                        <button onClick={close(() => patchDevice(dev.id, { flipX: !dev.flipX }))}>Oglindește orizontal ⇋</button>
                        <button onClick={close(() => patchDevice(dev.id, { flipY: !dev.flipY }))}>Oglindește vertical ⇵</button>
                      </>
                    )}
                    {(!deviceSymbol(project, dev) || deviceSymbol(project, dev)!.recolor) && (
                      <>
                        <div className="ctx-sep" />
                        <div className="ctx-label">Culoare simbol</div>
                        <div className="ctx-colors">
                          <ColorRow
                            value={dev.color}
                            defaultColor={systemById(symbolByType(dev.type)!.system).color}
                            onChange={(c) => {
                              patchDevice(dev.id, { color: c })
                              setCtxMenu(null)
                            }}
                          />
                        </div>
                      </>
                    )}
                    <div className="ctx-sep" />
                    <button className="danger-item" onClick={close(deleteSelection)}>
                      Șterge<kbd>Del</kbd>
                    </button>
                  </>
                )
              if (t?.kind === 'arch') {
                const el = project.arch.find((a) => a.id === t.id)
                return (
                  <>
                    <div className="ctx-title">{el ? ARCH_NAMES[el.kind] : 'Element'}</div>
                    {el?.kind === 'label' && (
                      <>
                        <button onClick={close(() => setEditTextId(el.id))}>
                          Editează textul<kbd>dublu-click</kbd>
                        </button>
                        <button onClick={close(() => patchArch(el.id, { size: Math.round((el.size ?? 0.45) * 1.25 * 20) / 20 }))}>Mărește textul A+</button>
                        <button onClick={close(() => patchArch(el.id, { size: Math.max(0.1, Math.round(((el.size ?? 0.45) / 1.25) * 20) / 20) }))}>
                          Micșorează textul A−
                        </button>
                      </>
                    )}
                    <button onClick={close(duplicateSelection)}>
                      Duplică<kbd>Ctrl+D</kbd>
                    </button>
                    {el?.x != null && (
                      <button onClick={close(() => rotateSelection(90))}>
                        Rotește 90°<kbd>R</kbd>
                      </button>
                    )}
                    {el?.kind === 'door' && (
                      <button onClick={close(() => patchArch(el.id, { flipY: !el.flipY }))}>Întoarce sensul de deschidere</button>
                    )}
                    <div className="ctx-sep" />
                    <button className="danger-item" onClick={close(deleteSelection)}>
                      Șterge<kbd>Del</kbd>
                    </button>
                  </>
                )
              }
              if (t?.kind === 'cable')
                return (
                  <>
                    <div className="ctx-title">Cablu {project.cables.find((c) => c.id === t.id)?.code}</div>
                    {pasteBtn}
                    <div className="ctx-sep" />
                    <button className="danger-item" onClick={close(deleteSelection)}>
                      Șterge cablul<kbd>Del</kbd>
                    </button>
                  </>
                )
              return pasteBtn
            })()}
          </div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
