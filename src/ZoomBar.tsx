import { useEffect, useRef, useState } from 'react'
import { stepPercent } from './zoom'

const PRESETS = [10, 25, 50, 75, 100, 150, 200, 300, 400]

/**
 * Bara de zoom a planșei: − / procent / +, presetări, încadrare și mărire pe selecție.
 * Procentul e raportat la mărimea planșei tipărite (100% = 1 mm hârtie = 1 mm pe ecran).
 */
export function ZoomBar({
  percent,
  onPercent,
  onFit,
  onSelection,
}: {
  percent: number
  onPercent: (p: number) => void
  onFit: () => void
  /** Mărește pe elementul selectat (lipsă = nimic selectat) */
  onSelection?: () => void
}) {
  const [menu, setMenu] = useState(false)
  const [edit, setEdit] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menu) return
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setMenu(false)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [menu])

  const shown = percent >= 10 ? Math.round(percent) : Math.round(percent * 10) / 10
  return (
    <div className="zoom-bar" ref={ref} onMouseDown={(e) => e.stopPropagation()}>
      <button onClick={() => onPercent(stepPercent(percent, -1))} title="Micșorează (Ctrl −)">
        −
      </button>
      {edit != null ? (
        <input
          className="zoom-input"
          autoFocus
          value={edit}
          onChange={(e) => setEdit(e.target.value)}
          onFocus={(e) => e.target.select()}
          onBlur={() => setEdit(null)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const v = parseFloat(edit.replace(',', '.'))
              if (v > 0) onPercent(v)
              setEdit(null)
            }
            if (e.key === 'Escape') setEdit(null)
          }}
        />
      ) : (
        <button className="zoom-pct" onClick={() => setMenu((m) => !m)} onDoubleClick={() => setEdit(String(shown))} title="Zoom (100% = mărimea planșei tipărite). Click = presetări, dublu-click = scrie procentul">
          {shown}%
        </button>
      )}
      <button onClick={() => onPercent(stepPercent(percent, 1))} title="Mărește (Ctrl +)">
        +
      </button>
      <span className="zoom-sep" />
      <button onClick={onFit} title="Încadrează tot desenul (Ctrl 0 sau F)">
        ⤢
      </button>
      {onSelection && (
        <button onClick={onSelection} title="Mărește pe elementul selectat">
          ⌖
        </button>
      )}
      {menu && (
        <div className="zoom-menu">
          {[...PRESETS].reverse().map((p) => (
            <button
              key={p}
              className={Math.abs(p - percent) < 0.5 ? 'on' : ''}
              onClick={() => {
                onPercent(p)
                setMenu(false)
              }}
            >
              {p}%{p === 100 ? ' — mărime reală' : ''}
            </button>
          ))}
          <div className="ctx-sep" />
          <button
            onClick={() => {
              onFit()
              setMenu(false)
            }}
          >
            Încadrează tot
          </button>
          <button
            onClick={() => {
              setMenu(false)
              setEdit(String(shown))
            }}
          >
            Alt procent…
          </button>
        </div>
      )}
    </div>
  )
}
