import { useEffect, useMemo, useState } from 'react'
import type { RenderedPage } from './exporters'

export interface PreviewPage extends RenderedPage {
  label: string
}

/** Previzualizarea paginilor PDF înainte de descărcare */
export function PdfPreview({ pages, title, onDownload, onClose }: { pages: PreviewPage[]; title: string; onDownload: () => void; onClose: () => void }) {
  const [zoom, setZoom] = useState(false)
  const [current, setCurrent] = useState(0)
  // imaginile paginilor (JPEG din canvas), eliberate la închidere
  const urls = useMemo(() => pages.map((pg) => pg.canvas.toDataURL('image/jpeg', 0.85)), [pages])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setCurrent((c) => Math.min(pages.length - 1, c + 1))
      if (e.key === 'ArrowLeft') setCurrent((c) => Math.max(0, c - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pages.length])

  const pg = pages[current]
  const fmt = (p: PreviewPage) => `${Math.round(p.wmm)} × ${Math.round(p.hmm)} mm`
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal preview">
        <header className="modal-head">
          <b>Previzualizare PDF</b>
          <span className="hint">
            {title} · {pages.length} {pages.length === 1 ? 'pagină' : 'pagini'}
          </span>
          <button className="close" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="modal-body">
          {pages.length > 1 && (
            <nav className="thumbs">
              {pages.map((p, i) => (
                <button key={i} className={i === current ? 'on' : ''} onClick={() => setCurrent(i)} title={p.label}>
                  <img src={urls[i]} alt="" />
                  <span>{p.label}</span>
                </button>
              ))}
            </nav>
          )}
          <div className={'page-view' + (zoom ? ' zoom' : '')} onClick={() => setZoom((z) => !z)} title={zoom ? 'Click = încadrare' : 'Click = mărire 100%'}>
            <img src={urls[current]} alt={pg.label} />
          </div>
        </div>
        <footer className="modal-foot">
          <span className="hint">
            {pg.label} · {fmt(pg)} · click pe pagină pentru mărire{pages.length > 1 ? ' · ← → pentru pagini' : ''}
          </span>
          <span className="spacer" />
          <button onClick={onClose}>Închide</button>
          <button className="primary" onClick={onDownload}>
            Descarcă PDF
          </button>
        </footer>
      </div>
    </div>
  )
}
