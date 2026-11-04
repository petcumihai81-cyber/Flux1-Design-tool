import { useMemo, useState } from 'react'
import type { Cable, Device, PageFormat, Project, SystemId, TitleBlock, Tool } from './types'
import { SYMBOLS, SYSTEMS, symbolByType, symbolDataUrl, systemById } from './symbols'
import { cableMeters, deviceSystem, polylineLength } from './project'
import { FALLBACK_PX_PER_M } from './PlanCanvas'

// ------------------------------------------------------------------ Paleta de simboluri

export function Palette({ tool, onPick }: { tool: Tool; onPick: (type: string) => void }) {
  const [open, setOpen] = useState<Record<string, boolean>>({ EFR: true, CA: true, CCTV: true, INC: true })
  const [q, setQ] = useState('')
  const query = q.trim().toLowerCase()
  return (
    <aside className="palette">
      <input className="search" placeholder="Caută simbol…" value={q} onChange={(e) => setQ(e.target.value)} />
      {SYSTEMS.map((sys) => {
        const items = SYMBOLS.filter(
          (s) => s.system === sys.id && (!query || s.name.toLowerCase().includes(query) || s.prefix.toLowerCase().includes(query)),
        )
        if (!items.length) return null
        const isOpen = open[sys.id] || !!query
        return (
          <section key={sys.id}>
            <button className="pal-head" style={{ borderColor: sys.color }} onClick={() => setOpen((o) => ({ ...o, [sys.id]: !o[sys.id] }))}>
              <span className="dot" style={{ background: sys.color }} />
              {sys.name}
              <span className="chev">{isOpen ? '▾' : '▸'}</span>
            </button>
            {isOpen && (
              <div className="pal-grid">
                {items.map((s) => (
                  <button
                    key={s.type}
                    className={'pal-item' + (tool.kind === 'place' && tool.type === s.type ? ' active' : '')}
                    title={`${s.name} (${s.prefix})\nClick pentru plasare sau trage pe plan`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/symbol-type', s.type)
                      e.dataTransfer.effectAllowed = 'copy'
                    }}
                    onClick={() => onPick(s.type)}
                  >
                    <img src={symbolDataUrl(s)} alt="" />
                    <span className="pal-prefix" style={{ color: sys.color }}>
                      {s.prefix}
                    </span>
                    <span className="pal-name">{s.name}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        )
      })}
    </aside>
  )
}

// ------------------------------------------------------------------ Câmpuri

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  )
}

function Num({ value, onChange, min, max, step = 1 }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <input
      type="number"
      value={Number.isFinite(value) ? value : ''}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        const v = parseFloat(e.target.value)
        if (!Number.isNaN(v)) onChange(v)
      }}
    />
  )
}

// ------------------------------------------------------------------ Proprietăți element

export function DeviceProps({ d, project, onChange, onDelete }: { d: Device; project: Project; onChange: (patch: Partial<Device>) => void; onDelete: () => void }) {
  const def = symbolByType(d.type)!
  const sys = systemById(def.system)
  return (
    <div className="props">
      <div className="props-title">
        <img src={symbolDataUrl(def)} alt="" />
        <div>
          <b>{def.name}</b>
          <small style={{ color: sys.color }}>{sys.name}</small>
        </div>
      </div>
      <Field label="Simbol / cod">
        <input value={d.label} onChange={(e) => onChange({ label: e.target.value })} />
      </Field>
      <Field label="Model echipament">
        <input value={d.model} placeholder="ex. DS-2CD2143G2-I" onChange={(e) => onChange({ model: e.target.value })} />
      </Field>
      <Field label="Zona protejată / încăpere">
        <input value={d.zone} placeholder="ex. Hol acces" onChange={(e) => onChange({ zone: e.target.value })} />
      </Field>
      {(def.system === 'EFR' || def.system === 'INC') && (
        <Field label={def.system === 'INC' ? 'Buclă / zonă' : 'Partiție'}>
          <input value={d.partition} onChange={(e) => onChange({ partition: e.target.value })} />
        </Field>
      )}
      <Field label="Rotire (°)">
        <Num value={d.rotation} min={0} max={359} step={5} onChange={(v) => onChange({ rotation: ((v % 360) + 360) % 360 })} />
      </Field>
      {def.camera && (
        <>
          <Field label="Unghi vizualizare (°)">
            <Num value={d.fov ?? def.camera.fov} min={5} max={360} onChange={(v) => onChange({ fov: Math.min(360, Math.max(5, v)) })} />
          </Field>
          <Field label="Distanță vizualizare (m)">
            <Num value={d.range ?? def.camera.range} min={1} max={500} onChange={(v) => onChange({ range: Math.max(1, v) })} />
          </Field>
          {!project.pxPerMeter && (
            <p className="warn">Scara nu e calibrată: conul folosește o scară provizorie ({FALLBACK_PX_PER_M} px/m).</p>
          )}
        </>
      )}
      <Field label="Observații">
        <textarea rows={2} value={d.notes} onChange={(e) => onChange({ notes: e.target.value })} />
      </Field>
      <button className="danger" onClick={onDelete}>
        Șterge echipamentul (Del)
      </button>
    </div>
  )
}

