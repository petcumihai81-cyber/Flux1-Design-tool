import { useRef, useState } from 'react'
import type { Project } from './types'
import { BUILTIN_TEMPLATES, addTemplate, exportTemplate, importTemplate, makeTemplate, removeTemplate, userTemplates } from './templates'
import type { ProjectTemplate } from './templates'
import { systemById } from './symbols'

const EMPTY = '__gol__'

/** „Nou”: proiect gol sau din șablon; aici se și salvează proiectul curent ca șablon */
export function NewProjectDialog({
  project,
  onCreate,
  onClose,
  notify,
}: {
  project: Project
  /** null = proiect gol */
  onCreate: (t: ProjectTemplate | null) => void
  onClose: () => void
  notify: (m: string) => void
}) {
  const [mine, setMine] = useState<ProjectTemplate[]>(() => userTemplates())
  const [selId, setSelId] = useState<string>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [withDrawing, setWithDrawing] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const all = [...BUILTIN_TEMPLATES, ...mine]
  const sel = all.find((t) => t.id === selId)

  const summary = (t: ProjectTemplate) => {
    const d = t.data
    const sheets = d.sheets ?? []
    return [
      `${(d.levels ?? []).length || 1} ${(d.levels ?? []).length === 1 ? 'nivel' : 'niveluri'}`,
      `${sheets.length} planșe`,
      ...(t.withDrawing ? [`${(d.devices ?? []).length} echipamente, ${(d.cables ?? []).length} cabluri`] : []),
      ...(d.catalog ? [`catalog: ${d.catalog.length} modele`] : ['catalogul tău implicit']),
      ...(d.customSymbols?.length ? [`${d.customSymbols.length} simboluri personalizate`] : []),
      ...(d.title?.logo ? ['logo firmă'] : []),
    ].join(' · ')
  }

  const saveCurrent = () => {
    const t = makeTemplate(project, name, desc, withDrawing)
    if (!addTemplate(t)) return notify('Șablonul nu încape în memoria browserului (încearcă fără desen sau exportă-l ca fișier).')
    setMine(userTemplates())
    setSelId(t.id)
    setSaving(false)
    setName('')
    setDesc('')
    notify(`Șablonul „${t.name}” a fost salvat.`)
  }

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal new-project">
        <header className="modal-head">
          <b>Proiect nou</b>
          <span className="hint">gol sau dintr-un șablon</span>
          <button className="close" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="modal-body np-body">
          <nav className="np-list">
            <button className={'np-item' + (selId === EMPTY ? ' on' : '')} onClick={() => setSelId(EMPTY)} onDoubleClick={() => onCreate(null)}>
              <b>Proiect gol</b>
              <small>o planșă, catalogul și logo-ul tău implicit</small>
            </button>
            <div className="np-sep">Șabloane de bază</div>
            {BUILTIN_TEMPLATES.map((t) => (
              <button key={t.id} className={'np-item' + (selId === t.id ? ' on' : '')} onClick={() => setSelId(t.id)} onDoubleClick={() => onCreate(t)}>
                <b>{t.name}</b>
                <small>{(t.data.sheets ?? []).filter((s) => s.kind === 'plan').map((s) => systemById(s.systems[0]).short).join(' · ')}</small>
              </button>
            ))}
            <div className="np-sep">Șabloanele mele ({mine.length})</div>
            {mine.map((t) => (
              <button key={t.id} className={'np-item' + (selId === t.id ? ' on' : '')} onClick={() => setSelId(t.id)} onDoubleClick={() => onCreate(t)}>
                <b>{t.name}</b>
                <small>{t.createdAt ? new Date(t.createdAt).toLocaleDateString('ro-RO') : ''}{t.withDrawing ? ' · cu desen' : ''}</small>
              </button>
            ))}
            {!mine.length && <p className="hint np-empty">Încă niciun șablon propriu. Salvează proiectul curent ca șablon (jos).</p>}
          </nav>
          <section className="np-detail">
            {selId === EMPTY ? (
              <>
                <h3>Proiect gol</h3>
                <p>O singură planșă de amplasare (A3 peisaj, 1:100), toate sistemele, catalogul implicit, logo-ul implicit (dacă l-ai setat).</p>
              </>
            ) : sel ? (
              <>
                <h3>{sel.name}</h3>
                {sel.description && <p>{sel.description}</p>}
                <p className="hint">{summary(sel)}</p>
                <ul className="np-sheets">
                  {(sel.data.sheets ?? []).map((s) => (
                    <li key={s.id}>
                      <span className="sheet-kind">{s.kind === 'bloc' ? '⊞' : '▭'}</span> <b>{s.nr}</b> {s.titlu} <small>({s.format} {s.orientation === 'landscape' ? 'peisaj' : 'portret'})</small>
                    </li>
                  ))}
                </ul>
                {!sel.builtin && (
                  <div className="np-actions">
                    <button onClick={() => exportTemplate(sel)} title="Descarcă șablonul ca fișier (pentru alt calculator)">
                      Exportă fișier
                    </button>
                    <button
                      className="danger"
                      onClick={() => {
                        if (!window.confirm(`Ștergi șablonul „${sel.name}”?`)) return
                        removeTemplate(sel.id)
                        setMine(userTemplates())
                        setSelId(EMPTY)
                      }}
                    >
                      Șterge șablonul
                    </button>
                  </div>
                )}
              </>
            ) : null}

            <div className="np-save">
              {!saving ? (
                <div className="np-actions">
                  <button onClick={() => setSaving(true)}>Salvează proiectul curent ca șablon…</button>
                  <button onClick={() => fileRef.current?.click()} title="Un fișier .sablon.json (sau un proiect .plansa.json)">
                    Importă șablon…
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".json,application/json"
                    hidden
                    onChange={async (e) => {
                      const f = e.target.files?.[0]
                      e.target.value = ''
                      if (!f) return
                      try {
                        const t = await importTemplate(f)
                        if (!addTemplate(t)) return notify('Șablonul nu încape în memoria browserului.')
                        setMine(userTemplates())
                        setSelId(t.id)
                        notify(`Șablonul „${t.name}” a fost importat.`)
                      } catch (err) {
                        notify((err as Error).message)
                      }
                    }}
                  />
                </div>
              ) : (
                <>
                  <h4>Salvează proiectul curent ca șablon</h4>
                  <label className="field">
                    <span>Nume</span>
                    <input autoFocus value={name} placeholder="ex. Magazin standard – efracție + CCTV" onChange={(e) => setName(e.target.value)} />
                  </label>
                  <label className="field">
                    <span>Descriere (opțional)</span>
                    <input value={desc} onChange={(e) => setDesc(e.target.value)} />
                  </label>
                  <label className="check">
                    <input type="checkbox" checked={withDrawing} onChange={(e) => setWithDrawing(e.target.checked)} />
                    Include și desenul (echipamente, cabluri, schiță, scheme bloc editate)
                  </label>
                  <p className="hint">
                    Intră: planșele (format, sisteme, straturi), nivelurile, catalogul, accesoriile, parametrii de calcul, datele firmei din cartuș și
                    memoriu, logo-ul, simbolurile personalizate. Nu intră: datele beneficiarului (nume, CUI, adresă, vecinătăți…) și planurile de fundal.
                  </p>
                  <div className="np-actions">
                    <button onClick={() => setSaving(false)}>Renunță</button>
                    <button className="primary" onClick={saveCurrent} disabled={!name.trim()}>
                      Salvează șablonul
                    </button>
                  </div>
                </>
              )}
            </div>
          </section>
        </div>
        <footer className="modal-foot">
          <span className="hint">Dublu-click pe un șablon = creează direct.</span>
          <span className="spacer" />
          <button onClick={onClose}>Renunță</button>
          <button className="primary" onClick={() => onCreate(selId === EMPTY ? null : sel ?? null)}>
            Creează proiectul
          </button>
        </footer>
      </div>
    </div>
  )
}
