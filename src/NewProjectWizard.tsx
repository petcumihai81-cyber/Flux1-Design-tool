import { useRef, useState } from 'react'
import type { Background, Level, Orientation, PageFormat, Project, Sheet, SystemId } from './types'
import type { ProjectTemplate } from './templates'
import { projectFromTemplate } from './templates'
import { ALL_SYSTEMS, emptyProject, newLevel, newSheet, symbolForPaper } from './project'
import { SYSTEMS, systemById } from './symbols'
import { loadBackground } from './background'
import type { PdfDoc } from './background'
import { readDxf } from './dxfImport'
import type { DxfDrawing } from './dxfImport'
import { PdfPagePicker } from './PdfPagePicker'
import { DxfImportDialog } from './DxfImportDialog'

const STEPS = ['Beneficiar', 'Clădirea', 'Sisteme și planșe', 'Date proiect', 'Pentru memoriu', 'Rezumat'] as const

/** Opțiunile pentru planșe (pasul 3) */
interface SheetOpts {
  keep: boolean
  systems: SystemId[]
  perSystem: boolean
  blocs: boolean
  format: PageFormat
  orientation: Orientation
  scara: string
}

/** Planul de fundal ales pentru un nivel, cu scara (DXF = deja calibrat) */
interface LevelPlan {
  bg: Background
  ppm: number | null
}

const nrGen = () => {
  let n = 0
  return () => 'P' + String(++n).padStart(2, '0')
}

/** Planșele generate de asistent: plan(uri) pe fiecare nivel și schemele bloc */
function buildSheets(levels: Level[], o: SheetOpts): Sheet[] {
  const nr = nrGen()
  const multi = levels.length > 1
  const common = { format: o.format, orientation: o.orientation, scara: o.scara }
  const plans: Sheet[] = []
  for (const l of levels) {
    const suffix = multi ? ` – ${l.name}` : ''
    if (o.perSystem)
      for (const s of o.systems)
        plans.push(newSheet({ ...common, levelId: l.id, nr: nr(), titlu: `Plan amplasare – ${systemById(s).name}${suffix}`, systems: [s], showCones: s === 'CCTV' }))
    else plans.push(newSheet({ ...common, levelId: l.id, nr: nr(), titlu: `Plan amplasare echipamente${suffix}`, systems: [...o.systems], showCones: o.systems.includes('CCTV') }))
  }
  const blocs = o.blocs
    ? o.systems.filter((s) => s !== 'NET' || o.systems.length === 1).map((s) => newSheet({ ...common, kind: 'bloc', nr: nr(), titlu: `Schemă bloc – ${systemById(s).name}`, systems: [s] }))
    : []
  return [...plans, ...blocs]
}

/**
 * Planșele din șablon, păstrate: nivelurile noi primesc o copie a planurilor primului nivel,
 * iar planșele unui nivel șters trec pe primul nivel.
 */
function keepSheets(sheets: Sheet[], levels: Level[]): Sheet[] {
  const ids = new Set(levels.map((l) => l.id))
  const fixed = sheets.map((s) => (s.kind === 'plan' && !ids.has(s.levelId ?? '') ? { ...s, levelId: levels[0].id } : s))
  const hasPlans = (id: string) => fixed.some((s) => s.kind === 'plan' && s.levelId === id)
  // modelul: planurile primului nivel (în ordinea clădirii) care are planșe
  const src = levels.find((l) => hasPlans(l.id))
  const model = src ? fixed.filter((s) => s.kind === 'plan' && s.levelId === src.id) : []
  const plans: Sheet[] = []
  for (const l of levels) {
    if (hasPlans(l.id))
      plans.push(
        ...fixed
          .filter((s) => s.kind === 'plan' && s.levelId === l.id)
          .map((s) => (levels.length > 1 && !s.titlu.includes(l.name) ? { ...s, titlu: `${s.titlu} – ${l.name}` } : s)),
      )
    else
      for (const s of model)
        plans.push({ ...JSON.parse(JSON.stringify(s)), id: newSheet().id, levelId: l.id, titlu: `${s.titlu} – ${l.name}`, diagram: undefined })
  }
  const all = [...plans, ...fixed.filter((s) => s.kind !== 'plan')]
  // renumerotare în ordine
  const nr = nrGen()
  return all.map((s) => ({ ...s, nr: nr() }))
}