export function CableProps({ c, project, onChange, onDelete }: { c: Cable; project: Project; onChange: (patch: Partial<Cable>) => void; onDelete: () => void }) {
  const sys = systemById(c.system)
  const byId = new Map(project.devices.map((d) => [d.id, d]))
  const meters = cableMeters(c, project)
  const raw = project.pxPerMeter ? polylineLength(c.points) / project.pxPerMeter : null
  return (
    <div className="props">
      <div className="props-title">
        <span className="cable-swatch" style={{ background: sys.color }} />
        <div>
          <b>Cablu {c.code}</b>
          <small style={{ color: sys.color }}>{sys.name}</small>
        </div>
      </div>
      <Field label="Cod cablu">
        <input value={c.code} onChange={(e) => onChange({ code: e.target.value })} />
      </Field>
      <div className="row2">
        <Field label="De la">
          <input value={(c.from && byId.get(c.from)?.label) || '—'} readOnly />
        </Field>
        <Field label="La">
          <input value={(c.to && byId.get(c.to)?.label) || '—'} readOnly />
        </Field>
      </div>
      <Field label="Subsistem">
        <select value={c.system} onChange={(e) => onChange({ system: e.target.value as SystemId })}>
          {SYSTEMS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Tip cablu">
        <input value={c.cableType} onChange={(e) => onChange({ cableType: e.target.value })} />
      </Field>
      <Field label="Lungime [m]">
        <div className="inline">
          <input
            type="number"
            min={0}
            placeholder={meters != null ? String(meters) : 'scară necalibrată'}
            value={c.lengthOverride ?? ''}
            onChange={(e) => {
              const v = parseFloat(e.target.value)
              onChange({ lengthOverride: Number.isNaN(v) ? null : v })
            }}
          />
        </div>
      </Field>
      <p className="hint">
        {raw != null
          ? `Măsurat pe plan: ${raw.toFixed(1)} m + ${project.cableReservePct}% rezervă = ${Math.ceil(raw * (1 + project.cableReservePct / 100))} m. Completează doar pentru a suprascrie.`
          : 'Calibrează scara pentru calcul automat al lungimii.'}
      </p>
      <Field label="Traseu / observații">
        <textarea rows={2} value={c.notes} placeholder="ex. Tavan fals, tub flexibil Ø20" onChange={(e) => onChange({ notes: e.target.value })} />
      </Field>
      <p className="hint">Trage de punctele albe pentru a modifica traseul; dublu-click pe un punct intermediar îl șterge.</p>
      <button className="danger" onClick={onDelete}>
        Șterge cablul (Del)
      </button>
    </div>
  )
}

// ------------------------------------------------------------------ Proiect / cartuș

const TITLE_FIELDS: [keyof TitleBlock, string][] = [
  ['proiectant', 'Proiectant'],
  ['beneficiar', 'Beneficiar'],
  ['obiectiv', 'Obiectiv / adresă'],
  ['nrProiect', 'Nr. proiect'],
  ['titluPlansa', 'Titlu planșă'],
  ['nrPlansa', 'Nr. planșă'],
  ['scara', 'Scara (text cartuș)'],
  ['data', 'Data'],
  ['intocmit', 'Întocmit'],
  ['verificat', 'Verificat'],
]

export function ProjectPanel({
  project,
  onChange,
  onCalibrate,
}: {
  project: Project
  onChange: (patch: Partial<Project>) => void
  onCalibrate: () => void
}) {
  const hidden = new Set(project.hidden)
  return (
    <div className="props">
      <h4>Cartuș</h4>
      {TITLE_FIELDS.map(([key, label]) => (
        <Field key={key} label={label}>
          <input value={project.title[key]} onChange={(e) => onChange({ title: { ...project.title, [key]: e.target.value } })} />
        </Field>
      ))}

      <h4>Planșă</h4>
      <Field label="Format pagină PDF">
        <select value={project.pageFormat} onChange={(e) => onChange({ pageFormat: e.target.value as PageFormat })}>
          <option value="A4">A4 orizontal</option>
          <option value="A3">A3 orizontal</option>
          <option value="A2">A2 orizontal</option>
        </select>
      </Field>
      <Field label={`Mărime simboluri (${project.symbolSize})`}>
        <input
          type="range"
          min={8}
          max={Math.max(120, project.symbolSize)}
          value={project.symbolSize}
          onChange={(e) => onChange({ symbolSize: parseInt(e.target.value, 10) })}
        />
      </Field>
      <Field label="Scară plan">
        <div className="inline">
          <span className={project.pxPerMeter ? 'ok' : 'warn'}>
            {project.pxPerMeter ? `${project.pxPerMeter.toFixed(2)} px/m` : 'necalibrată'}
          </span>
          <button onClick={onCalibrate}>Calibrează</button>
        </div>
      </Field>
      <Field label="Rezervă cablu (%)">
        <Num value={project.cableReservePct} min={0} max={100} onChange={(v) => onChange({ cableReservePct: Math.max(0, v) })} />
      </Field>

      <label className="check">
        <input type="checkbox" checked={project.showCones} onChange={(e) => onChange({ showCones: e.target.checked })} />
        Afișează conurile de vizualizare ale camerelor
      </label>

      <h4>Subsisteme afișate</h4>
      <p className="hint">Ascunde subsistemele pe care nu le vrei pe planșă — exportul PDF și Excel include doar ce e afișat.</p>
      {SYSTEMS.map((s) => (
        <label key={s.id} className="check">
          <input
            type="checkbox"
            checked={!hidden.has(s.id)}
            onChange={(e) =>
              onChange({ hidden: e.target.checked ? project.hidden.filter((h) => h !== s.id) : [...project.hidden, s.id] })
            }
          />
          <span className="dot" style={{ background: s.color }} />
          {s.name}
        </label>
      ))}
    </div>
  )
}

// ------------------------------------------------------------------ Liste (sumar)

export function ListsPanel({ project, onSelectDevice }: { project: Project; onSelectDevice: (id: string) => void }) {
  const data = useMemo(() => {
    return SYSTEMS.map((sys) => {
      const devices = project.devices
        .filter((d) => deviceSystem(d) === sys.id)
        .sort((a, b) => a.label.localeCompare(b.label, 'ro', { numeric: true }))
      const counts = new Map<string, number>()
      for (const d of devices) counts.set(d.type, (counts.get(d.type) ?? 0) + 1)
      const cables = project.cables.filter((c) => c.system === sys.id)
      let total = 0
      let unknown = false
      for (const c of cables) {
        const m = cableMeters(c, project)
        if (m == null) unknown = true
        else total += m
      }
      return { sys, devices, counts, cables, total, unknown }
    })
  }, [project])

  return (
    <div className="props lists">
      {data.map(({ sys, devices, counts, cables, total, unknown }) =>
        devices.length || cables.length ? (
          <section key={sys.id}>
            <h4 style={{ color: sys.color }}>{sys.name}</h4>
            <table>
              <tbody>
                {[...counts].map(([type, n]) => (
                  <tr key={type}>
                    <td>{symbolByType(type)?.prefix}</td>
                    <td>{symbolByType(type)?.name}</td>
                    <td className="num">{n}</td>
                  </tr>
                ))}
                {cables.length > 0 && (
                  <tr className="total">
                    <td>—</td>
                    <td>Cabluri ({cables.length})</td>
                    <td className="num">{unknown ? '?' : `${total} m`}</td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="chips">
              {devices.map((d) => (
                <button key={d.id} className="chip" style={{ borderColor: sys.color }} onClick={() => onSelectDevice(d.id)}>
                  {d.label}
                </button>
              ))}
            </div>
          </section>
        ) : null,
      )}
      {!project.devices.length && <p className="hint">Nu există încă echipamente pe planșă.</p>}
    </div>
  )
}
