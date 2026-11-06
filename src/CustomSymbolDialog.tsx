import { useEffect, useRef, useState } from 'react'
import type { CustomSymbol } from './types'
import { SYMBOLS, SYSTEMS, symbolByType, systemById } from './symbols'
import { normalizeRaster, normalizeSvg, recolorSvg, svgColorCount, tintRaster } from './symbolLibrary'
import { uid } from './project'
import { askConfirm } from './dialogs'

const ACCEPT = '.svg,.png,.ico,.jpg,.jpeg,.webp,.gif,.bmp,image/svg+xml,image/png,image/x-icon,image/jpeg,image/webp,image/gif'

const readText = (f: File) => f.text()
const readUrl = (f: File) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result as string)
    r.onerror = () => rej(r.error)
    r.readAsDataURL(f)
  })

/** Încărcarea / editarea unui simbol personalizat */
export function CustomSymbolDialog({
  existing,
  usedBy,
  onSave,
  onDelete,
  onClose,
}: {
  existing?: CustomSymbol
  /** Câte echipamente folosesc simbolul (la ștergere revin la simbolul standard) */
  usedBy: number
  onSave: (sym: CustomSymbol, keepInLibrary: boolean) => void
  onDelete?: () => void
  onClose: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [kind, setKind] = useState<'svg' | 'img' | null>(existing?.kind ?? null)
  /** Imaginea originală (pentru reprocesare la schimbarea opțiunilor) */
  const [rawSrc, setRawSrc] = useState<string | null>(existing?.kind === 'img' ? existing.data : null)
  const [data, setData] = useState<string>(existing?.data ?? '')
  const [name, setName] = useState(existing?.name ?? '')
  const [base, setBase] = useState(existing?.base ?? 'cctv_dome_int')
  const [prefix, setPrefix] = useState(existing?.prefix ?? '')
  const [recolor, setRecolor] = useState(existing?.recolor ?? true)
  const [whiteToAlpha, setWhiteToAlpha] = useState(false)
  const [keep, setKeep] = useState(true)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [preview, setPreview] = useState('')
  const def = symbolByType(base)!
  const color = systemById(def.system).color

  const loadFile = async (f: File) => {
    setError('')
    setInfo('')
    try {
      const isSvg = f.type === 'image/svg+xml' || f.name.toLowerCase().endsWith('.svg')
      if (!name) setName(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '))
      if (isSvg) {
        const svg = normalizeSvg(await readText(f))
        const colors = svgColorCount(svg)
        setKind('svg')
        setData(svg)
        setRawSrc(null)
        setRecolor(colors <= 1)
        setInfo(colors <= 1 ? 'SVG de o singură culoare: se poate recolora.' : `SVG cu ${colors} culori: recolorarea le face pe toate de aceeași culoare.`)
      } else {
        const src = await readUrl(f)
        const jpg = /jpe?g|bmp/i.test(f.type) || /\.(jpe?g|bmp)$/i.test(f.name)
        const r = await normalizeRaster(src, jpg)
        setKind('img')
        setRawSrc(src)
        setWhiteToAlpha(jpg || !r.hadAlpha)
        const r2 = jpg || r.hadAlpha ? r : await normalizeRaster(src, true)
        setData(r2.data)
        setRecolor(r2.monochrome)
        setInfo(
          (r.hadAlpha ? 'Imagine cu transparență.' : 'Imaginea nu avea transparență: fundalul alb a fost făcut transparent.') +
            (r2.monochrome ? ' Pare pictogramă de o singură culoare: se poate recolora.' : ' Are mai multe culori: se folosește cu culorile ei.'),
        )
      }
    } catch (err) {
      setError((err as Error).message)
    }
  }

  // reprocesare la schimbarea opțiunii „fundal alb → transparent”
  useEffect(() => {
    if (kind !== 'img' || !rawSrc) return
    let stop = false
    normalizeRaster(rawSrc, whiteToAlpha)
      .then((r) => !stop && setData(r.data))
      .catch((e) => !stop && setError(e.message))
    return () => {
      stop = true
    }
  }, [whiteToAlpha, rawSrc, kind])

  // previzualizarea în culoarea sistemului
  useEffect(() => {
    if (!data) return setPreview('')
    let stop = false
    const svgUrl = (svg: string) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
    if (kind === 'svg') setPreview(svgUrl(recolor ? recolorSvg(data, color) : data))
    else if (recolor) tintRaster(data, color).then((u) => !stop && setPreview(u))
    else setPreview(data)
    return () => {
      stop = true
    }
  }, [data, kind, recolor, color])

  const save = () => {
    if (!kind || !data) return setError('Alege întâi un fișier.')
    if (!name.trim()) return setError('Scrie o denumire.')
    onSave({ id: existing?.id ?? uid(), name: name.trim(), base, prefix: prefix.trim().toUpperCase(), kind, data, recolor }, keep)
  }

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal sym-dialog">
        <header className="modal-head">
          <b>{existing ? 'Simbol personalizat' : 'Încarcă simbol personalizat'}</b>
          <span className="hint">SVG (recomandat, se poate recolora), PNG, ICO, JPG, WebP</span>
          <button className="close" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="modal-body sym-body">
          <div className="sym-preview">
            {preview ? (
              <>
                <div className="sym-check big">
                  <img src={preview} alt="" />
                </div>
                <div className="sym-sizes">
                  {[48, 32, 20].map((s) => (
                    <div key={s} className="sym-check" style={{ width: s + 12, height: s + 12 }}>
                      <img src={preview} alt="" style={{ width: s, height: s }} />
                    </div>
                  ))}
                  <span className="hint">mărimi pe plan</span>
                </div>
              </>
            ) : (
              <button className="sym-drop" onClick={() => fileRef.current?.click()}>
                <span className="plus">+</span>
                Alege fișierul simbolului
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) loadFile(f)
              }}
            />
            {preview && <button onClick={() => fileRef.current?.click()}>Înlocuiește imaginea…</button>}
            {info && <p className="hint">{info}</p>}
            {error && <p className="warn">{error}</p>}
          </div>
          <div className="sym-form">
            <label className="field">
              <span>Denumire (apare în legendă)</span>
              <input value={name} placeholder="ex. Cameră dome Hikvision" onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="field">
              <span>Se comportă ca (sistem, cabluri, con cameră, liste, calcule)</span>
              <select value={base} onChange={(e) => setBase(e.target.value)}>
                {SYSTEMS.map((sys) => (
                  <optgroup key={sys.id} label={sys.name}>
                    {SYMBOLS.filter((x) => x.system === sys.id).map((x) => (
                      <option key={x.type} value={x.type}>
                        {x.name} ({x.prefix})
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Prefix numerotare (gol = {def.prefix})</span>
              <input value={prefix} placeholder={def.prefix} maxLength={8} onChange={(e) => setPrefix(e.target.value)} />
            </label>
            <label className="check">
              <input type="checkbox" checked={recolor} onChange={(e) => setRecolor(e.target.checked)} />
              Se recolorează (culoarea sistemului sau culoarea aleasă pe echipament)
            </label>
            {kind === 'img' && (
              <label className="check">
                <input type="checkbox" checked={whiteToAlpha} onChange={(e) => setWhiteToAlpha(e.target.checked)} />
                Fundalul alb devine transparent
              </label>
            )}
            {kind === 'img' && recolor && <p className="hint">Recolorarea la imagini funcționează bine doar la pictograme de o singură culoare (siluete).</p>}
            {!existing && (
              <label className="check">
                <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
                Păstrează-l și în biblioteca mea (apare în proiectele noi)
              </label>
            )}
            <p className="hint">
              Simbolul se încadrează automat în caseta simbolurilor (la imagini, marginile goale se taie), deci are aceeași mărime ca celelalte
              și se rotește / oglindește la fel.
            </p>
          </div>
        </div>
        <footer className="modal-foot">
          {existing && onDelete && (
            <button
              className="danger"
              onClick={async () =>
                (await askConfirm(
                  usedBy
                    ? `Ștergi simbolul „${existing.name}”? ${usedBy} echipamente revin la simbolul standard.`
                    : `Ștergi simbolul „${existing.name}”?`,
                  { title: 'Șterge simbolul', okLabel: 'Șterge', danger: true },
                )) && onDelete()
              }
            >
              Șterge simbolul
            </button>
          )}
          <span className="spacer" />
          <button onClick={onClose}>Renunță</button>
          <button className="primary" onClick={save} disabled={!data}>
            {existing ? 'Salvează' : 'Adaugă simbolul'}
          </button>
        </footer>
      </div>
    </div>
  )
}
