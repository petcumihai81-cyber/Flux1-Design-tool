/** Afișează ferestrele cerute cu askText / askConfirm / showAlert (dialogs.ts); se montează o dată, în App */
import { useEffect, useRef, useState } from 'react'
import { popDialog, subscribeDialogs } from './dialogs'
import type { Req } from './dialogs'

export function DialogHost() {
  const [q, setQ] = useState<Req[]>(() => subscribeDialogs(null))
  useEffect(() => {
    setQ(subscribeDialogs(setQ))
    return () => {
      subscribeDialogs(null)
    }
  }, [])
  const req = q[0]
  if (!req) return null
  return <DialogView key={q.length + req.title} req={req} />
}

function DialogView({ req }: { req: Req }) {
  const [value, setValue] = useState(req.kind === 'text' ? req.value : '')
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  const okRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (req.kind === 'text') {
      inputRef.current?.focus()
      inputRef.current?.select()
    } else okRef.current?.focus()
  }, [req])

  const close = (ok: boolean) => {
    if (req.kind === 'text') req.resolve(ok ? value : null)
    else if (req.kind === 'confirm') req.resolve(ok)
    else req.resolve()
    popDialog()
  }

  const onKey = (e: React.KeyboardEvent) => {
    // tastele nu ajung la scurtăturile planului
    e.stopPropagation()
    if (e.key === 'Escape') {
      e.preventDefault()
      close(false)
    } else if (e.key === 'Enter' && !(req.kind === 'text' && req.multiline && !e.ctrlKey && !e.metaKey)) {
      e.preventDefault()
      close(true)
    }
  }

  return (
    <div className="modal-back app-dialog-back" onMouseDown={(e) => e.target === e.currentTarget && close(false)} onKeyDown={onKey}>
      <div className="modal app-dialog" role="dialog" aria-modal="true" aria-label={req.title}>
        <header className="modal-head">
          <b>{req.title}</b>
          <button className="close" onClick={() => close(false)} aria-label="Închide">
            ×
          </button>
        </header>
        <div className="app-dialog-body">
          {req.kind === 'text' ? (
            <label className="field">
              {req.label && <span>{req.label}</span>}
              {req.multiline ? (
                <textarea ref={inputRef} rows={3} value={value} placeholder={req.placeholder} onChange={(e) => setValue(e.target.value)} />
              ) : (
                <input ref={inputRef} value={value} placeholder={req.placeholder} onChange={(e) => setValue(e.target.value)} />
              )}
              {req.multiline && <small className="hint">Enter = rând nou, Ctrl+Enter = gata</small>}
            </label>
          ) : (
            <p>{req.message}</p>
          )}
        </div>
        <footer className="modal-foot">
          <span className="spacer" />
          {req.kind !== 'alert' && <button onClick={() => close(false)}>Renunță</button>}
          <button ref={okRef} className={req.kind === 'confirm' && req.danger ? 'primary danger-fill' : 'primary'} onClick={() => close(true)}>
            {req.kind === 'alert' ? 'OK' : (req.okLabel ?? (req.kind === 'confirm' ? 'Da' : 'OK'))}
          </button>
        </footer>
      </div>
    </div>
  )
}
