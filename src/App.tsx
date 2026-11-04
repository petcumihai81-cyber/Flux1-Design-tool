import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type Konva from 'konva'
import './App.css'
import type { Cable, Device, Project, Selection, Sheet, SystemId, Tool } from './types'
import { useHistory } from './history'
import { activeSheet, catalogItem, devicePrefix, deviceSystem, emptyProject, formatLabel, isProject, newSheet, nextCableCode, nextLabel, nextSheetNr, normalizeProject, uid } from './project'
import { SYSTEMS, defaultCableType, symbolByType, systemById } from './symbols'
import PlanCanvas from './PlanCanvas'
import BlockCanvas from './BlockCanvas'
import { CableProps, DeviceProps, ListsPanel, Palette, ProjectPanel, SheetPanel } from './Panels'
import { loadBackground } from './background'
import { exportExcel, renderSheetPage, savePdf } from './exporters'
import type { RenderedPage } from './exporters'
import { exportDrawio } from './drawio'
import { CalcPanel, CatalogDialog } from './CatalogUI'
import { MemoriuDialog } from './MemoriuDialog'

const STORAGE_KEY = 'plansa-securitate:proiect'

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

type Tab = 'element' | 'proiect' | 'calcule' | 'liste'

export default function App() {
  const h = useHistory<Project>(loadStored)
  const project = h.value
  const sheet = activeSheet(project)
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [memoOpen, setMemoOpen] = useState(false)
  const [sheetMenu, setSheetMenu] = useState<{ left: number; bottom: number } | null>(null)
  const [tool, setTool] = useState<Tool>({ kind: 'select' })
  const [selection, setSelection] = useState<Selection>(null)
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

  // Salvare automată în browser
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(project))
      } catch {
        // planul de fundal poate depăși spațiul disponibil; încercăm fără el
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...project, background: null }))
        } catch {
          /* ignorat */
        }
      }
    }, 600)
    return () => window.clearTimeout(t)
  }, [project])

  // Selecția devine invalidă dacă elementul dispare (ex. undo)
  useEffect(() => {
    if (!selection) return
    const exists =
      selection.kind === 'device' ? project.devices.some((d) => d.id === selection.id) : project.cables.some((c) => c.id === selection.id)
    if (!exists) setSelection(null)
  }, [project, selection])

  const select = useCallback((s: Selection) => {
    setSelection(s)
    if (s) setTab('element')
  }, [])

  // ---------------------------------------------------------------- acțiuni

  const addDevice = useCallback(
    (type: string, x: number, y: number, catalogId?: string) => {
      const def = symbolByType(type)
      if (!def) return
      const id = uid()
      h.commit((p) => {
        const it = catalogItem(p, catalogId)
        const d: Device = {
          id,
          type,
          x,
          y,
          rotation: 0,
          label: nextLabel(devicePrefix(type, it), p.devices.map((d) => d.label), p.numberPad),
          model: '',
          ...(it ? { catalogId: it.id } : {}),
          zone: '',
          partition: '',
          notes: '',
          ...(def.camera ? { fov: it?.fovDeg ?? def.camera.fov, range: it?.rangeM ?? def.camera.range } : {}),
        }
        const sheets = p.sheets.map((sh) =>
          sh.id === p.activeSheetId && sh.kind === 'plan' && !sh.systems.includes(def.system)
            ? { ...sh, systems: SYSTEMS.map((x) => x.id).filter((x) => x === def.system || sh.systems.includes(x)) }
            : sh,
        )
        return { ...p, sheets, devices: [...p.devices, d] }
      })
      setSelection({ kind: 'device', id })
    },
    [h],
  )

  const addCable = useCallback(
    (points: number[], from?: string, to?: string) => {
      const id = uid()
      h.commit((p) => {
        const a = p.devices.find((d) => d.id === from)
        const b = p.devices.find((d) => d.id === to)
        const system = (a && symbolByType(a.type)?.system) || (b && symbolByType(b.type)?.system) || 'EFR'
        const c: Cable = {
          id,
          code: nextCableCode(system, p.cables),
          system,
          points,
          from,
          to,
          cableType: defaultCableType(a?.type, b?.type),
          lengthOverride: null,
          notes: '',
        }
        return { ...p, cables: [...p.cables, c] }
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
        // la schimbarea modelului din catalog, renumerotează dacă prefixul diferă (ex. PIR1 → PIRW1)
        if ('catalogId' in patch && patch.catalogId !== d.catalogId) {
          const oldP = devicePrefix(d.type, catalogItem(p, d.catalogId))
          const newP = devicePrefix(d.type, catalogItem(p, patch.catalogId))
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
    } else {
      h.commit((p) => ({ ...p, cables: p.cables.filter((c) => c.id !== selection.id) }))
    }
    setSelection(null)
  }, [selection, h])

  const rotateSelection = useCallback(
    (delta: number) => {
      if (selection?.kind !== 'device') return
      h.commit((p) => ({
        ...p,
        devices: p.devices.map((d) => (d.id === selection.id ? { ...d, rotation: (((d.rotation + delta) % 360) + 360) % 360 } : d)),
      }))
    },
    [selection, h],
  )

  const duplicateSelection = useCallback(() => {
    if (selection?.kind !== 'device') return
    const src = project.devices.find((d) => d.id === selection.id)
    const def = src && symbolByType(src.type)
    if (!src || !def) return
    const id = uid()
    h.commit((p) => ({
      ...p,
      devices: [
        ...p.devices,
        { ...src, id, x: src.x + p.symbolSize * 1.5, y: src.y, label: nextLabel(devicePrefix(src.type, catalogItem(p, src.catalogId)), p.devices.map((d) => d.label), p.numberPad) },
      ],
    }))
    setSelection({ kind: 'device', id })
  }, [selection, project.devices, h])

  // ---------------------------------------------------------------- copiere / lipire

  /** Echipamentul copiat (cu toate datele: model din catalog, zonă, con cameră...) */
  const [clipboard, setClipboard] = useState<Device | null>(null)
  const pasteCount = useRef(0)
  const [ctxMenu, setCtxMenu] = useState<{ clientX: number; clientY: number; x: number; y: number; target: Selection } | null>(null)

  const selectedDevice = selection?.kind === 'device' ? project.devices.find((d) => d.id === selection.id) : undefined

  const copySelection = (cut = false) => {
    if (!selectedDevice) return
    setClipboard({ ...selectedDevice })
    pasteCount.current = 0
    if (cut) deleteSelection()
    notify(`${cut ? 'Tăiat' : 'Copiat'}: ${selectedDevice.label}`)
  }

  /** Lipește echipamentul copiat la poziția dată sau decalat față de original */
  const paste = (at?: { x: number; y: number }) => {
    if (!clipboard || sheet.kind !== 'plan') return
    pasteCount.current++
    const id = uid()
    const sys = symbolByType(clipboard.type)?.system
    h.commit((p) => {
      const off = p.symbolSize * 1.5 * pasteCount.current
      const d: Device = {
        ...clipboard,
        id,
        x: at?.x ?? clipboard.x + off,
        y: at?.y ?? clipboard.y + off,
        label: nextLabel(devicePrefix(clipboard.type, catalogItem(p, clipboard.catalogId)), p.devices.map((x) => x.label), p.numberPad),
      }
      const sheets = p.sheets.map((sh) =>
        sh.id === p.activeSheetId && sys && !sh.systems.includes(sys) ? { ...sh, systems: SYSTEMS.map((x) => x.id).filter((x) => x === sys || sh.systems.includes(x)) } : sh,
      )
      return { ...p, sheets, devices: [...p.devices, d] }
    })
    setSelection({ kind: 'device', id })
  }

  const onScaleMeasured = (pixels: number) => {
    setTool({ kind: 'select' })
    if (pixels < 2) return notify('Segment prea scurt.')
    const answer = window.prompt('Lungimea reală a segmentului măsurat (metri):', '5')
    if (answer == null) return
    const m = parseFloat(answer.replace(',', '.'))
    if (!(m > 0)) return notify('Valoare invalidă.')
    h.commit((p) => ({ ...p, pxPerMeter: pixels / m }))
    notify(`Scară calibrată: ${(pixels / m).toFixed(2)} px/m`)
  }

  const onBackgroundFile = async (file: File) => {
    setBusy('Se încarcă planul…')
    try {
      const bg = await loadBackground(file, (count) => {
        const a = window.prompt(`PDF-ul are ${count} pagini. Ce pagină încarc?`, '1')
        return a == null ? null : parseInt(a, 10) || 1
      })
      if (!bg) return
      h.commit((p) => ({
        ...p,
        background: bg,
        pxPerMeter: null,
        symbolSize: p.devices.length ? p.symbolSize : Math.max(16, Math.round(Math.max(bg.width, bg.height) / 50)),
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
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const openJson = async (file: File) => {
    try {
      const v = JSON.parse(await file.text())
      if (!isProject(v)) throw new Error('Fișierul nu este un proiect valid.')
      h.reset(normalizeProject(v))
      setSelection(null)
      setTool({ kind: 'select' })
      setFitSignal((n) => n + 1)
      notify('Proiect deschis.')
    } catch (err) {
      notify('Eroare: ' + (err as Error).message)
    }
  }

  const newProject = () => {
    if (!window.confirm('Începi un proiect nou? Modificările nesalvate în fișier se pierd.')) return
    h.reset(emptyProject())
    setSelection(null)
    setTool({ kind: 'select' })
    setFitSignal((n) => n + 1)
  }

  // ---------------------------------------------------------------- planșe

  const setActiveSheet = (id: string) => {
    setSelection(null)
    setTool({ kind: 'select' })
    h.update((p) => ({ ...p, activeSheetId: id }))
    setFitSignal((n) => n + 1)
  }

  const patchSheet = (id: string, patch: Partial<Sheet>) =>
    h.commit((p) => ({ ...p, sheets: p.sheets.map((sh) => (sh.id === id ? { ...sh, ...patch } : sh)) }))

  const addSheets = (make: (p: Project) => Sheet[]) => {
    let firstId: string | undefined
    h.commit((p) => {
      const added: Sheet[] = []
      for (const sh of make(p)) {
        const nr = nextSheetNr({ ...p, sheets: [...p.sheets, ...added] })
        added.push({ ...sh, nr, format: sheet.format, orientation: sheet.orientation })
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

  const addPlanPerSystem = () =>
    addSheets((p) =>
      systemsWithDevices(p)
        .filter((id) => !p.sheets.some((sh) => sh.kind === 'plan' && sh.systems.length === 1 && sh.systems[0] === id))
        .map((id) => newSheet({ titlu: `Plan amplasare – ${systemById(id).name}`, systems: [id], showCones: id === 'CCTV' })),
    )

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
      savePdf([page], `${fileBase()} - ${sheet.nr} ${sheet.titlu}`)
    } catch (err) {
      notify((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const doExportAllPdf = async () => {
    const original = project.activeSheetId
    setBusy('Se generează toate planșele…')
    const pages: RenderedPage[] = []
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
          pages.push(await renderSheetPage(stage, project, sh))
        } catch {
          skipped.push(sh.nr)
        }
      }
      if (pages.length) savePdf(pages, `${fileBase()} - planse`)
      notify(`${pages.length} planșe exportate${skipped.length ? `; goale, sărite: ${skipped.join(', ')}` : ''}.`)
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
      if (catalogOpen || memoOpen) {
        if (e.key === 'Escape') {
          setCatalogOpen(false)
          setMemoOpen(false)
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
        duplicateSelection()
      } else if (mod && (e.key.toLowerCase() === 'c' || e.key.toLowerCase() === 'x') && sheet.kind === 'plan' && selectedDevice) {
        e.preventDefault()
        copySelection(e.key.toLowerCase() === 'x')
      } else if (mod && e.key.toLowerCase() === 'v' && sheet.kind === 'plan' && clipboard) {
        e.preventDefault()
        paste()
      } else if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        saveJson()
      } else if (e.key === 'Escape') {
        if (ctxMenu) setCtxMenu(null)
        else if (tool.kind !== 'select') setTool({ kind: 'select' })
        else setSelection(null)
      } else if ((e.key === 'Delete' || (e.key === 'Backspace' && tool.kind !== 'cable')) && selection && sheet.kind === 'plan') {
        e.preventDefault()
        deleteSelection()
      } else if (e.key.toLowerCase() === 'r' && !mod) {
        rotateSelection(e.shiftKey ? -15 : 15)
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

  return (
    <div className="app">
      <header className="toolbar">
        <div className="brand">Planșe Securitate</div>
        <div className="group">
          <button onClick={newProject} title="Proiect nou">Nou</button>
          <button onClick={() => openInput.current?.click()} title="Deschide proiect (.json)">Deschide</button>
          <button onClick={saveJson} title="Salvează proiect (Ctrl+S)">Salvează</button>
          <button onClick={() => bgInput.current?.click()} title="Încarcă planul clădirii (PDF sau imagine)">Încarcă plan</button>
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
          <button className="primary" onClick={doExportPdf} title="Exportă planșa curentă">PDF planșă</button>
          <button className="primary" onClick={doExportAllPdf} title="Toate planșele într-un singur PDF">PDF toate</button>
          <button className="primary" onClick={() => exportExcel(project)} title="Liste echipamente, zone, jurnal cablu">Excel</button>
          <button className="primary" onClick={doExportDrawio} title="Schemele bloc ca fișier draw.io editabil">draw.io</button>
          <button className="primary" onClick={() => setMemoOpen(true)} title="Memoriul tehnic pentru avizare (.docx)">Memoriu</button>
        </div>
        <input
          ref={bgInput}
          type="file"
          accept="application/pdf,image/*"
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
          onPick={(type, catalogId) => {
            if (sheet.kind === 'bloc') {
              const sys = symbolByType(type)?.system
              const target =
                project.sheets.find((sh) => sh.kind === 'plan' && sys && sh.systems.includes(sys)) ??
                project.sheets.find((sh) => sh.kind === 'plan')
              if (!target) return notify('Adaugă întâi o planșă de tip plan.')
              setActiveSheet(target.id)
              setTool({ kind: 'place', type, catalogId })
              return
            }
            setTool(tool.kind === 'place' && tool.type === type && tool.catalogId === catalogId ? { kind: 'select' } : { kind: 'place', type, catalogId })
          }}
        />

        <div className="center">
          {sheet.kind === 'plan' ? (
            <PlanCanvas
              project={project}
              sheet={sheet}
              tool={tool}
              selection={selection}
              stageRef={stageRef}
              fitSignal={fitSignal}
              onSelect={select}
              onAddDevice={addDevice}
              onAddCable={addCable}
              onScaleMeasured={onScaleMeasured}
              onContext={(info) => {
                setTool({ kind: 'select' })
                if (info.target) select(info.target)
                setCtxMenu(info)
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
            {project.sheets.map((sh) => (
              <div key={sh.id} className={'sheet-tab' + (sh.id === sheet.id ? ' on' : '')}>
                <button
                  onClick={() => sh.id !== sheet.id && setActiveSheet(sh.id)}
                  title={`${sh.titlu} · ${formatLabel(sh)}`}
                >
                  <span className="sheet-kind">{sh.kind === 'bloc' ? '⊞' : '▭'}</span>
                  <b>{sh.nr}</b> {sh.titlu}
                  <small>{formatLabel(sh)}</small>
                </button>
                {sh.id === sheet.id && project.sheets.length > 1 && (
                  <button className="sheet-x" title="Șterge planșa" onClick={() => deleteSheet(sh.id)}>
                    ×
                  </button>
                )}
              </div>
            ))}
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
                  <button onClick={() => addSheets(() => [newSheet()])}>Plan nou (toate sistemele)</button>
                  <button onClick={addPlanPerSystem}>Câte un plan pentru fiecare sistem folosit</button>
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
            <button className={tab === 'calcule' ? 'on' : ''} onClick={() => setTab('calcule')}>Calcule</button>
            <button className={tab === 'liste' ? 'on' : ''} onClick={() => setTab('liste')}>Liste</button>
          </nav>
          <div className="side-body">
            {tab === 'element' &&
              (selDevice ? (
                <DeviceProps d={selDevice} project={project} onChange={(patch) => patchDevice(selDevice.id, patch)} onDelete={deleteSelection} />
              ) : selCable ? (
                <CableProps c={selCable} project={project} onChange={(patch) => patchCable(selCable.id, patch)} onDelete={deleteSelection} />
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
                  </ul>
                </div>
              ))}
            {tab === 'proiect' && <SheetPanel sheet={sheet} onChange={(patch) => patchSheet(sheet.id, patch)} />}
            {tab === 'proiect' && (
              <ProjectPanel
                project={project}
                onChange={(patch) => h.commit((p) => ({ ...p, ...patch }))}
                onCalibrate={() => {
                  setTool({ kind: 'scale' })
                  setSelection(null)
                }}
              />
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
          onChange={(catalog) => h.commit((p) => ({ ...p, catalog }))}
          onClose={() => setCatalogOpen(false)}
          notify={notify}
        />
      )}
      {memoOpen && (
        <MemoriuDialog project={project} onChange={(patch) => h.commit((p) => ({ ...p, ...patch }))} onClose={() => setMemoOpen(false)} notify={notify} />
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
              const dev = t?.kind === 'device' ? project.devices.find((d) => d.id === t.id) : undefined
              const pasteBtn = (
                <button disabled={!clipboard} onClick={close(() => paste({ x: ctxMenu.x, y: ctxMenu.y }))}>
                  Lipește aici{clipboard ? ` (${devicePrefix(clipboard.type, catalogItem(project, clipboard.catalogId))})` : ''}
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
                    <div className="ctx-sep" />
                    <button className="danger-item" onClick={close(deleteSelection)}>
                      Șterge<kbd>Del</kbd>
                    </button>
                  </>
                )
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
