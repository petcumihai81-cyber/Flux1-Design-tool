import { GROUPS } from './verify'
import type { Issue, IssueTarget } from './verify'

const GO_LABEL: Record<IssueTarget['kind'], string> = {
  device: 'Arată pe plan',
  cable: 'Arată pe plan',
  level: 'Deschide nivelul',
  sheet: 'Deschide planșa',
  catalog: 'Deschide catalogul',
  memoriu: 'Completează memoriul',
  project: 'Completează cartușul',
  calc: 'Deschide calculele',
}

/** Rezultatul verificării înainte de predare */
export function VerifyDialog({ issues, onGo, onClose }: { issues: Issue[]; onGo: (t: IssueTarget) => void; onClose: () => void }) {
  const errs = issues.filter((i) => i.sev === 'err').length
  const warns = issues.length - errs
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal verify">
        <header className="modal-head">
          <b>Verificare înainte de predare</b>
          <span className="hint">
            {issues.length === 0 ? (
              <span className="ok">Nicio problemă găsită.</span>
            ) : (
              <>
                {errs > 0 && <span className="v-count err">{errs} {errs === 1 ? 'eroare' : 'erori'}</span>}
                {warns > 0 && <span className="v-count warn">{warns} {warns === 1 ? 'atenționare' : 'atenționări'}</span>}
              </>
            )}
          </span>
          <button className="close" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="modal-body verify-body">
          {issues.length === 0 && (
            <div className="verify-ok">
              <div className="big">✓</div>
              <p>Planșele, listele, calculele și memoriul au toate datele verificate.</p>
              <p className="hint">Verifică totuși vizual PDF-ul și memoriul înainte de predare.</p>
            </div>
          )}
          {GROUPS.map((g) => {
            const list = issues.filter((i) => i.group === g).sort((a, b) => (a.sev === b.sev ? 0 : a.sev === 'err' ? -1 : 1))
            if (!list.length) return null
            return (
              <section key={g}>
                <h4>{g}</h4>
                {list.map((it, i) => (
                  <div key={i} className={'v-issue ' + it.sev}>
                    <span className="v-icon">{it.sev === 'err' ? '!' : 'i'}</span>
                    <div className="v-text">
                      <div>{it.text}</div>
                      {it.items && (
                        <div className="v-items">
                          {it.items.slice(0, 40).join(', ')}
                          {it.items.length > 40 ? ` … (+${it.items.length - 40})` : ''}
                        </div>
                      )}
                    </div>
                    {it.target && (
                      <button
                        onClick={() => {
                          onGo(it.target!)
                          onClose()
                        }}
                      >
                        {GO_LABEL[it.target.kind]}
                      </button>
                    )}
                  </div>
                ))}
              </section>
            )
          })}
        </div>
        <footer className="modal-foot">
          <span className="hint">
            <b>Erorile</b> fac documentația greșită sau incompletă; <b>atenționările</b> sunt lucruri de verificat. Verificarea se reface la fiecare deschidere.
          </span>
          <span className="spacer" />
          <button className="primary" onClick={onClose}>
            Închide
          </button>
        </footer>
      </div>
    </div>
  )
}
