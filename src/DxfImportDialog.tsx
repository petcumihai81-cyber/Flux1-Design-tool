import { useEffect, useMemo, useRef, useState } from 'react'
import type { Background } from './types'
import { UNIT_M, UNIT_NAMES, chooseResolution, drawingBounds, guessUnit, renderDxf, unitFromHeader } from './dxfImport'
import type { DxfDrawing, DxfUnit } from './dxfImport'

const fmtM = (v: number) => v.toFixed(1).replace('.', ',')

/** Alegerea straturilor și a unității pentru un plan DXF; rezultatul e un fundal deja calibrat */
export function DxfImportDialog({
  drawing,
  fileName,
  onCancel,
  onImport,
}: {
  drawing: DxfDrawing
  fileName: string
  onCancel: () => void
  onImport: (bg: Background, pxPerMeter: number) => void
}) {
  const [visible, setVisible] = useState<Set<string>>(() => new Set(drawing.layers.filter((l) => !l.off).map((l) => l.name)))
  const headerUnit = unitFromHeader(drawing.insunits)
  const [unit, setUnit] = useState<DxfUnit>(() => {
    if (headerUnit) return headerUnit
    const b = drawingBounds(drawing, new Set(drawing.layers.filter((l) => !l.off).map((l) => l.name)))
    return guessUnit(b ? Math.max(b.width, b.height) : 1)
  })
  const [colors, setColors] = useState(false)
  const [patterns, setPatterns] = useState(true)
  const [filter, setFilter] = useState('')
  const preview = useRef<HTMLDivElement>(null)

  const bounds = useMemo(() => drawingBounds(drawing, visible), [drawing, visible])
  const widthM = bounds ? bounds.width * UNIT_M[unit] : 0
  const heightM = bounds ? bounds.height * UNIT_M[unit] : 0
  const ppm = chooseResolution(widthM + 1, heightM + 1)

  // previzualizarea (rezoluție mică)
  useEffect(() => {
    const el = preview.current
    if (!el) return
    const t = setTimeout(() => {
      const r = renderDxf(drawing, { visible, unitM: UNIT_M[unit], ppm, colors, patterns }, 1400)
      el.innerHTML = ''
      if (r) {
        r.canvas.style.maxWidth = '100%'
        r.canvas.style.maxHeight = '100%'
        el.appendChild(r.canvas)
      }
    }, 60)
    return () => clearTimeout(t)
  }, [drawing, visible, unit, ppm, colors, patterns])

  const toggle = (name: string) =>
    setVisible((v) => {
      const n = new Set(v)
      if (n.has(name)) n.delete(name)
      else n.add(name)
      return n
    })
  const shown = drawing.layers.filter((l) => l.name.toLowerCase().includes(filter.toLowerCase()))
  const skipped = Object.entries(drawing.skipped)
  const tooBig = widthM > 2000 || heightM > 2000
  const tooSmall = Math.max(widthM, heightM) < 2

  const doImport = () => {
    const r = renderDxf(drawing, { visible, unitM: UNIT_M[unit], ppm, colors, patterns })
    if (!r) return
    // rezoluția reală (poate fi redusă de limita de mărime)
    const realPpm = r.k / UNIT_M[unit]
    onImport(
      { src: r.canvas.toDataURL('image/png'), width: r.canvas.width, height: r.canvas.height, name: `${fileName} (DXF, ${UNIT_NAMES[unit]})` },
      realPpm,
    )
  }

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal dxf-import">
        <header className="modal-head">
          <b>Import plan DXF</b>
          <span className="hint">{fileName}</span>
          <button className="close" onClick={onCancel}>
            ×
          </button>
        </header>
        <div className="modal-body">
          <aside className="dxf-side">
            <label className="field">
              <span>Unitatea desenului</span>
              <select value={unit} onChange={(e) => setUnit(e.target.value as DxfUnit)}>
                {(Object.keys(UNIT_M) as DxfUnit[]).map((u) => (
                  <option key={u} value={u}>
                    {UNIT_NAMES[u]}
                    {u === headerUnit ? ' (din fișier)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <p className={tooBig || tooSmall ? 'warn' : 'hint'}>
              {bounds ? (
                <>
                  Desenul are <b>{fmtM(widthM)} × {fmtM(heightM)} m</b>
                  {!headerUnit && ' (unitatea nu e scrisă în fișier: am ghicit-o după mărime — verifică)'}.
                  {tooBig && ' Prea mare pentru o clădire: probabil unitatea e greșită sau un strat are elemente rătăcite departe — debifează-l.'}
                  {tooSmall && ' Prea mic: probabil unitatea e greșită.'}
                </>
              ) : (
                'Niciun strat vizibil.'
              )}
            </p>
            <label className="check">
              <input type="checkbox" checked={colors} onChange={(e) => setColors(e.target.checked)} />
              Culorile din DXF (altfel gri, ca simbolurile să iasă în evidență)
            </label>
            <label className="check">
              <input type="checkbox" checked={patterns} onChange={(e) => setPatterns(e.target.checked)} />
              Hașuri (pereți, zone) ca nuanță ușoară
            </label>
            <div className="dxf-layers-head">
              <b>Straturi ({drawing.layers.length})</b>
              <button onClick={() => setVisible(new Set(drawing.layers.map((l) => l.name)))}>Toate</button>
              <button onClick={() => setVisible(new Set())}>Niciunul</button>
            </div>
            {drawing.layers.length > 12 && <input placeholder="Caută strat…" value={filter} onChange={(e) => setFilter(e.target.value)} />}
            <div className="dxf-layers">
              {shown.map((l) => (
                <label key={l.name} className="check" title={`${l.count} elemente${l.off ? ' · oprit în fișier' : ''}`}>
                  <input type="checkbox" checked={visible.has(l.name)} onChange={() => toggle(l.name)} />
                  <i style={{ background: l.color === '#000000' ? '#333' : l.color }} />
                  <span className={l.off ? 'muted' : ''}>{l.name}</span>
                  <small>{l.count}</small>
                </label>
              ))}
            </div>
            {skipped.length > 0 && (
              <p className="hint">Ignorate: {skipped.map(([t, n]) => `${t} (${n})`).join(', ')}.</p>
            )}
          </aside>
          <div className="dxf-preview" ref={preview} />
        </div>
        <footer className="modal-foot">
          <span className="hint">
            Planul se încarcă la {ppm} px/m, cu scara deja calibrată. Debifează straturile de care nu ai nevoie (mobilier, cote, hașuri, cartuș).
          </span>
          <span className="spacer" />
          <button onClick={onCancel}>Renunță</button>
          <button className="primary" onClick={doImport} disabled={!bounds}>
            Încarcă planul
          </button>
        </footer>
      </div>
    </div>
  )
}
