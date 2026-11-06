import { useMemo, useState } from 'react'
import type { ArchElement, ArchTool, Cable, CatalogItem, CustomSymbol, Device, SheetTable, Level, Orientation, PageFormat, Project, Sheet, SystemId, TitleBlock, Tool, HatchKind } from './types'
import { ANNOT_TOOLS, ARCH_NAMES, ARCH_TOOLS, archIconUrl, devicesInZone, fmtM, zoneArea } from './arch'
import { alignGroup, distributeGroup } from './group'
import type { Item } from './group'
import { SYMBOLS, SYSTEMS, canMirror, symbolByType, symbolDataUrl, systemById } from './symbols'
import { cableEnds, cableMeters, cablePixels, catalogItem, deviceSystem, isRiserRoute, levelOf, riserHost, verticalMeters } from './project'
import { FALLBACK_PX_PER_M } from './PlanCanvas'
import { defaultLogo, prepareImage, saveDefaultLogo } from './images'
import { TABLE_KINDS } from './sheetTables'
import { SYMBOL_COLORS, deviceColor, deviceSymbol, symbolThumb } from './symbolLibrary'
import { ANNOT_LAYERS, ARCH_LAYERS, archLayer, layerLocked, layerVisible, systemLayers, toggleLayerLocked, toggleLayerVisible } from './layers'
import { askConfirm } from './dialogs'
import { HATCHES, HATCH_MM_DEFAULT } from './hatch'

// ------------------------------------------------------------------ Paleta de simboluri

