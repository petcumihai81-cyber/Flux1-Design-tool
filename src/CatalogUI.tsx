import { useMemo, useState } from 'react'
import type { CatalogItem, Project, SpecRow, SystemId } from './types'
import { SYMBOLS, SYSTEMS, symbolByType, symbolDataUrl, systemById } from './symbols'
import { ACCESSORY_KINDS, SEED_CATALOG, isAccessory, itemSystem, kindName, newCatalogItem, parseSpecs, saveDefaultCatalog } from './catalog'
import { batteryCalc, fmt, poeCalc, powerCalc, storageCalc } from './calc'
import { uid } from './project'

// ------------------------------------------------------------------ câmpuri numerice

function NumField({ label, value, onChange, unit }: { label: string; value?: number; onChange: (v: number | undefined) => void; unit?: string }) {
  return (
    <label className="field">
      <span>
        {label}
        {unit ? ` [${unit}]` : ''}
      </span>
      <input
        type="number"
        step="any"
        value={value ?? ''}
        placeholder="—"
        onChange={(e) => {
          const v = parseFloat(e.target.value.replace(',', '.'))
          onChange(Number.isNaN(v) ? undefined : v)
        }}
      />
    </label>
  )
}

function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

// ------------------------------------------------------------------ dialog catalog

export function CatalogDialog({
  project,
  onChange,
  onClose,
  notify,
}: {
  project: Project
  onChange: (catalog: CatalogItem[]) => void
  onClose: () => void
  notify: (m: string) => void
}) {
  const catalog = project.catalog
  const [selId, setSelId] = useState<string | null>(catalog[0]?.id ?? null)
  const [q, setQ] = useState('')
  const [newType, setNewType] = useState('efr_pir')
  const sel = catalog.find((c) => c.id === selId)
  const used = useMemo(() => {
    const m = new Map<string, number>()
    for (const d of project.devices) if (d.catalogId) m.set(d.catalogId, (m.get(d.catalogId) ?? 0) + 1)
    for (const a of project.accessories) m.set(a.catalogId, (m.get(a.catalogId) ?? 0) + a.qty)
    return m
  }, [project.devices, project.accessories])

  const patch = (p: Partial<CatalogItem>) => sel && onChange(catalog.map((c) => (c.id === sel.id ? { ...c, ...p } : c)))
  const query = q.trim().toLowerCase()

  const add = () => {
    const sys = symbolByType(newType)?.system ?? 'EFR'
    const it = { ...newCatalogItem(newType, sys), denumire: 'Echipament nou', prefix: '' }
    onChange([...catalog, it])
    setSelId(it.id)
  }

  const importJson = async (f: File) => {
    try {
      const v = JSON.parse(await f.text())
      const items: CatalogItem[] = Array.isArray(v) ? v : v.catalog
      if (!Array.isArray(items)) throw new Error('format necunoscut')
      const ids = new Set(catalog.map((c) => c.id))
      const fresh = items.filter((i) => i && typeof i.type === 'string' && !ids.has(i.id))
      onChange([...catalog, ...fresh])
      notify(`Importate ${fresh.length} echipamente (${items.length - fresh.length} existau deja).`)
    } catch (e) {
      notify('Import eșuat: ' + (e as Error).message)
    }
  }

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(catalog, null, 1)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'catalog-echipamente.json'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const remove = () => {
    if (!sel) return
    if (used.get(sel.id) && !window.confirm('Echipamentul e folosit în proiect. Îl ștergi oricum din catalog?')) return
    onChange(catalog.filter((c) => c.id !== sel.id))
    setSelId(null)
  }

  const groups = [
    ...SYSTEMS.map((s) => ({ id: s.id, name: s.name, color: s.color })),
  ]

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <header className="modal-head">
          <b>Catalog echipamente</b>
          <span className="hint">Modelele folosite în proiect, cu datele necesare calculelor. Câmpurile goale = de completat.</span>
          <button className="close" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="modal-body cat">
          <div className="cat-list">
            <input className="search" placeholder="Caută model, producător…" value={q} onChange={(e) => setQ(e.target.value)} />
            {groups.map((g) => {
              const items = catalog.filter(
                (c) =>
                  itemSystem(c) === g.id &&
                  (!query || `${c.denumire} ${c.model} ${c.producator} ${c.prefix}`.toLowerCase().includes(query)),
              )
              if (!items.length) return null
              return (
                <section key={g.id}>
                  <div className="cat-group" style={{ borderColor: g.color }}>
                    {g.name}
                  </div>
                  {items.map((c) => {
                    const def = symbolByType(c.type)
                    return (
                      <button key={c.id} className={'cat-item' + (c.id === selId ? ' on' : '')} onClick={() => setSelId(c.id)}>
                        {def ? <img src={symbolDataUrl(def)} alt="" /> : <span className="acc-ico">{kindName(c.type).slice(0, 3)}</span>}
                        <span>
                          <b>{c.model || '(fără model)'}</b>
                          <small>
                            {c.producator} · {kindName(c.type)}
                            {used.get(c.id) ? ` · folosit ${used.get(c.id)}×` : ''}
                          </small>
                        </span>
                      </button>
                    )
                  })}
                </section>
              )
            })}
          </div>

          <div className="cat-form">
            {sel ? (
              <>
                <div className="row2">
                  <label className="field">
                    <span>Tip / simbol</span>
                    <select value={sel.type} onChange={(e) => patch({ type: e.target.value, system: symbolByType(e.target.value)?.system ?? sel.system })}>
                      {SYSTEMS.map((s) => (
                        <optgroup key={s.id} label={s.name}>
                          {SYMBOLS.filter((x) => x.system === s.id).map((x) => (
                            <option key={x.type} value={x.type}>
                              {x.prefix} – {x.name}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                      <optgroup label="Accesorii (fără simbol pe plan)">
                        {ACCESSORY_KINDS.map((k) => (
                          <option key={k.type} value={k.type}>
                            {k.name}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </label>
                  {isAccessory(sel.type) ? (
                    <label className="field">
                      <span>Sistem</span>
                      <select value={sel.system} onChange={(e) => patch({ system: e.target.value as SystemId })}>
                        {SYSTEMS.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <TextField label="Prefix simbol" value={sel.prefix} placeholder={symbolByType(sel.type)?.prefix} onChange={(v) => patch({ prefix: v })} />
                  )}
                </div>
                <TextField label="Denumire (în liste)" value={sel.denumire} onChange={(v) => patch({ denumire: v })} />
                <div className="row2">
                  <TextField label="Model" value={sel.model} onChange={(v) => patch({ model: v })} />
                  <TextField label="Producător" value={sel.producator} onChange={(v) => patch({ producator: v })} />
                </div>
                <div className="checks">
                  <label className="check">
                    <input type="checkbox" checked={sel.baterie} onChange={(e) => patch({ baterie: e.target.checked })} />
                    Baterie proprie (wireless) — exclus din calculul acumulatorilor
                  </label>
                  <label className="check">
                    <input type="checkbox" checked={sel.poe} onChange={(e) => patch({ poe: e.target.checked })} />
                    Alimentat prin PoE
                  </label>
                </div>
                <h4>Date tehnice</h4>
                <div className="grid3">
                  <NumField label="Tensiune" unit="V" value={sel.tensiuneV} onChange={(v) => patch({ tensiuneV: v })} />
                  <NumField label="I veghe" unit="mA" value={sel.iVegheMa} onChange={(v) => patch({ iVegheMa: v })} />
                  <NumField label="I alarmă" unit="mA" value={sel.iAlarmaMa} onChange={(v) => patch({ iAlarmaMa: v })} />
                  <NumField label="Putere" unit="W" value={sel.putereW} onChange={(v) => patch({ putereW: v })} />
                  <NumField label="Consum PoE" unit="W" value={sel.poeW} onChange={(v) => patch({ poeW: v })} />
                  <NumField label="Buget PoE (switch)" unit="W" value={sel.poeBugetW} onChange={(v) => patch({ poeBugetW: v })} />
                  {(symbolByType(sel.type)?.camera || sel.bitrateKbps != null) && (
                    <>
                      <NumField label="Bitrate" unit="kbps" value={sel.bitrateKbps} onChange={(v) => patch({ bitrateKbps: v })} />
                      <NumField label="Unghi vizualizare (orizontal)" unit="°" value={sel.fovDeg} onChange={(v) => patch({ fovDeg: v })} />
                      <NumField label="Distanță utilă (con)" unit="m" value={sel.rangeM} onChange={(v) => patch({ rangeM: v })} />
                    </>
                  )}
                  {(sel.type === 'acc_acumulator' || sel.capacitateAh != null) && (
                    <NumField label="Capacitate" unit="Ah" value={sel.capacitateAh} onChange={(v) => patch({ capacitateAh: v })} />
                  )}
                  {(sel.type === 'acc_hdd' || sel.capacitateTB != null) && (
                    <NumField label="Capacitate" unit="TB" value={sel.capacitateTB} onChange={(v) => patch({ capacitateTB: v })} />
                  )}
                  {(sel.type === 'acc_ups' || sel.upsVA != null) && (
                    <>
                      <NumField label="Putere aparentă" unit="VA" value={sel.upsVA} onChange={(v) => patch({ upsVA: v })} />
                      <NumField label="Putere activă" unit="W" value={sel.upsW} onChange={(v) => patch({ upsW: v })} />
                      <NumField label="Energie baterii" unit="Wh" value={sel.upsWh} onChange={(v) => patch({ upsWh: v })} />
                    </>
                  )}
                </div>
                <label className="field">
                  <span>Note (alimentare, autonomie etc.)</span>
                  <textarea rows={2} value={sel.note} onChange={(e) => patch({ note: e.target.value })} />
                </label>
                <SpecsEditor key={sel.id} specs={sel.specs ?? []} onChange={(specs) => patch({ specs })} />
                <div className="inline">
                  <button
                    onClick={() => {
                      const copy = { ...sel, id: uid(), model: sel.model + ' (copie)' }
                      onChange([...catalog, copy])
                      setSelId(copy.id)
                    }}
                  >
                    Duplică
                  </button>
                  <button className="danger" onClick={remove}>
                    Șterge din catalog
                  </button>
                </div>
              </>
            ) : (
              <p className="hint">Selectează un echipament din listă sau adaugă unul nou.</p>
            )}
          </div>
        </div>
        <footer className="modal-foot">
          <select value={newType} onChange={(e) => setNewType(e.target.value)}>
            {SYSTEMS.map((s) => (
              <optgroup key={s.id} label={s.name}>
                {SYMBOLS.filter((x) => x.system === s.id).map((x) => (
                  <option key={x.type} value={x.type}>
                    {x.prefix} – {x.name}
                  </option>
                ))}
              </optgroup>
            ))}
            <optgroup label="Accesorii">
              {ACCESSORY_KINDS.map((k) => (
                <option key={k.type} value={k.type}>
                  {k.name}
                </option>
              ))}
            </optgroup>
          </select>
          <button className="primary" onClick={add}>
            + Adaugă
          </button>
          <span className="spacer" />
          <label className="btn-like">
            Import
            <input
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) importJson(f)
              }}
            />
          </label>
          <button onClick={exportJson}>Export</button>
          <button
            onClick={() => notify(saveDefaultCatalog(catalog) ? 'Catalog salvat ca implicit pentru proiectele noi.' : 'Nu am putut salva catalogul.')}
            title="Proiectele noi vor porni cu acest catalog"
          >
            Salvează ca implicit
          </button>
          <button
            onClick={() => {
              const ids = new Set(catalog.map((c) => c.id))
              const missing = SEED_CATALOG.filter((s) => !ids.has(s.id))
              onChange([...catalog, ...missing.map((m) => ({ ...m }))])
              notify(`Adăugate ${missing.length} echipamente din catalogul inițial.`)
            }}
            title="Readaugă echipamentele din catalogul inițial care lipsesc"
          >
            + Catalog inițial
          </button>
        </footer>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ fișa tehnică

function SpecsEditor({ specs, onChange }: { specs: SpecRow[]; onChange: (s: SpecRow[]) => void }) {
  const [paste, setPaste] = useState<string | null>(null)
  const set = (i: number, row: SpecRow) => onChange(specs.map((r, j) => (j === i ? row : r)))
  const move = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= specs.length) return
    const next = [...specs]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  const nParams = specs.filter((r) => 'label' in r).length
  return (
    <div className="specs">
      <h4>
        Fișa tehnică (memoriu) <span className="hint">· {nParams} parametri</span>
      </h4>
      {specs.length === 0 && (
        <p className="hint">Fără fișă completă: în memoriu apar doar datele de mai sus. Lipește tabelul din fișa producătorului sau adaugă rânduri.</p>
      )}
      <div className="spec-rows">
        {specs.map((r, i) =>
          'section' in r ? (
            <div key={i} className="spec-row section">
              <input value={r.section} onChange={(e) => set(i, { section: e.target.value })} placeholder="Titlu secțiune" />
              <span className="spec-tools">
                <button title="Sus" onClick={() => move(i, -1)}>↑</button>
                <button title="Jos" onClick={() => move(i, 1)}>↓</button>
                <button title="Șterge" onClick={() => onChange(specs.filter((_, j) => j !== i))}>×</button>
              </span>
            </div>
          ) : (
            <div key={i} className="spec-row">
              <input value={r.label} onChange={(e) => set(i, { ...r, label: e.target.value })} placeholder="Parametru" />
              <input value={r.value} onChange={(e) => set(i, { ...r, value: e.target.value })} placeholder="Valoare" />
              <span className="spec-tools">
                <button title="Sus" onClick={() => move(i, -1)}>↑</button>
                <button title="Jos" onClick={() => move(i, 1)}>↓</button>
                <button title="Șterge" onClick={() => onChange(specs.filter((_, j) => j !== i))}>×</button>
              </span>
            </div>
          ),
        )}
      </div>
      <div className="inline">
        <button onClick={() => onChange([...specs, { section: 'Secțiune nouă' }])}>+ Secțiune</button>
        <button onClick={() => onChange([...specs, { label: '', value: '' }])}>+ Parametru</button>
        <button onClick={() => setPaste(paste == null ? '' : null)}>{paste == null ? 'Lipește din fișa producătorului…' : 'Renunță'}</button>
        {specs.length > 0 && (
          <button className="danger" onClick={() => window.confirm('Ștergi toată fișa tehnică a acestui echipament?') && onChange([])}>
            Golește
          </button>
        )}
      </div>
      {paste != null && (
        <div className="spec-paste">
          <textarea
            rows={8}
            autoFocus
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder={'Copiază tabelul din fișa producătorului (site sau PDF) și lipește-l aici.\nFormat: „Parametru<TAB>Valoare” sau „Parametru: Valoare”; rândurile fără valoare devin titluri de secțiune.'}
          />
          <div className="inline">
            <span className="hint">{parseSpecs(paste).length} rânduri recunoscute</span>
            <button
              className="primary"
              disabled={!paste.trim()}
              onClick={() => {
                onChange([...specs, ...parseSpecs(paste)])
                setPaste(null)
              }}
            >
              Adaugă la fișă
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ panou calcule

function Status({ ok, children }: { ok: boolean | null; children: React.ReactNode }) {
  return <div className={'status ' + (ok == null ? 'neutral' : ok ? 'good' : 'bad')}>{children}</div>
}

export function CalcPanel({ project, onChange, onOpenCatalog }: { project: Project; onChange: (patch: Partial<Project>) => void; onOpenCatalog: () => void }) {
  const c = project.calc
  const setCalc = (patch: Partial<typeof c>) => onChange({ calc: { ...c, ...patch } })
  const accItems = project.catalog.filter((i) => isAccessory(i.type))
  const [accSel, setAccSel] = useState('')

  const efr = batteryCalc(project, 'EFR')
  const inc = batteryCalc(project, 'INC')
  const st = storageCalc(project)
  const pw = powerCalc(project, 'CCTV')
  const poe = poeCalc(project)

  const Battery = ({ b, title }: { b: ReturnType<typeof batteryCalc>; title: string }) =>
    b.rows.length || b.wireless || b.missing.length ? (
      <section className="calc">
        <h4>{title}</h4>
        <table>
          <thead>
            <tr>
              <th>Componentă</th>
              <th>buc</th>
              <th>Iv</th>
              <th>Ia</th>
            </tr>
          </thead>
          <tbody>
            {b.rows.map((r) => (
              <tr key={r.key}>
                <td>{r.denumire}</td>
                <td className="num">{r.qty}</td>
                <td className="num">{fmt(r.iv * r.qty)}</td>
                <td className="num">{fmt(r.ia * r.qty)}</td>
              </tr>
            ))}
            <tr className="total">
              <td>TOTAL [mA]</td>
              <td />
              <td className="num">{fmt(b.totalIv)}</td>
              <td className="num">{fmt(b.totalIa)}</td>
            </tr>
          </tbody>
        </table>
        {b.wireless > 0 && <p className="hint">{b.wireless} echipamente cu baterie proprie (excluse).</p>}
        {b.missing.length > 0 && <p className="warn">Fără date de consum: {b.missing.join(', ')}</p>}
        <p className="formula">
          n = ({fmt(b.totalIv)}·{c.tVegheH} + {fmt(b.totalIa)}·{c.tAlarmaH}) / ({c.factorAcumulator}·{fmt(b.capacitateMah, 0)}) = <b>{fmt(b.n, 3)}</b>
        </p>
        <Status ok={b.acumulator ? true : null}>
          N = [n] + 1 = <b>{b.N}</b> acumulator{b.N > 1 ? 'i' : ''} {b.acumulator ? `${b.acumulator.model} (${b.acumulator.capacitateAh} Ah)` : '(7 Ah implicit — adaugă acumulatorul la accesorii)'}
        </Status>
      </section>
    ) : null

  return (
    <div className="props calcs">
      <section className="calc">
        <h4>Accesorii (fără simbol pe plan)</h4>
        {project.accessories.map((a) => {
          const it = project.catalog.find((i) => i.id === a.catalogId)
          return (
            <div key={a.id} className="acc-row">
              <span title={it?.denumire}>
                <small style={{ color: it ? systemById(it.system).color : undefined }}>{it ? kindName(it.type) : '?'}</small> {it?.model ?? '(șters din catalog)'}
              </span>
              <input
                type="number"
                min={1}
                value={a.qty}
                onChange={(e) =>
                  onChange({ accessories: project.accessories.map((x) => (x.id === a.id ? { ...x, qty: Math.max(1, parseInt(e.target.value, 10) || 1) } : x)) })
                }
              />
              <button className="x" title="Elimină" onClick={() => onChange({ accessories: project.accessories.filter((x) => x.id !== a.id) })}>
                ×
              </button>
            </div>
          )
        })}
        <div className="inline">
          <select value={accSel} onChange={(e) => setAccSel(e.target.value)}>
            <option value="">Alege din catalog…</option>
            {accItems.map((i) => (
              <option key={i.id} value={i.id}>
                {kindName(i.type)}: {i.model} ({systemById(i.system).short})
              </option>
            ))}
          </select>
          <button
            disabled={!accSel}
            onClick={() => {
              onChange({ accessories: [...project.accessories, { id: uid(), catalogId: accSel, qty: 1 }] })
              setAccSel('')
            }}
          >
            Adaugă
          </button>
        </div>
        <button onClick={onOpenCatalog}>Deschide catalogul…</button>
      </section>

      <Battery b={efr} title="Acumulatori — efracție" />
      <Battery b={inc} title="Acumulatori — incendiu" />

      {st.cameras > 0 && (
        <section className="calc">
          <h4>Stocare video</h4>
          <table>
            <tbody>
              {st.rows.map((r) => (
                <tr key={r.key}>
                  <td>{r.denumire}</td>
                  <td className="num">{r.qty}×</td>
                  <td className="num">{r.bitrate} kbps</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="formula">
            C = BR·3600·24·{c.zileStocare} / (8·1024²) = <b>{fmt(st.gbContinuu, 0)} GB</b> (≈ {fmt(st.tbContinuu, 1)} TB) continuu; la detecție ({fmt(c.factorActivitate * 100, 0)}%):{' '}
            {fmt(st.gbDetectie, 0)} GB (≈ {fmt(st.tbDetectie, 1)} TB)
          </p>
          <Status ok={st.hdds.length ? st.tbInstalat >= st.tbContinuu : null}>
            {st.hdds.length
              ? `Instalat: ${st.hdds.map((h) => `${h.qty}× ${h.tb} TB`).join(' + ')} = ${fmt(st.tbInstalat, 1)} TB ${st.tbInstalat >= st.tbContinuu ? '≥' : '<'} ${fmt(st.tbContinuu, 1)} TB necesar`
              : 'Adaugă HDD-urile la accesorii pentru verificare.'}
          </Status>
        </section>
      )}

      {(pw.rows.length > 0 || pw.missing.length > 0) && (
        <section className="calc">
          <h4>Calcul energetic TVCI / UPS</h4>
          <table>
            <tbody>
              {pw.rows.map((r) => (
                <tr key={r.key}>
                  <td>{r.denumire}</td>
                  <td className="num">{r.qty}×</td>
                  <td className="num">{fmt(r.w * r.qty)} W</td>
                </tr>
              ))}
              <tr className="total">
                <td>TOTAL</td>
                <td />
                <td className="num">{fmt(pw.totalW)} W</td>
              </tr>
            </tbody>
          </table>
          {pw.poeExcluded > 0 && <p className="hint">{pw.poeExcluded} echipamente alimentate PoE prin switch (incluse în consumul switch-ului).</p>}
          {pw.missing.length > 0 && <p className="warn">Fără putere: {pw.missing.join(', ')}</p>}
          <p className="formula">
            PA = P / cosφ = {fmt(pw.totalW)} / {c.cosPhi} = <b>{fmt(pw.vaNecesar, 0)} VA</b>
          </p>
          <Status ok={pw.ups ? (pw.ups.upsVA ?? 0) >= pw.vaNecesar && (pw.autonomieMin ?? 0) >= c.autonomieMinimaMin : null}>
            {pw.ups
              ? `UPS ${pw.ups.model}: ${pw.ups.upsVA ?? '?'} VA; autonomie estimată ${pw.autonomieMin != null ? fmt(pw.autonomieMin, 0) + ' min' : '? (lipsește Wh)'} (minim ${c.autonomieMinimaMin} min)`
              : 'Adaugă UPS-ul la accesorii pentru verificare.'}
          </Status>
        </section>
      )}

      {(poe.consumatori > 0 || poe.switches.length > 0) && (
        <section className="calc">
          <h4>Buget PoE</h4>
          <p className="formula">
            Consum PoE: {poe.consumatori} echipamente = <b>{fmt(poe.consumW)} W</b> (+20% rezervă = {fmt(poe.consumW * 1.2)} W)
          </p>
          {poe.missing.length > 0 && <p className="warn">Fără consum PoE: {poe.missing.join(', ')}</p>}
          <Status ok={poe.switches.length ? poe.bugetW >= poe.consumW * 1.2 : null}>
            {poe.switches.length
              ? `Buget switch: ${poe.switches.map((s) => `${s.label} ${s.buget} W`).join(', ')} = ${fmt(poe.bugetW)} W`
              : 'Niciun switch cu buget PoE în proiect.'}
          </Status>
        </section>
      )}

      <section className="calc">
        <h4>Parametri</h4>
        <div className="grid2">
          <NumField label="t veghe" unit="h" value={c.tVegheH} onChange={(v) => setCalc({ tVegheH: v ?? 23.5 })} />
          <NumField label="t alarmă" unit="h" value={c.tAlarmaH} onChange={(v) => setCalc({ tAlarmaH: v ?? 0.5 })} />
          <NumField label="Factor acumulator" value={c.factorAcumulator} onChange={(v) => setCalc({ factorAcumulator: v ?? 0.86 })} />
          <NumField label="Zile stocare" value={c.zileStocare} onChange={(v) => setCalc({ zileStocare: v ?? 30 })} />
          <NumField label="Bitrate implicit" unit="kbps" value={c.bitrateImplicitKbps} onChange={(v) => setCalc({ bitrateImplicitKbps: v ?? 4096 })} />
          <NumField label="Activitate detecție" unit="0–1" value={c.factorActivitate} onChange={(v) => setCalc({ factorActivitate: v ?? 0.3 })} />
          <NumField label="cos φ UPS" value={c.cosPhi} onChange={(v) => setCalc({ cosPhi: v ?? 0.8 })} />
          <NumField label="Randament UPS" value={c.randamentUps} onChange={(v) => setCalc({ randamentUps: v ?? 0.85 })} />
          <NumField label="Autonomie minimă" unit="min" value={c.autonomieMinimaMin} onChange={(v) => setCalc({ autonomieMinimaMin: v ?? 15 })} />
        </div>
        <p className="hint">Autonomia UPS e o estimare (Wh · randament / P); valoarea exactă se ia din curba de descărcare a producătorului.</p>
      </section>
    </div>
  )
}
