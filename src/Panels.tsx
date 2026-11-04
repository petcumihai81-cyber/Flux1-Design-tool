import { useMemo, useState } from 'react'
import type { ArchElement, ArchTool, Cable, CatalogItem, Device, Level, Orientation, PageFormat, Project, Sheet, SystemId, TitleBlock, Tool } from './types'
import { ARCH_NAMES, ARCH_TOOLS, archIconUrl, fmtM } from './arch'
import { SYMBOLS, SYSTEMS, canMirror, symbolByType, symbolDataUrl, systemById } from './symbols'
import { cableMeters, cablePixels, catalogItem, deviceSystem, levelOf } from './project'
import { FALLBACK_PX_PER_M } from './PlanCanvas'

// ------------------------------------------------------------------ Paleta de simboluri

export function Palette({
  tool,
  catalog,
  onPick,
  onPickArch,
}: {
  tool: Tool
  catalog: CatalogItem[]
  onPick: (type: string, catalogId?: string) => void
  onPickArch: (t: ArchTool) => void
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({ ARH: false, CAT: true, EFR: true, CA: true, CCTV: true, INC: true, NET: true })
  const [q, setQ] = useState('')
  const query = q.trim().toLowerCase()
  return (
    <aside className="palette">
      <input className="search" placeholder="Caută simbol sau model…" value={q} onChange={(e) => setQ(e.target.value)} />
      {(() => {
        const items = ARCH_TOOLS.filter((t) => !query || t.name.toLowerCase().includes(query))
        if (!items.length) return null
        const isOpen = open.ARH || !!query || tool.kind === 'arch'
        return (
          <section>
            <button className="pal-head" style={{ borderColor: '#222' }} onClick={() => setOpen((o) => ({ ...o, ARH: !o.ARH }))}>
              <span className="dot" style={{ background: '#222' }} />
              Arhitectură (schiță)
              <span className="chev">{isOpen ? '▾' : '▸'}</span>
            </button>
            {isOpen && (
              <div className="pal-grid">
                {items.map((t) => (
                  <button
                    key={t.tool}
                    className={'pal-item' + (tool.kind === 'arch' && tool.arch === t.tool ? ' active' : '')}
                    title={t.name}
                    onClick={() => onPickArch(t.tool)}
                  >
                    <img src={archIconUrl(t.tool)} alt="" />
                    <span className="pal-prefix" style={{ color: '#222' }}>
                      {t.name}
                    </span>
                    <span className="pal-name">{t.hint}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        )
      })()}
      {(() => {
        const items = catalog.filter(
          (c) => symbolByType(c.type) && (!query || `${c.model} ${c.denumire} ${c.producator} ${c.prefix}`.toLowerCase().includes(query)),
        )
        if (!items.length) return null
        const isOpen = open.CAT || !!query
        return (
          <section>
            <button className="pal-head" style={{ borderColor: '#455a64' }} onClick={() => setOpen((o) => ({ ...o, CAT: !o.CAT }))}>
              <span className="dot" style={{ background: '#455a64' }} />
              Din catalog ({items.length})
              <span className="chev">{isOpen ? '▾' : '▸'}</span>
            </button>
            {isOpen && (
              <div className="pal-grid">
                {items.map((c) => {
                  const def = symbolByType(c.type)!
                  return (
                    <button
                      key={c.id}
                      className={'pal-item' + (tool.kind === 'place' && tool.catalogId === c.id ? ' active' : '')}
                      title={`${c.denumire}\n${c.producator} ${c.model}`}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/symbol-type', c.type)
                        e.dataTransfer.setData('text/catalog-id', c.id)
                      }}
                      onClick={() => onPick(c.type, c.id)}
                    >
                      <img src={symbolDataUrl(def)} alt="" />
                      <span className="pal-prefix" style={{ color: systemById(def.system).color }}>
                        {c.prefix || def.prefix}
                      </span>
                      <span className="pal-name">{c.model || c.denumire}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </section>
        )
      })()}
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
                    className={'pal-item' + (tool.kind === 'place' && tool.type === s.type && !tool.catalogId ? ' active' : '')}
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
      <Field label="Echipament din catalog">
        <select value={d.catalogId ?? ''} onChange={(e) => onChange({ catalogId: e.target.value || undefined })}>
          <option value="">— fără model din catalog —</option>
          {project.catalog
            .filter((c) => c.type === d.type)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.producator} {c.model}
              </option>
            ))}
        </select>
      </Field>
      {catalogItem(project, d.catalogId) ? (
        <p className="hint">{catalogItem(project, d.catalogId)!.denumire}</p>
      ) : (
        <Field label="Model (text liber)">
          <input value={d.model} placeholder="sau alege din catalog" onChange={(e) => onChange({ model: e.target.value })} />
        </Field>
      )}
      <Field label="Zona protejată / încăpere">
        <input value={d.zone} placeholder="ex. Hol acces" onChange={(e) => onChange({ zone: e.target.value })} />
      </Field>
      {(def.system === 'EFR' || def.system === 'INC') && (
        <>
          <div className="row2">
            <Field label="Modul">
              <input value={d.module ?? ''} placeholder={def.system === 'INC' ? 'CDI' : 'CAE'} onChange={(e) => onChange({ module: e.target.value })} />
            </Field>
            <Field label={def.system === 'INC' ? 'Buclă' : 'Zona modul'}>
              <input value={d.zoneNr ?? ''} onChange={(e) => onChange({ zoneNr: e.target.value })} />
            </Field>
          </div>
          <div className="row2">
            <Field label={def.system === 'INC' ? 'Zonă' : 'Partiție'}>
              <input value={d.partition} onChange={(e) => onChange({ partition: e.target.value })} />
            </Field>
            <Field label="Tip detecție / zonă">
              <input
                list="zone-types"
                value={d.zoneType ?? ''}
                placeholder={def.detection ?? ''}
                onChange={(e) => onChange({ zoneType: e.target.value })}
              />
              <datalist id="zone-types">
                <option value="întârziere" />
                <option value="instantanee" />
                <option value="24h" />
                <option value="urmărire" />
                <option value="foc" />
              </datalist>
            </Field>
          </div>
        </>
      )}
      <Field label="Rotire (°)">
        <Num value={d.rotation} min={0} max={359} step={5} onChange={(v) => onChange({ rotation: ((v % 360) + 360) % 360 })} />
      </Field>
      {canMirror(d.type) && (
        <div className="inline">
          <button className={d.flipX ? 'on' : ''} onClick={() => onChange({ flipX: !d.flipX })} title="Oglindește orizontal">
            ⇋ Oglindă orizontală
          </button>
          <button className={d.flipY ? 'on' : ''} onClick={() => onChange({ flipY: !d.flipY })} title="Oglindește vertical">
            ⇵ Verticală
          </button>
        </div>
      )}
      {def.camera && (
        <>
          <Field label="Unghi vizualizare (°)">
            <Num value={d.fov ?? def.camera.fov} min={5} max={360} onChange={(v) => onChange({ fov: Math.min(360, Math.max(5, v)) })} />
          </Field>
          <Field label="Distanță vizualizare (m)">
            <Num value={d.range ?? def.camera.range} min={1} max={500} onChange={(v) => onChange({ range: Math.max(1, v) })} />
          </Field>
          {!levelOf(project, d.levelId).pxPerMeter && (
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

// ------------------------------------------------------------------ Proprietăți element de arhitectură

export function ArchProps({ a, project, onChange, onDelete }: { a: ArchElement; project: Project; onChange: (patch: Partial<ArchElement>) => void; onDelete: () => void }) {
  const ppm = levelOf(project, a.levelId).pxPerMeter ?? 50
  const len = a.points ? polyLen(a.points) / ppm : 0
  return (
    <div className="props">
      <div className="props-title">
        <div>
          <b>{ARCH_NAMES[a.kind]}</b>
          <small style={{ color: 'var(--muted)' }}>Arhitectură (schiță)</small>
        </div>
      </div>
      {a.kind === 'wall' && (
        <>
          <Field label="Grosime perete (m)">
            <div className="inline">
              <Num value={a.thickness ?? 0.25} min={0.05} max={1} step={0.01} onChange={(v) => onChange({ thickness: Math.max(0.03, v) })} />
              <button onClick={() => onChange({ thickness: 0.25 })}>25 cm</button>
              <button onClick={() => onChange({ thickness: 0.12 })}>12 cm</button>
            </div>
          </Field>
          <p className="hint">Lungime: {fmtM(len)}. Trage de vârfuri pentru a modifica peretele (Shift = fără aliniere).</p>
        </>
      )}
      {(a.kind === 'door' || a.kind === 'window') && (
        <>
          <Field label="Lățime gol (m)">
            <Num value={a.width ?? (a.kind === 'door' ? 0.9 : 1.2)} min={0.3} max={6} step={0.05} onChange={(v) => onChange({ width: Math.max(0.2, v) })} />
          </Field>
          <Field label="Rotire (°)">
            <Num value={Math.round(a.rotation ?? 0)} min={0} max={359} step={5} onChange={(v) => onChange({ rotation: ((v % 360) + 360) % 360 })} />
          </Field>
          {a.kind === 'door' && (
            <div className="inline">
              <button onClick={() => onChange({ flipY: !a.flipY })}>Întoarce sensul</button>
              <button onClick={() => onChange({ flipX: !a.flipX })}>Schimbă balamaua</button>
            </div>
          )}
          <p className="hint">Trage {a.kind === 'door' ? 'ușa' : 'fereastra'} pe alt perete: se aliniază singură.</p>
        </>
      )}
      {a.kind === 'label' && (
        <>
          <Field label="Text">
            <input value={a.text ?? ''} onChange={(e) => onChange({ text: e.target.value })} />
          </Field>
          <p className="hint">Pe plan: dublu-click pe text = editare, pătratul albastru din colț = mărime. Click dreapta = A+ / A−.</p>
          <Field label="Înălțime litere (m)">
            <Num value={a.size ?? 0.45} min={0.1} max={3} step={0.05} onChange={(v) => onChange({ size: Math.max(0.1, v) })} />
          </Field>
          <Field label="Rotire (°)">
            <Num value={Math.round(a.rotation ?? 0)} min={0} max={359} step={5} onChange={(v) => onChange({ rotation: ((v % 360) + 360) % 360 })} />
          </Field>
        </>
      )}
      {a.kind === 'dim' && <p className="hint">Lungime: {fmtM(len)}. Trage de capete pentru a o modifica.</p>}
      <button className="danger" onClick={onDelete}>
        Șterge (Del)
      </button>
    </div>
  )
}

const polyLen = (pts: number[]) => {
  let l = 0
  for (let i = 2; i < pts.length; i += 2) l += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1])
  return l
}

/** Leagă un capăt de cablu de alt echipament (mută și punctul de capăt pe echipament) */
function endPatch(c: Cable, p: Project, end: 'from' | 'to', id?: string): Partial<Cable> {
  const pts = [...c.points]
  const d = p.devices.find((x) => x.id === id)
  if (d) {
    const i = end === 'from' ? 0 : pts.length - 2
    pts[i] = d.x
    pts[i + 1] = d.y
  }
  return end === 'from' ? { from: id, points: pts } : { to: id, points: pts, via: undefined }
}

export function CableProps({ c, project, onChange, onDelete }: { c: Cable; project: Project; onChange: (patch: Partial<Cable>) => void; onDelete: () => void }) {
  const sys = systemById(c.system)
  const byId = new Map(project.devices.map((d) => [d.id, d]))
  const meters = cableMeters(c, project)
  const cppm = levelOf(project, c.levelId).pxPerMeter
  const raw = cppm ? cablePixels(c, project) / cppm : null
  const via = c.via ? project.cables.find((x) => x.id === c.via!.cableId) : undefined
  const devOptions = [...project.devices]
    .sort((a, b) => Number(deviceSystem(b) === c.system) - Number(deviceSystem(a) === c.system) || a.label.localeCompare(b.label, 'ro', { numeric: true }))
    .map((d) => (
      <option key={d.id} value={d.id}>
        {d.label} – {symbolByType(d.type)?.name}
      </option>
    ))
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
          <select value={c.from ?? ''} onChange={(e) => onChange(endPatch(c, project, 'from', e.target.value || undefined))}>
            <option value="">— liber —</option>
            {devOptions}
          </select>
        </Field>
        <Field label="La">
          <select value={c.to ?? ''} onChange={(e) => onChange(endPatch(c, project, 'to', e.target.value || undefined))}>
            <option value="">— liber —</option>
            {devOptions}
          </select>
        </Field>
      </div>
      {via && (
        <p className="hint">
          Ramificație pe cablul <b>{via.code}</b>: merge pe același traseu până la {(c.to && byId.get(c.to)?.label) || 'capătul lui'}; lungimea include porțiunea
          comună.{' '}
          <button className="link" onClick={() => onChange({ via: undefined })}>
            Anulează ramificația
          </button>
        </p>
      )}
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
      <p className="hint">Trage de puncte pentru a modifica traseul; trage un capăt pe un echipament ca să-l legi (sau pe alt cablu, pentru ramificație). Dublu-click pe cablu adaugă un punct; dublu-click pe un punct intermediar îl șterge.</p>
      <button className="danger" onClick={onDelete}>
        Șterge cablul (Del)
      </button>
    </div>
  )
}

// ------------------------------------------------------------------ Proiect / planșă

const TITLE_FIELDS: [keyof TitleBlock, string][] = [
  ['proiectant', 'Proiectant'],
  ['beneficiar', 'Beneficiar'],
  ['obiectiv', 'Obiectiv / adresă'],
  ['nrProiect', 'Nr. proiect'],
  ['data', 'Data'],
  ['intocmit', 'Întocmit'],
  ['verificat', 'Verificat'],
]

export function SheetPanel({ sheet, levels, onChange }: { sheet: Sheet; levels: Level[]; onChange: (patch: Partial<Sheet>) => void }) {
  const toggle = (id: SystemId, on: boolean) =>
    onChange({ systems: on ? SYSTEMS.map((s) => s.id).filter((s) => s === id || sheet.systems.includes(s)) : sheet.systems.filter((s) => s !== id) })
  return (
    <div className="props">
      <h4>Planșa curentă {sheet.kind === 'bloc' ? '(schemă bloc)' : '(plan)'}</h4>
      <Field label="Titlu planșă">
        <input value={sheet.titlu} onChange={(e) => onChange({ titlu: e.target.value })} />
      </Field>
      {sheet.kind === 'plan' && levels.length > 1 && (
        <Field label="Nivel afișat">
          <select value={sheet.levelId} onChange={(e) => onChange({ levelId: e.target.value })}>
            {levels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <div className="row2">
        <Field label="Nr. planșă">
          <input value={sheet.nr} onChange={(e) => onChange({ nr: e.target.value })} />
        </Field>
        {sheet.kind === 'plan' && (
          <Field label="Scara (cartuș)">
            <input value={sheet.scara} onChange={(e) => onChange({ scara: e.target.value })} />
          </Field>
        )}
      </div>
      <div className="row2">
        <Field label="Format">
          <select value={sheet.format} onChange={(e) => onChange({ format: e.target.value as PageFormat })}>
            {(['A0', 'A1', 'A2', 'A3', 'A4'] as const).map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
            <option value="CUSTOM">Personalizat</option>
          </select>
        </Field>
        {sheet.format !== 'CUSTOM' ? (
          <Field label="Orientare">
            <select value={sheet.orientation} onChange={(e) => onChange({ orientation: e.target.value as Orientation })}>
              <option value="landscape">Peisaj</option>
              <option value="portrait">Portret</option>
            </select>
          </Field>
        ) : (
          <div />
        )}
      </div>
      {sheet.format === 'CUSTOM' && (
        <div className="row2">
          <Field label="Lățime (mm)">
            <Num value={sheet.customW} min={50} max={5000} onChange={(v) => onChange({ customW: v })} />
          </Field>
          <Field label="Înălțime (mm)">
            <Num value={sheet.customH} min={50} max={5000} onChange={(v) => onChange({ customH: v })} />
          </Field>
        </div>
      )}
      {sheet.kind === 'plan' ? (
        <>
          <span className="field-label">Sisteme afișate pe planșă</span>
          {SYSTEMS.map((s) => (
            <label key={s.id} className="check">
              <input type="checkbox" checked={sheet.systems.includes(s.id)} onChange={(e) => toggle(s.id, e.target.checked)} />
              <span className="dot" style={{ background: s.color }} />
              {s.name}
            </label>
          ))}
          <label className="check">
            <input type="checkbox" checked={sheet.showCones} onChange={(e) => onChange({ showCones: e.target.checked })} />
            Conuri de vizualizare camere
          </label>
        </>
      ) : (
        <Field label="Sistem">
          <select value={sheet.systems[0]} onChange={(e) => onChange({ systems: [e.target.value as SystemId] })}>
            {SYSTEMS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
      )}
    </div>
  )
}

/** Nivelul planșei curente: nume, plan de fundal, scară, mărimea simbolurilor */
export function LevelPanel({
  level,
  paperMmPerPx,
  suggested,
  canDelete,
  onChange,
  onFitSymbols,
  onLoadPlan,
  onCalibrate,
  onDelete,
}: {
  level: Level
  /** mm pe hârtie per pixel de plan, pentru planșa curentă */
  paperMmPerPx: number | null
  /** Mărimea propusă pentru simboluri (~6 mm pe planșă) */
  suggested: number | null
  canDelete: boolean
  onChange: (patch: Partial<Level>) => void
  onFitSymbols: (size: number) => void
  onLoadPlan: () => void
  onCalibrate: () => void
  onDelete: () => void
}) {
  const paperMm = paperMmPerPx ? level.symbolSize * paperMmPerPx : null
  return (
    <div className="props">
      <h4>Nivel (plan)</h4>
      <Field label="Nume nivel">
        <input value={level.name} placeholder="ex. Parter, Etaj 1" onChange={(e) => onChange({ name: e.target.value })} />
      </Field>
      <Field label="Plan de fundal">
        <div className="inline">
          <span className="hint">{level.background ? level.background.name : 'pagină albă (schiță)'}</span>
          <button onClick={onLoadPlan}>{level.background ? 'Înlocuiește' : 'Încarcă'}</button>
        </div>
      </Field>
      {level.background && (
        <button onClick={() => window.confirm('Scoți planul de fundal? Echipamentele și schița rămân.') && onChange({ background: null })}>
          Scoate fundalul (pagină albă)
        </button>
      )}
      <Field label="Scară">
        <div className="inline">
          <span className={level.pxPerMeter ? 'ok' : 'warn'}>{level.pxPerMeter ? `${level.pxPerMeter.toFixed(2)} px/m` : 'necalibrată'}</span>
          <button onClick={onCalibrate}>Calibrează</button>
        </div>
      </Field>
      <Field
        label={`Mărime simboluri: ${level.symbolSize} px${level.pxPerMeter ? ` ≈ ${(level.symbolSize / level.pxPerMeter).toFixed(2).replace('.', ',')} m` : ''}${paperMm ? ` · ${paperMm.toFixed(1).replace('.', ',')} mm pe planșă` : ''}`}
      >
        <input
          type="range"
          min={6}
          max={Math.max(120, level.symbolSize * 2, suggested ? suggested * 2 : 0)}
          value={level.symbolSize}
          onChange={(e) => onChange({ symbolSize: parseInt(e.target.value, 10) })}
        />
      </Field>
      {paperMm != null && (paperMm > 11 || paperMm < 3.5) && (
        <p className="warn">
          Simbolurile ies de ~{paperMm.toFixed(0)} mm pe planșă (uzual ~6 mm): {paperMm > 11 ? 'sunt prea mari, iar ușile, ferestrele și textele par mici lângă ele' : 'sunt prea mici pentru tipărire'}.
        </p>
      )}
      {suggested != null && (
        <button onClick={() => onFitSymbols(suggested)} title="Simbolurile ies ~6 mm pe planșa tipărită, în formatul planșei curente; textele prea mici se măresc odată cu ele">
          Potrivește simbolurile la planșă (~6 mm)
        </button>
      )}
      {canDelete && (
        <button className="danger" onClick={onDelete}>
          Șterge nivelul
        </button>
      )}
    </div>
  )
}

export function ProjectPanel({ project, onChange }: { project: Project; onChange: (patch: Partial<Project>) => void }) {
  return (
    <div className="props">
      <h4>Date proiect (cartuș)</h4>
      {TITLE_FIELDS.map(([key, label]) => (
        <Field key={key} label={label}>
          <input value={project.title[key]} onChange={(e) => onChange({ title: { ...project.title, [key]: e.target.value } })} />
        </Field>
      ))}

      <h4>Numerotare și cabluri</h4>
      <label className="check">
        <input type="checkbox" checked={project.numberPad} onChange={(e) => onChange({ numberPad: e.target.checked })} />
        Numerotare cu două cifre (PIR01 în loc de PIR1)
      </label>
      <Field label="Rezervă cablu (%)">
        <Num value={project.cableReservePct} min={0} max={100} onChange={(v) => onChange({ cableReservePct: Math.max(0, v) })} />
      </Field>
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
