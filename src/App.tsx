import { useCallback, useEffect, useRef, useState } from 'react'
import type Konva from 'konva'
import './App.css'
import type { Cable, Device, Project, Selection, Tool } from './types'
import { useHistory } from './history'
import { emptyProject, isProject, nextCableCode, nextLabel, normalizeProject, uid } from './project'
import { defaultCableType, symbolByType } from './symbols'
import PlanCanvas from './PlanCanvas'
import { CableProps, DeviceProps, ListsPanel, Palette, ProjectPanel } from './Panels'
import { loadBackground } from './background'
import { exportExcel, exportPdf } from './exporters'

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

type Tab = 'element' | 'proiect' | 'liste'

export default function App() {
  const h = useHistory<Project>(loadStored)
  const project = h.value
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
    (type: string, x: number, y: number) => {
      const def = symbolByType(type)
      if (!def) return
      const id = uid()
      h.commit((p) => {
        const d: Device = {
          id,
          type,
          x,
          y,
          rotation: 0,
          label: nextLabel(def.prefix, p.devices.map((d) => d.label)),
          model: '',
          zone: '',
          partition: '',
          notes: '',
          ...(def.camera ? { fov: def.camera.fov, range: def.camera.range } : {}),
        }
        return { ...p, hidden: p.hidden.filter((s) => s !== def.system), devices: [...p.devices, d] }
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
    h.commit((p) => ({ ...p, devices: p.devices.map((d) => (d.id === id ? { ...d, ...patch } : d)) }))

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
        { ...src, id, x: src.x + p.symbolSize * 1.5, y: src.y, label: nextLabel(def.prefix, p.devices.map((d) => d.label)) },
      ],
    }))
    setSelection({ kind: 'device', id })
  }, [selection, project.devices, h])

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
    a.download = `${(project.title.nrProiect || 'proiect').replace(/[\\/:*?"<>|]+/g, '_')} - ${project.title.nrPlansa || 'plansa'}.plansa.json`
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

  const doExportPdf = async () => {
    const stage = stageRef.current
    if (!stage) return
    setSelection(null)
    setBusy('Se generează PDF-ul…')
    try {
      await new Promise((r) => setTimeout(r, 50))
      await exportPdf(stage, project)
    } catch (err) {
      notify((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  // ---------------------------------------------------------------- taste

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
      } else if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        saveJson()
      } else if (e.key === 'Escape') {
        if (tool.kind !== 'select') setTool({ kind: 'select' })
        else setSelection(null)
      } else if ((e.key === 'Delete' || (e.key === 'Backspace' && tool.kind !== 'cable')) && selection) {
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
          <button className="primary" onClick={doExportPdf}>Export PDF</button>
          <button className="primary" onClick={() => exportExcel(project)}>Export Excel</button>
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
          onPick={(type) => {
            setTool(tool.kind === 'place' && tool.type === type ? { kind: 'select' } : { kind: 'place', type })
          }}
        />

        <PlanCanvas
          project={project}
          tool={tool}
          selection={selection}
          stageRef={stageRef}
          fitSignal={fitSignal}
          onSelect={select}
          onAddDevice={addDevice}
          onAddCable={addCable}
          onScaleMeasured={onScaleMeasured}
          checkpoint={h.checkpoint}
          update={h.update}
        />

        <aside className="side">
          <nav className="tabs">
            <button className={tab === 'element' ? 'on' : ''} onClick={() => setTab('element')}>Element</button>
            <button className={tab === 'proiect' ? 'on' : ''} onClick={() => setTab('proiect')}>Proiect</button>
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
            {tab === 'liste' && <ListsPanel project={project} onSelectDevice={(id) => select({ kind: 'device', id })} />}
          </div>
        </aside>
      </main>

      {busy && <div className="overlay">{busy}</div>}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
