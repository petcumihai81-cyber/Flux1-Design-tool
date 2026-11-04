import { useEffect, useState } from 'react'
import { pdfThumb } from './background'
import type { PdfDoc } from './background'

const paperName = (w: number, h: number) => {
  const [a, b] = [Math.max(w, h), Math.min(w, h)]
  const sizes: [string, number, number][] = [
    ['A0', 1189, 841],
    ['A1', 841, 594],
    ['A2', 594, 420],
    ['A3', 420, 297],
    ['A4', 297, 210],
  ]
  const f = sizes.find(([, x, y]) => Math.abs(a - x) < 8 && Math.abs(b - y) < 8)
  return `${f ? f[0] + ' ' : ''}${Math.round(w)}×${Math.round(h)} mm`
}

/** Alegerea paginii dintr-un PDF cu mai multe pagini: miniaturi, click = încarcă pagina */
export function PdfPagePicker({ doc, fileName, onPick }: { doc: PdfDoc; fileName: string; onPick: (page: number | null) => void }) {
  const n = doc.numPages
  const [thumbs, setThumbs] = useState<({ src: string; wmm: number; hmm: number } | null)[]>(() => Array(n).fill(null))
  const [num, setNum] = useState(1)

  // miniaturile se randează pe rând, ca primele pagini să apară repede
  useEffect(() => {
    let stop = false
    ;(async () => {
      for (let i = 1; i <= n && !stop; i++) {
        try {
          const t = await pdfThumb(doc, i)
          if (!stop) setThumbs((a) => a.map((x, j) => (j === i - 1 ? t : x)))
        } catch {
          /* pagina nu se poate randa: rămâne fără miniatură */
        }
      }
    })()
    return () => {
      stop = true
    }
  }, [doc, n])

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onPick(null)}>
      <div className="modal pdf-pick">
        <header className="modal-head">
          <b>Alege pagina cu planul</b>
          <span className="hint">
            {fileName} · {n} pagini — se încarcă doar pagina aleasă
          </span>
          <button className="close" onClick={() => onPick(null)}>
            ×
          </button>
        </header>
        <div className="modal-body pdf-pages">
          {thumbs.map((t, i) => (
            <button key={i} className="pdf-page" onClick={() => onPick(i + 1)} title={`Încarcă pagina ${i + 1}`}>
              <div className="pdf-thumb">{t ? <img src={t.src} alt={`Pagina ${i + 1}`} /> : <span className="hint">se încarcă…</span>}</div>
              <b>Pagina {i + 1}</b>
              {t && <small>{paperName(t.wmm, t.hmm)}</small>}
            </button>
          ))}
        </div>
        <footer className="modal-foot">
          <span className="hint">Click pe pagină pentru a o încărca, sau scrie numărul:</span>
          <input type="number" min={1} max={n} value={num} onChange={(e) => setNum(parseInt(e.target.value, 10) || 1)} style={{ width: 80 }} />
          <button className="primary" onClick={() => onPick(Math.min(n, Math.max(1, num)))}>
            Încarcă pagina {Math.min(n, Math.max(1, num))}
          </button>
          <span className="spacer" />
          <button onClick={() => onPick(null)}>Renunță</button>
        </footer>
      </div>
    </div>
  )
}