export function Palette({
  tool,
  catalog,
  customSymbols,
  onPick,
  onPickArch,
  onUploadSymbol,
  onEditSymbol,
  onExportSymbols,
  onImportSymbols,
}: {
  tool: Tool
  catalog: CatalogItem[]
  customSymbols: CustomSymbol[]
  onPick: (type: string, catalogId?: string, symbolId?: string) => void
  onPickArch: (t: ArchTool) => void
  onUploadSymbol: () => void
  onEditSymbol: (id: string) => void
  onExportSymbols: () => void
  onImportSymbols: () => void
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({ ARH: false, ADN: false, CAT: true, CUSTOM: true, EFR: true, CA: true, CCTV: true, INC: true, NET: true })
  const [q, setQ] = useState('')
  const query = q.trim().toLowerCase()
  return (
    <aside className="palette">
      <input className="search" placeholder="Caută simbol sau model…" value={q} onChange={(e) => setQ(e.target.value)} />
      {(
        [
          { id: 'ARH', title: 'Arhitectură (schiță)', color: '#222', tools: ARCH_TOOLS },
          { id: 'ADN', title: 'Zone, imagini, tabele', color: '#8d6e63', tools: ANNOT_TOOLS },
        ] as const
      ).map((grp) => {
        const items = grp.tools.filter((t) => !query || t.name.toLowerCase().includes(query))
        if (!items.length) return null
        const isOpen = open[grp.id] || !!query || (tool.kind === 'arch' && grp.tools.some((t) => t.tool === tool.arch))
        return (
          <section key={grp.id}>
            <button className="pal-head" style={{ borderColor: grp.color }} onClick={() => setOpen((o) => ({ ...o, [grp.id]: !o[grp.id] }))}>
              <span className="dot" style={{ background: grp.color }} />
              {grp.title}
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
      })}
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
                  const csym = c.symbolId ? customSymbols.find((x) => x.id === c.symbolId) : undefined
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
                      <img src={csym ? symbolThumb(csym, csym.recolor ? systemById(def.system).color : undefined) : symbolDataUrl(def)} alt="" />
                      <span className="pal-prefix" style={{ color: systemById(def.system).color }}>
                        {c.prefix || csym?.prefix || def.prefix}
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
      {(() => {
        const items = customSymbols.filter((c) => !query || `${c.name} ${c.prefix}`.toLowerCase().includes(query))
        if (query && !items.length) return null
        const isOpen = open.CUSTOM || !!query
        return (
          <section>
            <button className="pal-head" style={{ borderColor: '#8d6e63' }} onClick={() => setOpen((o) => ({ ...o, CUSTOM: !o.CUSTOM }))}>
              <span className="dot" style={{ background: '#8d6e63' }} />
              Simboluri personalizate ({customSymbols.length})
              <span className="chev">{isOpen ? '▾' : '▸'}</span>
            </button>
            {isOpen && (
              <div className="pal-grid">
                {items.map((c) => {
                  const def = symbolByType(c.base)!
                  const col = systemById(def.system).color
                  return (
                    <div key={c.id} className="pal-custom">
                      <button
                        className={'pal-item' + (tool.kind === 'place' && tool.symbolId === c.id ? ' active' : '')}
                        title={`${c.name}\nSe comportă ca: ${def.name}\nClick pentru plasare sau trage pe plan`}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/symbol-type', c.base)
                          e.dataTransfer.setData('text/symbol-id', c.id)
                          e.dataTransfer.effectAllowed = 'copy'
                        }}
                        onClick={() => onPick(c.base, undefined, c.id)}
                      >
                        <img src={symbolThumb(c, c.recolor ? col : undefined)} alt="" />
                        <span className="pal-prefix" style={{ color: col }}>
                          {c.prefix || def.prefix}
                        </span>
                        <span className="pal-name">{c.name}</span>
                      </button>
                      <button className="pal-edit" title="Editează / șterge simbolul" onClick={() => onEditSymbol(c.id)}>
                        ✎
                      </button>
                    </div>
                  )
                })}
                <button className="pal-item pal-upload" onClick={onUploadSymbol} title="Încarcă un simbol propriu (SVG, PNG, ICO, JPG, WebP)">
                  <span className="plus">+</span>
                  <span className="pal-name">Încarcă simbol</span>
                </button>
                <div className="pal-lib">
                  <button onClick={onExportSymbols} title="Salvează simbolurile (din proiect și din biblioteca browserului) într-un fișier .simboluri.json, pentru alt calculator">
                    Exportă
                  </button>
                  <button onClick={onImportSymbols} title="Adaugă simboluri dintr-un fișier .simboluri.json, dintr-un proiect, șablon sau pachet .zip">
                    Importă…
                  </button>
                </div>
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

/** Alegerea culorii unui simbol: culori propuse, culoare liberă și revenire la culoarea sistemului */
export function ColorRow({
  value,
  defaultColor,
  onChange,
  showReset,
}: {
  value?: string
  defaultColor: string
  onChange: (c: string | undefined) => void
  showReset?: boolean
}) {
  const cur = (value ?? defaultColor).toLowerCase()
  return (
    <div className="color-row">
      {SYMBOL_COLORS.map((c) => (
        <button
          key={c.c}
          className={'swatch' + (cur === c.c.toLowerCase() ? ' on' : '')}
          title={c.name + (c.c.toLowerCase() === defaultColor.toLowerCase() ? ' (culoarea sistemului)' : '')}
          style={{ background: c.c }}
          onClick={() => onChange(c.c.toLowerCase() === defaultColor.toLowerCase() ? undefined : c.c)}
        />
      ))}
      <input type="color" value={cur.length === 7 ? cur : '#000000'} title="Altă culoare" onChange={(e) => onChange(e.target.value)} />
      {(value || showReset) && (
        <button className="reset" onClick={() => onChange(undefined)} title="Culoarea sistemului">
          Implicită
        </button>
      )}
    </div>
  )
}

export function DeviceProps({ d, project, onChange, onDelete }: { d: Device; project: Project; onChange: (patch: Partial<Device>) => void; onDelete: () => void }) {
  const def = symbolByType(d.type)!
  const sys = systemById(def.system)
  const csym = deviceSymbol(project, d)
  const fromCatalog = !d.symbolId && csym
  return (
    <div className="props">
      <div className="props-title">
        <img src={csym ? symbolThumb(csym, csym.recolor ? deviceColor(d) : undefined) : symbolDataUrl(def, false, d.color)} alt="" />
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
      <Field label="Simbol">
        <select
          value={d.symbolId ?? ''}
          onChange={(e) => onChange({ symbolId: e.target.value || undefined })}
          title="Simbolul standard sau unul personalizat cu același comportament"
        >
          <option value="">{fromCatalog ? `— din catalog: ${csym!.name} —` : `Standard: ${def.name}`}</option>
          {project.customSymbols
            .filter((c) => c.base === d.type)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
      </Field>
      <Field label="Culoare simbol">
        {csym && !csym.recolor ? (
          <span className="hint">Simbolul „{csym.name}” își păstrează culorile (nu e recolorabil).</span>
        ) : (
          <ColorRow value={d.color} defaultColor={sys.color} onChange={(c) => onChange({ color: c })} />
        )}
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

// ------------------------------------------------------------------ Selecție multiplă

/** Valoarea comună a unui câmp pentru mai multe echipamente (sau undefined dacă diferă) */
function common<T>(vals: T[]): T | undefined {
  return vals.length && vals.every((v) => v === vals[0]) ? vals[0] : undefined
}

export function GroupPanel({
  project,
  items,
  onPatchDevices,
  onAlign,
  onDelete,
}: {
  project: Project
  items: Item[]
  onPatchDevices: (patch: Partial<Device>) => void
  onAlign: (fn: (p: Project, items: Item[]) => Project) => void
  onDelete: () => void
}) {
  const devices = project.devices.filter((d) => items.some((i) => i.kind === 'device' && i.id === d.id))
  const nArch = items.filter((i) => i.kind === 'arch').length
  const nCab = items.filter((i) => i.kind === 'cable').length
  const counts = new Map<string, number>()
  for (const d of devices) counts.set(d.type, (counts.get(d.type) ?? 0) + 1)
  const field = (label: string, key: 'zone' | 'partition' | 'module' | 'zoneType', placeholder?: string) => {
    const v = common(devices.map((d) => d[key] ?? ''))
    return (
      <Field label={label}>
        <input
          key={key + (v ?? '~')}
          defaultValue={v ?? ''}
          placeholder={v === undefined ? '(valori diferite — scrie pentru a le înlocui)' : placeholder}
          onBlur={(e) => {
            const nv = e.target.value
            if (nv !== (v ?? '') && !(v === undefined && nv === '')) onPatchDevices({ [key]: nv })
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </Field>
    )
  }
  return (
    <div className="props">
      <div className="props-title">
        <div>
          <b>{items.length} elemente selectate</b>
          <small style={{ color: 'var(--muted)' }}>
            {devices.length} echipamente{nArch ? ` · ${nArch} arhitectură` : ''}
            {nCab ? ` · ${nCab} cabluri` : ''}
          </small>
        </div>
      </div>
      {devices.length > 0 && (
        <table className="group-counts">
          <tbody>
            {[...counts].map(([type, n]) => (
              <tr key={type}>
                <td>{symbolByType(type)?.prefix}</td>
                <td>{symbolByType(type)?.name}</td>
                <td className="num">{n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {devices.length > 0 && (
        <>
          <h4>Editare în bloc (toate echipamentele selectate)</h4>
          {field('Zona protejată / încăpere', 'zone', 'ex. Hol acces')}
          <div className="row2">
            {field('Modul', 'module', 'CAE')}
            {field('Partiție', 'partition')}
          </div>
          {field('Tip detecție / zonă', 'zoneType', 'întârziere / instantanee / 24h')}
          <p className="hint">Modificarea se aplică la ieșirea din câmp (sau Enter).</p>
          <Field label="Culoare simboluri">
            <ColorRow value={common(devices.map((d) => d.color ?? '')) || undefined} defaultColor="" showReset onChange={(c) => onPatchDevices({ color: c })} />
          </Field>
        </>
      )}
      <h4>Aranjare</h4>
      <div className="grid2">
        <button onClick={() => onAlign((p, it) => alignGroup(p, it, 'h'))}>Aliniază orizontal</button>
        <button onClick={() => onAlign((p, it) => alignGroup(p, it, 'v'))}>Aliniază vertical</button>
        <button disabled={items.length < 3} onClick={() => onAlign((p, it) => distributeGroup(p, it, 'h'))}>
          Distribuie orizontal
        </button>
        <button disabled={items.length < 3} onClick={() => onAlign((p, it) => distributeGroup(p, it, 'v'))}>
          Distribuie vertical
        </button>
      </div>
      <p className="hint">Trage de chenarul albastru pentru a muta grupul. Shift + click adaugă sau scoate un element; Esc anulează selecția.</p>
      <button className="danger" onClick={onDelete}>
        Șterge {items.length} elemente (Del)
      </button>
    </div>
  )
}

// ------------------------------------------------------------------ Proprietăți element de arhitectură

const ZONE_COLORS = ['#1565c0', '#c62828', '#2e7d32', '#e65100', '#6a1b9a', '#00838f', '#ad1457', '#455a64', '#222222']

export function ArchProps({
  a,
  project,
  onChange,
  onDelete,
  onAssignZone,
}: {
  a: ArchElement
  project: Project
  onChange: (patch: Partial<ArchElement>) => void
  onDelete: () => void
  /** Zonă: completează „Zona protejată” la echipamentele din interior */
  onAssignZone?: (deviceIds: string[], zone: string) => void
}) {
  const ppm = levelOf(project, a.levelId).pxPerMeter ?? 50
  const len = a.points ? polyLen(a.points) / ppm : 0
  const isZone = a.kind === 'rect' || a.kind === 'ellipse' || a.kind === 'polygon'
  const inside = isZone ? devicesInZone(project, a) : []
  const imgRef = { current: null as HTMLInputElement | null }
  return (
    <div className="props">
      <div className="props-title">
        <div>
          <b>{ARCH_NAMES[a.kind]}</b>
          <small style={{ color: 'var(--muted)' }}>{isZone || a.kind === 'image' || a.kind === 'table' || a.kind === 'note' || a.kind === 'line' ? 'Zone, imagini, tabele' : 'Arhitectură (schiță)'}</small>
        </div>
      </div>
      {isZone && (
        <>
          <Field label="Numele zonei">
            <input value={a.text ?? ''} placeholder="ex. Zona 1 – Recepție" onChange={(e) => onChange({ text: e.target.value })} />
          </Field>
          {a.kind !== 'polygon' && (
            <div className="row2">
              <Field label="Lățime (m)">
                <Num value={a.width ?? 4} min={0.1} max={500} step={0.05} onChange={(v) => onChange({ width: Math.max(0.1, v) })} />
              </Field>
              <Field label="Înălțime (m)">
                <Num value={a.height ?? 3} min={0.1} max={500} step={0.05} onChange={(v) => onChange({ height: Math.max(0.1, v) })} />
              </Field>
            </div>
          )}
          <p className="hint">
            Aria: <b>{zoneArea(a, ppm).toFixed(2).replace('.', ',')} m²</b>
            {a.kind === 'polygon'
              ? ` · ${(a.points?.length ?? 0) / 2} colțuri · trage cercurile de pe colțuri pentru a schimba forma`
              : ' · trage pătratul din colț pentru redimensionare'}
          </p>
          {a.kind !== 'polygon' && (
            <Field label="Rotire (°)">
              <Num value={a.rotation ?? 0} min={-360} max={360} step={1} onChange={(v) => onChange({ rotation: v })} />
            </Field>
          )}
          <Field label="Culoare">
            <div className="color-row">
              {ZONE_COLORS.map((c) => (
                <button key={c} className={'swatch' + ((a.stroke ?? '#1565c0') === c ? ' on' : '')} style={{ background: c }} onClick={() => onChange({ stroke: c, fill: undefined })} />
              ))}
              <input type="color" value={a.stroke ?? '#1565c0'} onChange={(e) => onChange({ stroke: e.target.value, fill: undefined })} />
            </div>
          </Field>
          <Field label={`Umplere: ${Math.round((a.fillOpacity ?? 0.12) * 100)}%`}>
            <input type="range" min={0} max={60} step={2} value={Math.round((a.fillOpacity ?? 0.12) * 100)} onChange={(e) => onChange({ fillOpacity: parseInt(e.target.value, 10) / 100 })} />
          </Field>
          <div className="row2">
            <Field label="Hașură">
              <select value={a.hatch ?? 'none'} onChange={(e) => onChange({ hatch: e.target.value === 'none' ? undefined : (e.target.value as HatchKind) })}>
                {HATCHES.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Distanță (mm pe hârtie)">
              <Num
                value={a.hatchMm ?? HATCH_MM_DEFAULT}
                min={0.5}
                max={20}
                step={0.5}
                onChange={(v) => onChange({ hatchMm: Math.min(20, Math.max(0.5, v)) })}
              />
            </Field>
          </div>
          <label className="check">
            <input type="checkbox" checked={a.dashed !== false} onChange={(e) => onChange({ dashed: e.target.checked })} />
            Contur punctat
          </label>
          <label className="check">
            <input type="checkbox" checked={a.showArea !== false} onChange={(e) => onChange({ showArea: e.target.checked })} />
            Afișează aria (m²)
          </label>
          {onAssignZone && (
            <button
              disabled={!inside.length || !(a.text ?? '').trim()}
              title={inside.length ? inside.map((d) => d.label).join(', ') : 'Nu sunt echipamente în zonă'}
              onClick={() => onAssignZone(inside.map((d) => d.id), (a.text ?? '').trim())}
            >
              Atribuie zona celor {inside.length} echipamente din interior
            </button>
          )}
          {!!inside.length && !(a.text ?? '').trim() && <p className="hint">Scrie numele zonei ca s-o poți atribui echipamentelor (tabelul de zone din memoriu).</p>}
        </>
      )}
      {a.kind === 'image' && (
        <>
          <div className="row2">
            <Field label="Lățime (m)">
              <Num
                value={a.width ?? 4}
                min={0.05}
                max={500}
                step={0.05}
                onChange={(v) => {
                  const w = Math.max(0.05, v)
                  onChange({ width: w, height: ((a.height ?? 3) * w) / (a.width ?? 4) })
                }}
              />
            </Field>
            <Field label="Rotire (°)">
              <Num value={a.rotation ?? 0} min={-360} max={360} step={1} onChange={(v) => onChange({ rotation: v })} />
            </Field>
          </div>
          <p className="hint">{a.text ? `Fișier: ${a.text}. ` : ''}Trage pătratul din colț pentru mărime (proporțiile se păstrează).</p>
          <button onClick={() => imgRef.current?.click()}>Înlocuiește imaginea…</button>
          <input
            ref={(el) => {
              imgRef.current = el
            }}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              const img = await prepareImage(f)
              onChange({ src: img.src, text: f.name, height: ((a.width ?? 4) * img.h) / img.w })
            }}
          />
        </>
      )}
      {a.kind === 'line' && (
        <>
          <Field label="Culoare">
            <div className="color-row">
              {ZONE_COLORS.map((c) => (
                <button key={c} className={'swatch' + ((a.stroke ?? '#222222') === c ? ' on' : '')} style={{ background: c }} onClick={() => onChange({ stroke: c })} />
              ))}
              <input type="color" value={a.stroke ?? '#222222'} onChange={(e) => onChange({ stroke: e.target.value })} />
            </div>
          </Field>
          <Field label="Grosime pe hârtie (mm)">
            <div className="inline">
              <Num value={a.widthMm ?? 0.35} min={0.1} max={3} step={0.05} onChange={(v) => onChange({ widthMm: Math.max(0.1, Math.min(3, v)) })} />
              <button onClick={() => onChange({ widthMm: 0.25 })}>0,25</button>
              <button onClick={() => onChange({ widthMm: 0.5 })}>0,5</button>
            </div>
          </Field>
          <label className="check">
            <input type="checkbox" checked={!!a.dashed} onChange={(e) => onChange({ dashed: e.target.checked })} />
            Linie punctată
          </label>
          <label className="check">
            <input type="checkbox" checked={!!a.arrowStart} onChange={(e) => onChange({ arrowStart: e.target.checked })} />
            Săgeată la început
          </label>
          <label className="check">
            <input type="checkbox" checked={!!a.arrowEnd} onChange={(e) => onChange({ arrowEnd: e.target.checked })} />
            Săgeată la sfârșit
          </label>
          <p className="hint">Lungime: {fmtM(len)}. Trage cercurile de pe vârfuri pentru a schimba traseul (Shift = fără aliniere).</p>
        </>
      )}
      {a.kind === 'note' && (
        <>
          <Field label="Textul notei (Enter = rând nou)">
            <textarea rows={3} value={a.text ?? ''} onChange={(e) => onChange({ text: e.target.value })} />
          </Field>
          <Field label="Mărimea textului pe hârtie (mm)">
            <Num value={a.fontMm ?? 2.5} min={1} max={10} step={0.1} onChange={(v) => onChange({ fontMm: Math.max(1, Math.min(10, v)) })} />
          </Field>
          <Field label="Culoare">
            <div className="color-row">
              {ZONE_COLORS.map((c) => (
                <button key={c} className={'swatch' + ((a.stroke ?? '#222222') === c ? ' on' : '')} style={{ background: c }} onClick={() => onChange({ stroke: c })} />
              ))}
              <input type="color" value={a.stroke ?? '#222222'} onChange={(e) => onChange({ stroke: e.target.value })} />
            </div>
          </Field>
          <label className="check">
            <input type="checkbox" checked={!!a.boxed} onChange={(e) => onChange({ boxed: e.target.checked })} />
            Text în chenar alb (se citește bine peste plan)
          </label>
          <p className="hint">Trage cercurile de la capete: vârful săgeții și locul textului. Dublu-click pe text = editare pe plan.</p>
        </>
      )}
      {a.kind === 'table' && a.table && (
        <>
          <Field label="Conținut">
            <select value={a.table.kind} onChange={(e) => onChange({ table: { ...a.table!, kind: e.target.value as SheetTable['kind'] } })}>
              {TABLE_KINDS.map((t) => (
                <option key={t.kind} value={t.kind}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Sistem">
            <select value={a.table.system ?? ''} onChange={(e) => onChange({ table: { ...a.table!, system: (e.target.value || undefined) as SystemId | undefined } })}>
              <option value="">Toate sistemele</option>
              {SYSTEMS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <label className="check">
            <input type="checkbox" checked={!!a.table.levelOnly} onChange={(e) => onChange({ table: { ...a.table!, levelOnly: e.target.checked } })} />
            Doar elementele de pe nivelul „{levelOf(project, a.levelId).name}”
          </label>
          <Field label="Mărimea textului pe hârtie (mm)">
            <Num value={a.table.fontMm ?? 2.5} min={0.6} max={12} step={0.1} onChange={(v) => onChange({ table: { ...a.table!, fontMm: Math.max(0.6, Math.min(12, v)) } })} />
          </Field>
          <Field label="Rotire (°)">
            <Num value={a.rotation ?? 0} min={-360} max={360} step={90} onChange={(v) => onChange({ rotation: v })} />
          </Field>
          <p className="hint">Tabelul se actualizează singur din proiect. Trage pătratul din colț pentru mărimea textului.</p>
        </>
      )}
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
          <p className="hint">
            Pe plan, pătratele albastre de la capete schimbă lățimea pe direcția peretelui. Trage {a.kind === 'door' ? 'ușa' : 'fereastra'} pe alt
            perete: se aliniază singură.
          </p>
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
      {a.kind === 'riser' && (
        <>
          <Field label="Nume ghenă">
            <input value={a.text ?? ''} onChange={(e) => onChange({ text: e.target.value })} />
          </Field>
          <p className="hint">
            Pune o trecere cu același nume pe fiecare nivel prin care trec cablurile. Un cablu terminat la ghenă continuă pe celălalt nivel, pe
            traseul desenat acolo de la ghenă până la echipamentul central (switch, NVR, centrală). Lungimea include și înălțimea dintre niveluri
            (tab-ul Proiect → Nivel).
          </p>
        </>
      )}
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
  const host = riserHost(project, c)
  const route = isRiserRoute(project, c)
  const hostLevel = host ? levelOf(project, host.levelId) : undefined
  const hostEnd = host ? cableEnds(project, c) : undefined
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
      {c.riser && (
        <p className={host || route ? 'hint' : 'warn'}>
          {host ? (
            <>
              Trece prin ghena <b>{c.riser}</b> pe nivelul <b>{hostLevel?.name}</b> și continuă pe traseul <b>{host.code}</b> până la{' '}
              <b>{byId.get(c.from === hostEnd?.from ? hostEnd?.to ?? '' : hostEnd?.from ?? '')?.label}</b>; lungimea include coborârea / urcarea
              între niveluri ({fmtM(verticalMeters(project, c.levelId, host.levelId))}) și traseul comun.
            </>
          ) : route ? (
            <>
              Traseu comun de la ghena <b>{c.riser}</b>: e inclus în lungimea cablurilor care vin prin ghenă (nu se numără separat în jurnal).
            </>
          ) : (
            <>
              Capăt la ghena <b>{c.riser}</b>, dar pe alt nivel nu există încă traseul de la aceeași ghenă până la un echipament central (switch,
              NVR, centrală). Desenează-l pe nivelul unde se află echipamentul.
            </>
          )}
        </p>
      )}
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
        {raw == null
          ? 'Calibrează scara pentru calcul automat al lungimii.'
          : (() => {
              const r = project.cableReservePct
              if (!host) return `Măsurat pe plan: ${raw.toFixed(1)} m + ${r}% rezervă = ${Math.ceil(raw * (1 + r / 100))} m. Completează doar pentru a suprascrie.`
              const hppm = levelOf(project, host.levelId).pxPerMeter
              if (!hppm) return `Calibrează scara nivelului ${levelOf(project, host.levelId).name} pentru lungimea totală.`
              const vert = verticalMeters(project, c.levelId, host.levelId)
              const common = cablePixels(host, project) / hppm
              const total = raw + vert + common
              return `Măsurat: ${raw.toFixed(1)} m pe ${levelOf(project, c.levelId).name} + ${vert.toFixed(1)} m pe verticală + ${common.toFixed(1)} m traseu comun = ${total.toFixed(1)} m + ${r}% rezervă = ${Math.ceil(total * (1 + r / 100))} m.`
            })()}
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
  frame,
  onCenterFrame,
}: {
  /** Pagină albă: zona de desen a planșei (m) și dacă desenul iese din ea */
  frame: { meters: [number, number]; out: boolean; format: string; scara: string } | null
  onCenterFrame: () => void
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
      {frame && (
        <>
          <p className="hint">
            Chenarul albastru punctat de pe plan este zona de desen a planșei {frame.format} la {frame.scara}:{' '}
            {frame.meters[0].toFixed(1).replace('.', ',')} × {frame.meters[1].toFixed(1).replace('.', ',')} m. Ce desenezi în chenar iese în PDF
            exact la scara din cartuș.
          </p>
          {frame.out && (
            <p className="warn">
              Desenul iese din zona planșei, iar în PDF se micșorează și scara din cartuș nu mai e reală. Alege un format mai mare sau o scară
              mai mică (ex. 1:200), ori centrează zona pe desen.
            </p>
          )}
          <button onClick={onCenterFrame} title="Mută chenarul zonei de desen în centrul desenului de pe acest nivel">
            Centrează zona planșei pe desen
          </button>
        </>
      )}
      {!frame && !level.background && <p className="hint">Scrie scara planșei (ex. 1:100) ca să vezi zona de desen pe pagina albă.</p>}
      {level.background && (
        <>
          <Field label={`Estompare plan: ${Math.round((level.bgFade ?? 0) * 100)}%`}>
            <input
              type="range"
              min={0}
              max={90}
              step={5}
              value={Math.round((level.bgFade ?? 0) * 100)}
              onChange={(e) => onChange({ bgFade: parseInt(e.target.value, 10) / 100 })}
              title="Planul devine mai șters (ca o copie decolorată), iar simbolurile ies în evidență; se vede la fel în PDF"
            />
          </Field>
          <label className="check">
            <input type="checkbox" checked={level.bgLocked !== false} onChange={(e) => onChange({ bgLocked: e.target.checked })} />
            Plan blocat (nu se poate muta)
          </label>
          {level.bgLocked === false && (
            <>
              <p className="hint">
                Trage planul cu mouse-ul (unealta Selectare) ca să-l aliniezi. Echipamentele, cablurile și schița rămân pe loc. Blochează-l
                când ai terminat.
              </p>
              <Field label="Rotire plan (grade)">
                <Num value={level.bgRotation ?? 0} min={-180} max={180} step={0.5} onChange={(v) => onChange({ bgRotation: Math.max(-180, Math.min(180, v)) })} />
              </Field>
              <button onClick={() => onChange({ bgX: 0, bgY: 0, bgRotation: 0 })}>Readu planul în poziția inițială</button>
            </>
          )}
        </>
      )}
      {level.background && (
        <button onClick={async () => (await askConfirm('Scoți planul de fundal? Echipamentele și schița rămân.', { title: 'Scoate fundalul', okLabel: 'Scoate' })) && onChange({ background: null })}>
          Scoate fundalul (pagină albă)
        </button>
      )}
      <Field label="Înălțime nivel (m) — pentru cablurile prin ghene">
        <Num value={level.heightM ?? 3} min={0} max={50} step={0.1} onChange={(v) => onChange({ heightM: Math.max(0, v) })} />
      </Field>
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

export function ProjectPanel({ project, onChange, notify }: { project: Project; onChange: (patch: Partial<Project>) => void; notify: (m: string) => void }) {
  const logo = project.title.logo
  const [isDefault, setIsDefault] = useState(() => !!logo && defaultLogo() === logo)
  return (
    <div className="props">
      <h4>Date proiect (cartuș)</h4>
      {TITLE_FIELDS.map(([key, label]) => (
        <Field key={key} label={label}>
          <input value={project.title[key]} onChange={(e) => onChange({ title: { ...project.title, [key]: e.target.value } })} />
        </Field>
      ))}
      <Field label="Logo firmă (în cartuș, lângă „Proiectant”)">
        <div className="logo-row">
          {logo ? <img className="logo-thumb" src={logo} alt="Logo" /> : <span className="hint">fără logo</span>}
          <label className="btn-file">
            {logo ? 'Înlocuiește…' : 'Încarcă…'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (!f) return
                try {
                  const img = await prepareImage(f, 600)
                  onChange({ title: { ...project.title, logo: img.src } })
                  setIsDefault(false)
                } catch (err) {
                  notify('Logo-ul nu a putut fi citit: ' + (err as Error).message)
                }
              }}
            />
          </label>
          {logo && (
            <button
              onClick={() => {
                // gol (nu lipsă): proiectul rămâne fără logo și la redeschidere, chiar dacă există unul implicit
                onChange({ title: { ...project.title, logo: '' } })
                setIsDefault(false)
              }}
            >
              Șterge
            </button>
          )}
        </div>
      </Field>
      {logo && (
        <label className="check">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => {
              const ok = saveDefaultLogo(e.target.checked ? logo : undefined)
              if (!ok) return notify('Logo-ul nu încape în memoria browserului.')
              setIsDefault(e.target.checked)
              notify(e.target.checked ? 'Logo-ul va apărea și în proiectele noi.' : 'Proiectele noi pornesc fără logo.')
            }}
          />
          Folosește logo-ul și la proiectele noi
        </label>
      )}

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

// ------------------------------------------------------------------ Straturi (ca în AutoCAD / Photoshop)

const EyeIcon = ({ on }: { on: boolean }) =>
  on ? (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="3.2" fill="currentColor" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.45" />
      <path d="M3 3l18 18" stroke="currentColor" strokeWidth="2" />
    </svg>
  )

const LockIcon = ({ on }: { on: boolean }) => (
  <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
    <rect x="4.5" y="10.5" width="15" height="10" rx="2" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" />
    <path d={on ? 'M8 10.5V7.5a4 4 0 0 1 8 0v3' : 'M8 10.5V7.5a4 4 0 0 1 7.5-2'} fill="none" stroke="currentColor" strokeWidth="2" />
  </svg>
)

/** Panoul de straturi al planșei de plan: arată / ascunde și blochează straturi */
export function LayersPanel({
  project,
  sheet,
  level,
  onChange,
  onLevelChange,
}: {
  project: Project
  sheet: Sheet
  level: Level
  onChange: (patch: Partial<Sheet>) => void
  onLevelChange: (patch: Partial<Level>) => void
}) {
  const [closed, setClosed] = useState<Record<string, boolean>>({})
  const devs = project.devices.filter((d) => d.levelId === level.id)
  const cabs = project.cables.filter((c) => c.levelId === level.id)
  const arch = project.arch.filter((a) => a.levelId === level.id)
  const count = (key: string): number => {
    const [g, k] = key.split(':')
    if (g === 'arh') return arch.filter((a) => archLayer(a) === key).length
    if (k === 'cabluri') return cabs.filter((c) => c.system === g).length
    if (k === 'conuri') return devs.filter((d) => deviceSystem(d) === 'CCTV' && symbolByType(d.type)?.camera).length
    return devs.filter((d) => deviceSystem(d) === g).length
  }
  const usedSystems = SYSTEMS.filter((s) => devs.some((d) => deviceSystem(d) === s.id) || cabs.some((c) => c.system === s.id))
  const otherSystems = SYSTEMS.filter((s) => !usedSystems.includes(s))

  const row = (key: string, name: string, n: number, opts: { lockable?: boolean } = {}) => {
    const vis = layerVisible(sheet, key)
    const locked = layerLocked(sheet, key)
    return (
      <div key={key} className={'layer-row' + (vis ? '' : ' off')}>
        <button className="ly-eye" title={vis ? 'Ascunde stratul' : 'Arată stratul'} onClick={() => onChange(toggleLayerVisible(sheet, key))}>
          <EyeIcon on={vis} />
        </button>
        {opts.lockable !== false ? (
          <button className={'ly-lock' + (locked ? ' on' : '')} title={locked ? 'Deblochează (se poate selecta)' : 'Blochează (nu se poate selecta / muta)'} onClick={() => onChange(toggleLayerLocked(sheet, key))}>
            <LockIcon on={locked} />
          </button>
        ) : (
          <span className="ly-lock-space" />
        )}
        <span className="ly-name">{name}</span>
        <span className="ly-count">{n || ''}</span>
      </div>
    )
  }

  /** Grup: ochiul arată / ascunde toate straturile grupei; lacătul le blochează pe toate */
  const group = (id: string, name: string, color: string, layers: { key: string; name: string }[], sysOn?: boolean, onSys?: (on: boolean) => void) => {
    const allVis = sysOn ?? layers.every((l) => layerVisible(sheet, l.key))
    const allLocked = layers.every((l) => layerLocked(sheet, l.key))
    const isClosed = closed[id]
    return (
      <div key={id} className="layer-group">
        <div className={'layer-row group' + (allVis ? '' : ' off')}>
          <button
            className="ly-eye"
            title={allVis ? 'Ascunde toată grupa' : 'Arată toată grupa'}
            onClick={() => {
              if (onSys) return onSys(!allVis)
              const hidden = new Set(sheet.hiddenLayers ?? [])
              for (const l of layers) {
                if (allVis) hidden.add(l.key)
                else hidden.delete(l.key)
              }
              onChange({ hiddenLayers: [...hidden] })
            }}
          >
            <EyeIcon on={allVis} />
          </button>
          <button
            className={'ly-lock' + (allLocked ? ' on' : '')}
            title={allLocked ? 'Deblochează toată grupa' : 'Blochează toată grupa'}
            onClick={() => {
              const lk = new Set(sheet.lockedLayers ?? [])
              for (const l of layers) {
                if (allLocked) lk.delete(l.key)
                else lk.add(l.key)
              }
              onChange({ lockedLayers: [...lk] })
            }}
          >
            <LockIcon on={allLocked} />
          </button>
          <span className="dot" style={{ background: color }} />
          <button className="ly-group-name" onClick={() => setClosed((c) => ({ ...c, [id]: !c[id] }))}>
            {name}
            <span className="chev">{isClosed ? '▸' : '▾'}</span>
          </button>
        </div>
        {!isClosed && <div className="layer-children">{layers.map((l) => row(l.key, l.name, count(l.key)))}</div>}
      </div>
    )
  }

  const setSystem = (id: SystemId, on: boolean) =>
    onChange({ systems: on ? SYSTEMS.map((s) => s.id).filter((s) => s === id || sheet.systems.includes(s)) : sheet.systems.filter((s) => s !== id) })

  return (
    <div className="props layers-panel">
      <h4>Straturi – {sheet.nr} {sheet.titlu}</h4>
      <p className="hint">
        Ochiul arată / ascunde stratul pe această planșă (și în PDF / DXF). Lacătul îl blochează: se vede, dar nu se poate selecta sau
        muta.
      </p>
      {level.background && (
        <div className="layer-group">
          <div className={'layer-row group' + (layerVisible(sheet, 'fundal') ? '' : ' off')}>
            <button className="ly-eye" title="Arată / ascunde planul de fundal" onClick={() => onChange(toggleLayerVisible(sheet, 'fundal'))}>
              <EyeIcon on={layerVisible(sheet, 'fundal')} />
            </button>
            <button
              className={'ly-lock' + (level.bgLocked !== false ? ' on' : '')}
              title={level.bgLocked !== false ? 'Planul e blocat; click = deblochează ca să-l poți muta' : 'Blochează planul'}
              onClick={() => onLevelChange({ bgLocked: level.bgLocked === false })}
            >
              <LockIcon on={level.bgLocked !== false} />
            </button>
            <span className="dot" style={{ background: '#9e9e9e' }} />
            <span className="ly-name">Plan de fundal</span>
          </div>
        </div>
      )}
      {group('arh', 'Arhitectură (schiță)', '#222', ARCH_LAYERS)}
      {arch.some((a) => archLayer(a).startsWith('adn:')) && group('adn', 'Zone, imagini, tabele', '#8d6e63', ANNOT_LAYERS)}
      {usedSystems.map((s) => group(s.id, s.name, s.color, systemLayers(s.id), sheet.systems.includes(s.id), (on) => setSystem(s.id, on)))}
      {otherSystems.length > 0 && <p className="hint">Fără elemente pe acest nivel: {otherSystems.map((s) => s.short).join(', ')}.</p>}
      <div className="grid2">
        <button
          onClick={() => onChange({ hiddenLayers: [], showCones: true, systems: SYSTEMS.map((s) => s.id) })}
          title="Arată toate straturile pe această planșă"
        >
          Arată tot
        </button>
        <button onClick={() => onChange({ lockedLayers: [] })} title="Deblochează toate straturile">
          Deblochează tot
        </button>
      </div>
    </div>
  )
}
