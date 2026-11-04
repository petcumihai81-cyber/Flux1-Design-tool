import { useState } from 'react'
import type { MemoriuData, Project, TitleBlock } from './types'
import { ZONE_FUNCTIONALE } from './memoriuDefaults'
import { exportMemoriu, missingCount } from './memoriu'

type MKey = Exclude<keyof MemoriuData, 'zoneFunctionale'>

function F({ label, value, onChange, area, placeholder }: { label: string; value: string; onChange: (v: string) => void; area?: boolean; placeholder?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {area ? (
        <textarea rows={2} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  )
}

export function MemoriuDialog({
  project,
  onChange,
  onClose,
  notify,
}: {
  project: Project
  onChange: (patch: Partial<Project>) => void
  onClose: () => void
  notify: (m: string) => void
}) {
  const m = project.memoriu
  const t = project.title
  const [busy, setBusy] = useState(false)
  const setM = (k: MKey) => (v: string) => onChange({ memoriu: { ...m, [k]: v } })
  const setT = (k: keyof TitleBlock) => (v: string) => onChange({ title: { ...t, [k]: v } })
  const missing = missingCount(project)

  const generate = async () => {
    setBusy(true)
    try {
      await exportMemoriu(project)
      notify('Memoriul tehnic a fost generat.')
    } catch (e) {
      console.error(e)
      notify('Eroare la generare: ' + (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <header className="modal-head">
          <b>Memoriu tehnic</b>
          <span className="hint">
            Datele obiectivului pentru documentația de avizare. Echipamentele, zonele, calculele și planșele se preiau automat din proiect.
          </span>
          <button className="close" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="modal-body memo">
          <section>
            <h4>Beneficiar și obiectiv</h4>
            <div className="row2">
              <F label="Beneficiar (denumire)" value={t.beneficiar} onChange={setT('beneficiar')} placeholder="S.C. ... S.R.L." />
              <F label="CUI" value={m.cui} onChange={setM('cui')} placeholder="RO..." />
            </div>
            <F label="Sediu social" value={m.sediuSocial} onChange={setM('sediuSocial')} />
            <F label="Adresa obiectivului" value={t.obiectiv} onChange={setT('obiectiv')} />
            <F label="Activitatea desfășurată" value={m.activitate} onChange={setM('activitate')} placeholder="ex. comerț cu autoturisme" />
            <div className="row2">
              <F label="Cod CAEN" value={m.caen} onChange={setM('caen')} />
              <F label="Denumire activitate CAEN" value={m.caenDenumire} onChange={setM('caenDenumire')} />
            </div>
            <div className="row2">
              <F label="Nr. proiect" value={t.nrProiect} onChange={setT('nrProiect')} />
              <F label="Data" value={t.data} onChange={setT('data')} />
            </div>

            <h4>II.1 Amplasament</h4>
            <div className="row2">
              <F label="Vecinătate N" value={m.vecinN} onChange={setM('vecinN')} />
              <F label="Vecinătate S" value={m.vecinS} onChange={setM('vecinS')} />
              <F label="Vecinătate E" value={m.vecinE} onChange={setM('vecinE')} />
              <F label="Vecinătate V" value={m.vecinV} onChange={setM('vecinV')} />
              <F label="Acces pietonal" value={m.accesPietonal} onChange={setM('accesPietonal')} />
              <F label="Acces auto" value={m.accesAuto} onChange={setM('accesAuto')} />
            </div>

            <h4>II.2 / II.4 Construcție</h4>
            <F label="Elementele privind construcția" value={m.constructie} onChange={setM('constructie')} area placeholder="Gol = „Nu se cunosc detalii despre elementele de construcție.”" />
            <F label="Elemente mecano-fizice existente" value={m.mecanoFizice} onChange={setM('mecanoFizice')} area placeholder="ex. ușă de acces și geamuri termopan, yală cu butuc" />
          </section>

          <section>
            <h4>II.3 Zone funcționale (HG 301/2012)</h4>
            <F label="Cerințe minimale (Anexa 1)" value={m.cerinteMinimale} onChange={setM('cerinteMinimale')} area />
            {ZONE_FUNCTIONALE.map((z, i) => (
              <F
                key={z}
                label={`${i + 1}. ${z}`}
                value={m.zoneFunctionale[i] ?? ''}
                onChange={(v) => {
                  const zf = [...m.zoneFunctionale]
                  zf[i] = v
                  onChange({ memoriu: { ...m, zoneFunctionale: zf } })
                }}
              />
            ))}

            <h4>II.5 / II.6 Alimentare și comunicații</h4>
            <F label="Circuite de consum" value={m.circuite} onChange={setM('circuite')} placeholder="ex. 5 circuite de consum (4 pentru prize și 1 pentru iluminat)" />
            <div className="row2">
              <F label="UPS" value={m.upsSursa} onChange={setM('upsSursa')} placeholder="pus la dispoziție de beneficiar / integrat în sistem" />
              <F label="Comunicator dispecerat" value={m.comunicator} onChange={setM('comunicator')} placeholder="GPRS / IP / dual path IP+GPRS" />
              <F label="Timp ieșire (s)" value={m.timpIesireS} onChange={setM('timpIesireS')} />
              <F label="Timp intrare (s)" value={m.timpIntrareS} onChange={setM('timpIntrareS')} />
            </div>

            <h4>Semnături</h4>
            <div className="row2">
              <F label="Director tehnic (avizat)" value={m.directorTehnic} onChange={setM('directorTehnic')} />
              <F label="Proiectant (nume)" value={m.proiectantNume} onChange={setM('proiectantNume')} />
            </div>
            <F label="Firma proiectantă" value={t.proiectant} onChange={setT('proiectant')} />
          </section>
        </div>
        <footer className="modal-foot">
          <span className={missing ? 'warn' : 'ok'}>
            {missing
              ? `${missing} câmpuri importante necompletate — vor apărea în document ca [DE COMPLETAT], marcate cu galben.`
              : 'Toate câmpurile principale sunt completate.'}
          </span>
          <span className="spacer" />
          <button className="primary" disabled={busy} onClick={generate}>
            {busy ? 'Se generează…' : 'Generează memoriul (.docx)'}
          </button>
        </footer>
      </div>
    </div>
  )
}