/** Asistentul de proiect nou: pornește din proiectul gol sau din șablon și trece prin toate datele proiectului */
export function NewProjectWizard({
  start,
  onBack,
  onClose,
  onFinish,
  notify,
}: {
  /** null = proiect gol */
  start: ProjectTemplate | null
  onBack: () => void
  onClose: () => void
  onFinish: (p: Project, message: string) => void
  notify: (m: string) => void
}) {
  const [draft, setDraft] = useState<Project>(() => (start ? projectFromTemplate(start) : emptyProject()))
  const [step, setStep] = useState(0)
  const [plans, setPlans] = useState<Record<string, LevelPlan>>({})
  const [opts, setOpts] = useState<SheetOpts>(() => {
    const plan = draft.sheets.find((s) => s.kind === 'plan') ?? newSheet()
    const used = ALL_SYSTEMS.filter((s) => draft.sheets.some((sh) => sh.systems.includes(s)))
    return {
      keep: !!start,
      systems: start ? used : ['EFR', 'CCTV'],
      perSystem: true,
      blocs: true,
      format: plan.format,
      orientation: plan.orientation,
      scara: plan.scara,
    }
  })
  const [busy, setBusy] = useState<string | null>(null)
  const [pdfPick, setPdfPick] = useState<{ doc: PdfDoc; fileName: string; resolve: (page: number | null) => void } | null>(null)
  const [dxf, setDxf] = useState<{ drawing: DxfDrawing; fileName: string; levelId: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const fileTarget = useRef<string | null>(null)

  const title = draft.title
  const memo = draft.memoriu
  const setTitle = (k: keyof typeof title, v: string) => setDraft((p) => ({ ...p, title: { ...p.title, [k]: v } }))
  const setMemo = (k: keyof typeof memo, v: string) => setDraft((p) => ({ ...p, memoriu: { ...p.memoriu, [k]: v } }))
  const setLevel = (id: string, over: Partial<Level>) => setDraft((p) => ({ ...p, levels: p.levels.map((l) => (l.id === id ? { ...l, ...over } : l)) }))
  const hasElements = (id: string) => draft.devices.some((d) => d.levelId === id) || draft.cables.some((c) => c.levelId === id) || draft.arch.some((a) => a.levelId === id)

  const addLevel = (where: 'sub' | 'top') =>
    setDraft((p) => {
      const names = new Set(p.levels.map((l) => l.name))
      let name = ''
      if (where === 'sub') {
        for (let i = 1; !name; i++) {
          const n = i === 1 ? 'Subsol' : `Subsol ${i}`
          if (!names.has(n)) name = n
        }
      } else if (!names.has('Parter')) name = 'Parter'
      else
        for (let i = 1; !name; i++) {
          const n = `Etaj ${i}`
          if (!names.has(n)) name = n
        }
      const l = newLevel(name, { heightM: 3 })
      return { ...p, levels: where === 'sub' ? [l, ...p.levels] : [...p.levels, l] }
    })

  const moveLevel = (id: string, d: -1 | 1) =>
    setDraft((p) => {
      const i = p.levels.findIndex((l) => l.id === id)
      const j = i + d
      if (i < 0 || j < 0 || j >= p.levels.length) return p
      const levels = [...p.levels]
      ;[levels[i], levels[j]] = [levels[j], levels[i]]
      return { ...p, levels }
    })

  const removeLevel = (id: string) => {
    setDraft((p) => ({ ...p, levels: p.levels.filter((l) => l.id !== id) }))
    setPlans((m) => {
      const n = { ...m }
      delete n[id]
      return n
    })
  }

  const pickFile = (levelId: string) => {
    fileTarget.current = levelId
    fileRef.current?.click()
  }

  const onFile = async (file: File) => {
    const levelId = fileTarget.current
    fileTarget.current = null
    if (!levelId) return
    const lower = file.name.toLowerCase()
    if (lower.endsWith('.dwg')) return notify('Fișierele DWG nu se pot citi în browser. În AutoCAD: Save As → DXF, apoi încarcă fișierul DXF.')
    if (lower.endsWith('.dxf')) {
      setBusy('Se citește planul DXF…')
      try {
        await new Promise((r) => setTimeout(r, 30))
        const drawing = readDxf(await file.arrayBuffer())
        if (!drawing.prims.length) throw new Error('fișierul nu conține desen în spațiul model.')
        setDxf({ drawing, fileName: file.name, levelId })
      } catch (err) {
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
      if (bg) setPlans((m) => ({ ...m, [levelId]: { bg, ppm: null } }))
    } catch (err) {
      notify('Nu am putut încărca fișierul: ' + (err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  /** Proiectul final: planurile pe niveluri, planșele, simbolurile la mărimea potrivită */
  const build = (): Project => {
    let levels = draft.levels.map((l) => {
      const pl = plans[l.id]
      if (!pl) return l
      const keepSize = hasElements(l.id)
      return {
        ...l,
        background: pl.bg,
        pxPerMeter: pl.ppm,
        bgX: 0,
        bgY: 0,
        bgRotation: 0,
        symbolSize: keepSize ? l.symbolSize : pl.ppm ? Math.round(pl.ppm * 0.5) : Math.max(16, Math.round(Math.max(pl.bg.width, pl.bg.height) / 50)),
      }
    })
    const sheets = opts.keep ? keepSheets(draft.sheets, levels) : buildSheets(levels, opts)
    let p: Project = { ...draft, levels, sheets, activeSheetId: sheets[0].id }
    // DXF calibrat: simbolurile ~6 mm pe prima planșă a nivelului
    levels = levels.map((l) => {
      const pl = plans[l.id]
      const sh = sheets.find((s) => s.kind === 'plan' && s.levelId === l.id)
      if (!pl?.ppm || !sh || hasElements(l.id)) return l
      return { ...l, symbolSize: symbolForPaper(p, sh) ?? l.symbolSize }
    })
    p = { ...p, levels }
    return p
  }

  const finish = () => {
    const p = build()
    const uncal = p.levels.filter((l) => l.background && !l.pxPerMeter).length
    const msg = ['Proiectul a fost creat.', uncal ? `Calibrează scara planurilor încărcate (unealta „Scară”) – ${uncal} ${uncal === 1 ? 'nivel' : 'niveluri'}.` : '']
      .filter(Boolean)
      .join(' ')
    onFinish(p, msg)
  }

  const valid = opts.keep || opts.systems.length > 0
  const canNext = step !== 2 || valid
  const preview = step === 5 ? build() : null

  const field = (label: string, value: string, onChange: (v: string) => void, extra: { placeholder?: string; area?: boolean; wide?: boolean } = {}) => (
    <label className={'field' + (extra.wide ? ' wide' : '')}>
      <span>{label}</span>
      {extra.area ? (
        <textarea rows={2} value={value} placeholder={extra.placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input value={value} placeholder={extra.placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  )

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal new-project wizard">
        <header className="modal-head">
          <b>Asistent proiect nou</b>
          <span className="hint">{start ? `din șablonul „${start.name}”` : 'proiect gol'}</span>
          <button className="close" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="modal-body np-body">
          <nav className="np-list wz-steps">
            {STEPS.map((s, i) => (
              <button key={s} className={'np-item wz-step' + (i === step ? ' on' : '') + (i < step ? ' done' : '')} onClick={() => (i <= step || canNext) && setStep(i)}>
                <b>
                  <span className="wz-num">{i < step ? '✓' : i + 1}</span> {s}
                </b>
              </button>
            ))}
            <p className="hint wz-note">Orice pas se poate sări: ce lipsește se completează și mai târziu, în panoul Proiect.</p>
          </nav>
          <section className="np-detail wz-detail">
            {step === 0 && (
              <>
                <h3>Beneficiarul și obiectivul</h3>
                <div className="wz-grid">
                  {field('Beneficiar (denumire)', title.beneficiar, (v) => setTitle('beneficiar', v), { placeholder: 'ex. SC Exemplu SRL', wide: true })}
                  {field('Obiectiv (denumire și adresă)', title.obiectiv, (v) => setTitle('obiectiv', v), { placeholder: 'ex. Magazin, str. Florilor nr. 1, Ploiești', wide: true })}
                  {field('CUI', memo.cui, (v) => setMemo('cui', v))}
                  {field('Sediu social', memo.sediuSocial, (v) => setMemo('sediuSocial', v))}
                  {field('Activitate', memo.activitate, (v) => setMemo('activitate', v), { placeholder: 'ex. comerț cu amănuntul' })}
                  {field('Cod CAEN', memo.caen, (v) => setMemo('caen', v), { placeholder: 'ex. 4711' })}
                  {field('Denumire CAEN', memo.caenDenumire, (v) => setMemo('caenDenumire', v), { wide: true })}
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <h3>Clădirea: niveluri și planuri</h3>
                <p className="hint">Pentru fiecare nivel: un plan (PDF, imagine sau DXF) sau pagină albă, pe care desenezi schița. Înălțimea nivelului intră în lungimea cablurilor care trec prin ghene.</p>
                <table className="wz-levels">
                  <thead>
                    <tr>
                      <th />
                      <th>Nivel</th>
                      <th>Înălțime (m)</th>
                      <th>Plan</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {draft.levels.map((l, i) => {
                      const pl = plans[l.id]
                      return (
                        <tr key={l.id}>
                          <td className="wz-move">
                            <button disabled={i === 0} onClick={() => moveLevel(l.id, -1)} title="Mută mai sus">
                              ▲
                            </button>
                            <button disabled={i === draft.levels.length - 1} onClick={() => moveLevel(l.id, 1)} title="Mută mai jos">
                              ▼
                            </button>
                          </td>
                          <td>
                            <input value={l.name} onChange={(e) => setLevel(l.id, { name: e.target.value })} />
                          </td>
                          <td>
                            <input
                              type="number"
                              min={1}
                              step={0.1}
                              style={{ width: 70 }}
                              value={l.heightM ?? 3}
                              onChange={(e) => setLevel(l.id, { heightM: Math.max(0.5, parseFloat(e.target.value) || 3) })}
                            />
                          </td>
                          <td className="wz-plan">
                            {pl ? (
                              <>
                                <span className="wz-file" title={pl.bg.name}>
                                  {pl.bg.name}
                                </span>
                                <small className="hint">{pl.ppm ? 'DXF, scară calibrată' : 'de calibrat după creare'}</small>
                                <button onClick={() => setPlans((m) => Object.fromEntries(Object.entries(m).filter(([k]) => k !== l.id)))} title="Fără plan (pagină albă)">
                                  ×
                                </button>
                              </>
                            ) : (
                              <>
                                <span className="hint">pagină albă</span>
                                <button onClick={() => pickFile(l.id)}>Încarcă plan…</button>
                              </>
                            )}
                          </td>
                          <td>
                            <button
                              className="danger"
                              disabled={draft.levels.length === 1 || hasElements(l.id)}
                              title={hasElements(l.id) ? 'Nivelul are desen din șablon' : 'Șterge nivelul'}
                              onClick={() => removeLevel(l.id)}
                            >
                              Șterge
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <div className="np-actions">
                  <button onClick={() => addLevel('sub')}>+ Subsol</button>
                  <button onClick={() => addLevel('top')}>+ Etaj</button>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.dxf,.dwg,image/*,application/pdf"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    if (f) onFile(f)
                  }}
                />
              </>
            )}

            {step === 2 && (
              <>
                <h3>Sisteme și planșe</h3>
                {start && (
                  <label className="check">
                    <input type="checkbox" checked={opts.keep} onChange={(e) => setOpts({ ...opts, keep: e.target.checked })} />
                    Păstrează planșele din șablon ({draft.sheets.length}) — nivelurile noi primesc aceleași planuri ca primul nivel
                  </label>
                )}
                <fieldset className="wz-fs" disabled={opts.keep}>
                  <div className="wz-systems">
                    {SYSTEMS.map((s) => (
                      <label key={s.id} className="check wz-sys" style={{ borderColor: opts.systems.includes(s.id) ? s.color : undefined }}>
                        <input
                          type="checkbox"
                          checked={opts.systems.includes(s.id)}
                          onChange={(e) =>
                            setOpts({ ...opts, systems: e.target.checked ? ALL_SYSTEMS.filter((x) => x === s.id || opts.systems.includes(x)) : opts.systems.filter((x) => x !== s.id) })
                          }
                        />
                        <span className="wz-dot" style={{ background: s.color }} />
                        {s.name}
                      </label>
                    ))}
                  </div>
                  <div className="wz-radio">
                    <label className="check">
                      <input type="radio" checked={opts.perSystem} onChange={() => setOpts({ ...opts, perSystem: true })} />
                      Câte un plan pe sistem (pe fiecare nivel)
                    </label>
                    <label className="check">
                      <input type="radio" checked={!opts.perSystem} onChange={() => setOpts({ ...opts, perSystem: false })} />
                      Toate sistemele pe același plan
                    </label>
                    <label className="check">
                      <input type="checkbox" checked={opts.blocs} onChange={(e) => setOpts({ ...opts, blocs: e.target.checked })} />
                      Schemele bloc (câte una pe sistem)
                    </label>
                  </div>
                  <div className="wz-grid">
                    <label className="field">
                      <span>Format</span>
                      <select value={opts.format} onChange={(e) => setOpts({ ...opts, format: e.target.value as PageFormat })}>
                        {(['A4', 'A3', 'A2', 'A1', 'A0'] as PageFormat[]).map((f) => (
                          <option key={f}>{f}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Orientare</span>
                      <select value={opts.orientation} onChange={(e) => setOpts({ ...opts, orientation: e.target.value as Orientation })}>
                        <option value="landscape">peisaj</option>
                        <option value="portrait">portret</option>
                      </select>
                    </label>
                    {field('Scara', opts.scara, (v) => setOpts({ ...opts, scara: v }), { placeholder: '1:100' })}
                  </div>
                  {!opts.keep && !opts.systems.length && <p className="warn">Alege cel puțin un sistem.</p>}
                </fieldset>
              </>
            )}

            {step === 3 && (
              <>
                <h3>Datele proiectului (cartuș)</h3>
                <div className="wz-grid">
                  {field('Nr. proiect', title.nrProiect, (v) => setTitle('nrProiect', v), { placeholder: 'ex. 12/2026' })}
                  {field('Data', title.data, (v) => setTitle('data', v))}
                  {field('Proiectant', title.proiectant, (v) => setTitle('proiectant', v), { wide: true })}
                  {field('Întocmit', title.intocmit, (v) => setTitle('intocmit', v))}
                  {field('Verificat', title.verificat, (v) => setTitle('verificat', v))}
                  {field('Proiectant (nume, pentru memoriu)', memo.proiectantNume, (v) => setMemo('proiectantNume', v))}
                  {field('Director tehnic', memo.directorTehnic, (v) => setMemo('directorTehnic', v))}
                </div>
                <p className="hint wz-logo">
                  {title.logo ? (
                    <>
                      <img src={title.logo} alt="" /> Logo-ul firmei apare în cartuș (se schimbă din panoul Proiect).
                    </>
                  ) : (
                    'Fără logo în cartuș (se poate adăuga din panoul Proiect).'
                  )}
                </p>
              </>
            )}

            {step === 4 && (
              <>
                <h3>Pentru memoriul tehnic (opțional)</h3>
                <p className="hint">Ce rămâne gol apare în memoriu ca [DE COMPLETAT].</p>
                <div className="wz-grid">
                  {field('Vecinătate Nord', memo.vecinN, (v) => setMemo('vecinN', v))}
                  {field('Vecinătate Sud', memo.vecinS, (v) => setMemo('vecinS', v))}
                  {field('Vecinătate Est', memo.vecinE, (v) => setMemo('vecinE', v))}
                  {field('Vecinătate Vest', memo.vecinV, (v) => setMemo('vecinV', v))}
                  {field('Acces pietonal', memo.accesPietonal, (v) => setMemo('accesPietonal', v))}
                  {field('Acces auto', memo.accesAuto, (v) => setMemo('accesAuto', v))}
                  {field('Construcția', memo.constructie, (v) => setMemo('constructie', v), { area: true, wide: true, placeholder: 'ex. clădire P+1, structură din cărămidă, acoperiș tip terasă' })}
                  {field('Elemente mecano-fizice', memo.mecanoFizice, (v) => setMemo('mecanoFizice', v), { area: true, wide: true })}
                  {field('Circuite de valori / numerar', memo.circuite, (v) => setMemo('circuite', v), { area: true, wide: true })}
                </div>
              </>
            )}

            {step === 5 && preview && (
              <>
                <h3>Rezumat</h3>
                <dl className="wz-sum">
                  <dt>Beneficiar</dt>
                  <dd>{title.beneficiar || <i className="hint">necompletat</i>}</dd>
                  <dt>Obiectiv</dt>
                  <dd>{title.obiectiv || <i className="hint">necompletat</i>}</dd>
                  <dt>Proiect</dt>
                  <dd>
                    {title.nrProiect || <i className="hint">fără număr</i>} · {title.data} · {title.proiectant}
                  </dd>
                  <dt>Niveluri</dt>
                  <dd>
                    {preview.levels.map((l) => `${l.name} (${l.background ? (l.pxPerMeter ? 'plan DXF' : 'plan de calibrat') : 'pagină albă'})`).join(' · ')}
                  </dd>
                  <dt>Planșe</dt>
                  <dd>
                    <ul className="np-sheets">
                      {preview.sheets.map((s) => (
                        <li key={s.id}>
                          <span className="sheet-kind">{s.kind === 'bloc' ? '⊞' : '▭'}</span> <b>{s.nr}</b> {s.titlu}{' '}
                          <small>
                            ({s.format} {s.orientation === 'landscape' ? 'peisaj' : 'portret'}
                            {s.kind === 'plan' ? `, ${s.scara}` : ''})
                          </small>
                        </li>
                      ))}
                    </ul>
                  </dd>
                </dl>
              </>
            )}
          </section>
        </div>
        <footer className="modal-foot">
          <button onClick={() => (step === 0 ? onBack() : setStep(step - 1))}>← Înapoi</button>
          <span className="hint">
            Pasul {step + 1} din {STEPS.length}
          </span>
          <span className="spacer" />
          {step < STEPS.length - 1 && (
            <button onClick={finish} disabled={!valid} title="Creează proiectul cu ce ai completat până acum">
              Creează acum
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button className="primary" disabled={!canNext} onClick={() => setStep(step + 1)}>
              Înainte →
            </button>
          ) : (
            <button className="primary" onClick={finish} disabled={!valid}>
              Creează proiectul
            </button>
          )}
        </footer>
      </div>
      {busy && <div className="overlay" style={{ zIndex: 60 }}>{busy}</div>}
      {pdfPick && <PdfPagePicker doc={pdfPick.doc} fileName={pdfPick.fileName} onPick={pdfPick.resolve} />}
      {dxf && (
        <DxfImportDialog
          drawing={dxf.drawing}
          fileName={dxf.fileName}
          onCancel={() => setDxf(null)}
          onImport={(bg, ppm) => {
            setPlans((m) => ({ ...m, [dxf.levelId]: { bg, ppm } }))
            setDxf(null)
          }}
        />
      )}
    </div>
  )
}
