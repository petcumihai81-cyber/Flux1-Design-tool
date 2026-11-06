import { useState } from 'react'
import type { Project } from './types'

export interface PackOpts {
  pdf: boolean
  excel: boolean
  dxf: boolean
  drawio: boolean
  memoriu: boolean
}

const KEY = 'plansa-securitate:pachet'

const load = (): PackOpts => {
  const d = { pdf: false, excel: false, dxf: false, drawio: false, memoriu: false }
  try {
    return { ...d, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return d
  }
}

/** „Salvează ca pachet .zip”: proiectul cu fișierele lui și, opțional, documentele de predare */
export function PackageDialog({ project, onSave, onClose }: { project: Project; onSave: (o: PackOpts) => void; onClose: () => void }) {
  const [o, setO] = useState<PackOpts>(load)
  const plans = project.sheets.filter((s) => s.kind === 'plan').length
  const bgs = project.levels.filter((l) => l.background).length
  const imgs = project.arch.filter((a) => a.kind === 'image' && a.src).length
  const syms = project.customSymbols?.length ?? 0
  const item = (k: keyof PackOpts, label: string, hint: string) => (
    <label className="check pk-item">
      <input type="checkbox" checked={o[k]} onChange={(e) => setO({ ...o, [k]: e.target.checked })} />
      <span>
        <b>{label}</b> <small className="hint">{hint}</small>
      </span>
    </label>
  )
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(o))
    } catch {
      /* fără memorie: opțiunile nu se rețin */
    }
    onSave(o)
  }

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal pack-dialog">
        <header className="modal-head">
          <b>Salvează ca pachet .zip</b>
          <span className="hint">tot proiectul într-un singur fișier</span>
          <button className="close" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="pk-body">
          <p>
            Intră întotdeauna: proiectul (<code>proiect.plansa.json</code>), planurile de fundal ({bgs}), imaginile de pe planșe ({imgs}), simbolurile
            personalizate ({syms}) și logo-ul, ca fișiere separate (PNG / JPG / SVG). Pachetul se redeschide cu <b>Deschide</b>.
          </p>
          <h4>Documente pentru predare (în folderul „predare”)</h4>
          {item('pdf', 'PDF cu toate planșele', `${project.sheets.length} planșe`)}
          {item('dxf', 'DXF', `câte un fișier pe planșă de plan (${plans})`)}
          {item('excel', 'Excel', 'liste de echipamente, zone, jurnal de cabluri')}
          {item('drawio', 'draw.io', 'schemele bloc')}
          {item('memoriu', 'Memoriul tehnic .docx', '')}
        </div>
        <footer className="modal-foot">
          <span className="spacer" />
          <button onClick={onClose}>Renunță</button>
          <button className="primary" onClick={save}>
            Salvează pachetul
          </button>
        </footer>
      </div>
    </div>
  )
}
